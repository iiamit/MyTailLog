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
  const caller = await authenticate(request);
  rateLimit(caller.clientId, Date.now());
  requireScope(caller, scope);
  await requireAircraft(caller, aircraftId, scope);
  return caller;
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
