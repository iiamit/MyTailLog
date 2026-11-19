import type { PlannedVisit, VisitStatus } from "@/lib/database.types";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// Planned shop visits (09 §2.5, §5.3 `visit.create`, `visit.update`, `visit.setStatus`,
// `visitSuggestion.dismiss`; 14-decisions.md D2, D12). Suggested visits are computed by the due
// engine and never stored; only bookings and dismissals persist. Same contract as the other write
// modules: own can_edit_aircraft check, base rule, read back, never throws for an expected failure.

const NO_EDIT = "You don't have edit access to this aircraft.";
const CLOSED = "This visit is closed.";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_KEY = /^(mx|ad|squawk):[0-9a-f-]{36}$/;
const MAX_ITEMS = 50;

// ---------------------------------------------------------------------------
// Pure rules — tested in apps/web/test/writes-visits.test.ts
// ---------------------------------------------------------------------------

/** 09 §2.5: planned → in_shop | cancelled; in_shop → awaiting_records | done; awaiting_records → done;
 *  any non-done → cancelled. planned → awaiting_records is the daily job's ({@link advanceVisits}). */
const NEXT: Record<VisitStatus, VisitStatus[]> = {
  planned: ["in_shop", "cancelled"],
  in_shop: ["awaiting_records", "done", "cancelled"],
  awaiting_records: ["done", "cancelled"],
  done: [],
  cancelled: [],
};
export const canMoveVisit = (from: VisitStatus, to: VisitStatus) => NEXT[from]?.includes(to) ?? false;
export const isClosed = (s: VisitStatus) => s === "done" || s === "cancelled";

const isMonday = (d: string) => ISO.test(d) && new Date(`${d}T00:00:00Z`).getUTCDay() === 1;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Validate the editable fields of a visit. `weekOf` must be a Monday; `visitDate` inside that week. */
export function pickVisitFields(
  input: { weekOf?: unknown; visitDate?: unknown; notes?: unknown; airport?: unknown },
  weekOfNow?: string,
): { fields: Partial<Pick<PlannedVisit, "week_of" | "visit_date" | "notes" | "airport">> } | { error: string } {
  const out: Partial<Pick<PlannedVisit, "week_of" | "visit_date" | "notes" | "airport">> = {};
  if (input.weekOf !== undefined) {
    if (typeof input.weekOf !== "string" || !isMonday(input.weekOf)) return { error: "Pick the Monday of the visit's week." };
    out.week_of = input.weekOf;
  }
  if (input.visitDate !== undefined) {
    if (input.visitDate === null || input.visitDate === "") out.visit_date = null;
    else if (typeof input.visitDate !== "string" || !ISO.test(input.visitDate)) return { error: "Pick a date." };
    else out.visit_date = input.visitDate;
  }
  const week = out.week_of ?? weekOfNow;
  if (out.visit_date && week && (out.visit_date < week || out.visit_date > addDays(week, 6)))
    return { error: "The day must be in the visit's week." };
  if (input.notes !== undefined) {
    if (input.notes !== null && typeof input.notes !== "string") return { error: "Notes must be text." };
    const n = typeof input.notes === "string" ? input.notes.trim() : "";
    if (n.length > 2000) return { error: "Notes are too long (2,000 characters at most)." };
    out.notes = n || null;
  }
  if (input.airport !== undefined) {
    const a = typeof input.airport === "string" ? input.airport.trim().toUpperCase() : "";
    if (a.length > 8) return { error: "Use the airport's identifier, like KBED." };
    out.airport = a || null;
  }
  return { fields: out };
}

export function pickItemKeys(keys: unknown): { keys: string[] } | { error: string } {
  if (keys === undefined || keys === null) return { keys: [] };
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string" || !ITEM_KEY.test(k))) return { error: "Unknown item in the visit." };
  const uniq = [...new Set(keys as string[])];
  if (uniq.length > MAX_ITEMS) return { error: `A visit holds at most ${MAX_ITEMS} items.` };
  return { keys: uniq };
}

// ---------------------------------------------------------------------------
// Shared checks
// ---------------------------------------------------------------------------

const TABLE = { mx: "maintenance_item", ad: "ad_compliance", squawk: "squawk" } as const;

