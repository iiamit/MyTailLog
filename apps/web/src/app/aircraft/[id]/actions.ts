"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as pages from "@/lib/writes/pages";
import { failMessage } from "@/lib/writes/entries";
import { METERS, type Meter } from "@/lib/hobbsTach";

// Page ops are thin wrappers over lib/writes/pages (CONTRACT §4): resolve the
// session, call the one implementation, revalidate. The meter functions below
// are unchanged (writes C2 owns them).

async function session(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, ctx: { aircraftId, userId: user.id } } : null;
}

/** Delete captured pages, their extracted entries and stored images. */
export async function deletePages(
  aircraftId: string,
  pageIds: string[],
): Promise<{ ok: true; deleted: number } | { error: string }> {
  if (pageIds.length === 0) return { ok: true, deleted: 0 };
  const s = await session(aircraftId);
  if (!s) return { error: "Not signed in." };
  const r = await pages.deletePages(s.supabase, s.ctx, { pageIds });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true, deleted: Number(r.row?.deleted ?? 0) };
}

/** Delete one page. Kept as the single-page door onto deletePages. */
export async function deletePage(
  aircraftId: string,
  pageId: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await deletePages(aircraftId, [pageId]);
  if ("error" in res) return res;
  return res.deleted > 0 ? { ok: true } : { error: "Page not found." };
}

/** Persist a manual page order: renumber page_sequence to match `orderedIds` (1..N). */
export async function reorderPages(
  aircraftId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { error: string }> {
  if (orderedIds.length === 0) return { ok: true };
  const s = await session(aircraftId);
  if (!s) return { error: "Not signed in." };
  const r = await pages.reorder(s.supabase, s.ctx, { orderedIds });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${aircraftId}/pages`);
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

// A flagged reading lives in log_entry (source "entry") or hours_reading
// ("mfb"); both carry hobbs/tach + hours_reviewed_at and are RLS-scoped to
// aircraft editors. Branch on source so each .from() stays a concrete table.
type HoursSource = "entry" | "mfb";
type HoursPatch = { hobbs?: number | null; tach?: number | null; airframe?: number | null; hours_reviewed_at: string };

async function updateReading(
  aircraftId: string,
  source: HoursSource,
  readingId: string,
  patch: HoursPatch,
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const table = source === "entry" ? "log_entry" : "mfb" === source ? "hours_reading" : null;
  if (table !== "log_entry" && table !== "hours_reading") return { error: "Unknown reading source." };
  const q =
    table === "log_entry"
      ? supabase.from("log_entry").update(patch)
      : supabase.from("hours_reading").update(patch);
  const { error } = await q.eq("id", readingId).eq("aircraft_id", aircraftId);
  return error ? { error: error.message } : null;
}

/**
 * Accept a suggested correction to a mis-keyed hobbs/tach reading: write the new
 * value and stamp hours_reviewed_at so it stops re-flagging. `value` is the
 * (possibly owner-edited) replacement — validated as a positive finite number.
 */
export async function acceptHoursFix(
  aircraftId: string,
  source: HoursSource,
  readingId: string,
  field: Meter,
  value: number,
): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(value) || value <= 0) return { error: "Enter a positive number." };
  if (!METERS.includes(field)) return { error: "Unknown meter." };
  const stamp = new Date().toISOString();
  const patch: HoursPatch = { [field]: value, hours_reviewed_at: stamp };
  const err = await updateReading(aircraftId, source, readingId, patch);
  if (err) return { error: `Couldn't save: ${err.error}` };
  revalidatePath(`/aircraft/${aircraftId}/duplicates`);
  return { ok: true };
}

/**
 * Clear a duplicated meter field (hobbs===tach → the hobbs is a copy of the
 * tach): null it out and stamp reviewed. Keeps the real tach reading intact.
 */
export async function clearHoursField(
  aircraftId: string,
  source: HoursSource,
  readingId: string,
  field: Meter,
): Promise<{ ok: true } | { error: string }> {
  if (!METERS.includes(field)) return { error: "Unknown meter." };
  const stamp = new Date().toISOString();
  const patch: HoursPatch = { [field]: null, hours_reviewed_at: stamp };
  const err = await updateReading(aircraftId, source, readingId, patch);
  if (err) return { error: `Couldn't clear: ${err.error}` };
  revalidatePath(`/aircraft/${aircraftId}/duplicates`);
  return { ok: true };
}

/** Dismiss a flag — the reading is correct as-is; just stop re-flagging it. */
export async function dismissHoursFlag(
  aircraftId: string,
  source: HoursSource,
  readingId: string,
): Promise<{ ok: true } | { error: string }> {
  const err = await updateReading(aircraftId, source, readingId, { hours_reviewed_at: new Date().toISOString() });
  if (err) return { error: `Couldn't dismiss: ${err.error}` };
  revalidatePath(`/aircraft/${aircraftId}/duplicates`);
  return { ok: true };
}
