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

// Daily per-user cap on model CALLS (the cost unit). Own-key users get a much
// higher backstop since it's their spend; shared-key users are held tighter.
// ponytail: the cap bounds sustained abuse ACROSS requests — a single scan that
// fans out to many calls isn't throttled mid-request. Add a per-request budget
// if one request's fan-out ever needs bounding.
const SHARED_DAILY_CAP = 100;
const OWN_KEY_DAILY_CAP = 1000;

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

  return { apiKey: userKey ?? undefined, ownKey };
}

/** Record one model call. Never throws — logging must not fail the AI response. */
export async function logAiUsage(
  supabase: Supabase,
  userId: string,
  route: string,
  usage: AiUsage,
  ownKey: boolean,
): Promise<void> {
  try {
    await supabase.from("ai_usage").insert({
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
