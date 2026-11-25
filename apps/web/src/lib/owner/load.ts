import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
type Table =
  | "component"
  | "engine_observation"
  | "oil_analysis_sample"
  | "oil_addition"
  | "meter_reset"
  | "aircraft_expense"
  | "hours_reading"
  | "document"
  | "aircraft_inbox";
export async function ownerRows<T extends Table>(
  db: SupabaseClient<Database>,
  table: T,
  aircraft: string,
  period?: { from: string | null; to: string | null },
): Promise<Database["public"]["Tables"][T]["Row"][]> {
  const rows: Database["public"]["Tables"][T]["Row"][] = [];
  for (let start = 0; start <= 10000; start += 500) {
    let query = db
      .from(table as Table)
      .select("*")
      .eq("aircraft_id", aircraft)
      .order("id")
      .range(start, start + 499);
    if (table === "aircraft_expense" && period) {
      if (period.from) query = query.gte("date", period.from);
      if (period.to) query = query.lte("date", period.to);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(
      ...((data ?? []) as unknown as Database["public"]["Tables"][T]["Row"][]),
    );
    if (rows.length > 10000)
      throw new Error(
        "More than 10,000 records: choose a shorter reporting period.",
      );
    if (!data || data.length < 500) return rows;
  }
  return rows;
}
