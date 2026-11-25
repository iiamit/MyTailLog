"use server";

import { reviewDetails } from "@/lib/writes/pageDetails";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as entries from "@/lib/writes/entries";
import * as pages from "@/lib/writes/pages";
import * as gaps from "@/lib/writes/gaps";
import { randomUUID } from "node:crypto";
import { BOOK_NAME, nextWaiting } from "@/lib/v2/books";
import { insertAfter } from "@/lib/v2/capture";

// Thin wrappers over lib/writes (the same functions POST /api/sync/push dispatches), as the Status actions are:
// resolve the session, call the one implementation, revalidate the Logbooks screens and the rail.

type Fail = { error: string };

async function session(aircraftId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, ctx: { aircraftId, userId: data.user.id } as entries.WriteCtx } : null;
}
const NOT_SIGNED_IN = { error: "Not signed in." };

function refresh(aircraftId: string) {
  // 'layout' so the rail's "to review" flag and the spine re-read with the screen.
  revalidatePath(`/v2/aircraft/${aircraftId}`, "layout");
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
}

/** `gap.setStatus` from the gap detail (W-BOOKS-04). */
export async function setGapStatus(aircraftId: string, gapId: string, status: "open" | "no_pages_exist" | "asked_previous_owner" | "dismissed", note: string | null, base: string): Promise<{ ok: true; updatedAt: string } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  if (!base) return { error: "Reload the gap before changing it." };
  const r = await gaps.setStatus(s.supabase, s.ctx, { gapId, status, note }, base);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true, updatedAt: String(r.row?.updated_at) };
}

export type EntryWrite = { id: string; isNew: boolean; fields: Record<string, unknown> | null; base?: string };

/** The next page waiting for review after `pageId` (same book by sequence, then the other books in book order). */
async function nextPage(supabase: entries.Db, aircraftId: string, pageId: string | null): Promise<string | null> {
  const { data: waiting } = await supabase
    .from("log_entry")
    .select("page_id")
    .eq("aircraft_id", aircraftId)
    .eq("owner_confirmed", false)
    .is("replaced_by_entry_id", null)
    .not("page_id", "is", null)
    .limit(5000);
  const { data: referencePages } = await supabase.from("page").select("id").eq("aircraft_id", aircraftId).eq("extraction_status", "extracted").eq("review_status", "unreviewed").not("content_kinds", "eq", "{}");
  const ids = [...new Set([...(waiting ?? []).map((w) => w.page_id!), ...(referencePages ?? []).map((p) => p.id)].filter((p) => p !== pageId))];
  if (!ids.length) return null;
  const [{ data: rows }, { data: books }] = await Promise.all([
    supabase.from("page").select("id, logbook_id, page_sequence, created_at, extraction_status").in("id", ids.slice(0, 500)),
    supabase.from("logbook").select("id, type").eq("aircraft_id", aircraftId),
  ]);
  const type = new Map((books ?? []).map((b) => [b.id, b.type]));
  const current = pageId ? (await supabase.from("page").select("logbook_id").eq("id", pageId).maybeSingle()).data : null;
  const list = (rows ?? [])
    .filter((p) => p.extraction_status === "extracted")
    .map((p) => ({ id: p.id, logbook: type.get(p.logbook_id) ?? "other", sequence: p.page_sequence, created_at: p.created_at }));
  return nextWaiting(list, pageId ?? "", current ? type.get(current.logbook_id) ?? "" : "");
}

/**
 * Confirm entries from the review desk: unchanged ones by `entry.confirm`, changed ones by `entry.update` (which
 * confirms), missed ones by `entry.create`. With `pageId` and `wholePage`, the page is marked confirmed
 * (`page.review`) and the next waiting page is returned. Stops at the first failure and says which entry.
 */
