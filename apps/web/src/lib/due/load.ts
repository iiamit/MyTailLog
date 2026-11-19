import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Preferences } from "@/lib/database.types";
import { todayIn, type MapInput } from "@/lib/mapModel";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeStatus } from "@/lib/due/engine";

export type LoadedDueInput = {
  /** The due engine's rows plus the map's extra columns and gaps (lib/mapModel.ts MapInput). */
  input: MapInput;
  today: string;
  inputsSeq: number;
  preferences: Preferences | null;
};

/**
 * Every row the due engine reads for one aircraft, through RLS as the caller (09 §4.2). Shared by
 * GET /api/aircraft/[id]/status and the v2 Status screens so both compute from the same inputs.
 * Returns null when the caller cannot see the aircraft; throws when a table read fails.
 */
export async function loadDueInput(supabase: SupabaseClient<Database>, id: string, userId: string): Promise<LoadedDueInput | null> {
  const { data: aircraft } = await supabase.from("aircraft")
    .select("id, tail_number, enrollment_date, enrollment_tach, enrollment_hobbs, enrollment_airframe, expected_hours_per_week, situation_override, year, home_base")
    .eq("id", id).maybeSingle();
  if (!aircraft) return null;

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

  const [
    maintenance_item, ad_compliance, document, item_completion, log_entry, logbook, page, hours_reading,
    meter_reset, planned_visit, planned_visit_item, service_provider, visit_suggestion_dismissal, record_room, squawk, logbook_gap, profile, seq,
  ] = await Promise.all([
    all("maintenance_item", "id, kind, label, regulatory, interval_months, interval_hours, last_done_date, last_done_hours, next_due_date, next_due_hours, meter, line, provider_id, ifr_only, expires_on, shop_kind, visit_window_days, visit_window_hours"),
    all("ad_compliance", "id, kind, reference, recurring, status, interval_months, interval_hours, complied_date, complied_hours, next_due_date, next_due_hours, reference_entry_id, provider_id"),
    all("document", "id, type, title, expires_on, renews_every_months, track_expiry, remind_lead_days"),
    all("item_completion", "id, maintenance_item_id, ad_compliance_id, log_entry_id, done_date, done_hours"),
    all("log_entry", "id, logbook_id, page_id, entry_date, tach, hobbs, airframe, trust, replaced_by_entry_id, signature_name, is_continuation, mechanic_cert_number, entry_kind, description"),
    all("logbook", "id, type, component_ref, title"),
    all("page", "id, logbook_id, page_sequence, extraction_status, landing_date"),
    all("hours_reading", "id, reading_date, tach, hobbs, airframe, source"),
    all("meter_reset", "meter, reset_date, prior_value, new_value, id"),
    all("planned_visit", "id, status, week_of, visit_date, provider_id, airport, from_suggestion_key"),
    all("planned_visit_item", "visit_id, item_key, done_completion_id, id"),
    all("service_provider", "id, name, kind, airport, is_default"),
    all("visit_suggestion_dismissal", "suggestion_key, id"),
    // Viewers cannot read record rooms (RLS); for them a buyer room does not set the situation.
    all("record_room", "audience, expires_at, revoked_at, id").catch(() => []),
    all("squawk", "id, description, severity, status, reported_at, resolved_at, resolved_log_entry_id"),
    all("logbook_gap", "id, logbook_id, from_date, to_date, status, source, note"),
    supabase.from("profile").select("time_zone, preferences").eq("id", userId).maybeSingle(),
    supabase.from("change_log").select("seq").eq("aircraft_id", id).order("seq", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const input = {
    aircraft, maintenance_item, ad_compliance, document, item_completion, log_entry, logbook, page, hours_reading,
    meter_reset, planned_visit, planned_visit_item, service_provider, visit_suggestion_dismissal, record_room, squawk, logbook_gap,
  } as MapInput;
  return {
    input,
    today: todayIn(profile.data?.time_zone),
    inputsSeq: Number(seq.data?.seq ?? 0),
    preferences: (profile.data?.preferences as Preferences | null | undefined) ?? null,
  };
}

/**
 * One engine run per request, shared by the v2 layout's rail and the Status screens so their counts always agree
 * (W-STATUS-01). Null when the caller cannot see the aircraft; throws when a read fails.
 */
export const dueSnapshot = cache(async (id: string, userId: string) => {
  const loaded = await loadDueInput(await createClient(), id, userId);
  return loaded ? { loaded, snap: computeStatus(loaded.input, loaded.today) } : null;
});
