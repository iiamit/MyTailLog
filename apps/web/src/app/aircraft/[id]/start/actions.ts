"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage, type WriteCtx } from "@/lib/writes/entries";
import * as entries from "@/lib/writes/entries";
import * as maintenance from "@/lib/writes/maintenance";
import * as meters from "@/lib/writes/meters";
import { isIsoDate } from "@/lib/writes/meters";
import { DEFAULT_SEED_KINDS } from "@/lib/maintenance";

// Guided start (/aircraft/[id]/start). Thin wrappers over lib/writes, like every
// other action: the rules live there. The one judgment made here is that the
// owner explicitly confirming "this entry is my last annual" is what advances
// the forecast. No AI pass decides that (M3: unreviewed OCR never moves a
// compliance signal).

type Result = { ok: true } | { error: string };

async function session(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, ctx: { aircraftId, userId: user?.id ?? "" } as WriteCtx };
}

function refresh(aircraftId: string) {
  for (const p of ["", "/start", "/status", "/maintenance", "/meters"]) revalidatePath(`/aircraft/${aircraftId}${p}`);
}

/** Step 1: today's meter readings. */
export async function saveStartHours(aircraftId: string, input: { tach: number | null; hobbs: number | null }): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await meters.addReading(supabase, ctx, { tach: input.tach, hobbs: input.hobbs });
  if (r.status !== "ok") return { error: failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}

export type ExtractedEntry = {
  id: string;
  entry_date: string | null;
  tach: number | null;
  text: string;
};

/** The entries extraction produced for the page the owner just photographed. */
export async function pageEntries(aircraftId: string, pageId: string): Promise<ExtractedEntry[]> {
  const { supabase } = await session(aircraftId);
  const { data } = await supabase
    .from("log_entry")
    .select("id, entry_date, tach, description, work_performed")
    .eq("aircraft_id", aircraftId)
    .eq("page_id", pageId)
    .order("entry_date", { ascending: false, nullsFirst: false });
  return (data ?? []).map((e) => ({
    id: e.id,
    entry_date: e.entry_date,
    tach: e.tach,
    text: [e.description, e.work_performed].filter(Boolean).join(" · ").slice(0, 280),
  }));
}

/** Mark a seeded Part 91 item done on a date, adding the defaults first if this
 *  aircraft predates seeding at enroll. Never moves last-done backward. */
async function markKindDone(aircraftId: string, kind: string, date: string, hours: number | null): Promise<Result> {
  if (!isIsoDate(date)) return { error: "Pick a date." };
  if (date > new Date().toISOString().slice(0, 10)) return { error: "That date is in the future." };
  const { supabase, ctx } = await session(aircraftId);
  const seeded = await maintenance.seedStandard(supabase, ctx);
  if (seeded.status !== "ok") return { error: failMessage(seeded) };

  const { data: item } = await supabase
    .from("maintenance_item")
    .select("id, last_done_date")
    .eq("aircraft_id", aircraftId)
    .eq("kind", kind)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!item) return { error: "Couldn't find that item on this aircraft." };
  if (item.last_done_date && item.last_done_date > date) return { ok: true }; // already newer

  const r = await maintenance.markDone(supabase, ctx, { itemId: item.id, date, hours });
  if (r.status !== "ok") return { error: failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}

/** Step 2 (photo path): confirm the extracted entry and set the annual from it. */
export async function confirmAnnual(
  aircraftId: string,
  input: { entryId: string; date: string; tach: number | null },
): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  const confirmed = await entries.setConfirmed(supabase, ctx, { entryId: input.entryId, confirmed: true });
  if (confirmed.status !== "ok") return { error: failMessage(confirmed) };
  return markKindDone(aircraftId, "annual", input.date, input.tach);
}

/** Step 2 (typed path), and step 3's optional dates for the other Part 91 items. */
export async function setItemDate(aircraftId: string, input: { kind: string; date: string }): Promise<Result> {
  if (!DEFAULT_SEED_KINDS.includes(input.kind)) return { error: "Unknown item." };
  return markKindDone(aircraftId, input.kind, input.date, null);
}
