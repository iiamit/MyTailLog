import { guard, logAccess, apiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentHours } from "@/lib/aircraftHours";

// GET /api/v1/aircraft/{id}/hours — current hours + recent recorded readings.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "hours:read";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, SCOPE);

    const svc = createServiceClient();
    const { data: ac } = await svc
      .from("aircraft")
      .select("enrollment_hobbs, enrollment_tach")
      .eq("id", id)
      .single();
    const [currentHours, { data: readings }] = await Promise.all([
      getCurrentHours(svc, id, { hobbs: ac?.enrollment_hobbs ?? null, tach: ac?.enrollment_tach ?? null }),
      svc
        .from("hours_reading")
        .select("reading_date, hobbs, tach, source")
        .eq("aircraft_id", id)
        .order("reading_date", { ascending: false })
        .limit(50),
    ]);

    await logAccess(caller, id, SCOPE, `/api/v1/aircraft/${id}/hours`);
    return Response.json({ aircraft_id: id, current_hours: currentHours, readings: readings ?? [] });
  } catch (e) {
    return apiError(e);
  }
}
