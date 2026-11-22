import { insertRecords } from "./insert";
import type { Db, WriteCtx, WriteResult } from "./entries";

// `reminder.snooze` (09 §5.3, §2.11): "Remind me <date>" on Plan ahead and "Remind me Friday" on a
// notification. Stored per user, so any role may write it (viewers too); RLS checks the aircraft
// is theirs to see. One snooze per (user, aircraft, item, cycle): a later one replaces it, and it
// ends by itself when the due cycle changes (lib/reminders.ts dueSignature).

const KEY = /^(mx|ad|doc|visit):[\w:-]{1,200}$/;

export async function snooze(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; itemKey: string; dueSignature: string; until?: string | null },
): Promise<WriteResult> {
  if (typeof input.itemKey !== "string" || !KEY.test(input.itemKey)) return { status: "error", message: "Which item?", httpStatus: 400 };
  if (typeof input.dueSignature !== "string" || input.dueSignature.length > 100)
    return { status: "error", message: "The due date is unreadable.", httpStatus: 400 };
  let until: string | null = null;
  if (input.until != null) {
    const t = typeof input.until === "string" ? Date.parse(input.until) : NaN;
    if (Number.isNaN(t) || t <= Date.now()) return { status: "error", message: "Pick a date in the future.", httpStatus: 400 };
    until = new Date(t).toISOString();
  }
  return insertRecords(supabase, ctx, "reminder_snooze", {
    user_id: ctx.userId, aircraft_id: ctx.aircraftId, item_key: input.itemKey, due_signature: input.dueSignature, until_at: until,
  }, "user_id,aircraft_id,item_key,due_signature", false);
}
