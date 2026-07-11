import { guard, logAccess, apiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/v1/aircraft/{id}/weightbalance — current empty W&B (latest revision)
// plus the revision history.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "weightbalance:read";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, SCOPE);

    const { data } = await createServiceClient()
      .from("weight_balance")
      .select(
        "revision_date, empty_weight, empty_weight_arm, empty_weight_moment, max_gross_weight, method, reference",
      )
      .eq("aircraft_id", id)
      .order("revision_date", { ascending: false });

    const revisions = data ?? [];
    await logAccess(caller, id, SCOPE, `/api/v1/aircraft/${id}/weightbalance`);
    return Response.json({ aircraft_id: id, current: revisions[0] ?? null, revisions });
  } catch (e) {
    return apiError(e);
  }
}
