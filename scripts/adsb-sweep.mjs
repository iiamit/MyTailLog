#!/usr/bin/env node
// ===========================================================================
// ADS-B sweep runner — the half that has to run OFF Google Cloud.
//
// OpenSky's host (194.209.200.34) blackholes Google Cloud egress. Measured from
// a Cloud Run job in the MyTailLog project, us-east4 AND us-central1:
//
//   OpenSky  http=000  connect=0.000000s  total=25.003s   <- SYN dropped
//   GitHub   http=200                     total=0.027s    <- egress is fine
//
// From a GitHub-hosted runner the same request is http=200 in 0.86s, so the
// fetching lives here. Everything that needs the database — which aircraft are
// opted in, what window to ask for, and the writes — stays behind
// /api/cron/adsb. This script holds no database credentials at all.
//
// It also does no window arithmetic. The server hands back windows that already
// respect OpenSky's 2-UTC-day partition limit; the one unit-tested copy of that
// rule stays in lib/adsb/opensky.ts where it can't drift from this file.
// ===========================================================================

const SITE = process.env.MYTAILLOG_URL ?? "https://mytaillog.com";
const CRON_SECRET = required("CRON_SECRET");
const CLIENT_ID = required("OPENSKY_CLIENT_ID");
const CLIENT_SECRET = required("OPENSKY_CLIENT_SECRET");

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const API = "https://opensky-network.org/api/flights/aircraft";

// Generous next to the 10s that used to be here: the old value was tuned against
// a host we could not reach at all, so it never measured anything real. OpenSky
// answers in ~1s warm, and the job has 15 minutes.
const TIMEOUT_MS = 30_000;
const BATCH = 500; // server caps a single POST at 1000

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const { queries } = await getJson(`${SITE}/api/cron/adsb`);
  if (!queries?.length) {
    console.log("[adsb] no opted-in aircraft with a resolved hex — nothing to sweep");
    return;
  }
  const tails = new Set(queries.map((q) => q.icao24));
  console.log(`[adsb] ${queries.length} queries across ${tails.size} aircraft`);

  const token = await accessToken();
  const flights = [];
  let failed = 0;

  for (const q of queries) {
    try {
      const found = await fetchFlights(token, q);
      for (const f of found) flights.push({ ...f, aircraft_id: q.aircraft_id });
    } catch (e) {
      if (e.rateLimited) {
        // Stop outright rather than hammering a bucket we've already spent. The
        // 3-day lookback means tomorrow's run picks up whatever we missed.
        console.error(`[adsb] ${e.message} — stopping the sweep, posting what we have`);
        break;
      }
      failed += 1;
      console.error(`[adsb] ${q.icao24} ${q.begin}-${q.end} failed: ${e.message}`);
    }
  }

  console.log(`[adsb] ${flights.length} flight records observed (${failed} queries failed)`);

  let ingested = 0;
  for (let i = 0; i < flights.length; i += BATCH) {
    const res = await postJson(`${SITE}/api/cron/adsb`, { flights: flights.slice(i, i + BATCH) });
    ingested += res.ingested ?? 0;
    if (res.skipped) console.log(`[adsb] ${res.skipped} record(s) skipped by the server`);
  }
  console.log(`[adsb] ingested ${ingested} new flight(s)`);

  // A sweep where every query failed is a broken sweep, not an empty sky.
  if (failed === queries.length) {
    console.error("[adsb] every query failed");
    process.exit(1);
  }
}

async function accessToken() {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`OpenSky token request failed (${res.status})`);
  const json = await res.json();
  if (!json.access_token) throw new Error("OpenSky token response had no access_token");
  return json.access_token;
}

async function fetchFlights(token, q) {
  const url = `${API}?icao24=${encodeURIComponent(q.icao24)}&begin=${q.begin}&end=${q.end}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.status === 429) {
    const err = new Error("OpenSky rate limit hit");
    err.rateLimited = true;
    throw err;
  }
  // 404 with an empty body is how OpenSky reports "no flights in this window".
  // A legal, successful query — not an error.
  if (res.status === 404) return [];
  if (!res.ok) {
    // Surface the body on a 400: the partition-limit message lives there, and
    // it's the difference between a five-minute fix and a blind one.
    const detail = res.status === 400 ? `: ${(await res.text()).slice(0, 200)}` : "";
    throw new Error(`OpenSky flights request failed (${res.status})${detail}`);
  }

  const remaining = res.headers.get("x-rate-limit-remaining");
  if (remaining) console.log(`[adsb] OpenSky credits remaining: ${remaining}`);

  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    icao24: String(r.icao24 ?? q.icao24).toLowerCase(),
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    estDepartureAirport: r.estDepartureAirport ?? null,
    estArrivalAirport: r.estArrivalAirport ?? null,
    callsign: r.callsign ?? null,
  }));
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`POST ${url} failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

main().catch((e) => {
  console.error(`[adsb] sweep failed: ${e.message}`);
  process.exit(1);
});
