import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  currentTach,
  currentHobbs,
  currentAirframe,
  meterValueAtDate,
  normalizeReadings,
  detectAnomalies,
  detectDuplicateMeters,
  applyResets,
  toTotal,
  toFace,
  readingSourceOf,
  tachBridge,
  type TachBridge,
  type Anomaly,
  type CurrentTach,
  type CurrentHobbs,
  type CurrentAirframe,
  type Meter,
  type MeterReset,
  type Reading,
} from "@/lib/hobbsTach";
import { computeUtilization, type Utilization } from "@/lib/utilization";

/** What the caller knows about the aircraft's origin readings. */
export type Enrollment = {
  hobbs: number | null;
  tach: number | null;
  airframe?: number | null;
  // Enrollment has no reading date of its own in most callers; supplying the
  // aircraft's enrollment_date lets meter resets place it in the right era.
  date?: string | null;
} | null;

// Row shapes the pure builders need — the columns fetchReadings selects, and
// nothing more. Declared structurally (not as Database["log_entry"]["Row"]) so
// the native app can pass rows read out of its own SQLite mirror.
export type EntryRowLite = {
  id: string;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  hours_reviewed_at: string | null;
};
export type HoursRowLite = {
  id: string;
  reading_date: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  hours_reviewed_at: string | null;
  source: string | null;
};

/**
 * PURE core of fetchReadings: the same normalization, over rows you already
 * have. The native app reads log_entry/hours_reading out of on-device SQLite and
 * calls this, so there is exactly ONE definition of what counts as a reading.
 * Duplicating this on the device is how the two would drift and a countdown
 * would disagree between phone and web — on numbers people fly against.
 */
export function toReadings(
  entries: EntryRowLite[],
  readings: HoursRowLite[],
  enrollment?: Enrollment,
): Reading[] {
  const out: Reading[] = [];
  for (const r of entries)
    out.push({ id: r.id, source: "entry", date: r.entry_date, hobbs: r.hobbs, tach: r.tach, airframe: r.airframe, reviewedAt: r.hours_reviewed_at });
  for (const r of readings)
    // `*_estimate` sources are values we inferred, not meter reads — flagged so
    // the utilization rate can exclude them (see Reading.estimated).
    out.push({ id: r.id, source: readingSourceOf(r.source), date: r.reading_date, hobbs: r.hobbs, tach: r.tach, airframe: r.airframe, reviewedAt: r.hours_reviewed_at, estimated: String(r.source ?? "").endsWith("_estimate") });
  if (enrollment && (enrollment.hobbs != null || enrollment.tach != null || enrollment.airframe != null))
    out.push({
      id: "enrollment",
      source: "enrollment",
      date: enrollment.date ?? null,
      hobbs: enrollment.hobbs,
      tach: enrollment.tach,
      airframe: enrollment.airframe ?? null,
      reviewedAt: null,
    });
  return out; // RAW — forecast consumers normalize; anomaly detection needs the raw hobbs==tach.
}

/**
 * All meter readings for an aircraft — log entries, synced hours_reading rows
 * (MyFlightBook, etc.), and the enrollment readings as an oldest-origin anchor.
 * A shared aircraft collects readings from every connected co-owner, so this
 * naturally spans all of them. Fetch half only; the shaping is in toReadings().
 */
