import { getOAuthProvider } from "./provider";
import { createServiceClient } from "@/lib/supabase/service";

// Resource Server enforcement — the choke point for every /api/v1 endpoint.
//
// CRITICAL: an OAuth access token is NOT a Supabase JWT, so RLS does NOT protect
// these endpoints. Authorization is explicit here: token valid → scope present →
// aircraft ∈ the caller's grant. Data is then read via the service client
// FILTERED to that aircraft. (Same lesson as the N1 ledger fix.)

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type ApiCaller = { accountId: string; clientId: string; scopes: Set<string> };

/** Validate the Bearer access token via oidc-provider. Throws 401 otherwise. */
export async function authenticate(request: Request): Promise<ApiCaller> {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) throw new ApiError(401, "invalid_token", "Missing bearer token.");
  const at = await getOAuthProvider().AccessToken.find(m[1].trim());
  if (!at || at.isExpired || !at.accountId || !at.clientId) {
    throw new ApiError(401, "invalid_token", "Token is invalid or expired.");
  }
  return { accountId: at.accountId, clientId: at.clientId, scopes: at.scopes };
}

/** Require an OAuth scope on the token. Throws 403 insufficient_scope. */
export function requireScope(caller: ApiCaller, scope: string): void {
  if (!caller.scopes.has(scope)) {
    throw new ApiError(403, "insufficient_scope", `This endpoint requires the ${scope} scope.`);
  }
}

/** Aircraft ids this (account, client) may read for `scope` (active grants only). */
export async function grantedAircraftIds(caller: ApiCaller, scope: string): Promise<string[]> {
  const svc = createServiceClient();

  // Account-wide grant ("all my aircraft, now and future"): if present with this
  // scope, every currently-OWNED aircraft is covered — including ones added after
  // consent. (error-tolerant: a pre-0040 database just falls through to the
  // per-aircraft grants below.) Ownership is still the boundary, re-checked live.
  const { data: acct, error: acctErr } = await svc
    .from("oauth_account_grant")
    .select("scopes")
    .eq("account_id", caller.accountId)
    .eq("client_id", caller.clientId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!acctErr && acct && (acct.scopes ?? []).includes(scope)) {
    const { data: owned } = await svc
      .from("aircraft")
      .select("id")
      .eq("owner_id", caller.accountId);
    return (owned ?? []).map((a) => a.id);
  }

  const { data } = await svc
    .from("oauth_aircraft_grant")
    .select("aircraft_id, scopes")
    .eq("account_id", caller.accountId)
    .eq("client_id", caller.clientId)
    .is("revoked_at", null);
  const granted = (data ?? []).filter((g) => (g.scopes ?? []).includes(scope)).map((g) => g.aircraft_id);
  if (granted.length === 0) return [];
  // Re-verify LIVE ownership: the token's account must STILL own each granted
  // aircraft. This closes the grant-outlives-ownership gap (e.g. after an
  // ownership transfer) and is defense-in-depth against any bad grant row —
  // the RS reads with a service client, so this is the last ownership check.
  const { data: owned } = await svc
    .from("aircraft")
    .select("id")
    .eq("owner_id", caller.accountId)
    .in("id", granted);
  return (owned ?? []).map((a) => a.id);
}

/**
 * Assert the caller may read `aircraftId` for `scope`. Throws 404 (NOT 403) when
 * the aircraft isn't in the grant — a grant for aircraft A must never even
 * confirm aircraft B exists (the leak-proofing invariant).
 */
export async function requireAircraft(caller: ApiCaller, aircraftId: string, scope: string): Promise<void> {
  const ids = await grantedAircraftIds(caller, scope);
  if (!ids.includes(aircraftId)) {
    throw new ApiError(404, "not_found", "No such aircraft.");
  }
}

// ---------------------------------------------------------------------------
// Rate limiting — per-client token bucket. ponytail: in-memory, so it's
// per-instance; move to a shared store (e.g. a Postgres counter) if a client
// spread across instances needs a hard global cap.
const RATE_PER_MIN = Number(process.env.API_V1_RATE_PER_MIN ?? 120);
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(clientId: string, now: number): void {
  const b = buckets.get(clientId);
  if (!b || now >= b.resetAt) {
    buckets.set(clientId, { count: 1, resetAt: now + 60_000 });
    return;
  }
  if (b.count >= RATE_PER_MIN) throw new ApiError(429, "rate_limited", "Too many requests.");
  b.count += 1;
}

