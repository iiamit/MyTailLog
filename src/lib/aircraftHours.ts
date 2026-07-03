import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Best estimate of the aircraft's current hours (total time), for
 * forecasting/urgency. Entries record the reading in whichever of hobbs / tach
 * the logbook uses (and total time is often written as tach), so we take the
 * highest value seen across BOTH fields, falling back to the enrollment
 * readings and to any synced hours_reading rows (e.g. MyFlightBook). Since a
 * shared aircraft can collect readings from multiple connected co-owners, the
 * max naturally spans all of them. Highest-known reading ≈ current time.
 */
export async function getCurrentHours(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  enrollment?: { hobbs: number | null; tach: number | null } | null,
): Promise<number | null> {
  let max: number | null = null;
  const consider = (v: number | null | undefined) => {
    if (v != null && Number.isFinite(v) && (max == null || v > max)) max = v;
  };

  const { data: rows } = await supabase
    .from("log_entry")
    .select("hobbs, tach")
    .eq("aircraft_id", aircraftId);
  for (const r of rows ?? []) {
    consider(r.hobbs);
    consider(r.tach);
  }

  // Synced readings (MyFlightBook and any future source) count too.
  const { data: readings } = await supabase
    .from("hours_reading")
    .select("hobbs, tach")
    .eq("aircraft_id", aircraftId);
  for (const r of readings ?? []) {
    consider(r.hobbs);
    consider(r.tach);
  }

  if (enrollment) {
    consider(enrollment.hobbs);
    consider(enrollment.tach);
  }
  return max;
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
