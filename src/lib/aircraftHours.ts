import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Best estimate of the aircraft's current hours (total time), for
 * forecasting/urgency. Entries record the reading in whichever of hobbs / tach
 * the logbook uses (and total time is often written as tach), so we take the
 * highest value seen across BOTH fields, falling back to the enrollment
 * readings. Highest-known reading ≈ current time.
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

  if (enrollment) {
    consider(enrollment.hobbs);
    consider(enrollment.tach);
  }
  return max;
}