export async function confirmEntries(
  aircraftId: string,
  pageId: string | null,
  logbookId: string,
  writes: EntryWrite[],
  wholePage: boolean,
  pageBase?: string,
): Promise<{ ok: true; pageVersions: Record<string, string>; confirmed: string[]; created: { tempId: string; id: string }[]; updatedVersions: Record<string, string>; versions: Record<string, string>; next: string | null } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  if (pageId && wholePage && !pageBase) return { error: "Reload the page before confirming it." };
  const prepared: Record<string, unknown>[] = [];
  for (const w of writes) {
    if (!w.isNew && !w.base) return { error: "Reload this entry before confirming it." };
    const picked = w.fields ? entries.pickEntryFields(w.fields) : { fields: null };
    if ("error" in picked) return { error: picked.error };
    prepared.push({ ...w, tempId: w.id, id: w.isNew && !/^[0-9a-f-]{36}$/i.test(w.id) ? randomUUID() : w.id, fields: picked.fields });
  }
  const { data, error } = await s.supabase.rpc("confirm_review_entries", {
    p_aircraft: aircraftId, p_page: pageId, p_book: logbookId || null,
    p_page_base: pageBase || null, p_writes: prepared, p_whole: wholePage,
  });
  if (error) return { error: error.message };
  const result = data as { status: string; row: { confirmed: string[]; created: { tempId: string; id: string }[]; entryVersions: Record<string, string>; updatedVersions: Record<string, string>; pageVersions: Record<string, string> } } | null;
  if (result?.status !== "ok" || !result.row) return { error: "Could not confirm these entries." };
  const next = pageId && wholePage ? await nextPage(s.supabase, aircraftId, pageId) : null;
  refresh(aircraftId);
  return { ok: true, confirmed: result.row.confirmed, created: result.row.created, versions: result.row.entryVersions, updatedVersions: result.row.updatedVersions, pageVersions: result.row.pageVersions, next };
}

/** Undo "Confirm page and next" or "Confirm clean pages": back to read by AI, pages back to unreviewed. */
export async function undoConfirm(aircraftId: string, entryVersions: Record<string, string>, pageVersions: Record<string, string>): Promise<{ ok: true } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const { error } = await s.supabase.rpc("undo_review_confirmation", { p_aircraft: aircraftId, p_entries: entryVersions, p_pages: pageVersions });
  if (error) return { error: error.message };
  refresh(aircraftId);
  return { ok: true };
}

export async function setEntryConfirmed(aircraftId: string, entryId: string, confirmed: boolean, base: string): Promise<{ ok: true } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const r = await entries.setConfirmed(s.supabase, s.ctx, { entryId, confirmed }, base);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}

export async function deleteEntry(aircraftId: string, entryId: string, base: string): Promise<{ ok: true } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const r = await entries.remove(s.supabase, s.ctx, { entryId }, base);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}

/** "Join them": merge a continuation into the entry it continues (entry.merge). */
export async function joinContinuation(aircraftId: string, tailEntryId: string, base: string): Promise<{ ok: true } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const r = await entries.mergeContinuation(s.supabase, s.ctx, { tailEntryId }, base);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}

/** "Flag this page" (page.review disputed). */
export async function flagPage(aircraftId: string, pageId: string, base: string): Promise<{ ok: true } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  if (!base) return { error: "Reload the page before changing it." };
  const r = await pages.setReview(s.supabase, s.ctx, { pageId, status: "disputed" }, base);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}

/**
 * "Confirm {c} clean pages" (W-BOOKS-08) through entries.confirmClean. The ids it will confirm are read first with
 * the same rule (isEntryClean) so the toast's Undo can put exactly those back.
 */
export async function confirmClean(aircraftId: string, versions: Record<string, string>): Promise<{ ok: true; entries: number; ids: string[]; pages: string[]; entryVersions: Record<string, string>; pageVersions: Record<string, string> } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const r = await entries.confirmClean(s.supabase, s.ctx, { versions });
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  const entryVersions = (r.row?.entryVersions ?? {}) as Record<string, string>;
  const pageVersions = (r.row?.pageVersions ?? {}) as Record<string, string>;
  refresh(aircraftId);
  return { ok: true, entries: Number(r.row?.confirmed ?? 0), ids: Object.keys(entryVersions), pages: Object.keys(pageVersions), entryVersions, pageVersions };
}

// --- Pages library and Add pages (W-BOOKS-05, W-BOOKS-06) ----------------------------------------------------------

type Done = { ok: true; n: number } | Fail;
const counted = (r: Extract<entries.WriteResult, { status: "ok" }>, k: string) => Number((r.row as Record<string, unknown> | null)?.[k] ?? 0);

async function pageWrite(aircraftId: string, run: (s: NonNullable<Awaited<ReturnType<typeof session>>>) => Promise<entries.WriteResult>, k: string): Promise<Done> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const r = await run(s);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true, n: counted(r, k) };
}

