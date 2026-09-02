import { enqueueAction } from "./db";

// The ONE way UI code writes anything. See docs/ios-parity/CONTRACT.md §2–3.
//
// STUB — owned by the core-sync stream, which replaces the internals (a real
// `base` column, the conflict state, draining to POST /api/sync/push). The
// signature is the contract and does not change. Until then this rides on the
// existing action_queue so every UI stream compiles and drains through today's
// /actions route for the four legacy types.

export type MutationType = string; // narrowed to the §3 union by core sync

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
  const id = opts.id ?? crypto.randomUUID();
  await enqueueAction({
    id,
    aircraft_id: aircraftId,
    type,
    label: opts.label ?? labelFor(type, payload),
    // ponytail: base rides inside the payload until core sync adds the column.
    payload: JSON.stringify(opts.base ? { ...payload, __base: opts.base } : payload),
    created_at: new Date().toISOString(),
  });
  return { id };
}

/** Human wording for the pending list. Owners read this, so no type names. */
function labelFor(type: string, p: Record<string, unknown>): string {
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
  };
  const desc = typeof p.description === "string" ? ` · ${p.description.slice(0, 40)}` : "";
  return `${what} ${how[verb ?? ""] ?? verb ?? ""}${desc}`.trim();
}
