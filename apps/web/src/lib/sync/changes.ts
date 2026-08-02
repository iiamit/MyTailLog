// ===========================================================================
// Pure shaping for the sync PULL feed — no I/O, unit-tested.
//
// The change_log can hold several rows for the same record inside one pull
// window (inserted, then updated, then maybe deleted). The device only needs the
// FINAL state per record, so we collapse to the latest change per (table, id):
//   - latest op is D  → tell the client to delete it
//   - latest op is I/U → tell the client to upsert it (row data fetched by caller)
// Ordered by seq so the client can apply with foreign keys deferred and land in a
// consistent state. Idempotent: re-pulling an overlapping window is harmless.
// ===========================================================================

export const SYNCED_TABLES = [
  "aircraft",
  "logbook",
  "page",
  "log_entry",
  "component",
  "ad_compliance",
  "maintenance_item",
  "document",
  "squawk",
  "adsb_flight",
  "oil_addition",
  "oil_analysis_sample",
  "hours_reading",
  "meter_reset",
  "scanned_document",
  "weight_balance",
] as const;

export type ChangeRow = { seq: number; table_name: string; row_id: string; op: "I" | "U" | "D" };
export type ReducedChange = { table: string; id: string; op: "upsert" | "delete"; seq: number };

/** Collapse the raw feed to the latest change per (table, id), ordered by seq. */
export function reduceChanges(rows: ChangeRow[]): ReducedChange[] {
  const latest = new Map<string, ChangeRow>();
  for (const r of rows) {
    const key = `${r.table_name}:${r.row_id}`;
    const prev = latest.get(key);
    if (!prev || r.seq > prev.seq) latest.set(key, r);
  }
  return [...latest.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({ table: r.table_name, id: r.row_id, op: r.op === "D" ? "delete" : "upsert", seq: r.seq }));
}