/** Every key names a row on THIS aircraft (RLS proves access to the visit, not to what its keys point at). */
async function itemsOnAircraft(supabase: Db, aircraftId: string, keys: string[]): Promise<boolean> {
  for (const prefix of Object.keys(TABLE) as (keyof typeof TABLE)[]) {
    const ids = keys.filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(prefix.length + 1));
    if (!ids.length) continue;
    const { data } = await supabase.from(TABLE[prefix]).select("id").eq("aircraft_id", aircraftId).in("id", ids);
    if ((data ?? []).length !== ids.length) return false;
  }
  return true;
}

/** The open visit already holding one of these keys, named for the owner (09 §2.5). */
async function alreadyBooked(supabase: Db, aircraftId: string, keys: string[], exceptVisit?: string): Promise<string | null> {
  if (!keys.length) return null;
  const { data } = await supabase.from("planned_visit_item").select("visit_id")
    .eq("aircraft_id", aircraftId).in("item_key", keys).is("done_completion_id", null);
  const other = (data ?? []).find((r) => r.visit_id !== exceptVisit);
  if (!other) return null;
  const { data: v } = await supabase.from("planned_visit").select("week_of").eq("id", other.visit_id).maybeSingle();
  return `This item is already in the visit for the week of ${v?.week_of ?? "another week"}.`;
}

async function providerOnAircraft(supabase: Db, aircraftId: string, providerId: unknown): Promise<boolean> {
  if (providerId == null || providerId === "") return true;
  if (typeof providerId !== "string") return false;
  const { data } = await supabase.from("service_provider").select("id").eq("id", providerId).eq("aircraft_id", aircraftId).maybeSingle();
  return !!data;
}

async function loadVisit(supabase: Db, ctx: WriteCtx, visitId: string, base: string | undefined): Promise<{ row: PlannedVisit } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase.from("planned_visit").select("*")
    .eq("id", visitId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Visit not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** `visit.create`: book a visit (from a suggestion or by hand). `id` is the idempotency key. */
export async function create(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; weekOf: string; visitDate?: string | null; providerId?: string | null; airport?: string | null;
    notes?: string | null; fromSuggestionKey?: string | null; itemKeys?: string[] },
): Promise<WriteResult> {
  if (typeof input.id !== "string" || !input.id) return { status: "error", message: "The visit is missing its id.", httpStatus: 400 };
  if (input.weekOf === undefined) return { status: "error", message: "Pick the Monday of the visit's week.", httpStatus: 400 };
  const picked = pickVisitFields(input);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  const keys = pickItemKeys(input.itemKeys);
  if ("error" in keys) return { status: "error", message: keys.error, httpStatus: 400 };
  const fromKey = input.fromSuggestionKey == null || input.fromSuggestionKey === "" ? null : input.fromSuggestionKey;
  if (fromKey !== null && (typeof fromKey !== "string" || !/^[0-9a-f]{16}$/.test(fromKey)))
    return { status: "error", message: "Unknown suggestion.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const { data: existing } = await supabase.from("planned_visit").select("*").eq("id", input.id).maybeSingle();
  if (existing) return existing.aircraft_id === ctx.aircraftId ? { status: "ok", row: existing } : { status: "error", message: "Visit not found.", httpStatus: 404 };
  if (!(await providerOnAircraft(supabase, ctx.aircraftId, input.providerId)))
    return { status: "error", message: "That shop isn't on this aircraft.", httpStatus: 400 };
  if (!(await itemsOnAircraft(supabase, ctx.aircraftId, keys.keys))) return { status: "error", message: "Unknown item in the visit.", httpStatus: 400 };
  const booked = await alreadyBooked(supabase, ctx.aircraftId, keys.keys);
  if (booked) return { status: "error", message: booked, httpStatus: 409 };

  const { data: visit, error } = await supabase.from("planned_visit").insert({
    id: input.id, aircraft_id: ctx.aircraftId, status: "planned", provider_id: input.providerId || null,
    from_suggestion_key: fromKey, created_by: ctx.userId, ...picked.fields, week_of: input.weekOf,
  }).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!visit) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  if (keys.keys.length) {
    const { error: itemErr } = await supabase.from("planned_visit_item")
      .insert(keys.keys.map((k) => ({ aircraft_id: ctx.aircraftId, visit_id: visit.id, item_key: k })));
    if (itemErr) {
      // No half-booked visit: the item rows failed (a race on the open-item index), so take the visit back.
      await supabase.from("planned_visit").delete().eq("id", visit.id).eq("aircraft_id", ctx.aircraftId);
      return { status: "error", message: itemErr.code === "23505" ? "One of these items was just booked into another visit." : itemErr.message, httpStatus: 409 };
    }
  }
  return { status: "ok", row: visit };
}

