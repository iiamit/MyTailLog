// ===========================================================================
// Per-request AI context + gate.
//
// The Anthropic call sites live deep inside the extraction pipeline / proposal
// helpers. Rather than thread a per-user API key and a usage logger through
// every signature, we stash them in an AsyncLocalStorage the route establishes
// once; getAnthropic() (anthropic.ts) reads the key, and the client wrapper
// reads onUsage. ALS is concurrency-safe — a module global would race across
// simultaneous requests from different users.
//
// prepareAi() is the single gate every AI route calls: it resolves the user's
// own key (if any), enforces the daily call cap (cost-DoS guard), and reports
// whether AI is configured at all.
// ===========================================================================

import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { decryptSecret } from "@/lib/crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { estimateCost } from "./pricing";

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };
type AiCtx = { apiKey?: string; onUsage?: (u: AiUsage) => void | Promise<void> };

const store = new AsyncLocalStorage<AiCtx>();

export function runWithAiContext<T>(ctx: AiCtx, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

export function currentAiContext(): AiCtx {
  return store.getStore() ?? {};
}

// Usage limits, all env-tunable (change the number + redeploy, no code edit):
//   AI_SHARED_USER_DAILY_CALLS — per-user/day cap on the SHARED key (default 100)
//   AI_OWN_USER_DAILY_CALLS    — per-user/day cap on a user's OWN key (default 1000)
//   AI_SHARED_DAILY_USD        — GLOBAL/day $ ceiling on the shared key across all
//                                users (default 20; 0 disables the global guard)
// ponytail: per-user caps bound abuse ACROSS requests — a single scan that fans
// out to many calls isn't throttled mid-request. The global $ ceiling is the
// real bound on total shared-key spend.
const num = (v: string | undefined, d: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const SHARED_DAILY_CAP = num(process.env.AI_SHARED_USER_DAILY_CALLS, 100);
const OWN_KEY_DAILY_CAP = num(process.env.AI_OWN_USER_DAILY_CALLS, 1000);
const SHARED_DAILY_USD = num(process.env.AI_SHARED_DAILY_USD, 20);
// Estimated $/request charged against the shared-key ceiling while a call is
// in flight (reserve_ai_call), reconciled to the real cost when the request
// finishes. Keep it near a typical extraction so the ceiling isn't overshot by
// concurrent calls. ponytail: flat estimate; make it per-model if it drifts.
const CALL_ESTIMATE_USD = num(process.env.AI_CALL_ESTIMATE_USD, 1);

type Supabase = SupabaseClient<Database>;

/** The user's own Anthropic key (decrypted), or null if they haven't set one. */
export async function getUserAiKey(supabase: Supabase, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("user_ai_key")
    .select("key_cipher")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.key_cipher ? decryptSecret(data.key_cipher) : null;
}

export type AiGate = { apiKey?: string; ownKey: boolean } | { error: string; status: number };

/** Resolve the key, check configuration, and enforce the daily cap. */
export async function prepareAi(supabase: Supabase, userId: string): Promise<AiGate> {
  const userKey = await getUserAiKey(supabase, userId);
  const ownKey = Boolean(userKey);

  if (!userKey && !process.env.ANTHROPIC_API_KEY) {
    return { error: "AI isn't configured. Add your own Anthropic API key in Settings.", status: 501 };
  }

  const cap = ownKey ? OWN_KEY_DAILY_CAP : SHARED_DAILY_CAP;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if ((count ?? 0) >= cap) {
    return {
      error: ownKey
        ? `Daily AI limit reached (${cap} calls). Try again tomorrow.`
        : `Daily AI limit reached (${cap} calls). Add your own Anthropic API key in Settings to raise it.`,
      status: 429,
    };
  }

  // Global ceiling on the SHARED key only (own-key spend is the user's own).
  if (!ownKey && SHARED_DAILY_USD > 0) {
    const { data: spentToday } = await supabase.rpc("shared_key_cost_today");
    if (Number(spentToday ?? 0) >= SHARED_DAILY_USD) {
      return {
        error:
          "The app's shared AI budget for today is used up. Add your own Anthropic API key in Settings to keep using AI.",
        status: 429,
      };
    }
  }

  return { apiKey: userKey ?? undefined, ownKey };
}

// The ledger is written ONLY by the service-role client (RLS-bypass), never the
// user's client — direct client inserts are revoked (migration 0032). This is
// what makes the shared-key $ ceiling (shared_key_cost_today) trustworthy: a
// signed-in user has no write path to poison it (forge a negative cost to bypass
// the ceiling, or a huge cost to DoS every shared-key user). Token counts here
// come from the real Anthropic response in the route, so a service write is safe.
let ledgerClient: ReturnType<typeof createServiceClient> | null = null;
const ledger = () => (ledgerClient ??= createServiceClient());

// Atomically reserve one AI call against the caps BEFORE the model runs (fixes
// the check-then-act race in prepareAi). Returns a reservation id to release
// when the request finishes, or null if a cap/ceiling is already reached. Called
// via the service-role client because reserve_ai_call writes ai_usage (client
// insert revoked, 0032) and must run with server-trusted args. Fails CLOSED:
// any error → no reservation → the route denies the call.
export async function reserveAiCall(userId: string, ownKey: boolean): Promise<string | null> {
  const cap = ownKey ? OWN_KEY_DAILY_CAP : SHARED_DAILY_CAP;
  try {
    const { data, error } = await ledger().rpc("reserve_ai_call", {
      p_user_id: userId,
      p_cap: cap,
      p_usd_cap: ownKey ? 0 : SHARED_DAILY_USD,
      p_own_key: ownKey,
      p_estimate: ownKey ? 0 : CALL_ESTIMATE_USD,
    });
    if (error) {
      console.error("reserve_ai_call failed", error);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.error("reserve_ai_call threw", err);
    return null;
  }
}

/** The 429 message when reserveAiCall returns null (a cap/ceiling was reached). */
export function aiBudgetMessage(ownKey: boolean): string {
  return ownKey
    ? "Daily AI limit reached. Try again tomorrow."
    : "Daily AI limit reached. Add your own Anthropic API key in Settings to raise it.";
}

/** Release a reservation (delete the placeholder row). Never throws. */
export async function releaseAiReservation(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await ledger().from("ai_usage").delete().eq("id", id);
  } catch (err) {
    console.error("release ai reservation failed", err);
  }
}

/** Record one model call. Never throws — logging must not fail the AI response. */
export async function logAiUsage(
  userId: string,
  route: string,
  usage: AiUsage,
  ownKey: boolean,
): Promise<void> {
  try {
    await ledger().from("ai_usage").insert({
      user_id: userId,
      route,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cost_usd: estimateCost(usage.model, usage.inputTokens, usage.outputTokens),
      used_own_key: ownKey,
    });
  } catch (err) {
    console.error("ai_usage insert failed", err);
  }
}
