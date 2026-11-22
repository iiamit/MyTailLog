import { insertRecords } from "./insert";
import { replayRpc } from "./replay";
import { writeRecord } from "./conditional";
import type { MaintenanceItem } from "@/lib/database.types";
import { maintenanceNextDue, STANDARD_ITEMS, DEFAULT_SEED_KINDS } from "@/lib/maintenance";
import { METERS, type Meter } from "@/lib/hobbsTach";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";
import { isIsoDate, validNumber } from "./meters";

// The ONE implementation of every maintenance-item write (CONTRACT §3 C2, §4).
// See entries.ts for the rules. Pure helpers are tested in
// apps/web/test/writes-c2.test.ts.

const NO_EDIT = "You don't have edit access to this aircraft.";

/** The editable fields of a maintenance item (the web form's shape, minus id). */
export type MaintenanceItemFields = {
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
  notes: string | null;
  /** null = app default (oil → hobbs, everything else → tach). */
  meter: Meter | null;
} & Partial<Pick<MaintenanceItem, "line" | "shop_kind" | "provider_id" | "ifr_only" | "expires_on" | "visit_window_days" | "visit_window_hours" | "remind_lead_days" | "remind_lead_hours">>;

/** What "mark done" carries. The legacy phone build sends the same fields in
 *  snake_case to /api/aircraft/[id]/actions; that route maps them here. */
export type MarkDoneInput = {
  itemId: string;
  /** Last-done date; null clears it (web "unset"). Absent = today. */
  date?: string | null;
  hours?: number | null;
  /** The physical meter the entered hours came from. */
  meter?: Meter;
  // The 91.171(d) record, written as a real log_entry when BOTH logbookId and
  // description are present (a checkbox that only moved a due-date would leave
  // a VOR-check owner non-compliant while telling them they were fine).
  logbookId?: string | null;
  description?: string | null;
  workPerformed?: string | null;
  signature?: string | null;
  tach?: number | null;
  hobbs?: number | null;
  /** The log_entry's id — the mutation id, so a retry never writes two. */
  entryId?: string;
  recordCompletion?: boolean;
  completionId?: string;
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Validate an untrusted item payload at the trust boundary. */
export function pickMaintenanceFields(input: unknown): { fields: MaintenanceItemFields } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Item fields are missing." };
  const src = input as Record<string, unknown>;
  const label = typeof src.label === "string" ? src.label.trim() : "";
  if (!label) return { error: "Label is required." };
  if (src.meter != null && !METERS.includes(src.meter as Meter)) return { error: "Unknown meter." };
  if (![src.interval_months, src.interval_hours, src.last_done_hours].every(validNumber)) {
    return { error: "Intervals and hours must be zero or a positive number." };
  }
  if (src.last_done_date != null && !isIsoDate(src.last_done_date)) return { error: "Last done must be a date." };
  const extras: Record<string, unknown> = {};
  for (const [key, allowed] of [["line", ["airframe", "engine", "prop", "avionics"]], ["shop_kind", ["mechanic", "avionics_shop", "prop_shop", "engine_shop", "self"]]] as const) {
    if (!(key in src)) continue;
    if (src[key] != null && !(allowed as readonly unknown[]).includes(src[key])) return { error: `Unknown ${key.replace("_", " ")}.` };
    extras[key] = src[key];
  }
  for (const key of ["visit_window_days", "visit_window_hours", "remind_lead_days", "remind_lead_hours"] as const) {
    if (!(key in src)) continue;
    if (!validNumber(src[key])) return { error: "Reminder and visit windows must be zero or a positive number." };
    extras[key] = src[key];
  }
  if ("provider_id" in src) {
    if (src.provider_id != null && (typeof src.provider_id !== "string" || !/^[0-9a-f-]{36}$/i.test(src.provider_id))) return { error: "Pick a shop or mechanic." };
    extras.provider_id = src.provider_id;
  }
  if ("expires_on" in src) {
    if (src.expires_on != null && !isIsoDate(src.expires_on)) return { error: "Pick an expiry date." };
    extras.expires_on = src.expires_on;
  }
  if ("ifr_only" in src) {
    if (typeof src.ifr_only !== "boolean") return { error: "Invalid IFR-only setting." };
    extras.ifr_only = src.ifr_only;
  }
  return {
    fields: {
      ...extras,
      kind: typeof src.kind === "string" && src.kind ? src.kind : "other",
      label,
      regulatory: src.regulatory === true,
      interval_months: (src.interval_months as number | null | undefined) ?? null,
      interval_hours: (src.interval_hours as number | null | undefined) ?? null,
      last_done_date: (src.last_done_date as string | null | undefined) ?? null,
      last_done_hours: (src.last_done_hours as number | null | undefined) ?? null,
      notes: typeof src.notes === "string" ? src.notes : null,
      meter: (src.meter as Meter | null | undefined) ?? null,
    },
  };
}

