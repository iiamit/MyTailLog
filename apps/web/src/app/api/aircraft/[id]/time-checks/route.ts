import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { computeTimeChecks, type TimeCheckInput } from "@/lib/timeCheck";

// GET /api/aircraft/{id}/time-checks (09 §4.7, §3.10) →
//   [{ component, entryId, pageRef, written, calculated, result: 'agree'|'apart', difference, digitSwap, dismissed }]
// Latest written value per component first, then up to 3 earlier. Answers go through push `timeCheck.dismiss`.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const { data: aircraft } = await supabase.from("aircraft").select("id").eq("id", id).maybeSingle();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });

  async function all<T>(table: string, columns: string, filter?: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<T[]> {
    const out: T[] = [];
    for (let start = 0; ; start += 1000) {
      const q = filter ? filter(base(table, columns)) : base(table, columns);
      const { data, error } = await q.order("id").range(start, start + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < 1000) return out;
    }
  }
  // Table names vary, so the typed builder cannot check these selects; TimeCheckInput does.
  const base = (table: string, columns: string) => supabase.from(table as "log_entry").select(columns).eq("aircraft_id", id);

  try {
    const [maintenance_item, item_completion, log_entry, logbook, page, meter_reset, time_check_dismissal] = await Promise.all([
      all("maintenance_item", "id, kind", (q) => q.in("kind", ["engine_tbo", "prop_overhaul"])),
      all("item_completion", "id, maintenance_item_id, log_entry_id, done_date, done_hours"),
      all("log_entry", "id, logbook_id, page_id, entry_date, tach, trust, replaced_by_entry_id, stated_times"),
      all("logbook", "id, type, title"),
      all("page", "id, logbook_id, page_sequence"),
      all("meter_reset", "id, meter, reset_date, prior_value, new_value"),
      all("time_check_dismissal", "id, component, log_entry_id, written_value, calculated_value"),
    ]);
    const checks = computeTimeChecks({ maintenance_item, item_completion, log_entry, logbook, page, meter_reset, time_check_dismissal } as TimeCheckInput);
    return NextResponse.json(checks, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "We could not compare the times right now. Try again.", code: "time_checks_failed" }, { status: 500 });
  }
}
