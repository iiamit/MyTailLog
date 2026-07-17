import { guard, logAccess, apiError, ApiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentMeters } from "@/lib/aircraftHours";
import type { CurrentTach, CurrentHobbs } from "@/lib/hobbsTach";

// GET  /api/v1/aircraft/{id}/hours — current tach/hobbs (reconciled) + readings.
// POST /api/v1/aircraft/{id}/hours — append hobbs/tach reading(s) (hours:write).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "hours:read";
const WRITE_SCOPE = "hours:write";
const MAX_BATCH = 200;

// Shape a reconciled meter for the API. `estimated` = derived from the other
// meter via this aircraft's hobbs↔tach ratio (tach is rarely logged; we project
// it from hobbs); `rough` = fell back to the default ratio.
const meterOut = (m: CurrentTach | CurrentHobbs) => ({
  value: "tach" in m ? m.tach : m.hobbs,
  estimated: m.estimated,
  rough: m.rough,
  as_of: m.asOf,
});

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
    const [{ tach, hobbs }, { data: readings }] = await Promise.all([
      getCurrentMeters(svc, id, { hobbs: ac?.enrollment_hobbs ?? null, tach: ac?.enrollment_tach ?? null }),
      svc
        .from("hours_reading")
        .select("reading_date, hobbs, tach, source")
        .eq("aircraft_id", id)
        .order("reading_date", { ascending: false })
        .limit(50),
    ]);

    await logAccess(caller, id, SCOPE, `/api/v1/aircraft/${id}/hours`);
    return Response.json({
      aircraft_id: id,
      current_hours: tach.tach, // = current_tach.value; kept for back-compat
      current_tach: meterOut(tach),
      current_hobbs: meterOut(hobbs),
      readings: readings ?? [],
    });
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

// Validate one reading input → an upsert row. hobbs and tach are independent
// timelines, so a caller pushes them as SEPARATE readings (each with its own
// date + external_ref) when they came from different flights.
function toRow(raw: unknown, aircraftId: string, accountId: string) {
  if (!raw || typeof raw !== "object") throw new ApiError(400, "invalid_request", "Each reading must be an object.");
  const r = raw as Record<string, unknown>;
  const hobbs = meter(r.hobbs);
  const tach = meter(r.tach);
  if (hobbs == null && tach == null) throw new ApiError(400, "invalid_request", "Each reading needs hobbs and/or tach.");
  const reading_date =
    typeof r.reading_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(r.reading_date)
      ? r.reading_date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  const external_ref =
    typeof r.external_ref === "string" && r.external_ref.trim()
      ? r.external_ref.trim().slice(0, 200)
      : `${reading_date}:${hobbs ?? ""}:${tach ?? ""}`; // deterministic → repeat pushes dedupe
  return {
    aircraft_id: aircraftId,
    hobbs,
    tach,
    reading_date,
    source: "myflightbook",
    synced_by: accountId,
    external_ref,
    updated_at: new Date().toISOString(),
  };
}

// POST — append reading(s) for a client the owner granted hours:write. Accepts a
// single reading `{hobbs?,tach?,reading_date?,external_ref?}` OR a batch
// `{readings:[...]}`. Idempotent on (aircraft_id, source, external_ref) — reuse a
// flight id as external_ref and re-pushes are no-ops. Feeds the reconciler; a
// wild value surfaces in Duplicates & fixes rather than being rejected.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, WRITE_SCOPE);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new ApiError(400, "invalid_request", "A JSON body is required.");
    const inputs = Array.isArray(body.readings) ? body.readings : [body];
    if (inputs.length === 0) throw new ApiError(400, "invalid_request", "No readings.");
    if (inputs.length > MAX_BATCH) throw new ApiError(400, "invalid_request", `At most ${MAX_BATCH} readings per request.`);

    // Dedupe by external_ref within the batch (Postgres upsert can't touch the
    // same conflict target twice in one statement). Same external_ref = same
    // flight pushed as separate hobbs & tach readings → MERGE the meters into
    // one row (per-field last-non-null), not last-write-wins — else whichever
    // meter came first was silently dropped.
    const byRef = new Map<string, ReturnType<typeof toRow>>();
    for (const raw of inputs) {
      const row = toRow(raw, id, caller.accountId);
      const prev = byRef.get(row.external_ref);
      byRef.set(row.external_ref, prev ? { ...prev, hobbs: row.hobbs ?? prev.hobbs, tach: row.tach ?? prev.tach } : row);
    }
    const rows = [...byRef.values()];

    const svc = createServiceClient();

    // Upsert replaces the whole row, so a meter-only push (e.g. correcting hobbs
    // on a flight we already stored the tach for) would null the other meter.
    // Coalesce each incoming row's absent meter from the stored row first.
    const { data: existing } = await svc
      .from("hours_reading")
      .select("external_ref, hobbs, tach")
      .eq("aircraft_id", id)
      .eq("source", "myflightbook")
      .in("external_ref", rows.map((r) => r.external_ref));
    const prior = new Map((existing ?? []).map((e) => [e.external_ref, e]));
    for (const row of rows) {
      const e = prior.get(row.external_ref);
      if (e) {
        row.hobbs = row.hobbs ?? e.hobbs;
        row.tach = row.tach ?? e.tach;
      }
    }

    const { data, error } = await svc
      .from("hours_reading")
      .upsert(rows, { onConflict: "aircraft_id,source,external_ref" })
      .select("reading_date, hobbs, tach, source, external_ref");
    if (error) throw new ApiError(500, "server_error", error.message);

    await logAccess(caller, id, WRITE_SCOPE, `POST /api/v1/aircraft/${id}/hours`);
    return Response.json({ ok: true, aircraft_id: id, readings: data ?? [] }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
