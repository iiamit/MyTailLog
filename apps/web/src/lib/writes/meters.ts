import type { HoursReading, MeterResetRow } from "@/lib/database.types";
import { METERS, type Meter } from "@/lib/hobbsTach";
import { normalizeIcao24, resolveIcao24 } from "@/lib/adsb/icao24";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every meter write (CONTRACT §3 C2, §4): manual
// readings, meter replacements, the enrollment baseline and the ADS-B controls.
// See entries.ts for the rules. Pure helpers are tested in
// apps/web/test/writes-c2.test.ts.

const NO_EDIT = "You don't have edit access to this aircraft.";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A meter value from an untrusted payload: absent/null, or a finite number ≥ 0. */
export const validNumber = (v: unknown): v is number | null | undefined =>
  v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0);

export const isIsoDate = (v: unknown): v is string => typeof v === "string" && ISO_DATE.test(v);

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export type ReadingInput = { date?: string | null; tach?: number | null; hobbs?: number | null; airframe?: number | null };

/** Validate a reading: a real date (defaults to today), at least one meter, nothing negative. */
export function pickReading(
  input: unknown,
): { reading_date: string; tach: number | null; hobbs: number | null; airframe: number | null } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Reading is missing." };
  const src = input as ReadingInput;
  const date = src.date ?? today();
  if (!isIsoDate(date)) return { error: "Pick a date." };
  const values = [src.tach, src.hobbs, src.airframe];
  if (values.every((v) => v == null)) return { error: "Enter at least one reading." };
  if (!values.every(validNumber)) return { error: "Readings must be zero or a positive number." };
  return { reading_date: date, tach: src.tach ?? null, hobbs: src.hobbs ?? null, airframe: src.airframe ?? null };
}

export type ResetInput = { meter: Meter; date: string; prior: number | null; next: number; notes?: string | null };

/** Validate a meter replacement: a known meter, a date, non-negative readings. */
export function pickReset(
  input: unknown,
): { meter: Meter; reset_date: string; prior_value: number | null; new_value: number; notes: string | null } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Meter replacement is missing." };
  const src = input as Partial<ResetInput>;
  if (!src.meter || !METERS.includes(src.meter)) return { error: "Pick a meter." };
  if (!isIsoDate(src.date)) return { error: "When did the new meter go in?" };
  if (!validNumber(src.prior) || !validNumber(src.next)) return { error: "Readings must be zero or a positive number." };
  return {
    meter: src.meter,
    reset_date: src.date,
    prior_value: src.prior ?? null,
    new_value: src.next ?? 0,
    notes: typeof src.notes === "string" ? src.notes.trim() || null : null,
  };
}

// ---------------------------------------------------------------------------
// Readings (hours_reading, source = manual)
// ---------------------------------------------------------------------------

/**
 * Record a meter reading by hand. The normal path is a scanned logbook page or a
 * MyFlightBook sync, but airframe time (a glider's only meter) comes from neither
 * — this is how it gets in. `id` is the phone's idempotency key, stored as
 * `external_ref` (the unique key is aircraft_id+source+external_ref), so a retry
 * after a lost response lands on the row it already wrote.
 */
export async function addReading(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string } & ReadingInput,
): Promise<WriteResult> {
  const picked = pickReading(input);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const row = { aircraft_id: ctx.aircraftId, ...picked, source: "manual", synced_by: ctx.userId };
  const { data, error } = input.id
    ? await supabase
        .from("hours_reading")
        .upsert(
          { ...row, external_ref: input.id, updated_at: new Date().toISOString() },
          { onConflict: "aircraft_id,source,external_ref" },
        )
        .select("*")
        .maybeSingle()
    : await supabase.from("hours_reading").insert(row).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}

/** Load a manual reading for an update/delete: edit access, ownership, base check.
 *  Scoped to manual rows: a synced MyFlightBook reading is changed by re-syncing,
 *  and a logbook entry's hours belong to the entry, not to this page. */
