import type { Db, WriteCtx, WriteResult } from "./entries";
import { replayRpc } from "./replay";

/** Compare the loaded version inside the same transaction that writes it. */
export async function writeRecord(db: Db, ctx: WriteCtx, table: string, id: string, base: string, patch: Record<string, unknown> | null): Promise<WriteResult> {
  const { data, error } = await replayRpc(db, ctx, "write_record", {
    p_table: table, p_aircraft: ctx.aircraftId, p_id: id, p_base: base,
    p_patch: patch, p_delete: patch === null,
  });
  return error ? { status: "error", message: error.message } : data as WriteResult;
}