type DueSource = Pick<MaintenanceItem, "kind" | "interval_months" | "interval_hours" | "updated_at">;

/**
 * What marking an item done writes, or why it can't. The §2 conflict rule: with
 * a `base` and a row that moved on since, nothing is written. Without a base
 * (web, legacy phones) the write applies as today. next-due comes from the SAME
 * maintenanceNextDue() the web uses, so the calendar-month rule can't drift.
 */
export function markDonePlan(
  item: DueSource,
  input: Pick<MarkDoneInput, "date" | "hours" | "meter">,
  base?: string,
):
  | { conflict: true }
  | { error: string }
  | { patch: Pick<MaintenanceItem, "last_done_date" | "last_done_hours" | "next_due_date" | "next_due_hours"> & Partial<Pick<MaintenanceItem, "meter">> } {
  if (isStale(item.updated_at, base)) return { conflict: true };
  const date = input.date === undefined ? new Date().toISOString().slice(0, 10) : input.date;
  if (date != null && !isIsoDate(date)) return { error: "Pick a date." };
  if (!validNumber(input.hours)) return { error: "Hours must be zero or a positive number." };
  if (input.meter && !METERS.includes(input.meter)) return { error: "Pick a valid meter." };
  const hours = input.hours ?? null;
  const due = maintenanceNextDue({
    kind: item.kind,
    interval_months: item.interval_months,
    interval_hours: item.interval_hours,
    last_done_date: date,
    last_done_hours: hours,
  });
  return { patch: { last_done_date: date, last_done_hours: hours, ...due, ...(input.meter ? { meter: input.meter } : {}) } };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function loadItem(
  supabase: Db,
  ctx: WriteCtx,
  itemId: string,
): Promise<{ row: MaintenanceItem } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("maintenance_item")
    .select("*")
    .eq("id", itemId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "That item isn't on this aircraft.", httpStatus: 404 };
  return { row };
}

/** Add (no id) or edit (id + base) an item. Next-due is recomputed from the fields. */
export async function upsert(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; item: unknown },
  base?: string,
): Promise<WriteResult> {
  const picked = pickMaintenanceFields(input.item);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (picked.fields.provider_id) {
    const { data: provider } = await supabase.from("service_provider").select("id").eq("id", picked.fields.provider_id).eq("aircraft_id", ctx.aircraftId).maybeSingle();
    if (!provider) return { status: "error", message: "That shop isn't on this aircraft.", httpStatus: 400 };
  }
  const row = { aircraft_id: ctx.aircraftId, ...picked.fields, ...maintenanceNextDue(picked.fields) };

  if (input.id) {
    const loaded = await loadItem(supabase, ctx, input.id);
    if ("status" in loaded) return loaded;
    if (isStale(loaded.row.updated_at, base)) return { status: "conflict", row: loaded.row };
    const patch = { ...row };
    delete (patch as Partial<typeof row>).aircraft_id;
    return writeRecord(supabase, ctx, "maintenance_item", input.id, loaded.row.updated_at, patch);
  }

  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return insertRecords(supabase, ctx, "maintenance_item", row);
}