async function loadReading(
  supabase: Db,
  ctx: WriteCtx,
  readingId: string,
  base: string | undefined,
): Promise<{ row: HoursReading } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("hours_reading")
    .select("*")
    .eq("id", readingId)
    .eq("aircraft_id", ctx.aircraftId)
    .eq("source", "manual")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Reading not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

/** Correct a manual reading. Fields left out keep their stored value. */
export async function updateReading(
  supabase: Db,
  ctx: WriteCtx,
  input: { readingId: string } & ReadingInput,
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadReading(supabase, ctx, input.readingId, base);
  if ("status" in loaded) return loaded;
  const cur = loaded.row;
  const picked = pickReading({
    date: input.date ?? cur.reading_date,
    tach: "tach" in input ? input.tach : cur.tach,
    hobbs: "hobbs" in input ? input.hobbs : cur.hobbs,
    airframe: "airframe" in input ? input.airframe : cur.airframe,
  });
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  const { data, error } = await supabase
    .from("hours_reading")
    .update(picked)
    .eq("id", input.readingId)
    .eq("aircraft_id", ctx.aircraftId)
    .eq("source", "manual")
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Reading not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/** Delete a manual reading. Nothing references hours_reading(id). */
export async function deleteReading(
  supabase: Db,
  ctx: WriteCtx,
  input: { readingId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadReading(supabase, ctx, input.readingId, base);
  if ("status" in loaded) return loaded;
  const { data, error } = await supabase
    .from("hours_reading")
    .delete()
    .eq("id", input.readingId)
    .eq("aircraft_id", ctx.aircraftId)
    .eq("source", "manual")
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Reading not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

// ---------------------------------------------------------------------------
// Meter replacements (meter_reset)
// ---------------------------------------------------------------------------

/**
 * Record a meter replacement: the old meter's final reading and what the new one
 * started at. The app stitches history across it so hour-based items keep
 * counting instead of seeing time run backwards. `id` is the phone's key.
 */
export async function addReset(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string } & ResetInput,
): Promise<WriteResult> {
  const picked = pickReset(input);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("meter_reset")
    .upsert(
      { ...(input.id ? { id: input.id } : {}), aircraft_id: ctx.aircraftId, ...picked },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (data) return { status: "ok", row: data };
  // ignoreDuplicates returned nothing: a retry of an id we already wrote.
  const { data: existing } = await supabase
    .from("meter_reset")
    .select("*")
    .eq("id", input.id ?? "")
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  return existing ? { status: "ok", row: existing } : { status: "error", message: "Couldn't save the meter replacement." };
}

/** Delete a meter replacement. Nothing references meter_reset(id). */
export async function deleteReset(
  supabase: Db,
  ctx: WriteCtx,
  input: { resetId: string },
  base?: string,
): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error: loadErr } = await supabase
    .from("meter_reset")
    .select("*")
    .eq("id", input.resetId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (loadErr) return { status: "error", message: loadErr.message };
  if (!row) return { status: "error", message: "Meter replacement not found.", httpStatus: 404 };
  if (isStale((row as MeterResetRow).updated_at, base)) return { status: "conflict", row };
  const { data, error } = await supabase
    .from("meter_reset")
    .delete()
    .eq("id", input.resetId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Meter replacement not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

// ---------------------------------------------------------------------------
// Aircraft-level meter settings
// ---------------------------------------------------------------------------

/**
 * Correct the enrollment meter readings — the baseline captured when the
 * aircraft was first added. Passing null CLEARS a meter, which is how an owner
 * who tracks tach only removes hobbs from the app entirely.
 */
export async function updateEnrollmentMeters(
  supabase: Db,
  ctx: WriteCtx,
  input: { hobbs: number | null; tach: number | null; airframe: number | null },
): Promise<WriteResult> {
  if (![input.hobbs, input.tach, input.airframe].every(validNumber)) {
    return { status: "error", message: "Readings must be zero or a positive number — leave blank to clear.", httpStatus: 400 };
  }
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("aircraft")
    .update({ enrollment_hobbs: input.hobbs, enrollment_tach: input.tach, enrollment_airframe: input.airframe })
    .eq("id", ctx.aircraftId)
    .select("id, enrollment_hobbs, enrollment_tach, enrollment_airframe")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}

// ---------------------------------------------------------------------------
// ADS-B (passive hours)
// ---------------------------------------------------------------------------

/**
 * Turn the ADS-B fallback observer on or off. Opt-in, off by default: this is
 * position data about someone's aircraft and nobody gets enrolled silently.
 * Turning it on resolves the Mode S hex once and caches it; `hexInput` is the
 * manual escape hatch when neither the FAA registry nor adsbdb knows the
 * aircraft. Returns row `{ icao24 }`.
 */
export async function setAdsbEnabled(
  supabase: Db,
  ctx: WriteCtx,
  input: { enabled: boolean; hexInput?: string | null },
): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("tail_number, icao24")
    .eq("id", ctx.aircraftId)
    .maybeSingle();
  if (!aircraft) return { status: "error", message: "Aircraft not found.", httpStatus: 404 };

  let icao24 = aircraft.icao24;
  if (input.hexInput != null && input.hexInput.trim() !== "") {
    icao24 = normalizeIcao24(input.hexInput);
    if (!icao24) return { status: "error", message: "A Mode S address is six hex characters, e.g. A12239.", httpStatus: 400 };
  } else if (input.enabled && !icao24) {
    icao24 = await resolveIcao24(aircraft.tail_number);
    if (!icao24) {
      return {
        status: "error",
        message:
          "Couldn't find this aircraft's Mode S address in the FAA registry or adsbdb. Enter it by hand — it's on your registration.",
      };
    }
  }

  const { data, error } = await supabase
    .from("aircraft")
    .update({ adsb_enabled: input.enabled === true, icao24 })
    .eq("id", ctx.aircraftId)
    .select("id, adsb_enabled, icao24")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}

/**
 * Dismiss the current suggestion: mark every undismissed observed flight as
 * seen so it stops being counted. The rows stay — dismissing is "I know, and my
 * records are right", not "delete the observation". Returns row `{ dismissed }`.
 */
export async function dismissAdsbFlights(supabase: Db, ctx: WriteCtx): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("adsb_flight")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("aircraft_id", ctx.aircraftId)
    .is("dismissed_at", null)
    .select("id");
  if (error) return { status: "error", message: error.message };
  return { status: "ok", row: { dismissed: data?.length ?? 0 } };
}

/**
 * Accept an ADS-B suggestion: write ONE hours_reading with source
 * `adsb_estimate`, at the value the USER confirmed. Never auto-written.
 *
 * Deliberately `adsb_estimate` and not `manual`: it is never authoritative for
 * compliance and must never feed a utilization-rate calculation, which would be
 * circular. `external_ref` keys it to the date so a double-click can't create a
 * second row. The accepted reading becomes the new cutoff, so the observed
 * flights behind it are dismissed too.
 */
export async function acceptAdsbEstimate(
  supabase: Db,
  ctx: WriteCtx,
  input: { date: string; tach: number | null; hobbs: number | null },
): Promise<WriteResult> {
  const picked = pickReading({ date: input.date, tach: input.tach, hobbs: input.hobbs });
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("hours_reading")
    .upsert(
      {
        aircraft_id: ctx.aircraftId,
        reading_date: picked.reading_date,
        tach: picked.tach,
        hobbs: picked.hobbs,
        source: "adsb_estimate",
        synced_by: ctx.userId,
        external_ref: picked.reading_date,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "aircraft_id,source,external_ref" },
    )
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const dismissed = await dismissAdsbFlights(supabase, ctx);
  if (dismissed.status !== "ok") return dismissed;
  return { status: "ok", row: data };
}