/** `visit.update` (base = the visit's): week, day, shop, notes, and items added or taken out. */
export async function update(
  supabase: Db,
  ctx: WriteCtx,
  input: { visitId: string; weekOf?: string; visitDate?: string | null; providerId?: string | null; notes?: string | null;
    airport?: string | null; addItemKeys?: string[]; removeItemKeys?: string[] },
  base?: string,
): Promise<WriteResult> {
  const add = pickItemKeys(input.addItemKeys);
  const drop = pickItemKeys(input.removeItemKeys);
  if ("error" in add) return { status: "error", message: add.error, httpStatus: 400 };
  if ("error" in drop) return { status: "error", message: drop.error, httpStatus: 400 };
  const loaded = await loadVisit(supabase, ctx, input.visitId, base);
  if ("status" in loaded) return loaded;
  if (isClosed(loaded.row.status)) return { status: "error", message: CLOSED, httpStatus: 409 };
  const picked = pickVisitFields(input, loaded.row.week_of);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  // A new week with the old day would break the table's check; the day goes unless it is still inside.
  const day = picked.fields.visit_date !== undefined ? picked.fields.visit_date : loaded.row.visit_date;
  const week = picked.fields.week_of ?? loaded.row.week_of;
  if (day && (day < week || day > addDays(week, 6))) picked.fields.visit_date = null;
  if ("providerId" in input && !(await providerOnAircraft(supabase, ctx.aircraftId, input.providerId)))
    return { status: "error", message: "That shop isn't on this aircraft.", httpStatus: 400 };
  if (!(await itemsOnAircraft(supabase, ctx.aircraftId, add.keys))) return { status: "error", message: "Unknown item in the visit.", httpStatus: 400 };
  const booked = await alreadyBooked(supabase, ctx.aircraftId, add.keys, input.visitId);
  if (booked) return { status: "error", message: booked, httpStatus: 409 };

  if (drop.keys.length) {
    // Only items not done at this visit come out; a done item stays as the visit's record.
    const { error } = await supabase.from("planned_visit_item").delete()
      .eq("visit_id", input.visitId).eq("aircraft_id", ctx.aircraftId).in("item_key", drop.keys).is("done_completion_id", null);
    if (error) return { status: "error", message: error.message };
  }
  if (add.keys.length) {
    const { error } = await supabase.from("planned_visit_item").upsert(
      add.keys.map((k) => ({ aircraft_id: ctx.aircraftId, visit_id: input.visitId, item_key: k })),
      { onConflict: "visit_id,item_key", ignoreDuplicates: true });
    if (error) return { status: "error", message: error.code === "23505" ? "One of these items was just booked into another visit." : error.message, httpStatus: 409 };
  }
  // Always touch the visit so its version moves with its items (09 §5.5 composite edits).
  const patch = { ...picked.fields, ...("providerId" in input ? { provider_id: input.providerId || null } : {}), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("planned_visit").update(patch)
    .eq("id", input.visitId).eq("aircraft_id", ctx.aircraftId).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Visit not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/** `visit.setStatus` (base). Closing a visit returns its undone items to the suggestions (09 §2.5). */
export async function setStatus(
  supabase: Db,
  ctx: WriteCtx,
  input: { visitId: string; status: VisitStatus },
  base?: string,
): Promise<WriteResult> {
  if (!["in_shop", "awaiting_records", "done", "cancelled"].includes(input.status))
    return { status: "error", message: "Unknown visit status.", httpStatus: 400 };
  const loaded = await loadVisit(supabase, ctx, input.visitId, base);
  if ("status" in loaded) return loaded;
  if (loaded.row.status === input.status) return { status: "ok", row: loaded.row };
  if (!canMoveVisit(loaded.row.status, input.status))
    return { status: "error", message: isClosed(loaded.row.status) ? CLOSED : "A visit can't move to that state from here.", httpStatus: 409 };
  return moveVisit(supabase, ctx.aircraftId, input.visitId, input.status);
}

async function moveVisit(supabase: Db, aircraftId: string, visitId: string, status: VisitStatus): Promise<WriteResult> {
  if (isClosed(status)) {
    const { error } = await supabase.from("planned_visit_item").delete()
      .eq("visit_id", visitId).eq("aircraft_id", aircraftId).is("done_completion_id", null);
    if (error) return { status: "error", message: error.message };
  }
  const { data, error } = await supabase.from("planned_visit").update({ status })
    .eq("id", visitId).eq("aircraft_id", aircraftId).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Visit not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/** `visitSuggestion.dismiss`: hide a suggestion; a different item set or week makes a new key, so it can return. */
export async function dismissSuggestion(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; suggestionKey: string },
): Promise<WriteResult> {
  if (typeof input.suggestionKey !== "string" || !/^[0-9a-f]{16}$/.test(input.suggestionKey))
    return { status: "error", message: "Unknown suggestion.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { error } = await supabase.from("visit_suggestion_dismissal").upsert(
    { ...(input.id ? { id: input.id } : {}), aircraft_id: ctx.aircraftId, suggestion_key: input.suggestionKey, dismissed_by: ctx.userId },
    { onConflict: "aircraft_id,suggestion_key", ignoreDuplicates: true });
  if (error) return { status: "error", message: error.message };
  const { data } = await supabase.from("visit_suggestion_dismissal").select("*")
    .eq("aircraft_id", ctx.aircraftId).eq("suggestion_key", input.suggestionKey).maybeSingle();
  return data ? { status: "ok", row: data } : { status: "error", message: NO_EDIT, httpStatus: 403 };
}

/**
 * An item was done (a completion was recorded): tick it on the open visit holding it, link the
 * completion to that visit, and close an awaiting-records visit whose every item is now done (09 §2.5).
 * Derived bookkeeping: a failure never fails the completion that called it.
 */
export async function recordVisitCompletion(supabase: Db, aircraftId: string, itemKey: string, completionId: string): Promise<void> {
  try {
    const { data: row } = await supabase.from("planned_visit_item").select("id, visit_id")
      .eq("aircraft_id", aircraftId).eq("item_key", itemKey).is("done_completion_id", null).maybeSingle();
    if (!row) return;
    await supabase.from("planned_visit_item").update({ done_completion_id: completionId }).eq("id", row.id).eq("aircraft_id", aircraftId);
    await supabase.from("item_completion").update({ visit_id: row.visit_id }).eq("id", completionId).eq("aircraft_id", aircraftId);
    const [{ data: visit }, { data: open }] = await Promise.all([
      supabase.from("planned_visit").select("status").eq("id", row.visit_id).maybeSingle(),
      supabase.from("planned_visit_item").select("id").eq("visit_id", row.visit_id).is("done_completion_id", null)
        .not("item_key", "like", "squawk:%"),
    ]);
    if (visit?.status === "awaiting_records" && !(open ?? []).length) await moveVisit(supabase, aircraftId, row.visit_id, "done");
  } catch {
    // See above.
  }
}

/** The daily job (09 §2.5): a planned visit moves to awaiting_records the day after `coalesce(visit_date, week_of + 4)`. */
export function overduePlannedVisits(rows: Pick<PlannedVisit, "id" | "aircraft_id" | "status" | "week_of" | "visit_date">[], today: string) {
  return rows.filter((v) => v.status === "planned" && (v.visit_date ?? addDays(v.week_of, 4)) < today);
}

/** Runs with the service client from the daily cron. Returns how many visits moved. */
export async function advanceVisits(service: Db, today: string): Promise<number> {
  const { data, error } = await service.from("planned_visit").select("id, aircraft_id, status, week_of, visit_date")
    .eq("status", "planned").lt("week_of", today);
  if (error) throw new Error(error.message);
  let moved = 0;
  for (const v of overduePlannedVisits(data ?? [], today)) {
    const { error: e } = await service.from("planned_visit").update({ status: "awaiting_records" }).eq("id", v.id).eq("status", "planned");
    if (!e) moved++;
  }
  return moved;
}
