import { canEdit, entryIsOnAircraft, FOREIGN_ENTRY, type Db, type WriteCtx, type WriteResult } from "./entries";

// `timeCheck.dismiss` (09 §2.13, §5.3): the owner answered a written-versus-calculated check. The
// stored pair is what was answered; the check comes back when either value changes (lib/timeCheck.ts).

const NO_EDIT = "You don't have edit access to this aircraft.";

export async function dismiss(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; component: string; entryId: string; written: number; calculated: number; action: string },
): Promise<WriteResult> {
  if (input.component !== "engine" && input.component !== "prop") return { status: "error", message: "Engine or propeller?", httpStatus: 400 };
  if (input.action !== "agree" && input.action !== "added_to_annual_prep") return { status: "error", message: "Unknown answer.", httpStatus: 400 };
  if (![input.written, input.calculated].every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e8))
    return { status: "error", message: "The hours are unreadable.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  if (typeof input.entryId !== "string" || !(await entryIsOnAircraft(supabase, ctx.aircraftId, input.entryId)))
    return { status: "error", message: FOREIGN_ENTRY, httpStatus: 400 };
  // One answer per (component, entry): a later answer replaces the earlier one. The unique key is the
  // idempotency key, so the client's `id` is not used as the row id (an upsert must not rewrite a primary key).
  const { data, error } = await supabase.from("time_check_dismissal").upsert({
    aircraft_id: ctx.aircraftId, component: input.component, log_entry_id: input.entryId,
    written_value: input.written, calculated_value: input.calculated, action: input.action, created_by: ctx.userId,
  }, { onConflict: "aircraft_id,component,log_entry_id" }).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}
