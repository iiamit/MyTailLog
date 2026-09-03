import { enqueueAction } from "./db";
import type { MutationType } from "@/lib/sync/mutations";

// The ONE way UI code writes anything. See docs/ios-parity/CONTRACT.md §2–3.
//
// Every write lands in the on-device action_queue first (SQLite), then
// drainActions() in actions.ts posts it to POST /api/sync/push. The signature
// is the contract and does not change.

export type { MutationType };

export type Enqueued = { id: string };

/**
 * Queue a mutation. `base` is the ISO `updated_at` of the row being changed as
 * the phone last saw it — required for every update/delete type, absent on
 * inserts. `id` is the idempotency key and, for inserts, the new row's id.
 */
export async function enqueue(
  type: MutationType,
  aircraftId: string,
  payload: Record<string, unknown>,
  opts: { id?: string; base?: string; label?: string } = {},
): Promise<Enqueued> {
  const id = opts.id ?? uuid();
  await enqueueAction({
    id,
    aircraft_id: aircraftId,
    type,
    label: opts.label ?? labelFor(type, payload),
    payload: JSON.stringify(payload),
    base: opts.base ?? null,
    created_at: new Date().toISOString(),
  });
  return { id };
}

export function uuid(): string {
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

/** Human wording for the pending list. Owners read this, so no type names. */
export function labelFor(type: string, p: Record<string, unknown>): string {
  const [domain, verb] = type.split(".");
  const noun: Record<string, string> = {
    entry: "Log entry", entries: "Log entries", page: "Page", reading: "Meter reading",
    meterReset: "Meter replacement", mx: "Maintenance item", ad: "AD record",
    component: "Equipment", proposals: "Equipment proposals", squawk: "Squawk",
    oil: "Oil added", document: "Document", wb: "Weight & balance", aircraft: "Aircraft",
  };
  const what = noun[domain] ?? domain;
  const how: Record<string, string> = {
    create: "added", update: "edited", confirm: "confirmed", delete: "deleted",
    merge: "merged", resolve: "resolved", reopen: "reopened", complete: "marked done",
    upsert: "saved", review: "reviewed", reorder: "reordered", remove: "removed",
    reinstall: "reinstalled", setEntry: "attached", setLinks: "linked",
    confirmClean: "confirmed", seedStandard: "set up", track: "tracked", dismiss: "dismissed",
  };
  const desc = typeof p.description === "string" ? ` · ${p.description.slice(0, 40)}` : "";
  return `${what} ${how[verb ?? ""] ?? verb ?? ""}${desc}`.trim();
}
