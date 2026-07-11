import { guard, logAccess, apiError } from "@/lib/oauth/resource";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentHours } from "@/lib/aircraftHours";
import { urgencyOf } from "@/lib/compliance";

// GET /api/v1/aircraft/{id}/airworthiness — AD/inspection status, next-due, and
// current hours for ONE granted aircraft. Requires airworthiness:read + a grant.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPE = "airworthiness:read";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const caller = await guard(request, id, SCOPE); // 401/403/404 as appropriate

    const svc = createServiceClient();
    const { data: ac } = await svc
      .from("aircraft")
      .select("id, tail_number, enrollment_hobbs, enrollment_tach")
      .eq("id", id)
      .single();
    const currentHours = await getCurrentHours(svc, id, {
      hobbs: ac?.enrollment_hobbs ?? null,
      tach: ac?.enrollment_tach ?? null,
    });

    const [{ data: ads }, { data: items }] = await Promise.all([
      svc
        .from("ad_compliance")
        .select("reference, title, kind, status, recurring, complied_date, complied_hours, next_due_date, next_due_hours")
        .eq("aircraft_id", id),
      svc
        .from("maintenance_item")
        .select("kind, label, regulatory, interval_months, interval_hours, last_done_date, last_done_hours, next_due_date, next_due_hours")
        .eq("aircraft_id", id),
    ]);

    const directives = (ads ?? []).map((a) => ({
      reference: a.reference,
      title: a.title,
      kind: a.kind,
      status: a.status,
      recurring: a.recurring,
      complied_date: a.complied_date,
      complied_hours: a.complied_hours,
      next_due_date: a.next_due_date,
      next_due_hours: a.next_due_hours,
      urgency: urgencyOf(a, currentHours),
    }));
    const inspections = (items ?? []).map((m) => ({
      kind: m.kind,
      label: m.label,
      regulatory: m.regulatory,
      last_done_date: m.last_done_date,
      last_done_hours: m.last_done_hours,
      next_due_date: m.next_due_date,
      next_due_hours: m.next_due_hours,
      urgency: urgencyOf(m, currentHours),
    }));

    const overdue =
      directives.filter((d) => d.urgency === "overdue").length +
      inspections.filter((i) => i.urgency === "overdue").length;
    const dueSoon =
      directives.filter((d) => d.urgency === "due_soon").length +
      inspections.filter((i) => i.urgency === "due_soon").length;

    await logAccess(caller, id, SCOPE, `/api/v1/aircraft/${id}/airworthiness`);
    return Response.json({
      aircraft_id: id,
      tail_number: ac?.tail_number ?? null,
      current_hours: currentHours,
      summary: { airworthy: overdue === 0, overdue, due_soon: dueSoon },
      airworthiness_directives: directives,
      inspections,
    });
  } catch (e) {
    return apiError(e);
  }
}
