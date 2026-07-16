import { guard, logAccess, apiError, ApiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentHours } from "@/lib/aircraftHours";

// GET  /api/v1/aircraft/{id}/hours — current hours + recent recorded readings.
// POST /api/v1/aircraft/{id}/hours — append a hobbs/tach reading (hours:write).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "hours:read";
const WRITE_SCOPE = "hours:write";

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

// A positive finite meter value, null when absent. Throws 400 on a bad value.
function meter(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0)
    throw new ApiError(400, "invalid_request", "hobbs/tach must be positive numbers.");
  return Math.round(v * 10) / 10;
}

// POST — append a hobbs/tach reading for a client the owner granted hours:write.
// Idempotent on (aircraft_id, source, external_ref): re-pushing the same flight's
// reading is a no-op. Feeds straight into the reconciler (current hobbs/tach +
// the maintenance forecast); a wild value surfaces in Duplicates & fixes rather
// than being rejected. Body: { hobbs?, tach?, reading_date?, external_ref? }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, WRITE_SCOPE);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new ApiError(400, "invalid_request", "A JSON body is required.");
    const hobbs = meter(body.hobbs);
    const tach = meter(body.tach);
    if (hobbs == null && tach == null) throw new ApiError(400, "invalid_request", "Provide hobbs and/or tach.");

    const reading_date =
      typeof body.reading_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.reading_date)
        ? body.reading_date.slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const external_ref =
      typeof body.external_ref === "string" && body.external_ref.trim()
        ? body.external_ref.trim().slice(0, 200)
        : `${reading_date}:${hobbs ?? ""}:${tach ?? ""}`; // deterministic → repeat pushes dedupe

    const svc = createServiceClient();
    const { data, error } = await svc
      .from("hours_reading")
      .upsert(
        {
          aircraft_id: id,
          hobbs,
          tach,
          reading_date,
          source: "myflightbook",
          synced_by: caller.accountId,
          external_ref,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "aircraft_id,source,external_ref" },
      )
      .select("reading_date, hobbs, tach, source, external_ref")
      .maybeSingle();
    if (error) throw new ApiError(500, "server_error", error.message);

    await logAccess(caller, id, WRITE_SCOPE, `POST /api/v1/aircraft/${id}/hours`);
    return Response.json({ ok: true, aircraft_id: id, reading: data }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
