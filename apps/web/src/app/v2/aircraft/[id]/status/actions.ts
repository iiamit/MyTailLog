"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIn } from "@/lib/mapModel";
import { failMessage, type WriteCtx } from "@/lib/writes/entries";
import * as maintenance from "@/lib/writes/maintenance";
import { recordVisitCompletion } from "@/lib/writes/visits";
import * as visits from "@/lib/writes/visits";
import { createLink } from "@/lib/mechanicLink";
import type { Meter } from "@/lib/hobbsTach";
import type { VisitStatus } from "@/lib/database.types";

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
  const { data: completion, error } = await supabase.from("item_completion").insert({
    aircraft_id: aircraftId, maintenance_item_id: itemId, done_date: date, done_hours: hours,
    meter: hours != null ? meter : null, source: "mark_done", created_by: user.id,
  }).select("id").maybeSingle();
  if (error) return { error: "The item was updated, but its history could not be saved. Try again." };
  if (completion) await recordVisitCompletion(supabase, aircraftId, `mx:${itemId}`, completion.id);
  revalidatePath(`/aircraft/${aircraftId}/status`);
  redirect(`/aircraft/${aircraftId}/status/item/mx:${itemId}?done=1`);
}

// --- Visits (W-STATUS-01 VisitPanel, BookVisitDialog; 09 §2.5) ---------------------------------

export type VisitFormState = { error?: string; url?: string; mailto?: string; expiresAt?: string } | null;

const statusHref = (aircraftId: string, q = "") => `/aircraft/${aircraftId}/status${q}`;
const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

/** "Book visit": a planned_visit with the ticked items. Online on the web. */
export async function bookVisit(aircraftId: string, suggestionKey: string | null, _prev: VisitFormState, form: FormData): Promise<VisitFormState> {
  const { supabase, user, ctx } = await session(aircraftId);
  if (!user) return { error: "Not signed in." };
  const itemKeys = form.getAll("item").map(String);
  if (!itemKeys.length) return { error: "Pick at least one item for the visit." };
  const id = crypto.randomUUID();
  const r = await visits.create(supabase, ctx, {
    id, weekOf: str(form, "weekOf"), visitDate: str(form, "visitDate") || null, providerId: str(form, "providerId") || null,
    notes: str(form, "notes") || null, fromSuggestionKey: suggestionKey, itemKeys,
  });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(statusHref(aircraftId));
  redirect(statusHref(aircraftId, `?visit=${id}&booked=1`));
}

/** "Dismiss" a suggestion; it returns only if its items or week change. */
export async function dismissVisitSuggestion(aircraftId: string, suggestionKey: string) {
  const { supabase, ctx } = await session(aircraftId);
  const r = await visits.dismissSuggestion(supabase, ctx, { id: crypto.randomUUID(), suggestionKey });
  revalidatePath(statusHref(aircraftId));
  redirect(statusHref(aircraftId, r.status === "ok" ? "" : `?err=${encodeURIComponent(failMessage(r))}`));
}

/** It's in the shop / Close this visit / Cancel visit. Closing returns undone items to the suggestions. */
export async function setVisitStatus(aircraftId: string, visitId: string, status: VisitStatus, back: "status" | "annual" = "status") {
  const { supabase, ctx } = await session(aircraftId);
  const r = await visits.setStatus(supabase, ctx, { visitId, status });
  revalidatePath(statusHref(aircraftId));
  const closed = status === "done" || status === "cancelled";
  const err = r.status === "ok" ? "" : `err=${encodeURIComponent(failMessage(r))}`;
  if (back === "annual") redirect(`/aircraft/${aircraftId}/maintenance/annual${err ? `?${err}` : ""}`);
  redirect(statusHref(aircraftId, closed && !err ? "" : `?visit=${visitId}${err ? `&${err}` : ""}`));
}

/** "Move": a new week (a Monday); the day goes unless it is still inside that week. */
export async function moveVisit(aircraftId: string, visitId: string, _prev: VisitFormState, form: FormData): Promise<VisitFormState> {
  const { supabase, user, ctx } = await session(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await visits.update(supabase, ctx, { visitId, weekOf: str(form, "weekOf") });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(statusHref(aircraftId));
  redirect(statusHref(aircraftId, `?visit=${visitId}`));
}

/** At-risk notice: "Move the visit to the week of {date}" in one press. */
export async function moveVisitTo(aircraftId: string, visitId: string, weekOf: string) {
  const { supabase, ctx } = await session(aircraftId);
  const r = await visits.update(supabase, ctx, { visitId, weekOf });
  revalidatePath(statusHref(aircraftId));
  redirect(statusHref(aircraftId, r.status === "ok" ? `?visit=${visitId}` : `?err=${encodeURIComponent(failMessage(r))}`));
}

/** "Send to {provider}": a 30-day mechanic link of kind visit; the owner's own mail app sends it (09 §4.5). */
export async function sendVisit(aircraftId: string, visitId: string, _prev: VisitFormState, form: FormData): Promise<VisitFormState> {
  const { supabase, user } = await session(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await createLink(supabase, {
    aircraftId, userId: user.id, kind: "visit", visitId,
    body: { recipientLabel: str(form, "recipientLabel"), providerId: str(form, "providerId") || null, expiresInDays: 30 },
  });
  if ("error" in r) return { error: r.error };
  return { url: r.url, mailto: r.mailto, expiresAt: r.expiresAt };
}
