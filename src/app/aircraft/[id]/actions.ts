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
