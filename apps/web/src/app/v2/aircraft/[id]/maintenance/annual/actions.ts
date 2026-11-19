"use server";

import { createClient } from "@/lib/supabase/server";
import { createRoom } from "@/app/aircraft/[id]/share/actions";

export type IaRoomState = { error?: string; url?: string } | null;

/**
 * "Share with your IA" (W-MAINT-04 For your IA): the IA preset of a record room in one press. createRoom checks the
 * caller owns the aircraft and keeps only ids on it; the link is shown once, like the Share hub.
 */
export async function shareWithIa(aircraftId: string, days: number, _prev: IaRoomState, form: FormData): Promise<IaRoomState> {
  const supabase = await createClient();
  const [{ data: books }, { data: docs }] = await Promise.all([
    supabase.from("logbook").select("id").eq("aircraft_id", aircraftId),
    supabase.from("document").select("id").eq("aircraft_id", aircraftId),
  ]);
  return createRoom(aircraftId, {
    label: String(form.get("label") ?? "").trim() || "Your IA",
    includeSummary: form.get("summary") === "on",
    logbookIds: form.get("books") === "on" ? (books ?? []).map((b) => b.id) : [],
    includeScans: form.get("scans") === "on",
    documentIds: form.get("docs") === "on" ? (docs ?? []).map((d) => d.id) : [],
    days,
  });
}
