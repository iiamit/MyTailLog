/**
 * MyFlightBook (myflightbook.com) integration — the ONE place all MFB HTTP and
 * response parsing lives. Everything else (routes, server actions) calls these
 * functions with credentials/tokens read from the DB server-side.
 *
 * OAuth2 is configured PER USER: each user registers their own MFB OAuth app
 * (github.com/ericberman/MyFlightbookWeb, dev page myflightbook.com/logbook/mvc/oauth)
 * and supplies their own client id + secret. There is no app-wide credential.
 *
 * Endpoints & methods were read from the MyFlightbookWeb source
 * (Areas/mvc/Controllers/oAuthController.cs, AppCode/OAuthWebService.cs). See
 * the constants below; the ones marked "verify" are best-understood from source
 * and should be confirmed against a live token.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret, decryptSecret, isLegacyPlaintext } from "@/lib/crypto";

const MFB_BASE = "https://myflightbook.com/logbook";

// OAuth endpoints (oAuthController.cs: Authorize + OAuthToken actions, area "mvc").
// The token URL is confirmed verbatim in source; the authorize URL is the MVC
// route for the Authorize action (verify against a live redirect).
export const MFB_AUTHORIZE_URL = `${MFB_BASE}/mvc/oAuth/Authorize`;
export const MFB_TOKEN_URL = `${MFB_BASE}/mvc/oAuth/OAuthToken`;
// Resource (web service) endpoint: OAuthResource action; the requested service
// name is the last path segment. `?json=1` selects JSON over the default XML.
const MFB_RESOURCE_URL = `${MFB_BASE}/mvc/oAuth/OAuthResource`;

// Scopes: read the user's aircraft list and their flights (OAuthWebService.cs
// MFBOAuthScope: readaircraft covers AircraftForUser, readflight covers
// FlightsWithQueryAndOffset).
export const MFB_SCOPES = "readaircraft readflight";

// Tach is not a first-class flight field in MFB — it's a custom property.
// CustomPropertyTypes.cs: IDPropTachEnd = 96 (Tach Start = 95).
const CFP_TACH_END = 96;

export type MfbTokens = {
  access_token: string;
  refresh_token: string | null;
  /** seconds until the access token expires (MFB mints 14-day access tokens). */
  expires_in: number | null;
};

export type MfbAircraft = { aircraftId: number; tailNumber: string };
export type MfbFlightReading = {
  flightId: number;
  aircraftId: number;
  date: string | null;
  hobbs: number | null;
  tach: number | null;
};

