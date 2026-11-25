import type { Db, WriteCtx } from "./entries";

export type ReplayOperation = "review_page_details" | "write_record" | "merge_log_entry" | "mark_maintenance_done"
  | "save_service_provider" | "save_planned_visit" | "set_expected_hours_checked"
  | "retire_component" | "confirm_equipment_proposals" | "change_pages" | "insert_records"
  | "create_planned_visit" | "seed_maintenance_items" | "confirm_clean_entries" | "create_squawk";

/** Reuse the ordinary RPC for web writes; v2 effects and their receipt commit together. */
export async function replayRpc(db: Db, ctx: WriteCtx, operation: ReplayOperation, args: Record<string, unknown>) {
  if (ctx.mutation) return db.rpc("apply_sync_write", {
    p_mutation: { ...ctx.mutation, aircraftId: ctx.aircraftId }, p_operation: operation, p_arguments: args,
  });
  const rpc = db.rpc.bind(db) as (name: ReplayOperation, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string; details?: string } | null }>;
  return rpc(operation, args);
}
