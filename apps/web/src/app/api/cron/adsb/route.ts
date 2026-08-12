// ===========================================================================
// ADS-B sweep endpoints — the half of the sweep that has to run on OUR side.
//
// WHY THIS ISN'T IN THE DAILY CRON ANY MORE
// OpenSky's host (194.209.200.34) blackholes Google Cloud egress. Measured from
// a Cloud Run job in this project, us-east4 AND us-central1:
//
//   DNS      194.209.200.34   resolves
//   OpenSky  http=000  connect=0.000000s  total=25.003s   <- SYN dropped
//   GitHub   http=200                     total=0.027s    <- egress is fine
//
// connect=0.000000s means the TCP handshake never completes — dropped, not
// refused. So the sweep inside the daily cron never made a single successful
// call from the day it shipped; every run logged a 10s timeout per aircraft.
// Raising the timeout cannot fix a blackhole.
//
// GitHub-hosted runners reach OpenSky fine (http=200 in 0.86s), so the FETCH
// moved to .github/workflows/adsb-sweep.yml. This module keeps everything that
// must stay server-side:
//
//   GET  → the exact, already-chunked OpenSky queries to run
//   POST → ingest the flights that came back
//
// Handing out pre-chunked windows is deliberate. OpenSky allows at most 2 UTC
// calendar-day partitions per query and 400s otherwise; windowChunks() is the
// one unit-tested place that knows this. The runner can't build an illegal
// window because it never does the arithmetic.
// ===========================================================================

import { createServiceClient } from "@/lib/supabase/service";
import { startOfUtcDay, windowChunks } from "@/lib/adsb/opensky";
import { json, cronDenied } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Whole UTC DAYS, never hours — see windowChunks(). Going back to the start of
// the UTC day 2 days ago covers 3 calendar days, so a single missed run heals
// itself on the next one instead of losing those hours permanently.
const LOOKBACK_DAYS = 2;

// A day of flying for a few hundred opted-in aircraft, with room to spare. This
// is a bound on one request, not a policy — the runner posts in batches.
const MAX_FLIGHTS = 1000;

type Query = { aircraft_id: string; icao24: string; begin: number; end: number };

/** The queries the runner should execute, one per aircraft per legal window. */
export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  const { data: fleet, error } = await supabase
    .from("aircraft")
    .select("id, icao24")
    .eq("adsb_enabled", true)
    .not("icao24", "is", null);
  if (error) return json({ error: error.message }, 500);

  const end = Math.floor(Date.now() / 1000);
  const begin = startOfUtcDay(end - LOOKBACK_DAYS * 86_400);

  const queries: Query[] = (fleet ?? []).flatMap((ac) =>
    windowChunks(begin, end).map(([from, to]) => ({
      aircraft_id: ac.id,
      icao24: String(ac.icao24).toLowerCase(),
      begin: from,
      end: to,
    })),
  );

  return json({ queries, window: { begin, end } });
}

type Incoming = {
  aircraft_id?: unknown;
  icao24?: unknown;
  firstSeen?: unknown;
  lastSeen?: unknown;
  estDepartureAirport?: unknown;
  estArrivalAirport?: unknown;
  callsign?: unknown;
};

/**
 * Ingest observed flights. Idempotent on (aircraft_id, first_seen), so a re-run
 * of the workflow — or the overlapping 3-day lookback — writes nothing new.
 *
 * The caller holds CRON_SECRET, but the payload still gets shape-checked and
 * the derived values (airborne_minutes, timestamps) are computed HERE. A
 * scheduled job on a public repo is a bigger surface than Cloud Scheduler was;
 * it should not be able to write arbitrary numbers into an hours estimate.
 */
export async function POST(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;

  let body: { flights?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }

  const flights = Array.isArray(body?.flights) ? (body.flights as Incoming[]) : null;
  if (!flights) return json({ error: "Expected { flights: [...] }." }, 400);
  if (flights.length > MAX_FLIGHTS) {
    return json({ error: `Too many flights in one request (${flights.length} > ${MAX_FLIGHTS}).` }, 400);
  }
  if (flights.length === 0) return json({ ingested: 0, skipped: 0 });

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  // Opt-in is re-checked at WRITE time, not just when GET handed out the
  // queries. ADS-B is position data about someone's aircraft; an owner who
  // switches it off while the sweep is mid-flight must not get rows anyway.
  const { data: enabled, error: fleetError } = await supabase
    .from("aircraft")
    .select("id")
    .eq("adsb_enabled", true);
  if (fleetError) return json({ error: fleetError.message }, 500);
  const allowed = new Set((enabled ?? []).map((a) => a.id));

  const rows = [];
  for (const f of flights) {
    const aircraftId = typeof f.aircraft_id === "string" ? f.aircraft_id : null;
    if (!aircraftId || !allowed.has(aircraftId)) continue;

    const icao24 = str(f.icao24)?.toLowerCase();
    if (!icao24) continue; // NOT NULL in 0048

    const firstSeen = Number(f.firstSeen);
    const lastSeen = Number(f.lastSeen);
    if (!Number.isFinite(firstSeen) || !Number.isFinite(lastSeen)) continue;
    if (lastSeen < firstSeen) continue;

    rows.push({
      aircraft_id: aircraftId,
      icao24,
      first_seen: new Date(firstSeen * 1000).toISOString(),
      last_seen: new Date(lastSeen * 1000).toISOString(),
      est_departure_airport: str(f.estDepartureAirport),
      est_arrival_airport: str(f.estArrivalAirport),
      callsign: str(f.callsign)?.trim() || null,
      airborne_minutes: Math.max(0, Math.round((lastSeen - firstSeen) / 60)),
    });
  }

  if (rows.length === 0) return json({ ingested: 0, received: 0, skipped: flights.length });

  // .select() so `ingested` counts rows the database actually INSERTED, not rows
  // we handed it. ON CONFLICT DO NOTHING ... RETURNING yields only the new ones,
  // and the 3-day lookback re-posts the same flights every day — reporting the
  // input length would log "ingested 2 new flights" forever. (Service-role
  // client, so the insert().select() RLS trap doesn't apply here.)
  const { data: inserted, error } = await supabase
    .from("adsb_flight")
    .upsert(rows, { onConflict: "aircraft_id,first_seen", ignoreDuplicates: true })
    .select("id");
  if (error) return json({ error: error.message }, 500);

  return json({
    ingested: inserted?.length ?? 0,
    received: rows.length,
    skipped: flights.length - rows.length,
  });
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}
