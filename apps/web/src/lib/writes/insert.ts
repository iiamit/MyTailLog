import type { Db, WriteCtx, WriteResult } from "./entries";
import { replayRpc } from "./replay";

/** The insert and optional sync receipt share a transaction; table RLS still applies. */
export async function insertRecords(db: Db, ctx: WriteCtx, table: string, rows: Record<string, unknown> | Record<string, unknown>[], conflict = "id", ignore = true): Promise<WriteResult> {
  const { data, error } = await replayRpc(db, ctx, "insert_records", {
    p_table: table, p_aircraft: ctx.aircraftId, p_rows: Array.isArray(rows) ? rows : [rows],
    p_conflict: conflict, p_ignore: ignore,
  });
  return error ? { status: "error", message: error.message } : data as WriteResult;
}