/** Build the authorize URL the browser is redirected to (step 1 of the flow). */
export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: MFB_SCOPES,
    state: opts.state,
  });
  return `${MFB_AUTHORIZE_URL}?${q.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<MfbTokens> {
  const res = await fetch(MFB_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MyFlightBook token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`MyFlightBook token response was not JSON: ${text.slice(0, 200)}`);
  }
  const access = json.access_token;
  if (typeof access !== "string" || !access) {
    throw new Error(`MyFlightBook token response missing access_token: ${text.slice(0, 200)}`);
  }
  return {
    access_token: access,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : null,
  };
}

/** Exchange an authorization code for tokens (step 2, in the callback). */
export function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<MfbTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }),
  );
}

/** Trade a refresh token for a fresh access token. */
export function refreshTokens(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<MfbTokens> {
  return postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    }),
  );
}

async function callService(
  accessToken: string,
  service: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const body = new URLSearchParams({ json: "1", ...params });
  // DNOA's resource server reads the bearer token from the Authorization header.
  const res = await fetch(`${MFB_RESOURCE_URL}/${service}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`MyFlightBook ${service} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`MyFlightBook ${service} did not return JSON: ${text.slice(0, 200)}`);
  }
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  // Some MFB responses wrap the array; unwrap a single array-valued property.
  if (v && typeof v === "object") {
    for (const val of Object.values(v as Record<string, unknown>)) {
      if (Array.isArray(val)) return val as Record<string, unknown>[];
    }
  }
  return [];
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** List the user's MFB aircraft (AircraftForUser → readaircraft scope). */
export async function listAircraft(accessToken: string): Promise<MfbAircraft[]> {
  const raw = asArray(await callService(accessToken, "AircraftForUser"));
  const out: MfbAircraft[] = [];
  for (const a of raw) {
    const id = num(a.AircraftID);
    const tail = typeof a.TailNumber === "string" ? a.TailNumber : null;
    if (id != null && tail) out.push({ aircraftId: id, tailNumber: tail });
  }
  return out;
}

/**
 * Pull the user's recent flights, newest first, and extract the ending hobbs
 * (HobbsEnd) and tach (custom property 96) plus date/ids. Tach is often absent
 * (users don't always log it) — that's fine, hobbs alone still advances hours.
 *
 * ponytail: one page of `maxCount` recent flights (default 200), no paging. If
 * a user has flown >200 flights since an aircraft's last flight, that aircraft
 * could be missed — bump maxCount or add offset paging if that ever bites.
 */
export async function listRecentFlightReadings(
  accessToken: string,
  maxCount = 200,
): Promise<MfbFlightReading[]> {
  const raw = asArray(
    await callService(accessToken, "FlightsWithQueryAndOffset", {
      // Empty query = all flights; MFB returns them most-recent first.
      fq: "{}",
      offset: "0",
      maxCount: String(maxCount),
    }),
  );
  const out: MfbFlightReading[] = [];
  for (const f of raw) {
    const flightId = num(f.FlightID);
    const aircraftId = num(f.AircraftID);
    if (flightId == null || aircraftId == null) continue;
    const hobbs = num(f.HobbsEnd);
    let tach: number | null = null;
    for (const cfp of asArray(f.CustomProperties)) {
      if (num(cfp.PropTypeID) === CFP_TACH_END) {
        tach = num(cfp.DecValue);
        break;
      }
    }
    const date = typeof f.Date === "string" ? f.Date.slice(0, 10) : null;
    out.push({
      flightId,
      aircraftId,
      date,
      hobbs: hobbs && hobbs > 0 ? hobbs : null,
      tach: tach && tach > 0 ? tach : null,
    });
  }
  return out;
}

/**
 * Return a usable access token for the user, refreshing (and persisting the new
 * tokens) if the stored one is expired. Returns null when the user isn't
 * connected or the refresh fails — callers must degrade gracefully.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  // Credentials live in a private schema (0047); read/write via service-role RPCs.
  const svc = createServiceClient();
  const { data: rows } = await svc.rpc("mfb_conn_secrets", { p_user_id: userId });
  const conn = rows?.[0];

  if (!conn?.access_token) return null;

  // Secrets/tokens are encrypted at rest (AES-256-GCM); decrypt for use.
  const accessToken = decryptSecret(conn.access_token);
  const refreshToken = decryptSecret(conn.refresh_token);
  const clientSecret = decryptSecret(conn.client_secret);

  // L9 sweep: a client_secret stored before at-rest encryption existed
  // (2026-07-03..07-07) is still plaintext. Re-encrypt it in place, once.
  if (isLegacyPlaintext(conn.client_secret) && clientSecret) {
    await svc.rpc("set_mfb_client_secret", {
      p_user_id: userId,
      p_cipher: encryptSecret(clientSecret),
    });
  }

  // 60s buffer so we don't hand back a token that expires mid-request.
  const expired =
    conn.token_expires_at != null &&
    new Date(conn.token_expires_at).getTime() - 60_000 < Date.now();

  if (!expired) return accessToken;

  if (!refreshToken || !conn.client_id || !clientSecret) {
    return accessToken; // no way to refresh; try the (maybe stale) token
  }

  try {
    const tokens = await refreshTokens({
      clientId: conn.client_id,
      clientSecret,
      refreshToken,
    });
    await svc.rpc("set_mfb_tokens", {
      p_user_id: userId,
      p_access: encryptSecret(tokens.access_token),
      p_refresh: encryptSecret(tokens.refresh_token ?? refreshToken),
      p_expires_at: expiresAtFrom(tokens.expires_in),
      p_mark_connected: false,
    });
    return tokens.access_token;
  } catch {
    return null; // refresh failed — treat as disconnected for this run
  }
}

/** ISO timestamp `expires_in` seconds from now, or null when unknown. */
export function expiresAtFrom(expiresIn: number | null): string | null {
  if (expiresIn == null || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

/** Normalize a tail number for matching (uppercase, strip non-alphanumerics). */
export function normalizeTail(tail: string): string {
  return tail.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
