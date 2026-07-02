"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ReviewStatus } from "@/lib/database.types";

// The editable fields of a log entry. Arrays arrive already split from the
// client's comma-separated inputs. All mutations run under the caller's session
// so row-level security scopes them to the owner's aircraft.
export type EntryFields = {
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
};

type Result = { ok: true } | { error: string };

function reviewPath(aircraftId: string, pageId: string) {
  return `/aircraft/${aircraftId}/pages/${pageId}/review`;
}

/** Save edits to an extracted entry. Editing implicitly confirms it — a human
 *  has now vetted the fields, so it's trustworthy enough to drive reminders. */
export async function saveEntry(
  aircraftId: string,
  pageId: string,
  entryId: string,
  fields: EntryFields,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_entry")
    .update({ ...fields, owner_confirmed: true })
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

export async function setEntryConfirmed(
  aircraftId: string,
  pageId: string,
  entryId: string,
  confirmed: boolean,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("log_entry")
    .update({ owner_confirmed: confirmed })
    .eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

export async function deleteEntry(
  aircraftId: string,
  pageId: string,
  entryId: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("log_entry").delete().eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

/** Add an entry the extractor missed. Human-authored, so confirmed and with no
 *  machine confidence/model provenance. */
export async function addEntry(
  aircraftId: string,
  pageId: string,
  logbookId: string,
  fields: EntryFields,
): Promise<{ ok: true; id: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("log_entry")
    .insert({
      page_id: pageId,
      logbook_id: logbookId,
      aircraft_id: aircraftId,
      ...fields,
      owner_confirmed: true,
      confidence: null,
      field_confidence: null,
      extraction_model: null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Insert failed." };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true, id: data.id };
}

/** Mark the whole page reviewed (confirmed) or disputed. */
export async function setPageReview(
  aircraftId: string,
  pageId: string,
  status: ReviewStatus,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("page")
    .update({ review_status: status })
    .eq("id", pageId);
  if (error) return { error: error.message };
  revalidatePath(reviewPath(aircraftId, pageId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}
