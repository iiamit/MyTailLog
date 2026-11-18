import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { todayIn } from "@/lib/mapModel";
import { computeStatus, type DueInput } from "@/lib/due/engine";

// GET /api/aircraft/{id}/status[?fresh=1] → StatusSnapshot (09 §4.2, 4.3).
// Reads through RLS as the caller, so viewers get the status and strangers a 404.
// Always computed on request: snapshot rows are written by the service role only
// (0083), and this route never uses it. shortcut: `fresh` is accepted and
// ignored, until the debounced snapshot writer (09 §2.15) lands.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const { data: aircraft } = await supabase.from("aircraft")
    .select("id, tail_number, enrollment_date, enrollment_tach, enrollment_hobbs, enrollment_airframe, expected_hours_per_week, situation_override")
    .eq("id", id).maybeSingle();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });

  // Supabase caps result sets; page through so long histories are not cut off.
  async function all<T>(table: string, columns: string): Promise<T[]> {
    const out: T[] = [];
    for (let start = 0; ; start += 1000) {
      // Table names vary, so the typed builder cannot check this select; the engine's row types do.
      const { data, error } = await supabase.from(table as "maintenance_item").select(columns)
        .eq("aircraft_id", id).order("id").range(start, start + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return out;
    }
  }

  try {
    const [
      maintenance_item, ad_compliance, document, item_completion, log_entry, logbook, page, hours_reading,
      meter_reset, planned_visit, planned_visit_item, service_provider, record_room, squawk, profile, seq,
    ] = await Promise.all([
      all("maintenance_item", "id, kind, label, regulatory, interval_months, interval_hours, last_done_date, last_done_hours, next_due_date, next_due_hours, meter, line, provider_id, ifr_only, expires_on"),
      all("ad_compliance", "id, kind, reference, recurring, status, interval_months, interval_hours, complied_date, complied_hours, next_due_date, next_due_hours, reference_entry_id, provider_id"),
      all("document", "id, type, title, expires_on, renews_every_months, track_expiry, remind_lead_days"),
      all("item_completion", "id, maintenance_item_id, ad_compliance_id, log_entry_id, done_date, done_hours"),
      all("log_entry", "id, logbook_id, page_id, entry_date, tach, hobbs, airframe, trust, replaced_by_entry_id, signature_name"),
      all("logbook", "id, type"),
      all("page", "id, logbook_id, page_sequence, extraction_status"),
      all("hours_reading", "id, reading_date, tach, hobbs, airframe, source"),
      all("meter_reset", "meter, reset_date, prior_value, new_value, id"),
      all("planned_visit", "id, status, week_of, visit_date, provider_id, airport"),
      all("planned_visit_item", "visit_id, item_key, id"),
      all("service_provider", "id, name"),
      // Viewers cannot read record rooms (RLS); for them a buyer room does not set the situation.
      all("record_room", "audience, expires_at, revoked_at, id").catch(() => []),
      all("squawk", "id, description, severity, status"),
      supabase.from("profile").select("time_zone").eq("id", user.id).maybeSingle(),
      supabase.from("change_log").select("seq").eq("aircraft_id", id).order("seq", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const input = {
      aircraft, maintenance_item, ad_compliance, document, item_completion, log_entry, logbook, page, hours_reading,
      meter_reset, planned_visit, planned_visit_item, service_provider, record_room, squawk,
    } as DueInput;
    const body = computeStatus(input, todayIn(profile.data?.time_zone));
    return NextResponse.json(
      { ...body, computedAt: new Date().toISOString(), inputsSeq: Number(seq.data?.seq ?? 0) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "We could not work out what is due right now. Try again.", code: "status_failed" }, { status: 500 });
  }
}