/** "Read again": back into the server reading queue. */
export async function readPagesAgain(aircraftId: string, pageIds: string[]): Promise<Done> {
  return pageWrite(aircraftId, (s) => pages.requeue(s.supabase, s.ctx, { pageIds }), "queued");
}

/** "Move to another book": pages and the entries read from them. */
export async function movePagesTo(aircraftId: string, pageIds: string[], logbookId: string): Promise<Done> {
  return pageWrite(aircraftId, (s) => pages.movePages(s.supabase, s.ctx, { pageIds, logbookId }), "moved");
}

/** "Delete": pages, their entries and their scans (page.delete). */
export async function deletePagesNow(aircraftId: string, pageIds: string[]): Promise<Done> {
  return pageWrite(aircraftId, (s) => pages.deletePages(s.supabase, s.ctx, { pageIds }), "deleted");
}

/** "Done reordering" (page.reorder) for one volume. */
export async function savePageOrder(aircraftId: string, logbookId: string, orderedIds: string[]): Promise<Done> {
  const r = await pageWrite(aircraftId, (s) => pages.reorder(s.supabase, s.ctx, { logbookId, orderedIds }), "none");
  return "error" in r ? r : { ok: true, n: orderedIds.length };
}

/** "Place them: After page {n}" (W-BOOKS-06): pages that arrived at the end move to sit after paper position `after`. */
export async function placePagesAfter(aircraftId: string, logbookId: string, newIds: string[], after: number): Promise<Done> {
  const r = await pageWrite(aircraftId, async (s) => {
    const { data } = await s.supabase.from("page").select("id").eq("aircraft_id", aircraftId).eq("logbook_id", logbookId)
      .order("page_sequence", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(2000);
    const ids = (data ?? []).map((p) => p.id);
    const here = new Set(ids);
    return pages.reorder(s.supabase, s.ctx, { logbookId, orderedIds: insertAfter(ids, newIds.filter((id) => here.has(id)), after) });
  }, "none");
  return "error" in r ? r : { ok: true, n: newIds.length };
}

export type DuplicatePair = { pageId: string; label: string; of: { pageId: string; label: string; scannedAt: string } };

/** Pages held for "Keep both" / "Skip this one" (09 §3.9.3), each with the page it looks like. */
export async function pendingDuplicates(aircraftId: string): Promise<DuplicatePair[]> {
  const s = await session(aircraftId);
  if (!s) return [];
  const { data: held } = await s.supabase.from("page").select("id, logbook_id, page_sequence, duplicate_of_page_id")
    .eq("aircraft_id", aircraftId).not("duplicate_of_page_id", "is", null).in("extraction_status", ["queued", "pending"]).limit(100);
  if (!held?.length) return [];
  const [{ data: originals }, { data: books }] = await Promise.all([
    s.supabase.from("page").select("id, logbook_id, page_sequence, created_at").in("id", held.map((h) => h.duplicate_of_page_id!)),
    s.supabase.from("logbook").select("id, type, title").eq("aircraft_id", aircraftId),
  ]);
  const label = (logbookId: string, seq: number | null) => {
    const b = (books ?? []).find((x) => x.id === logbookId);
    return `${b?.title || BOOK_NAME[b?.type ?? "other"] || "Logbook"}${seq != null ? ` p. ${seq}` : ""}`;
  };
  return held.flatMap((h) => {
    const o = (originals ?? []).find((x) => x.id === h.duplicate_of_page_id);
    return o ? [{ pageId: h.id, label: label(h.logbook_id, h.page_sequence), of: { pageId: o.id, label: label(o.logbook_id, o.page_sequence), scannedAt: o.created_at } }] : [];
  });
}

/** Identity decisions share the native outbox transaction; an old page or destination cannot overwrite a newer one. */
export async function reviewPageDetails(aircraftId: string, pageId: string, base: string, decision: unknown): Promise<{ ok: true } | Fail> {
  const s = await session(aircraftId);
  if (!s) return NOT_SIGNED_IN;
  const r = await reviewDetails(s.supabase, s.ctx, { pageId, decision }, base);
  if (r.status !== "ok") return { error: entries.failMessage(r) };
  refresh(aircraftId);
  return { ok: true };
}
