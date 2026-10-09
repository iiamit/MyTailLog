import type { createClient } from "@/lib/supabase/server";
import type { LogEntry, Page } from "@/lib/database.types";

type EntryRow = Pick<LogEntry, "id" | "page_id" | "logbook_id" | "entry_date" | "hobbs" | "tach" | "description" | "work_performed" | "parts" | "owner_confirmed" | "authored_superseded_by">;

/** Supabase caps result sets; a dossier must not silently omit older pages. */
export async function loadLogEntries(supabase: Awaited<ReturnType<typeof createClient>>, aircraftId: string) {
  const rows: EntryRow[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from("log_entry")
      .select("id, page_id, logbook_id, entry_date, hobbs, tach, description, work_performed, parts, owner_confirmed, authored_superseded_by")
      .eq("aircraft_id", aircraftId).order("id").range(start, start + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return rows;
}

export async function loadRecordPages(supabase: Awaited<ReturnType<typeof createClient>>, aircraftId: string) {
  const rows: Pick<Page, "id" | "logbook_id" | "page_sequence" | "review_status" | "extraction_status" | "unread_rotated_content">[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from("page")
      .select("id, logbook_id, page_sequence, review_status, extraction_status, unread_rotated_content")
      .eq("aircraft_id", aircraftId).order("id").range(start, start + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  return rows;
}
