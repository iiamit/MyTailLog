"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as entries from "@/lib/writes/entries";
import * as pages from "@/lib/writes/pages";
import type { ReviewStatus, ReferenceLink } from "@/lib/database.types";

// Thin wrappers over lib/writes (CONTRACT §4): resolve the session, call the
// one implementation, revalidate. All behaviour lives in lib/writes/*.

export type { EntryFields } from "@/lib/writes/entries";

type Result = { ok: true } | { error: string };

async function session(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, ctx: { aircraftId, userId: user.id } } : null;
}

// An imported entry has no page (log_entry.page_id is nullable), so there is no
// single-page reviewer to revalidate — the flat "Review all" screen is its home.
function reviewPath(aircraftId: string, pageId: string | null) {
  return pageId
    ? `/aircraft/${aircraftId}/pages/${pageId}/review`
    : `/aircraft/${aircraftId}/review`;
}

const NOT_SIGNED_IN = "Not signed in.";

/** Replace an entry's external reference links. */
export async function setEntryLinks(
  aircraftId: string,
  pageId: string | null,
  entryId: string,
  links: ReferenceLink[],
): Promise<Result> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await entries.setLinks(s.supabase, s.ctx, { entryId, links });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

/** Consolidate a page-spanning entry into the entry it continues (#188 relink included). */
export async function mergeContinuation(
  aircraftId: string,
  pageId: string | null,
  tailId: string,
): Promise<Result> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await entries.mergeContinuation(s.supabase, s.ctx, { tailEntryId: tailId });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

/** Save edits to an extracted entry. Editing implicitly confirms it. */
export async function saveEntry(
  aircraftId: string,
  pageId: string | null,
  entryId: string,
  fields: entries.EntryFields,
): Promise<Result> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await entries.update(s.supabase, s.ctx, { entryId, fields });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

export async function setEntryConfirmed(
  aircraftId: string,
  pageId: string | null,
  entryId: string,
  confirmed: boolean,
): Promise<Result> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await entries.setConfirmed(s.supabase, s.ctx, { entryId, confirmed });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

export async function deleteEntry(
  aircraftId: string,
  pageId: string | null,
  entryId: string,
): Promise<Result> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await entries.remove(s.supabase, s.ctx, { entryId });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true };
}

/** Add an entry the extractor missed. */
export async function addEntry(
  aircraftId: string,
  pageId: string | null,
  logbookId: string,
  fields: entries.EntryFields,
): Promise<{ ok: true; id: string } | { error: string }> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await entries.create(s.supabase, s.ctx, { logbookId, pageId, fields });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  return { ok: true, id: String(r.row?.id) };
}

/** Mark the whole page reviewed (confirmed) or disputed. */
export async function setPageReview(
  aircraftId: string,
  pageId: string, // a real page — this marks the page itself reviewed
  status: ReviewStatus,
): Promise<Result> {
  const s = await session(aircraftId);
  if (!s) return { error: NOT_SIGNED_IN };
  const r = await pages.setReview(s.supabase, s.ctx, { pageId, status });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  revalidatePath(reviewPath(aircraftId, pageId));
  // 'layout' so the persistent shell's Review nav badge re-fetches (it lives in
  // aircraft/[id]/layout.tsx, which a default 'page' revalidate never touches).
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
  return { ok: true };
}
