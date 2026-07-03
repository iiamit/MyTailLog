// ===========================================================================
// "Sync one user's hours" — the single implementation shared by the manual
// profile button (RLS client, aircraft resolved by the signed-in user's JWT)
// and the daily cron (service-role client, aircraft resolved explicitly since
// there is no JWT). All MFB HTTP stays in @/lib/myflightbook.
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  getValidAccessToken,
  listAircraft,
  listRecentFlightReadings,
  normalizeTail,
  type MfbFlightReading,
} from "@/lib/myflightbook";

export type SyncResult = {
  synced: number;
  matched: number;
  unmatchedTails: string[];
  errors: string[];
};

/**
 * Pull the user's MFB aircraft + recent flights, match by tail to the aircraft
 * they can write to, and upsert one hours_reading per matched aircraft holding
 * the latest recorded hobbs/tach. Idempotent on (aircraft_id, source,
 * external_ref = MFB flight id).
 *
 * `aircraft` is supplied by the caller — the tails this user may write to. The
 * manual route passes RLS-scoped rows; the cron passes owned + shared rows it
 * resolved itself.
 *
 * Returns null when the user has no usable MFB access token (not connected).
 * Throws on an MFB HTTP error so the caller can distinguish and report it.
 */
export async function syncUserHours(
  supabase: SupabaseClient<Database>,
  userId: string,
  aircraft: { id: string; tail_number: string }[],
): Promise<SyncResult | null> {
  const accessToken = await getValidAccessToken(supabase, userId);
  if (!accessToken) return null;

  const [mfbAircraft, flights] = await Promise.all([
    listAircraft(accessToken),
    listRecentFlightReadings(accessToken),
  ]);

  const mineByTail = new Map<string, string>();
  for (const a of aircraft) mineByTail.set(normalizeTail(a.tail_number), a.id);

  // MFB aircraftId → MyTailLog aircraft id, for tails present on both sides.
  const mfbIdToLocal = new Map<number, string>();
  const matchedTails: string[] = [];
  const unmatchedTails: string[] = [];
  for (const a of mfbAircraft) {
    const localId = mineByTail.get(normalizeTail(a.tailNumber));
    if (localId) {
      mfbIdToLocal.set(a.aircraftId, localId);
      matchedTails.push(a.tailNumber);
    } else {
      unmatchedTails.push(a.tailNumber);
    }
  }

  // Latest flight (by date, then id) per matched MFB aircraft.
  const latest = new Map<number, MfbFlightReading>();
  for (const f of flights) {
    if (!mfbIdToLocal.has(f.aircraftId)) continue;
    const cur = latest.get(f.aircraftId);
    if (!cur || newer(f, cur)) latest.set(f.aircraftId, f);
  }

  let synced = 0;
  const errors: string[] = [];
  for (const [mfbId, f] of latest) {
    const aircraftId = mfbIdToLocal.get(mfbId)!;
    // Upsert per-row so one rejection doesn't sink the whole batch.
    const { error } = await supabase.from("hours_reading").upsert(
      {
        aircraft_id: aircraftId,
        reading_date: f.date,
        hobbs: f.hobbs,
        tach: f.tach,
        source: "myflightbook",
        synced_by: userId,
        external_ref: String(f.flightId),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "aircraft_id,source,external_ref" },
    );
    if (error) errors.push(error.message);
    else synced += 1;
  }

  return { synced, matched: matchedTails.length, unmatchedTails, errors };
}

function newer(a: MfbFlightReading, b: MfbFlightReading): boolean {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da > db;
  return a.flightId > b.flightId;
}
