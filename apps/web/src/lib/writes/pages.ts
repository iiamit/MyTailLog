import type { Page, ReviewStatus } from "@/lib/database.types";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every page write (CONTRACT §3 C1, §4). See
// entries.ts for the rules. `@/lib/storage` is imported lazily because it is
// `server-only`, and the unit tests load this file under plain node for
// reorderPlan.

const NO_EDIT = "You don't have edit access to this aircraft.";
const REVIEW_STATUSES: ReviewStatus[] = ["unreviewed", "confirmed", "disputed"];

/** Guard against an unbounded .in() list; the UI selects at most a page's worth. */
export const MAX_DELETE = 500;

/**
 * Renumber page_sequence to match `orderedIds` (1..N). page_sequence has no
 * unique constraint, so a straight renumber is safe. page_sequence drives the
 * #N label and the review prev/next order, so this reorders those too.
 */
export function reorderPlan(orderedIds: unknown): { rows: { id: string; page_sequence: number }[] } | { error: string } {
  if (!Array.isArray(orderedIds) || !orderedIds.every((x) => typeof x === "string" && x)) {
    return { error: "Couldn't save order: the page list is malformed." };
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { error: "Couldn't save order: the same page appeared twice." };
  }
  return { rows: (orderedIds as string[]).map((id, k) => ({ id, page_sequence: k + 1 })) };
}

