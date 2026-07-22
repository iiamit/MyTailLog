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

    const detailed = caller.scopes.has("aircraft:read");
    const cols = detailed
      ? "id, tail_number, make, model, year, serial_number, home_base"
      : "id, tail_number";
    // Re-verify LIVE ownership (same rule as resource.ts grantedAircraftIds): only
    // return granted aircraft the account STILL owns — a grant can't outlive the
    // ownership that justified it, and the RS reads via a service client (no RLS).
    const { data: aircraft, error } = await svc
      .from("aircraft")
      .select(cols)
      .in("id", ids)
      .eq("owner_id", caller.accountId);
    if (error) throw new ApiError(500, "server_error", error.message);

    await logAccess(caller, null, detailed ? "aircraft:read" : "aircraft:list", "/api/v1/aircraft");
    return Response.json({ aircraft: aircraft ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
