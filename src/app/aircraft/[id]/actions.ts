"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

/**
 * Delete a captured page along with any entries extracted from it and its
 * stored image. `log_entry.page_id` is ON DELETE SET NULL (so entries survive a
 * re-scan of the same page), which means deleting the page alone would leave
 * orphaned entries — this action removes them explicitly. Runs under the
 * caller's session, so RLS scopes every step to the owner's aircraft.
 */
export async function deletePage(
  aircraftId: string,
  pageId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("page")
    .select("storage_path, aircraft_id")
    .eq("id", pageId)
    .single();
  if (!page || page.aircraft_id !== aircraftId) {
    return { error: "Page not found." };
  }

  const { error: entriesError } = await supabase
    .from("log_entry")
    .delete()
    .eq("page_id", pageId);
  if (entriesError) {
    return { error: `Couldn't delete entries: ${entriesError.message}` };
  }

  const { error: pageError } = await supabase.from("page").delete().eq("id", pageId);
  if (pageError) {
    return { error: `Couldn't delete page: ${pageError.message}` };
  }

  // Best-effort image cleanup — an orphaned storage object is harmless if this
  // fails, and the records (the important part) are already gone.
  if (page.storage_path) {
    await supabase.storage.from(BUCKET).remove([page.storage_path]);
  }

  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

/**
 * Persist a manual page order for one logbook: renumber page_sequence to match
 * `orderedIds` (1..N). page_sequence has no unique constraint, so a straight
 * renumber is safe. RLS scopes updates to editors of this aircraft; the
 * aircraft_id filter is a belt-and-suspenders guard. page_sequence drives the
 * #N label and the review prev/next order, so this reorders those too.
 */
export async function reorderPages(
  aircraftId: string,
  orderedIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("page")
      .update({ page_sequence: i + 1 })
      .eq("id", orderedIds[i])
      .eq("aircraft_id", aircraftId);
    if (error) return { error: `Couldn't save order: ${error.message}` };
  }
  revalidatePath(`/aircraft/${aircraftId}/pages`);
  return { ok: true };
}

// A flagged reading lives in log_entry (source "entry") or hours_reading
// ("mfb"); both carry hobbs/tach + hours_reviewed_at and are RLS-scoped to
// aircraft editors. Branch on source so each .from() stays a concrete table.
type HoursSource = "entry" | "mfb";
type HoursPatch = { hobbs?: number | null; tach?: number | null; hours_reviewed_at: string };

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
  field: "hobbs" | "tach",
  value: number,
): Promise<{ ok: true } | { error: string }> {
  if (!Number.isFinite(value) || value <= 0) return { error: "Enter a positive number." };
  const stamp = new Date().toISOString();
  const patch: HoursPatch =
    field === "hobbs" ? { hobbs: value, hours_reviewed_at: stamp } : { tach: value, hours_reviewed_at: stamp };
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
  field: "hobbs" | "tach",
): Promise<{ ok: true } | { error: string }> {
  const stamp = new Date().toISOString();
  const patch: HoursPatch =
    field === "hobbs" ? { hobbs: null, hours_reviewed_at: stamp } : { tach: null, hours_reviewed_at: stamp };
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
