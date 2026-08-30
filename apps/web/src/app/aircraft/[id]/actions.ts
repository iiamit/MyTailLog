"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { removeBlobs } from "@/lib/storage";
import { METERS, type Meter } from "@/lib/hobbsTach";

/**
 * Delete captured pages along with any entries extracted from them and their
 * stored images. `log_entry.page_id` is ON DELETE SET NULL (so entries survive a
 * re-scan of the same page), which means deleting a page alone would leave
 * orphaned entries — this removes them explicitly.
 *
 * One implementation for one page or five hundred: deleting a whole mis-uploaded
 * batch used to be one confirm click per page.
 */
export async function deletePages(
  aircraftId: string,
  pageIds: string[],
): Promise<{ ok: true; deleted: number } | { error: string }> {
  if (pageIds.length === 0) return { ok: true, deleted: 0 };
  const supabase = await createClient();

  // A VIEWER can read these pages, and their DELETE matches zero rows and
  // returns no error — a silent no-op indistinguishable from success. Gate on
  // edit access rather than trusting the absence of an error.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId });
  if (!canEdit) return { error: "You don't have edit access to this aircraft." };

  // Re-resolve against the named aircraft: an id belonging to someone else's
  // aircraft must not ride along in the array.
  const { data: pages } = await supabase
    .from("page")
    .select("id, storage_path")
    .eq("aircraft_id", aircraftId)
    .in("id", pageIds.slice(0, MAX_DELETE));
  const found = pages ?? [];
  if (found.length === 0) return { error: "Those pages are no longer here." };

  const ids = found.map((p) => p.id);

  const { error: entriesError } = await supabase.from("log_entry").delete().in("page_id", ids);
  if (entriesError) return { error: `Couldn't delete entries: ${entriesError.message}` };

  // .select() so the count is what the database actually removed, not what was
  // asked for.
  const { data: gone, error: pageError } = await supabase
    .from("page")
    .delete()
    .in("id", ids)
    .select("id");
  if (pageError) return { error: `Couldn't delete pages: ${pageError.message}` };

  // Best-effort image cleanup — an orphaned object is harmless if this fails,
  // and the records (the part that matters) are already gone.
  const paths = found.map((p) => p.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) await removeBlobs(paths);

  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true, deleted: gone?.length ?? 0 };
}

/** Guard against an unbounded .in() list; the UI selects at most a page's worth. */
const MAX_DELETE = 500;

/** Delete one page. Kept as the single-page door onto deletePages. */
export async function deletePage(
  aircraftId: string,
  pageId: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await deletePages(aircraftId, [pageId]);
  if ("error" in res) return res;
  return res.deleted > 0 ? { ok: true } : { error: "Page not found." };
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
  if (orderedIds.length === 0) return { ok: true };
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: "Couldn't save order: the same page appeared twice." };
  }

  const supabase = await createClient();
  // Chunked concurrency rather than one round trip per page. Nudging a page one
  // step is 2 updates, but re-sequencing a whole logbook off a date sort is
  // however many pages that book has — sequential awaits made a 150-page book a
  // minutes-long wait. Chunked so a large logbook doesn't open 150 sockets at once.
  const CHUNK = 25;
  for (let start = 0; start < orderedIds.length; start += CHUNK) {
    const slice = orderedIds.slice(start, start + CHUNK);
    const results = await Promise.all(
      slice.map((id, k) =>
        supabase
          .from("page")
          .update({ page_sequence: start + k + 1 })
          .eq("id", id)
          .eq("aircraft_id", aircraftId)
          .select("id"),
      ),
    );
    for (const r of results) {
      if (r.error) return { error: `Couldn't save order: ${r.error.message}` };
      // RLS makes a non-editor's update match zero rows instead of failing.
      if (!r.data?.length) return { error: "You don't have permission to reorder these pages." };
    }
  }

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
