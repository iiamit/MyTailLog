import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import {
  listDrainable,
  removeAction,
  markActionFailed,
  markActionRetry,
  markActionConflict,
  resubmitAction,
  type QueuedAction,
} from "./db";
import { enqueue, uuid } from "./mutations";
import { translateLegacy, MAX_MUTATIONS, type PushResult } from "@/lib/sync/mutations";
import { nextRetryAt } from "./sync-policy";

// ===========================================================================
// Safe writes: persist on device first, then drain when connected.
//
// Same shape as the capture queue, for the same reason — the aircraft is the one
// place you reliably have no bars, and it's exactly where you want to record the
// tach you're looking at. Every mutation lands in SQLite first (mutations.ts),
// so closing the app mid-ramp loses nothing; App.tsx then drains it here.
//
// The mutation's `id` is generated on the phone and reused as the server row's
// key, which makes the pipeline replay-safe: a drain that lands but loses the
// response retries and writes nothing the second time. Updates carry `base`
// (the row's updated_at as last seen); if the server's row moved on, the
// mutation parks as a conflict for the owner to settle (pending.tsx).
// ===========================================================================

/** The four original write types. Kept so existing screens compile; each is
 *  translated into its CONTRACT §3 mutation on the way into the queue. */
export type ActionType = "reading" | "oil" | "squawk" | "mx_complete";

export type ActionInput = {
  aircraftId: string;
  type: ActionType;
  label: string;
  payload: Record<string, unknown>;
};

/** Queue a legacy-shaped action. Returns its id — the same id the server row will carry. */
export async function queueAction(input: ActionInput): Promise<string> {
  const id = uuid();
  const t = translateLegacy(input.aircraftId, { ...input.payload, id, type: input.type });
  if ("error" in t) throw new Error(t.error);
  await enqueue(t.ok.type, input.aircraftId, t.ok.payload, { id, base: t.ok.base, label: input.label });
  return id;
}

export type DrainResult = { sent: number; failed: number; conflicts: number; offline: boolean };

/**
 * Push every drainable mutation to /api/sync/push in batches, oldest first.
 * `ok` → removed. `conflict` → parked with the server's row. `error` → kept
 * with the reason, because a refused write that silently disappears is
 * indistinguishable from a successful one. No answer at all → untouched when
 * offline (the expected hangar state), backoff-gated when online.
 */
export async function drainActions(): Promise<DrainResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const queue = await listDrainable();
  const out: DrainResult = { sent: 0, failed: 0, conflicts: 0, offline: !token };
  if (!token || queue.length === 0) return out;

  for (let i = 0; i < queue.length; i += MAX_MUTATIONS) {
    const batch = queue.slice(i, i + MAX_MUTATIONS);
    let res: { status: number; data?: { results?: PushResult[]; error?: string } };
    try {
      res = await CapacitorHttp.post({
        url: `${API_BASE}/api/sync/push`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: { mutations: batch.map(toMutation) },
      });
    } catch (e) {
      await unreachable(batch, e instanceof Error ? e.message : String(e), out);
      continue;
    }

    if (res.status >= 500) {
      await unreachable(batch, `The server had a problem (HTTP ${res.status}).`, out);
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      // A whole-batch rejection (401 = stale token, 400 = a malformed batch).
      const message = typeof res.data?.error === "string" ? res.data.error : `HTTP ${res.status}`;
      for (const a of batch) await markActionFailed(a.id, message);
      out.failed += batch.length;
      continue;
    }

    const byId = new Map((res.data?.results ?? []).map((r) => [r.id, r]));
    for (const a of batch) {
      const r = byId.get(a.id);
      if (r?.status === "ok") {
        await removeAction(a.id);
        out.sent++;
      } else if (r?.status === "conflict" && r.row) {
        await markActionConflict(a.id, r.row);
        out.conflicts++;
      } else {
        await markActionFailed(a.id, r?.error ?? "The server didn't answer for this one.");
        out.failed++;
      }
    }
  }
  return out;
}

function toMutation(a: QueuedAction) {
  return {
    id: a.id,
    type: a.type,
    aircraftId: a.aircraft_id,
    payload: JSON.parse(a.payload) as Record<string, unknown>,
    ...(a.base ? { base: a.base } : {}),
  };
}

/** No usable answer. Offline: leave everything as it was. Online: count the
 *  try and back off, so a struggling server isn't hit on every foreground. */
async function unreachable(batch: QueuedAction[], reason: string, out: DrainResult): Promise<void> {
  if (!navigator.onLine) {
    out.offline = true;
    return;
  }
  for (const a of batch) await markActionRetry(a.id, `Couldn't reach the server — will try again. (${reason})`, nextRetryAt(a.attempts));
}

/** "Keep mine" on the conflict screen: resend on top of the server's version. */
export async function keepMine(a: QueuedAction): Promise<void> {
  const theirs = a.server_row ? (JSON.parse(a.server_row) as Record<string, unknown>) : null;
  const base = typeof theirs?.updated_at === "string" ? theirs.updated_at : new Date().toISOString();
  await resubmitAction(a.id, base);
}

// --- Who may write ----------------------------------------------------------

const ACCESS_KEY = "mytaillog.canEdit";
const ALLOWANCE_KEY = "mytaillog.aiAllowance";

/**
 * Refresh the set of aircraft this user may EDIT, cached in localStorage so the
 * UI can decide offline. RLS is still the authority — this only stops us
 * offering a button that is going to be refused. A viewer's write would
 * otherwise queue, drain, and vanish, because RLS makes it a silent no-op.
 * Also caches the AI allowance the same response carries.
 */
export async function refreshEditable(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  const res = await CapacitorHttp.get({
    url: `${API_BASE}/api/sync/access`,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status < 200 || res.status >= 300) return;
  const access = (res.data?.access ?? []) as { aircraft_id: string; can_edit: boolean }[];
  const editable = access.filter((a) => a.can_edit).map((a) => a.aircraft_id);
  localStorage.setItem(ACCESS_KEY, JSON.stringify(editable));
  const allowance = res.data?.allowance as AiAllowance | undefined;
  if (allowance && typeof allowance.dailyCap === "number") {
    localStorage.setItem(ALLOWANCE_KEY, JSON.stringify({ ...allowance, fetchedAt: new Date().toISOString() }));
  }
}

export type AiAllowance = { callsToday: number; dailyCap: number; fetchedAt?: string };

/** Extractions left today, as last fetched; null until /api/sync/access has answered. */
export function aiAllowance(): AiAllowance | null {
  try {
    const raw = localStorage.getItem(ALLOWANCE_KEY);
    return raw ? (JSON.parse(raw) as AiAllowance) : null;
  } catch {
    return null;
  }
}

/**
 * Unknown means ALLOW: a first run that hasn't reached /api/sync/access yet
 * would otherwise show a read-only app to the owner. The server refuses what it
 * must, so the cost of guessing wrong is an error message, not a bad write.
 */
export function canEdit(aircraftId: string): boolean {
  try {
    const raw = localStorage.getItem(ACCESS_KEY);
    if (!raw) return true;
    return (JSON.parse(raw) as string[]).includes(aircraftId);
  } catch {
    return true;
  }
}
