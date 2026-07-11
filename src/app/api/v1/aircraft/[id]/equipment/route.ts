import { guard, logAccess, apiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/v1/aircraft/{id}/equipment — installed components + history.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "equipment:read";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, SCOPE);

    const { data } = await createServiceClient()
      .from("component")
      .select(
        "name, make, category, part_number, serial_number, install_date, removal_date, life_limit_value, life_limit_unit, is_installed",
      )
      .eq("aircraft_id", id)
      .order("is_installed", { ascending: false })
      .order("name");

    await logAccess(caller, id, SCOPE, `/api/v1/aircraft/${id}/equipment`);
    return Response.json({ aircraft_id: id, equipment: data ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
