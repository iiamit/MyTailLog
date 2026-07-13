import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  currentTach,
  currentHobbs,
  meterValueAtDate,
  normalizeReadings,
  detectAnomalies,
  type Anomaly,
  type CurrentTach,
  type CurrentHobbs,
  type Meter,
  type Reading,
} from "@/lib/hobbsTach";

/**
 * All hobbs/tach readings for an aircraft, normalized for hobbsTach — log
 * entries, synced hours_reading rows (MyFlightBook, etc.), and the enrollment
 * readings as an oldest-origin anchor. A shared aircraft collects readings from
 * every connected co-owner, so this naturally spans all of them.
 */
async function fetchReadings(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: { hobbs: number | null; tach: number | null } | null,
): Promise<Reading[]> {
  const [{ data: entries }, { data: readings }] = await Promise.all([
    supabase.from("log_entry").select("id, entry_date, hobbs, tach, hours_reviewed_at").eq("aircraft_id", aircraftId),
    supabase.from("hours_reading").select("id, reading_date, hobbs, tach, hours_reviewed_at").eq("aircraft_id", aircraftId),
  ]);

  const out: Reading[] = [];
  for (const r of entries ?? [])
    out.push({ id: r.id, source: "entry", date: r.entry_date, hobbs: r.hobbs, tach: r.tach, reviewedAt: r.hours_reviewed_at });
  for (const r of readings ?? [])
    out.push({ id: r.id, source: "mfb", date: r.reading_date, hobbs: r.hobbs, tach: r.tach, reviewedAt: r.hours_reviewed_at });
  if (enrollment && (enrollment.hobbs != null || enrollment.tach != null))
    out.push({ id: "enrollment", source: "enrollment", date: null, hobbs: enrollment.hobbs, tach: enrollment.tach, reviewedAt: null });
  return normalizeReadings(out);
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
  enrollment?: { hobbs: number | null; tach: number | null } | null,
): Promise<CurrentTach> {
  return currentTach(await fetchReadings(supabase, aircraftId, enrollment));
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
  enrollment?: { hobbs: number | null; tach: number | null } | null,
): Promise<{
  tach: CurrentTach;
  hobbs: CurrentHobbs;
  // Meter value at a maintenance item's last-done date — the same-meter baseline
  // its countdown anchors to (so oil advances on hobbs even if recorded in tach).
  baselineFor: (date: string | null, meter: Meter) => number | null;
}> {
  const readings = await fetchReadings(supabase, aircraftId, enrollment);
  return {
    tach: currentTach(readings),
    hobbs: currentHobbs(readings),
    baselineFor: (date, meter) => meterValueAtDate(readings, date, meter),
  };
}

/** Current hours (= current tach) for callers that only need the number. */
export async function getCurrentHours(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: { hobbs: number | null; tach: number | null } | null,
): Promise<number | null> {
  return (await getCurrentTach(supabase, aircraftId, enrollment)).tach;
}

export type HoursAnomaly = Anomaly & { date: string | null };

/**
 * Likely-mis-keyed hobbs/tach readings (dropped/extra digit, fat-finger) with a
 * suggested fix, for owner review. Enrollment readings are excluded — they're a
 * single baseline, not editable from the review surface.
 */
export async function getHoursAnomalies(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: { hobbs: number | null; tach: number | null } | null,
): Promise<HoursAnomaly[]> {
  const readings = await fetchReadings(supabase, aircraftId, enrollment);
  const byId = new Map(readings.map((r) => [r.id, r]));
  return detectAnomalies(readings)
    .filter((a) => a.source !== "enrollment")
    .map((a) => ({ ...a, date: byId.get(a.readingId)?.date ?? null }));
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