/** Mark the whole page reviewed (confirmed) or disputed. `base` is the page's updated_at. */
export async function setReview(
  supabase: Db,
  ctx: WriteCtx,
  input: { pageId: string; status: ReviewStatus },
  base?: string,
): Promise<WriteResult> {
  if (!REVIEW_STATUSES.includes(input.status)) return { status: "error", message: "Unknown review status.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const { data: page, error: loadErr } = await supabase
    .from("page")
    .select("*")
    .eq("id", input.pageId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (loadErr) return { status: "error", message: loadErr.message };
  if (!page) return { status: "error", message: "Page not found.", httpStatus: 404 };
  if (isStale(page.updated_at, base)) return { status: "conflict", row: page };

  const { data, error } = await supabase
    .from("page")
    .update({ review_status: input.status })
    .eq("id", input.pageId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Page not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/**
 * Persist a manual page order for one logbook ({@link reorderPlan}). No base:
 * a reorder is idempotent and the last one wins. `logbookId`, when given, pins
 * the update to that book so a stale id list can't renumber another one.
 */
export async function reorder(
  supabase: Db,
  ctx: WriteCtx,
  input: { logbookId?: string; orderedIds: unknown },
): Promise<WriteResult> {
  const plan = reorderPlan(input.orderedIds);
  if ("error" in plan) return { status: "error", message: plan.error, httpStatus: 400 };
  if (plan.rows.length === 0) return { status: "ok", row: null };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  // Chunked concurrency rather than one round trip per page. Nudging a page one
  // step is 2 updates, but re-sequencing a whole logbook off a date sort is
  // however many pages that book has — sequential awaits made a 150-page book a
  // minutes-long wait. Chunked so a large logbook doesn't open 150 sockets at once.
  const CHUNK = 25;
  for (let start = 0; start < plan.rows.length; start += CHUNK) {
    const results = await Promise.all(
      plan.rows.slice(start, start + CHUNK).map(({ id, page_sequence }) => {
        let q = supabase.from("page").update({ page_sequence }).eq("id", id).eq("aircraft_id", ctx.aircraftId);
        if (input.logbookId) q = q.eq("logbook_id", input.logbookId);
        return q.select("id");
      }),
    );
    for (const r of results) {
      if (r.error) return { status: "error", message: `Couldn't save order: ${r.error.message}` };
      // RLS makes a non-editor's update match zero rows instead of failing.
      if (!r.data?.length) return { status: "error", message: "Some of those pages are no longer here.", httpStatus: 404 };
    }
  }
  return { status: "ok", row: null };
}

/**
 * Delete captured pages along with any entries extracted from them and their
 * stored images. `log_entry.page_id` is ON DELETE SET NULL (so entries survive a
 * re-scan of the same page), which means deleting a page alone would leave
 * orphaned entries — this removes them explicitly. The other page references
 * (scanned_document CASCADE; weight_balance/ad_compliance/oil_analysis
 * source pages SET NULL) are provenance of a page that no longer exists, so
 * they die with it.
 *
 * One implementation for one page or five hundred: deleting a whole mis-uploaded
 * batch used to be one confirm click per page. Returns row `{ deleted }`.
 */
export async function deletePages(
  supabase: Db,
  ctx: WriteCtx,
  input: { pageIds: unknown },
): Promise<WriteResult> {
  const ids0 = Array.isArray(input.pageIds) ? input.pageIds.filter((x): x is string => typeof x === "string") : null;
  if (!ids0) return { status: "error", message: "No pages were named.", httpStatus: 400 };
  if (ids0.length === 0) return { status: "ok", row: { deleted: 0 } };

  // A VIEWER can read these pages, and their DELETE matches zero rows and
  // returns no error — a silent no-op indistinguishable from success. Gate on
  // edit access rather than trusting the absence of an error.
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  // Re-resolve against the named aircraft: an id belonging to someone else's
  // aircraft must not ride along in the array.
  const { data: pages } = await supabase
    .from("page")
    .select("id, storage_path")
    .eq("aircraft_id", ctx.aircraftId)
    .in("id", ids0.slice(0, MAX_DELETE));
  const found: Pick<Page, "id" | "storage_path">[] = pages ?? [];
  if (found.length === 0) return { status: "error", message: "Those pages are no longer here.", httpStatus: 404 };

  const ids = found.map((p) => p.id);

  const { error: entriesError } = await supabase.from("log_entry").delete().in("page_id", ids);
  if (entriesError) return { status: "error", message: `Couldn't delete entries: ${entriesError.message}` };

  // .select() so the count is what the database actually removed, not what was
  // asked for.
  const { data: gone, error: pageError } = await supabase.from("page").delete().in("id", ids).select("id");
  if (pageError) return { status: "error", message: `Couldn't delete pages: ${pageError.message}` };

  // Best-effort image cleanup — an orphaned object is harmless if this fails,
  // and the records (the part that matters) are already gone.
  const paths = found.map((p) => p.storage_path).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const { removeBlobs } = await import("@/lib/storage");
    await removeBlobs(paths);
  }

  return { status: "ok", row: { deleted: gone?.length ?? 0 } };
}

// ---------------------------------------------------------------------------
// Capture into the reading queue (09 §2.9, §3.9.1, §3.9.3; 05 §7.2).
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHASH = /^[0-9a-f]{16}$/i;
/** Hamming distance at or under which two page dHashes are the same page (09 §3.9.3). */
export const DUPLICATE_DISTANCE = 6;
/** 09 §5.6: a page is at most 12 MB after the phone's JPEG encode. */
export const MAX_PAGE_BYTES = 12 * 1024 * 1024;
const BATCH_SOURCES = ["phone_camera", "web_upload", "web_camera", "pdf", "csv"] as const;

/** Bits that differ between two 64-bit dHashes written as 16 hex characters. */
export function hamming64(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** The closest earlier page within DUPLICATE_DISTANCE, or null. */
export function findDuplicate<T extends { image_phash: string | null }>(phash: string, pages: T[]): T | null {
  let best: { page: T; d: number } | null = null;
  for (const p of pages) {
    if (!p.image_phash || !PHASH.test(p.image_phash)) continue;
    const d = hamming64(phash, p.image_phash);
    if (d <= DUPLICATE_DISTANCE && (!best || d < best.d)) best = { page: p, d };
  }
  return best?.page ?? null;
}

export type QueueFields = {
  batch_id?: string | null;
  image_phash?: string | null;
  duplicate_of_page_id?: string | null;
  extraction_status?: "queued";
  queued_by?: string;
};

/**
 * The reading-queue columns for a new page. `queue` false (a legacy client that
 * calls extract itself) leaves the page `pending` as before. A page that looks
 * like one already scanned is stored but waits for the owner's decision.
 */
export async function queueFields(
  supabase: Db,
  ctx: WriteCtx,
  input: { queue: boolean; batchId?: unknown; phash?: unknown },
): Promise<{ fields: QueueFields } | { error: string; httpStatus: number }> {
  if (!input.queue) return { fields: {} };
  const batchId = typeof input.batchId === "string" && input.batchId ? input.batchId : null;
  if (batchId) {
    const { data: batch } = await supabase.from("scan_batch").select("id").eq("id", batchId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
    if (!batch) return { error: "That scan batch isn't on this aircraft.", httpStatus: 400 };
  }
  const phash = typeof input.phash === "string" && input.phash ? input.phash.toLowerCase() : null;
  if (phash && !PHASH.test(phash)) return { error: "The page fingerprint is malformed.", httpStatus: 400 };
  let duplicateOf: string | null = null;
  if (phash) {
    // shortcut: compares against every fingerprinted page of the aircraft in JS (a few thousand at most); move to SQL if fleets grow.
    const { data } = await supabase.from("page").select("id, image_phash").eq("aircraft_id", ctx.aircraftId).not("image_phash", "is", null);
    duplicateOf = findDuplicate(phash, (data ?? []) as { id: string; image_phash: string | null }[])?.id ?? null;
  }
  return {
    fields: { batch_id: batchId, image_phash: phash, duplicate_of_page_id: duplicateOf, extraction_status: "queued", queued_by: ctx.userId },
  };
}

/** What the upload response says about a likely duplicate (09 §3.9.3). */
export async function describeDuplicate(supabase: Db, pageId: string | null | undefined) {
  if (!pageId) return null;
  const { data } = await supabase.from("page").select("id, logbook_id, page_sequence, created_at").eq("id", pageId).maybeSingle();
  return data ? { pageId: data.id, logbookId: data.logbook_id, pageSequence: data.page_sequence, scannedAt: data.created_at } : null;
}

/**
 * The next page number in a logbook: one past the highest already there.
 *
 * page_sequence carries no unique constraint (manual reorder renumbers freely),
 * so two captures draining at the same instant could take the same number. That
 * is the same tie a manual reorder already tolerates and the list still renders,
 * where refusing the insert would lose a scan the owner has already taken.
 *
 * Falls back to null on a read error rather than guessing at 1 and colliding
 * with an existing page 1.
 */
export async function nextSequence(supabase: Db, logbookId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("page")
    .select("page_sequence")
    .eq("logbook_id", logbookId)
    .not("page_sequence", "is", null)
    .order("page_sequence", { ascending: false })
    .limit(1);
  if (error) return null;
  const highest = data?.[0]?.page_sequence;
  return typeof highest === "number" ? highest + 1 : 1;
}

/** Where a page image lives (09 §6). The upload URL and page.register both use it. */
export const pageStoragePath = (aircraftId: string, logbookId: string, pageId: string) => `${aircraftId}/${logbookId}/${pageId}.jpg`;

/**
 * `page.register` (05 §7.2): the phone uploaded the image straight to storage
 * with a signed URL; this creates the page row, queued for reading. `id` is the
 * page id and the idempotency key. Page order is assigned here, on arrival.
 */
export async function register(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; logbookId: string; storagePath: string; capturedAt?: string | null; isHandwritten?: boolean; batchId?: string; phash?: string },
): Promise<WriteResult> {
  if (!UUID.test(input.id ?? "") || !UUID.test(input.logbookId ?? "")) return { status: "error", message: "Invalid page or logbook id.", httpStatus: 400 };
  const path = pageStoragePath(ctx.aircraftId, input.logbookId, input.id);
  if (input.storagePath !== path) return { status: "error", message: "The page was uploaded to an unexpected place.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const [{ data: book }, { data: existing }] = await Promise.all([
    supabase.from("logbook").select("id").eq("id", input.logbookId).eq("aircraft_id", ctx.aircraftId).maybeSingle(),
    supabase.from("page").select("*").eq("id", input.id).maybeSingle(),
  ]);
  if (existing) {
    return existing.aircraft_id === ctx.aircraftId && existing.logbook_id === input.logbookId
      ? { status: "ok", row: existing }
      : { status: "error", message: "Page id belongs to another logbook.", httpStatus: 409 };
  }
  if (!book) return { status: "error", message: "Logbook not found on this aircraft.", httpStatus: 404 };

  const { blobSize, removeBlobs } = await import("@/lib/storage");
  const { thumbnailKey } = await import("@/lib/capture/thumbnail");
  const [size, thumbSize] = await Promise.all([blobSize(path), blobSize(thumbnailKey(path))]);
  if (size == null) return { status: "error", message: "The page image isn't on the server. Take or upload the page again.", httpStatus: 400 };
  if (size > MAX_PAGE_BYTES) {
    await removeBlobs([path, thumbnailKey(path)]);
    return { status: "error", message: "Too large to upload. Retake at a lower size or upload from a computer.", httpStatus: 413 };
  }

  const q = await queueFields(supabase, ctx, { queue: true, batchId: input.batchId, phash: input.phash });
  if ("error" in q) return { status: "error", message: q.error, httpStatus: q.httpStatus };

  const { data, error } = await supabase.from("page").insert({
    id: input.id,
    logbook_id: input.logbookId,
    aircraft_id: ctx.aircraftId,
    storage_path: path,
    thumbnail_path: thumbSize != null ? thumbnailKey(path) : null,
    page_sequence: await nextSequence(supabase, input.logbookId),
    captured_at: input.capturedAt ?? null,
    is_handwritten: input.isHandwritten !== false,
    ...q.fields,
  }).select("*").maybeSingle();
  if (error?.code === "23505") {
    const { data: again } = await supabase.from("page").select("*").eq("id", input.id).maybeSingle();
    return again ? { status: "ok", row: again } : { status: "error", message: error.message };
  }
  if (error) return { status: "error", message: error.message };
  return { status: "ok", row: data };
}

/** `batch.create` (09 §4.8, §5.3): one scanning session into one logbook. `id` is the idempotency key. */
export async function createBatch(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; logbookId: string; source: string; expectedPages: number; isHandwritten?: boolean },
): Promise<WriteResult> {
  if (!UUID.test(input.id ?? "") || !UUID.test(input.logbookId ?? "")) return { status: "error", message: "Invalid batch or logbook id.", httpStatus: 400 };
  if (!BATCH_SOURCES.includes(input.source as (typeof BATCH_SOURCES)[number])) return { status: "error", message: "Unknown scan source.", httpStatus: 400 };
  if (!Number.isInteger(input.expectedPages) || input.expectedPages < 1 || input.expectedPages > 2000)
    return { status: "error", message: "A batch holds 1 to 2,000 pages.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: existing } = await supabase.from("scan_batch").select("*").eq("id", input.id).maybeSingle();
  if (existing) return existing.aircraft_id === ctx.aircraftId ? { status: "ok", row: existing } : { status: "error", message: "Batch not found.", httpStatus: 404 };
  const { data: book } = await supabase.from("logbook").select("id").eq("id", input.logbookId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (!book) return { status: "error", message: "That logbook isn't on this aircraft.", httpStatus: 400 };
  const { data, error } = await supabase.from("scan_batch").insert({
    id: input.id, aircraft_id: ctx.aircraftId, logbook_id: input.logbookId,
    source: input.source as (typeof BATCH_SOURCES)[number], expected_pages: input.expectedPages,
    is_handwritten: input.isHandwritten !== false, created_by: ctx.userId,
  }).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  return { status: "ok", row: data };
}

/**
 * `page.duplicateDecision` (09 §3.9.3): "Keep both" lets the reader take the
 * page; "Skip this one" deletes it and the batch stops expecting it.
 */
export async function duplicateDecision(
  supabase: Db,
  ctx: WriteCtx,
  input: { pageId: string; decision: "keep_both" | "skip" },
): Promise<WriteResult> {
  if (input.decision !== "keep_both" && input.decision !== "skip") return { status: "error", message: "Choose keep_both or skip.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: page } = await supabase.from("page").select("id, batch_id, duplicate_of_page_id")
    .eq("id", input.pageId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  // Already skipped (a retry): the page is gone, which is what was asked.
  if (!page) return input.decision === "skip" ? { status: "ok", row: null } : { status: "error", message: "Page not found.", httpStatus: 404 };
  if (input.decision === "keep_both") {
    const { data, error } = await supabase.from("page").update({ duplicate_of_page_id: null })
      .eq("id", page.id).eq("aircraft_id", ctx.aircraftId).select("*").maybeSingle();
    if (error) return { status: "error", message: error.message };
    return { status: "ok", row: data };
  }
  const r = await deletePages(supabase, ctx, { pageIds: [page.id] });
  if (r.status !== "ok") return r;
  if (page.batch_id) {
    const { data: batch } = await supabase.from("scan_batch").select("expected_pages").eq("id", page.batch_id).maybeSingle();
    if (batch && batch.expected_pages > 1)
      await supabase.from("scan_batch").update({ expected_pages: batch.expected_pages - 1 }).eq("id", page.batch_id);
  }
  return { status: "ok", row: null };
}

const idList = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, MAX_DELETE) : []);

/**
 * "Read again" (W-BOOKS-05): put pages back in the server reading queue. The reader replaces their unconfirmed
 * entries and keeps confirmed ones (pipeline.ts). Pages being read right now are left alone.
 */
export async function requeue(supabase: Db, ctx: WriteCtx, input: { pageIds: unknown }): Promise<WriteResult> {
  const ids = idList(input.pageIds);
  if (!ids.length) return { status: "error", message: "No pages were named.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase.from("page")
    .update({ extraction_status: "queued", extraction_error: null, read_attempts: 0, read_after: null, queued_by: ctx.userId })
    .eq("aircraft_id", ctx.aircraftId).in("id", ids).neq("extraction_status", "processing").select("id");
  if (error) return { status: "error", message: error.message };
  return { status: "ok", row: { queued: data?.length ?? 0 } };
}

/**
 * "Move to another book" (W-BOOKS-05): misfiled pages and the entries read from them go to `logbookId`, after its
 * last page, keeping their order. The scan stays where it is stored (page.storage_path names it).
 */
export async function movePages(supabase: Db, ctx: WriteCtx, input: { pageIds: unknown; logbookId: string }): Promise<WriteResult> {
  const ids = idList(input.pageIds);
  if (!ids.length) return { status: "error", message: "No pages were named.", httpStatus: 400 };
  if (!UUID.test(input.logbookId ?? "")) return { status: "error", message: "Choose a logbook.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const [{ data: book }, { data: pages }] = await Promise.all([
    supabase.from("logbook").select("id").eq("id", input.logbookId).eq("aircraft_id", ctx.aircraftId).maybeSingle(),
    supabase.from("page").select("id, page_sequence").eq("aircraft_id", ctx.aircraftId).in("id", ids)
      .order("page_sequence", { ascending: true, nullsFirst: false }),
  ]);
  if (!book) return { status: "error", message: "That logbook isn't on this aircraft.", httpStatus: 400 };
  if (!pages?.length) return { status: "error", message: "Those pages are no longer here.", httpStatus: 404 };
  let seq = (await nextSequence(supabase, input.logbookId)) ?? 1;
  for (const p of pages) {
    const { error } = await supabase.from("page").update({ logbook_id: input.logbookId, page_sequence: seq++ })
      .eq("id", p.id).eq("aircraft_id", ctx.aircraftId);
    if (error) return { status: "error", message: `Couldn't move the pages: ${error.message}` };
  }
  const { error } = await supabase.from("log_entry").update({ logbook_id: input.logbookId })
    .eq("aircraft_id", ctx.aircraftId).in("page_id", pages.map((p) => p.id));
  if (error) return { status: "error", message: `Moved the pages but not their entries: ${error.message}` };
  return { status: "ok", row: { moved: pages.length } };
}
