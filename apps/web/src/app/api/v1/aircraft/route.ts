import { authenticate, rateLimit, logAccess, apiError, ApiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/v1/aircraft — the aircraft this token may see (any granted scope).
// Identity (id + tail) is always returned; fuller details require aircraft:read.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const caller = await authenticate(request);
    rateLimit(caller.clientId, Date.now());

    const svc = createServiceClient();
    const detailed = caller.scopes.has("aircraft:read");
    const cols = detailed
      ? "id, tail_number, make, model, year, serial_number, home_base"
      : "id, tail_number";

    // Base: every aircraft the account STILL owns (live-ownership boundary, same
    // rule as resource.ts). An account-wide grant returns all of them (incl. ones
    // added after consent); otherwise restrict to the per-aircraft grants.
    let query = svc.from("aircraft").select(cols).eq("owner_id", caller.accountId);

    // Account-wide grant? (error-tolerant so a pre-0040 database still works.)
    const { data: acct, error: acctErr } = await svc
      .from("oauth_account_grant")
      .select("scopes")
      .eq("account_id", caller.accountId)
      .eq("client_id", caller.clientId)
      .is("revoked_at", null)
      .maybeSingle();

    if (acctErr || !acct || (acct.scopes ?? []).length === 0) {
      const { data: grants } = await svc
        .from("oauth_aircraft_grant")
        .select("aircraft_id, scopes")
        .eq("account_id", caller.accountId)
        .eq("client_id", caller.clientId)
        .is("revoked_at", null);
      // Only list aircraft whose grant carries at least one data scope — a
      // scope-less token (e.g. openid-only) must not enumerate tail numbers.
      const ids = [
        ...new Set(
          (grants ?? []).filter((g) => (g.scopes?.length ?? 0) > 0).map((g) => g.aircraft_id),
        ),
      ];
      if (ids.length === 0) return Response.json({ aircraft: [] });
      query = query.in("id", ids);
    }

    const { data: aircraft, error } = await query;
    if (error) throw new ApiError(500, "server_error", error.message);

    await logAccess(caller, null, detailed ? "aircraft:read" : "aircraft:list", "/api/v1/aircraft");
    return Response.json({ aircraft: aircraft ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
