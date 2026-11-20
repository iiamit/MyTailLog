import type { Db } from "@/lib/writes";
import { reduceChanges, SYNCED_TABLES, type ChangeRow } from "@/lib/sync/changes";

// The read path shared by GET /api/sync/pull (v1) and /api/sync/v2/pull: every
// change to the caller's accessible aircraft with seq > cursor, collapsed to the
// latest state per record: `upsert` (with the current row) or `delete`. RLS on
// change_log + each table scopes everything to what the user can see.
// Idempotent — safe to re-pull.

export const LIMIT_DEFAULT = 500;
export const LIMIT_MAX = 1000;
const SYNCED = new Set<string>(SYNCED_TABLES);

export type SyncChange =
  | { table: string; op: "upsert"; id: string; seq: number; row: Record<string, unknown> }
  | { table: string; op: "delete"; id: string; seq: number };

export type PullPage = { changes: SyncChange[]; nextCursor: number; hasMore: boolean };

/** `cursor` and `limit` from the query string, clamped. */
export function pullParams(url: string): { cursor: number; limit: number } {
  const params = new URL(url).searchParams;
  return {
    cursor: Math.max(0, Number.parseInt(params.get("cursor") || "0", 10) || 0),
    limit: Math.min(LIMIT_MAX, Math.max(1, Number.parseInt(params.get("limit") || "", 10) || LIMIT_DEFAULT)),
  };
}

export async function pullChanges(supabase: Db, userId: string, cursor: number, limit: number): Promise<PullPage | { error: string }> {
  const { data: aircraft, error: accessError } = await supabase.from("aircraft").select("id").limit(101);
  if (accessError) return { error: accessError.message };

  let query = supabase
    .from("change_log")
    .select("seq, table_name, row_id, op")
    .gt("seq", cursor)
    .order("seq", { ascending: true })
    .limit(limit);

  // Avoid evaluating access checks against every other tenant's historical rows.
  // RLS still authorizes each candidate, including shared AD references and deleted aircraft.
  // shortcut: over 100 aircraft uses the original RLS-only query; use a DB-side join if fleets need it.
  if ((aircraft ?? []).length > 100) console.warn("[shortcut-trigger]", { at: "lib/sync/pull.ts:43", aircraft: aircraft!.length });
  if ((aircraft ?? []).length <= 100) {
    const scope = ["aircraft_id.is.null", `owner_id.eq.${userId}`];
    if (aircraft?.length) scope.push(`aircraft_id.in.(${aircraft.map((a) => a.id).join(",")})`);
    query = query.or(scope.join(","));
  }
  const { data: feed, error } = await query;
  if (error) return { error: error.message };

  const rows = (feed ?? []) as ChangeRow[];
  const reduced = reduceChanges(rows);
  // The feed is ordered by seq, so the last row is the max: the cursor never moves backwards.
  const nextCursor = rows.length ? Math.max(cursor, rows[rows.length - 1].seq) : cursor;
  const hasMore = rows.length === limit;

  // Batch-fetch current rows for the upserts, per table (RLS-scoped).
  const idsByTable = new Map<string, string[]>();
  for (const c of reduced) {
    if (c.op !== "upsert" || !SYNCED.has(c.table)) continue;
    const list = idsByTable.get(c.table) ?? [];
    list.push(c.id);
    idsByTable.set(c.table, list);
  }
  const rowByKey = new Map<string, Record<string, unknown>>();
  for (const [table, ids] of idsByTable) {
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error: rowError } = await supabase
        // dynamic table name — the typed union collapses; cast the arg
        .from(table as never)
        .select("*")
        .in("id", ids.slice(i, i + 500));
      if (rowError) return { error: rowError.message };
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        rowByKey.set(`${table}:${row.id}`, row);
      }
    }
  }

  const changes: SyncChange[] = [];
  for (const c of reduced) {
    if (c.op === "upsert" && SYNCED.has(c.table)) {
      const row = rowByKey.get(`${c.table}:${c.id}`);
      // Row not visible (deleted between queries, or no access) → tell the client
      // to drop it; the next pull's own D row, if any, is then a harmless no-op.
      changes.push(row ? { table: c.table, op: "upsert", id: c.id, seq: c.seq, row } : { table: c.table, op: "delete", id: c.id, seq: c.seq });
    } else {
      changes.push({ table: c.table, op: "delete", id: c.id, seq: c.seq });
    }
  }

  return { changes, nextCursor, hasMore };
}
