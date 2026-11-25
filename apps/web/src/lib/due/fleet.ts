import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { todayIn, type MapInput } from "@/lib/mapModel";
import { computeStatus } from "./engine";
import { DUE_AIRCRAFT_COLUMNS, DUE_TABLE_COLUMNS } from "./columns";

type Table = keyof typeof DUE_TABLE_COLUMNS;
type ScopedRow = Record<string, unknown> & { aircraft_id: string };
export type FleetStatus = {
  snap: ReturnType<typeof computeStatus>;
  waiting: number;
  confirmed: number;
};
const CHUNK = 75;
const PAGE = 500;

/** Shelf summaries use the canonical engine, without per-aircraft requests or sync-log history. */
export async function loadFleetStatus(
  client: SupabaseClient<Database>, aircraftIds: string[], userId: string,
): Promise<Map<string, FleetStatus>> {
  const result = new Map<string, FleetStatus>();
  const ids = [...new Set(aircraftIds)];
  if (!ids.length) return result;
  const { data: profile, error } = await client.from("profile").select("time_zone").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const today = todayIn(profile?.time_zone);
  for (let start = 0; start < ids.length; start += CHUNK) {
    const { data: aircraft, error: aircraftError } = await client.from("aircraft")
      .select(DUE_AIRCRAFT_COLUMNS).in("id", ids.slice(start, start + CHUNK));
    if (aircraftError) throw new Error(aircraftError.message);
    const visible = aircraft ?? [];
    if (!visible.length) continue;
    const allowed = new Set(visible.map((a) => a.id));
    const grouped = new Map([...allowed].map((id) => [id, {} as Record<Table, ScopedRow[]>]));
    await Promise.all((Object.keys(DUE_TABLE_COLUMNS) as Table[]).map(async (table) => {
      try {
        for (let offset = 0; ; offset += PAGE) {
          const { data, error } = await client.from(table as "maintenance_item")
            .select(`aircraft_id, ${DUE_TABLE_COLUMNS[table]}`).in("aircraft_id", [...allowed])
            .order("id").range(offset, offset + PAGE - 1);
          if (error) throw new Error(error.message);
          for (const row of (data ?? []) as unknown as ScopedRow[]) {
            const bucket = grouped.get(row.aircraft_id);
            if (bucket) (bucket[table] ??= []).push(row);
          }
          if (!data || data.length < PAGE) break;
        }
      } catch (error) {
        // Same optional buyer-room behavior as the single-aircraft loader.
        if (table !== "record_room") throw error;
        for (const bucket of grouped.values()) bucket[table] = [];
      }
    }));
    for (const aircraft of visible) {
      const rows = grouped.get(aircraft.id)!;
      const entries = rows.log_entry ?? [];
      result.set(aircraft.id, {
        snap: computeStatus({ ...rows, aircraft } as unknown as MapInput, today),
        waiting: new Set(entries.filter((e) => !e.owner_confirmed && e.page_id).map((e) => e.page_id)).size,
        confirmed: entries.filter((e) => e.owner_confirmed).length,
      });
    }
  }
  return result;
}
