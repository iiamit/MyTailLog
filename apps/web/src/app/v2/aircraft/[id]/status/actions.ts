"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/mapModel";
import { failMessage, type WriteCtx } from "@/lib/writes/entries";
import * as maintenance from "@/lib/writes/maintenance";
import type { Meter } from "@/lib/hobbsTach";

async function session(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user, ctx: { aircraftId, userId: user?.id ?? "" } as WriteCtx };
}

/** "Add the standard Part 91 items" on the empty Status board (W-STATUS-01 No items). */
export async function seedStandardFromStatus(aircraftId: string) {
  const { supabase, ctx } = await session(aircraftId);
  await maintenance.seedStandard(supabase, ctx);
  revalidatePath(`/aircraft/${aircraftId}/status`);
}

export type MarkDoneState = { error?: string; warning?: string } | null;

/**
 * Mark-done drawer (W-STATUS-04) for tracked items: the existing write updates the item and records the meter
 * reading, then an item_completion (source mark_done) is added so the v2 engine and the history count it (09 §2.2).
 */
export async function markItemDone(aircraftId: string, itemId: string, _prev: MarkDoneState, form: FormData): Promise<MarkDoneState> {
  const { supabase, user, ctx } = await session(aircraftId);
  if (!user) return { error: "Not signed in." };
  const date = String(form.get("date") ?? "");
  const rawHours = String(form.get("hours") ?? "").trim();
  const hours = rawHours === "" ? null : Number(rawHours);
  const meter = String(form.get("meter") ?? "tach") as Meter;
  const { data: profile } = await supabase.from("profile").select("time_zone").eq("id", user.id).maybeSingle();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIn(profile?.time_zone)) return { error: "Pick a date on or before today." };
  if (hours != null && !(Number.isFinite(hours) && hours >= 0)) return { error: "Hours must be zero or a positive number." };

  const latest = Number(form.get("latest"));
  if (hours != null && Number.isFinite(latest) && hours < latest && form.get("confirmLower") !== "1")
    return { warning: `That's lower than the last reading, ${latest.toFixed(1)}. Check the meter.` };

  const r = await maintenance.markDone(supabase, ctx, { itemId, date, hours, meter });
  if (r.status !== "ok") return { error: failMessage(r) };
  const { error } = await supabase.from("item_completion").insert({
    aircraft_id: aircraftId, maintenance_item_id: itemId, done_date: date, done_hours: hours,
    meter: hours != null ? meter : null, source: "mark_done", created_by: user.id,
  });
  if (error) return { error: "The item was updated, but its history could not be saved. Try again." };
  revalidatePath(`/aircraft/${aircraftId}/status`);
  redirect(`/aircraft/${aircraftId}/status/item/mx:${itemId}?done=1`);
}
