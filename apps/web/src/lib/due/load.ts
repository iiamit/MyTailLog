import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Preferences } from "@/lib/database.types";
import { todayIn, type MapInput } from "@/lib/mapModel";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DUE_AIRCRAFT_COLUMNS, DUE_TABLE_COLUMNS } from "./columns";
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
    .select(DUE_AIRCRAFT_COLUMNS)
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
    all("maintenance_item", DUE_TABLE_COLUMNS.maintenance_item),
    all("ad_compliance", DUE_TABLE_COLUMNS.ad_compliance),
    all("document", DUE_TABLE_COLUMNS.document),
    all("item_completion", DUE_TABLE_COLUMNS.item_completion),
    all("log_entry", DUE_TABLE_COLUMNS.log_entry),
    all("logbook", DUE_TABLE_COLUMNS.logbook),
    all("page", DUE_TABLE_COLUMNS.page),
    all("hours_reading", DUE_TABLE_COLUMNS.hours_reading),
    all("meter_reset", DUE_TABLE_COLUMNS.meter_reset),
    all("planned_visit", DUE_TABLE_COLUMNS.planned_visit),
    all("planned_visit_item", DUE_TABLE_COLUMNS.planned_visit_item),
    all("service_provider", DUE_TABLE_COLUMNS.service_provider),
    all("visit_suggestion_dismissal", DUE_TABLE_COLUMNS.visit_suggestion_dismissal),
    // Viewers cannot read record rooms (RLS); for them a buyer room does not set the situation.
    all("record_room", DUE_TABLE_COLUMNS.record_room).catch(() => []),
    all("squawk", DUE_TABLE_COLUMNS.squawk),
    all("logbook_gap", DUE_TABLE_COLUMNS.logbook_gap),
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
