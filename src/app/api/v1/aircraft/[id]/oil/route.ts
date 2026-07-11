import { guard, logAccess, apiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";

// GET /api/v1/aircraft/{id}/oil — oil-analysis samples (oldest→newest) for
// wear-metal trending. universal_averages ship per row so clients can compare.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "oil:read";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, SCOPE);

    const { data } = await createServiceClient()
      .from("oil_analysis_sample")
      .select(
        "sample_date, analysis_date, lab, lab_number, oil_type, oil_hours, engine_hours, oil_added_quarts, elements_ppm, oil_properties, universal_averages, status, lab_comments, excluded_from_averages",
      )
      .eq("aircraft_id", id)
      .order("sample_date", { ascending: true });

    await logAccess(caller, id, SCOPE, `/api/v1/aircraft/${id}/oil`);
    return Response.json({ aircraft_id: id, samples: data ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
