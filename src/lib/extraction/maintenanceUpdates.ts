// ===========================================================================
// Maintenance updater — runs maintenance-event extraction and advances the
// forecast's last-done data from the logs.
//
// For each detected completion, the matching maintenance_item's last_done is
// advanced to the LATEST date seen (never regressed), and next-due is
// recomputed. If a known standard item's completion appears but no item exists
// yet, the standard item is created with that last-done — so the forecast
// populates itself from the logbooks. Best-effort; callers wrap it so a failure
// never blocks extraction. Directly updating last-done dates (factual events
// from reviewed entries) is low-risk and the forecast shows the date for the
// owner to verify/correct.
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  extractMaintenanceFromEntries,
  type MaintenanceEntryInput,
} from "./maintenance";
import { STANDARD_ITEMS, maintenanceNextDue } from "@/lib/maintenance";
import { safeIsoDate } from "./date";

type Client = SupabaseClient<Database>;

export async function applyMaintenanceFromEntries(
  supabase: Client,
  aircraftId: string,
  entries: MaintenanceEntryInput[],
): Promise<{ updated: number; detected: number }> {
  if (entries.length === 0) return { updated: 0, detected: 0 };

  const events = await extractMaintenanceFromEntries(entries);
  if (events.length === 0) return { updated: 0, detected: 0 };

  // Latest completion per kind (by date; undated events sort last).
  const latestByKind = new Map<string, { date: string | null; hours: number | null }>();
  for (const e of events) {
    if (!e.kind || e.confidence < 0.4) continue;
    const date = safeIsoDate(e.date); // model may emit an impossible date → Postgres-safe
    const cur = latestByKind.get(e.kind);
    if (!cur || (date ?? "") > (cur.date ?? "")) {
      latestByKind.set(e.kind, { date, hours: e.hours });
    }
  }
  if (latestByKind.size === 0) return { updated: 0, detected: events.length };

  const { data: items } = await supabase
    .from("maintenance_item")
    .select("id, kind, interval_months, interval_hours, last_done_date")
    .eq("aircraft_id", aircraftId);
  const byKind = new Map((items ?? []).map((m) => [m.kind, m]));

  let changed = 0;
  for (const [kind, detected] of latestByKind) {
    const existing = byKind.get(kind);
    if (existing) {
      // Only advance forward.
      if (
        detected.date &&
        (!existing.last_done_date || detected.date > existing.last_done_date)
      ) {
        const due = maintenanceNextDue({
          interval_months: existing.interval_months,
          interval_hours: existing.interval_hours,
          last_done_date: detected.date,
          last_done_hours: detected.hours,
        });
        const { error } = await supabase
          .from("maintenance_item")
          .update({
            last_done_date: detected.date,
            last_done_hours: detected.hours,
            next_due_date: due.next_due_date,
            next_due_hours: due.next_due_hours,
          })
          .eq("id", existing.id);
        if (!error) changed++;
      }
    } else {
      // Auto-create a standard item from a first-seen completion.
      const std = STANDARD_ITEMS.find((s) => s.kind === kind);
      if (std && detected.date) {
        const due = maintenanceNextDue({
          interval_months: std.interval_months,
          interval_hours: std.interval_hours,
          last_done_date: detected.date,
          last_done_hours: detected.hours,
        });
        const { error } = await supabase.from("maintenance_item").insert({
          aircraft_id: aircraftId,
          kind: std.kind,
          label: std.label,
          regulatory: std.regulatory,
          interval_months: std.interval_months,
          interval_hours: std.interval_hours,
          last_done_date: detected.date,
          last_done_hours: detected.hours,
          next_due_date: due.next_due_date,
          next_due_hours: due.next_due_hours,
        });
        if (!error) changed++;
      }
    }
  }
  return { updated: changed, detected: events.length };
}
