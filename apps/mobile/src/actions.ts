import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import {
  enqueueAction,
  listActions,
  removeAction,
  markActionFailed,
  type QueuedAction,
} from "./db";

// ===========================================================================
// Offline writes: queue on device, drain when there's signal.
//
// Same shape as the capture queue, for the same reason — the aircraft is the one
// place you reliably have no bars, and it's exactly where you want to record the
// tach you're looking at. Nothing here writes to the server directly; every
// action lands in SQLite first, so closing the app mid-ramp loses nothing.
//
// The action's `id` is a UUID generated HERE and reused as the server row's key,
// which makes the whole pipeline replay-safe: a drain that uploads successfully
// but loses the response retries and writes nothing the second time.
// ===========================================================================

export type ActionType = "reading" | "oil" | "squawk" | "mx_complete";

export type ActionInput = {
  aircraftId: string;
  type: ActionType;
  label: string;
  payload: Record<string, unknown>;
};

function uuid(): string {
  // crypto.randomUUID exists in WKWebView on iOS 15.4+; the fallback keeps the
  // queue working rather than throwing on an older device.
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Queue an action. Returns its id — the same id the server row will carry. */
export async function queueAction(input: ActionInput): Promise<string> {
  const id = uuid();
  await enqueueAction({
    id,
    aircraft_id: input.aircraftId,
    type: input.type,
    label: input.label,
    payload: JSON.stringify({ ...input.payload, id, type: input.type }),
    created_at: new Date().toISOString(),
  });
  return id;
}

export type DrainResult = { sent: number; failed: number; offline: boolean };

/**
 * Upload every queued action, grouped per aircraft (the endpoint is per
 * aircraft). An action the server ACCEPTS is removed; one it REJECTS keeps its
 * error and stays visible, because a rejected write that silently disappears is
 * indistinguishable from a successful one.
 */
export async function drainActions(): Promise<DrainResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const queue = await listActions();
  if (!token || queue.length === 0) return { sent: 0, failed: 0, offline: !token };

  const byAircraft = new Map<string, QueuedAction[]>();
  for (const a of queue) {
    const list = byAircraft.get(a.aircraft_id) ?? [];
    list.push(a);
    byAircraft.set(a.aircraft_id, list);
  }

  let sent = 0;
  let failed = 0;
  let offline = false;

  for (const [aircraftId, actions] of byAircraft) {
    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE}/api/aircraft/${aircraftId}/actions`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: { actions: actions.map((a) => JSON.parse(a.payload) as Record<string, unknown>) },
      });

      if (res.status < 200 || res.status >= 300) {
        // A whole-batch rejection (403 = not an editor, 401 = stale token).
        const message = typeof res.data?.error === "string" ? res.data.error : `HTTP ${res.status}`;
        for (const a of actions) await markActionFailed(a.id, message);
        failed += actions.length;
        continue;
      }

      const results = (res.data?.results ?? []) as { id: string; ok: boolean; error?: string }[];
      const byId = new Map(results.map((r) => [r.id, r]));
      for (const a of actions) {
        const r = byId.get(a.id);
        if (r?.ok) {
          await removeAction(a.id);
          sent++;
        } else {
          await markActionFailed(a.id, r?.error ?? "The server didn't answer for this one.");
          failed++;
        }
      }
    } catch (e) {
      // No signal — leave everything queued, untouched, and don't count it as a
      // failure. This is the expected state in a hangar, not an error.
      offline = true;
      void e;
    }
  }

  return { sent, failed, offline };
}

// --- Who may write ----------------------------------------------------------

const ACCESS_KEY = "mytaillog.canEdit";

/**
 * Refresh the set of aircraft this user may EDIT, cached in localStorage so the
 * UI can decide offline. RLS is still the authority — this only stops us
 * offering a button that is going to be refused. A viewer's write would
 * otherwise queue, drain, and vanish, because RLS makes it a silent no-op.
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