/** Delete an item. Nothing references maintenance_item(id). */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { itemId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadItem(supabase, ctx, input.itemId);
  if ("status" in loaded) return loaded;
  if (isStale(loaded.row.updated_at, base)) return { status: "conflict", row: loaded.row };
  return writeRecord(supabase, ctx, "maintenance_item", input.itemId, loaded.row.updated_at, null);
}

/**
 * Mark an item done at a date/hours ({@link markDonePlan}), and when the caller
 * gave us a logbook and a description, write the legal record too — the VOR
 * check being the reason this exists. Both the web and the phone come through
 * here so the two can't drift.
 */
export async function markDone(
  supabase: Db,
  ctx: WriteCtx,
  input: MarkDoneInput,
  base?: string,
): Promise<WriteResult> {
  if (!input.itemId) return { status: "error", message: "Which item?", httpStatus: 400 };
  const loaded = await loadItem(supabase, ctx, input.itemId);
  if ("status" in loaded) return loaded;
  const plan = markDonePlan(loaded.row, input, base);
  if ("conflict" in plan) return { status: "conflict", row: loaded.row };
  if ("error" in plan) return { status: "error", message: plan.error, httpStatus: 400 };

  const description = input.description?.trim();
  if (input.logbookId && description && ![input.tach, input.hobbs].every(validNumber)) {
    return { status: "error", message: "Readings must be zero or a positive number.", httpStatus: 400 };
  }
  const readingId = input.entryId ?? crypto.randomUUID();
  // SQL compares the item version and commits all three records together.
  const { data, error } = await replayRpc(supabase, ctx, "mark_maintenance_done", {
    p_aircraft: ctx.aircraftId, p_item: input.itemId, p_base: loaded.row.updated_at, p_patch: plan.patch,
    p_reading: input.meter && plan.patch.last_done_date && plan.patch.last_done_hours != null ? {
      id: readingId, reading_date: plan.patch.last_done_date,
      hobbs: input.meter === "hobbs" ? plan.patch.last_done_hours : null,
      tach: input.meter === "tach" ? plan.patch.last_done_hours : null,
      airframe: input.meter === "airframe" ? plan.patch.last_done_hours : null,
    } : null,
    p_completion: input.recordCompletion ? { id: input.completionId ?? crypto.randomUUID(), done_date: plan.patch.last_done_date, done_hours: plan.patch.last_done_hours, meter: input.meter ?? loaded.row.meter, source: input.logbookId && description ? "vor_check" : "mark_done" } : null,
    p_entry: input.logbookId && description ? {
      id: input.entryId ?? readingId, logbook_id: input.logbookId, entry_date: plan.patch.last_done_date,
      tach: input.tach ?? null, hobbs: input.hobbs ?? null, description,
      work_performed: input.workPerformed ?? null, signature_name: input.signature ?? null,
    } : null,
  });
  return error ? { status: "error", message: error.message } : data as WriteResult;
}

/** Seed the common Part 91 recurring items (skips any already present). Returns row `{ added }`. */
export async function seedStandard(supabase: Db, ctx: WriteCtx): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const toAdd = STANDARD_ITEMS.filter((s) => DEFAULT_SEED_KINDS.includes(s.kind)).map((s) => ({
    aircraft_id: ctx.aircraftId,
    kind: s.kind,
    label: s.label,
    regulatory: s.regulatory,
    interval_months: s.interval_months,
    interval_hours: s.interval_hours,
  }));
  const { data, error } = await replayRpc(supabase, ctx, "seed_maintenance_items", { p_aircraft: ctx.aircraftId, p_items: toAdd });
  return error ? { status: "error", message: error.message } : data as WriteResult;
}
