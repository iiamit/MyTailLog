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
 * they can write to, and upsert one hours_reading per matched local aircraft holding
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
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const [mfbAircraft, flights] = await Promise.all([
    listAircraft(accessToken),
    listRecentFlightReadings(accessToken),
  ]);

  const mineByTail = new Map<string, string>();
  for (const a of aircraft) mineByTail.set(normalizeTail(a.tail_number), a.id);

  // MFB aircraftId → MyTailLog aircraft id, for tails present on both sides.
  const mfbIdToLocal = new Map<number, string>();
  const matchedAircraft = new Set<string>();
  const unmatchedTails: string[] = [];
  for (const a of mfbAircraft) {
    const localId = mineByTail.get(normalizeTail(a.tailNumber));
    if (localId) {
      mfbIdToLocal.set(a.aircraftId, localId);
      matchedAircraft.add(localId);
    } else {
      unmatchedTails.push(a.tailNumber);
    }
  }

  // MFB returns flights newest first, using time/Hobbs start within the same
  // date. FlightID is creation order, which need not be the order flown. Pick
  // once per LOCAL aircraft: two MFB aircraft records may share its tail.
  const latest = latestFlightsByAircraft(flights, mfbIdToLocal);

  let synced = 0;
  const errors: string[] = [];
  for (const [aircraftId, f] of latest) {
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

  return { synced, matched: matchedAircraft.size, unmatchedTails, errors };
}

export function latestFlightsByAircraft(
  flights: MfbFlightReading[],
  mfbIdToLocal: Map<number, string>,
): Map<string, MfbFlightReading> {
  const latest = new Map<string, MfbFlightReading>();
  for (const flight of flights) {
    const localId = mfbIdToLocal.get(flight.aircraftId);
    if (localId && !latest.has(localId)) latest.set(localId, flight);
  }
  return latest;
}
