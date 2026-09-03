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