async function fetchReadings(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<Reading[]> {
  const [{ data: entries }, { data: readings }] = await Promise.all([
    supabase.from("log_entry").select("id, entry_date, hobbs, tach, airframe, hours_reviewed_at").eq("aircraft_id", aircraftId),
    supabase.from("hours_reading").select("id, reading_date, hobbs, tach, airframe, hours_reviewed_at, source").eq("aircraft_id", aircraftId),
  ]);
  return toReadings(entries ?? [], readings ?? [], enrollment);
}

/** Declared meter replacements, oldest first. Usually empty. */
export async function getMeterResets(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
): Promise<MeterReset[]> {
  const { data } = await supabase
    .from("meter_reset")
    .select("meter, reset_date, prior_value, new_value")
    .eq("aircraft_id", aircraftId)
    .order("reset_date", { ascending: true });
  return (data ?? []).map((r) => ({
    meter: r.meter as Meter,
    date: r.reset_date,
    prior: r.prior_value,
    next: r.new_value,
  }));
}

/**
 * Readings on one continuous scale: raw rows, then meter replacements stitched
 * in. Everything that does hour MATH goes through here, so a replaced meter is
 * handled once instead of in each consumer.
 */
async function fetchStitched(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<{ raw: Reading[]; readings: Reading[]; resets: MeterReset[] }> {
  const [raw, resets] = await Promise.all([
    fetchReadings(supabase, aircraftId, enrollment),
    getMeterResets(supabase, aircraftId),
  ]);
  // `raw` comes back too: the utilization rate works on UNSTITCHED readings so it
  // can DROP an interval that spans a meter replacement rather than smooth over it.
  return { raw, readings: applyResets(raw, resets), resets };
}

/**
 * Current TACH time — the meter maintenance/ADs are tracked against. Derived
 * from all readings via hobbsTach: anchored to a real hobbs↔tach pair and
 * walked forward on the latest hobbs when no recent tach exists (flagged
 * `estimated`). Replaces the old max(hobbs,tach) conflation, which inflated the
 * "now" with faster-accruing hobbs and made tach-based items look overdue.
 */
export async function getCurrentTach(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<CurrentTach> {
  const { readings } = await fetchStitched(supabase, aircraftId, enrollment);
  return currentTach(normalizeReadings(readings));
}

export type CurrentMeters = {
  tach: CurrentTach;
  hobbs: CurrentHobbs;
  airframe: CurrentAirframe;
  // Meter value at a maintenance item's last-done date — the same-meter baseline
  // its countdown anchors to (so oil advances on hobbs even if recorded in tach).
  baselineFor: (date: string | null, meter: Meter) => number | null;
  // Lifts stored face-value scalars onto the readings' scale — identity unless a
  // meter has been replaced.
  toTotalHours: (value: number | null, date: string | null, meter: Meter) => number | null;
  // How fast this aircraft has actually been flown lately, for turning an
  // hours-remaining figure into an approximate calendar date. `none` confidence
  // when the readings can't support one — callers then show hours only.
  utilization: Utilization;
  // Converts a hobbs reading to the equivalent tach. Built from the SAME
  // normalized, reset-stitched readings as everything else here — building it
  // from raw rows lets a mis-keyed hobbs==tach row anchor it and produce
  // nonsense, which is not a hypothetical (see the oil burn-rate report).
  bridge: TachBridge | null;
};

/**
 * PURE core of getCurrentMeters: everything downstream of the fetch. Takes RAW
 * (unstitched) readings plus the meter resets, because the utilization rate must
 * see the unstitched series so it can DROP an interval spanning a meter
 * replacement rather than smooth over it.
 *
 * The native app calls this with rows from its own SQLite mirror, so phone and
 * web derive "current hours" from one implementation.
 */
export function currentMetersFrom(raw: Reading[], resets: MeterReset[]): CurrentMeters {
  const readings = normalizeReadings(applyResets(raw, resets));
  return {
    tach: currentTach(readings),
    hobbs: currentHobbs(readings),
    airframe: currentAirframe(readings),
    baselineFor: (date, meter) => meterValueAtDate(readings, date, meter),
    toTotalHours: (value, date, meter) => toTotal(value, date, meter, resets),
    utilization: computeUtilization(raw, resets),
    bridge: tachBridge(readings),
  };
}

/**
 * Both current meters from a single readings fetch. Maintenance items count down
 * on the meter matching their kind — regulatory (100-hr, annual) on tach, usage
 * (oil, advisory) on hobbs — so the forecast needs both. Hobbs is the abundant
 * meter (MFB syncs it every flight); tach is the authoritative maintenance meter.
 */
export async function getCurrentMeters(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<CurrentMeters> {
  const [raw, resets] = await Promise.all([
    fetchReadings(supabase, aircraftId, enrollment),
    getMeterResets(supabase, aircraftId),
  ]);
  return currentMetersFrom(raw, resets);
}

/** Current hours (= current tach) for callers that only need the number. */
export async function getCurrentHours(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<number | null> {
  return (await getCurrentTach(supabase, aircraftId, enrollment)).tach;
}

/**
 * The most recent RECORDED reading from ANY source — logbook entry, synced
 * hours_reading (MFB / manual / adsb_estimate) or the enrollment baseline —
 * carrying at least one meter value.
 *
 * Hobbs and tach are CUMULATIVE, so this one row already accounts for every hour
 * flown up to its date, however many flights that was. That's what makes it the
 * ADS-B reconciliation cutoff (@/lib/adsb/reconcile): anything the aircraft flew
 * at or before this date is already in the meter.
 */
export async function getLatestRecordedReading(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<{ date: string; tach: number | null; hobbs: number | null; source: string } | null> {
  const readings = await fetchReadings(supabase, aircraftId, enrollment);
  let best: Reading | null = null;
  for (const r of readings) {
    if (!r.date) continue;
    if (r.hobbs == null && r.tach == null && r.airframe == null) continue;
    if (!best || r.date > best.date!) best = r;
  }
  return best ? { date: best.date!, tach: best.tach, hobbs: best.hobbs, source: best.source } : null;
}

export type HoursAnomaly = Anomaly & { date: string | null };

/**
 * Readings that need owner review: hobbs===tach duplicates (fix = clear hobbs)
 * plus likely mis-keyed values (dropped/extra digit, fat-finger; fix = a
 * suggested number). Duplicates run on RAW readings; mis-keyed on normalized so a
 * duplicate doesn't create a false monotonicity flag. Enrollment is excluded —
 * a single baseline, not editable from the review surface.
 */
export async function getHoursAnomalies(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: Enrollment,
): Promise<HoursAnomaly[]> {
  const [raw, resets] = await Promise.all([
    fetchReadings(supabase, aircraftId, enrollment),
    getMeterResets(supabase, aircraftId),
  ]);
  const byId = new Map(raw.map((r) => [r.id, r]));
  const withDate = (a: Anomaly): HoursAnomaly => ({ ...a, date: byId.get(a.readingId)?.date ?? null });
  // Mis-keyed detection runs on the STITCHED scale — a declared meter
  // replacement is not a typo, and left unstitched it flags the boundary reading
  // forever. The numbers we hand back are what the owner sees and edits, though,
  // so they come back to face value (a no-op when nothing was ever replaced).
  const unshift = (a: Anomaly): Anomaly => {
    const date = byId.get(a.readingId)?.date ?? null;
    return {
      ...a,
      value: toFace(a.value, date, a.field, resets) ?? a.value,
      suggested: toFace(a.suggested, date, a.field, resets),
    };
  };
  const anomalies = [
    ...detectDuplicateMeters(raw),
    ...detectAnomalies(normalizeReadings(applyResets(raw, resets))).map(unshift),
  ];
  return anomalies.filter((a) => a.source !== "enrollment").map(withDate);
}

/**
 * The most recent RECORDED hobbs/tach reading synced from MyFlightBook, for an
 * honest "hours as of <date>" label. Not a live meter — just the latest logged
 * flight we've seen. Returns null when nothing has been synced.
 */
export async function getLatestMfbReading(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
): Promise<{ date: string | null; hobbs: number | null; tach: number | null } | null> {
  const { data } = await supabase
    .from("hours_reading")
    .select("reading_date, hobbs, tach")
    .eq("aircraft_id", aircraftId)
    .eq("source", "myflightbook")
    .order("reading_date", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { date: data.reading_date, hobbs: data.hobbs, tach: data.tach };
}
