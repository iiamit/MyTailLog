import { createClient } from "@/lib/supabase/server";
import {
  getValidAccessToken,
  listAircraft,
  listRecentFlightReadings,
  normalizeTail,
  type MfbFlightReading,
} from "@/lib/myflightbook";

export const runtime = "nodejs";

/**
 * Pull the signed-in user's MyFlightBook aircraft + recent flights, match by
 * tail number to MyTailLog aircraft they can edit, and upsert one hours_reading
 * per matched aircraft holding the latest recorded hobbs/tach. Idempotent on
 * (aircraft_id, source, external_ref = MFB flight id).
 *
 * Best-effort throughout: not connected, an MFB error, or an unmatched tail all
 * return a clear JSON result rather than throwing.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  const accessToken = await getValidAccessToken(supabase, user.id);
  if (!accessToken) {
    return json({ error: "MyFlightBook isn’t connected. Connect it in your profile." }, 400);
  }

  let mfbAircraft, flights: MfbFlightReading[];
  try {
    [mfbAircraft, flights] = await Promise.all([
      listAircraft(accessToken),
      listRecentFlightReadings(accessToken),
    ]);
  } catch (e) {
    return json({ error: `MyFlightBook error: ${(e as Error).message}` }, 502);
  }

  // MyTailLog aircraft the user can see (RLS scopes this to owner/shared).
  const { data: myAircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number");

  const mineByTail = new Map<string, string>();
  for (const a of myAircraft ?? []) mineByTail.set(normalizeTail(a.tail_number), a.id);

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
    // Upsert per-row so one RLS rejection (e.g. a view-only aircraft) doesn't
    // sink the whole batch.
    const { error } = await supabase.from("hours_reading").upsert(
      {
        aircraft_id: aircraftId,
        reading_date: f.date,
        hobbs: f.hobbs,
        tach: f.tach,
        source: "myflightbook",
        synced_by: user.id,
        external_ref: String(f.flightId),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "aircraft_id,source,external_ref" },
    );
    if (error) errors.push(error.message);
    else synced += 1;
  }

  return json({
    synced,
    matched: matchedTails.length,
    unmatchedTails,
    errors: errors.length ? errors : undefined,
  });
}

function newer(a: MfbFlightReading, b: MfbFlightReading): boolean {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da > db;
  return a.flightId > b.flightId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
