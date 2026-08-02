// ===========================================================================
// OpenSky Network — flight history for one ICAO 24-bit address.
//
// Verified 2026-08-02: `/flights/aircraft` returns 403 anonymously. Basic auth
// was removed in March 2026, so this is OAuth2 client credentials only.
//
// The ONLY thing that leaves this process is a Mode S hex, which is public
// registry data. No user data is sent outbound.
//
// Credits are bucketed per endpoint: /flights/* is 4,000/day on a standard
// account and a <24 h window costs 4 credits (~1,000 aircraft/day). We read
// X-Rate-Limit-Remaining so the ceiling is visible before it's hit, and on 429
// we throw RateLimited so the caller STOPS the sweep instead of retrying.
// ===========================================================================

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
const API = "https://opensky-network.org/api/flights/aircraft";

/** The API rejects a begin→end interval longer than 2 days. Stay under it. */
const MAX_WINDOW_S = 47 * 3600;
const TIMEOUT_MS = 10_000;

export type OpenSkyFlight = {
  icao24: string;
  firstSeen: number; // unix seconds
  lastSeen: number; // unix seconds
  estDepartureAirport: string | null;
  estArrivalAirport: string | null;
  callsign: string | null;
};

/** Injectable so the cron, the tests and the E2E stub all share one shape. */
export type OpenSkyClient = (
  icao24: string,
  begin: number,
  end: number,
) => Promise<OpenSkyFlight[]>;

/** Thrown on 429 — the caller must stop the sweep, not retry in a loop. */
export class RateLimited extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super(`OpenSky rate limit hit; retry after ${retryAfterSeconds ?? "?"}s`);
    this.name = "RateLimited";
  }
}

export function openSkyConfigured(): boolean {
  return !!(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET);
}

// Tokens live ~1800 s. Cache with a 60 s margin so we never hand back one that
// expires mid-request. ponytail: module-level — one process, one bucket.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.OPENSKY_CLIENT_ID ?? "",
      client_secret: process.env.OPENSKY_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`OpenSky token request failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("OpenSky token response had no access_token");
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + ((json.expires_in ?? 1800) - 60) * 1000,
  };
  return cached.token;
}

/** Split [begin, end) into slices the API will accept (≤ 2 days each). */
export function windowChunks(begin: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  for (let s = begin; s < end; s += MAX_WINDOW_S) {
    out.push([s, Math.min(s + MAX_WINDOW_S, end)]);
  }
  return out;
}

/** Real client. `begin`/`end` are unix seconds; chunked to respect the 2-day cap. */
export const fetchFlights: OpenSkyClient = async (icao24, begin, end) => {
  const token = await accessToken();
  const out: OpenSkyFlight[] = [];

  for (const [from, to] of windowChunks(begin, end)) {
    const url = `${API}?icao24=${encodeURIComponent(icao24.toLowerCase())}&begin=${from}&end=${to}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 429) {
      const retry = Number(res.headers.get("x-rate-limit-retry-after-seconds"));
      throw new RateLimited(Number.isFinite(retry) ? retry : null);
    }
    // 404 = "no flights in this window", which OpenSky reports instead of [].
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`OpenSky flights request failed (${res.status})`);

    const remaining = res.headers.get("x-rate-limit-remaining");
    if (remaining) console.log(`[adsb] OpenSky credits remaining: ${remaining}`);

    const rows = (await res.json()) as Record<string, unknown>[];
    for (const r of Array.isArray(rows) ? rows : []) {
      const firstSeen = Number(r.firstSeen);
      const lastSeen = Number(r.lastSeen);
      if (!Number.isFinite(firstSeen) || !Number.isFinite(lastSeen)) continue;
      out.push({
        icao24: String(r.icao24 ?? icao24).toLowerCase(),
        firstSeen,
        lastSeen,
        estDepartureAirport: str(r.estDepartureAirport),
        estArrivalAirport: str(r.estArrivalAirport),
        callsign: str(r.callsign)?.trim() || null,
      });
    }
  }
  return out;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// E2E test double: ONLY set in playwright.config.ts's webServer.env, never in
// prod. Two deterministic flights ~26 h and ~2 h ago so the reconciliation and
// the suggestion banner have something real to chew on.
function e2eStubFlights(icao24: string, begin: number, end: number): OpenSkyFlight[] {
  const mk = (hoursAgo: number, minutes: number): OpenSkyFlight => {
    const firstSeen = end - hoursAgo * 3600;
    return {
      icao24: icao24.toLowerCase(),
      firstSeen,
      lastSeen: firstSeen + minutes * 60,
      estDepartureAirport: "KPAO",
      estArrivalAirport: "KSQL",
      callsign: "E2ESTUB",
    };
  };
  return [mk(26, 90), mk(2, 66)].filter((f) => f.firstSeen >= begin);
}

/** The client the cron should use, or null when OpenSky isn't configured. */
export function openSkyClient(): OpenSkyClient | null {
  if (process.env.E2E_STUB_ADSB) {
    return async (icao24, begin, end) => e2eStubFlights(icao24, begin, end);
  }
  return openSkyConfigured() ? fetchFlights : null;
}