/**
 * The full per-aircraft gate for a scoped endpoint: valid token → not rate
 * limited → has the scope → aircraft in an active grant. Returns the caller.
 * (404 from requireAircraft when the aircraft isn't granted.)
 */
export async function guard(request: Request, aircraftId: string, scope: string): Promise<ApiCaller> {
  let caller: ApiCaller | null = null;
  try {
    caller = await authenticate(request);
    rateLimit(caller.clientId, Date.now());
    requireScope(caller, scope);
    await requireAircraft(caller, aircraftId, scope);
    return caller;
  } catch (e) {
    await logDenied(caller, aircraftId, scope, requestPath(request), e);
    throw e;
  }
}

/** `POST /api/v1/aircraft/<id>/hours` — method + pathname, never the query string. */
export function requestPath(request: Request): string {
  return `${request.method} ${new URL(request.url).pathname}`;
}

/**
 * Decide what a denial should record. Pure, so the rules are testable without a
 * database — and the rule that matters is the `null` case.
 *
 * A 401 from an unidentifiable token has no client to attribute, so persisting a
 * row per attempt would let anyone on the internet grow an owner-readable table
 * without bound. Those go to the server log instead. Rows returned here always
 * belong to a client that authenticated.
 */
export function deniedLogRow(
  caller: ApiCaller | null,
  aircraftId: string | null,
  scope: string,
  path: string,
  err: unknown,
): { client_id: string; account_id: string; aircraft_id: string | null; scope: string; path: string; status: number; error: string } | null {
  if (!caller) return null;
  const status = err instanceof ApiError ? err.status : 500;
  // The CODE only. `err.message` can carry caller-supplied text, and this table
  // is owner-readable.
  const code = err instanceof ApiError ? err.code : "server_error";
  return {
    client_id: caller.clientId,
    account_id: caller.accountId,
    aircraft_id: aircraftId,
    scope,
    path,
    status,
    error: code,
  };
}

/**
 * Audit a DENIED call. Never throws: a logging failure must not turn a clean 403
 * into a 500, and must not mask the original error.
 */
export async function logDenied(
  caller: ApiCaller | null,
  aircraftId: string | null,
  scope: string,
  path: string,
  err: unknown,
): Promise<void> {
  try {
    const row = deniedLogRow(caller, aircraftId, scope, path, err);
    if (!row) {
      // Unattributable: log, don't store. No token material — the presence and
      // shape of the header is enough to separate "sent nothing", "sent a
      // malformed header" and "sent a token we rejected".
      const code = err instanceof ApiError ? err.code : "server_error";
      // Constant format string, values as arguments. `path` comes from the
      // request URL, so it is attacker-influenced: interpolating it into the
      // format string itself would let a crafted request forge log lines.
      console.error("[api/v1] denied %s — %s (no identifiable client)", path, code);
      return;
    }
    console.error("[api/v1] denied %s — %s (client %s)", path, row.error, row.client_id);
    await createServiceClient().from("oauth_access_log").insert(row);
  } catch (logErr) {
    console.error("[api/v1] failed to record a denial:", (logErr as Error).message);
  }
}

/** Audit one read into oauth_access_log (service-role write; owner can read it). */
export async function logAccess(
  caller: ApiCaller,
  aircraftId: string | null,
  scope: string,
  path: string,
): Promise<void> {
  await createServiceClient()
    .from("oauth_access_log")
    .insert({ client_id: caller.clientId, account_id: caller.accountId, aircraft_id: aircraftId, scope, path });
}

/** Turn an ApiError (or anything) into a JSON error Response. */
export function apiError(e: unknown): Response {
  if (e instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (e.status === 401) headers["WWW-Authenticate"] = `Bearer error="${e.code}"`;
    if (e.code === "insufficient_scope") headers["WWW-Authenticate"] = `Bearer error="insufficient_scope"`;
    return Response.json({ error: e.code, error_description: e.message }, { status: e.status, headers });
  }
  console.error("[api/v1] unexpected error:", e);
  return Response.json({ error: "server_error" }, { status: 500 });
}
