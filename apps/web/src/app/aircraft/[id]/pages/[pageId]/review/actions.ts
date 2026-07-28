"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ReviewStatus, ReferenceLink } from "@/lib/database.types";

// The editable fields of a log entry. Arrays arrive already split from the
// client's comma-separated inputs. All mutations run under the caller's session
// so row-level security scopes them to the owner's aircraft.
export type EntryFields = {
  entry_date: string | null;
  hobbs: number | null;
  airframe: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
  // Optional: only present when the entry's attachment/links editor changes it,
  // so a normal field save via .update({...fields}) leaves existing links intact.
  reference_links?: ReferenceLink[];
};

type Result = { ok: true } | { error: string };

function reviewPath(aircraftId: string, pageId: string) {
  return `/aircraft/${aircraftId}/pages/${pageId}/review`;
}

/**
 * Replace an entry's external reference links. Only http(s) URLs are stored
 * (these render as an <a href>, so a javascript: link would be XSS); labels and
 * count are bounded. RLS scopes the write to editors of this aircraft.
 */
export async function setEntryLinks(
  aircraftId: string,
  pageId: string,
  entryId: string,
  links: ReferenceLink[],
): Promise<Result> {
  const clean = (links ?? [])
    .map((l) => ({ label: String(l?.label ?? "").trim().slice(0, 120), url: String(l?.url ?? "").trim() }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 20);
  const supabase = await createClient();
  const { error } = await supabase.from("log_entry").update({ reference_links: clean }).eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

const joinText = (a: string | null, b: string | null): string | null =>
  [a, b].map((x) => x?.trim()).filter(Boolean).join(" ") || null;
const unionRefs = (a: string[] | null, b: string[] | null): string[] => [
  ...new Set([...(a ?? []), ...(b ?? [])]),
];

/**
 * Consolidate a page-spanning entry. `tailId` is the continuation (the orphaned
 * top-of-page half). We find its "head" — the entry that runs off the bottom of
 * the previous page in the same logbook — merge the two into the head (keeping
 * the head's date/tach, concatenating the work text, taking the closing
 * signature from the tail, unioning AD/SB refs), then delete the tail. The
 * merged entry drops back to unconfirmed so the owner vets the result.
 */
export async function mergeContinuation(
  aircraftId: string,
  pageId: string,
  tailId: string,
): Promise<Result> {
  const supabase = await createClient();

  const { data: tail } = await supabase
    .from("log_entry")
    .select("*")
    .eq("id", tailId)
    .single();
  if (!tail || tail.aircraft_id !== aircraftId) return { error: "Entry not found." };

  const { data: tailPage } = await supabase
    .from("page")
    .select("page_sequence, logbook_id")
    .eq("id", tail.page_id ?? "")
    .single();
  if (!tailPage || tailPage.page_sequence == null) {
    return { error: "This page has no sequence number, so the previous page can't be found." };
  }

  const { data: prevPages } = await supabase
    .from("page")
    .select("id")
    .eq("logbook_id", tailPage.logbook_id)
    .lt("page_sequence", tailPage.page_sequence)
    .order("page_sequence", { ascending: false })
    .limit(1);
  const prevPage = prevPages?.[0];
  if (!prevPage) return { error: "There's no previous page in this logbook to merge into." };

  const { data: candidates } = await supabase
    .from("log_entry")
    .select("*")
    .eq("page_id", prevPage.id)
    .order("entry_index", { ascending: false, nullsFirst: false });
  const heads = candidates ?? [];
  // Prefer the entry the model flagged as continuing; else one still "open" (no
  // signature); else the last entry on the page.
  const head =
    heads.find((h) => h.continues_next) ??
    heads.find((h) => !h.signature_name) ??
    heads[0];
  if (!head) return { error: "The previous page has no entry to merge into." };
  if (head.id === tail.id) return { error: "Nothing to merge." };

  const { error: updateError } = await supabase
    .from("log_entry")
    .update({
      entry_date: head.entry_date ?? tail.entry_date,
      hobbs: head.hobbs ?? tail.hobbs,
      airframe: head.airframe ?? tail.airframe,
      tach: head.tach ?? tail.tach,
      description: joinText(head.description, tail.description),
      work_performed: joinText(head.work_performed, tail.work_performed),
      parts: joinText(head.parts, tail.parts),
      signature_name: tail.signature_name ?? head.signature_name,
      mechanic_cert_number: tail.mechanic_cert_number ?? head.mechanic_cert_number,
      ad_refs: unionRefs(head.ad_refs, tail.ad_refs),
      sb_refs: unionRefs(head.sb_refs, tail.sb_refs),
      continues_next: tail.continues_next, // the tail may itself run onward (3+ pages)
      is_continuation: head.is_continuation,
      field_confidence: null,
      owner_confirmed: false,
    })
    .eq("id", head.id);
  if (updateError) return { error: updateError.message };

  const { error: deleteError } = await supabase.from("log_entry").delete().eq("id", tail.id);
  if (deleteError) return { error: deleteError.message };

  revalidatePath(reviewPath(aircraftId, pageId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
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
  // 'layout' so the persistent shell's Review nav badge re-fetches (it lives in
  // aircraft/[id]/layout.tsx, which a default 'page' revalidate never touches).
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
  return { ok: true };
}
