// Pure page-list ordering: sorting and manual reorder, always WITHIN a logbook.
// Extracted from PagesPanel so it's unit-testable (test/page-sort.test.ts).

export type SortKey = "upload" | "date" | "tach" | "airframe";
export type SortDir = "asc" | "desc";

export type SortablePage = {
  id: string;
  logbookId: string;
  pageSequence: number | null;
  latestDate: string | null;
  tach: number | null;
  /** Airframe total time (AFTT) at this page — how an airframe book is ordered. */
  airframe: number | null;
};

/**
 * The value a given sort key reads off a page.
 *
 * AFTT falls back to tach, because most airframe logbooks never write an
 * airframe total separately — the tach reading in the entry IS the time the
 * book is kept in. Without the fallback, sorting an ordinary airframe book by
 * AFTT would send nearly every page to the bottom as a null and order nothing.
 *
 * The tach is not an engine counter and does not restart when an engine is
 * changed — engine time is kept in the logs as time since overhaul or since new
 * — so on an airframe page the tach reading is that page's total time.
 *
 * `currentAirframe` in hobbsTach.ts still does NOT make this substitution, for
 * its own stated reason: airframe time has no fixed relationship to the meters
 * on aircraft where they diverge (it cites a glider accruing airframe hours with
 * the engine off), and it feeds maintenance countdowns where a wrong number is
 * an airworthiness problem rather than a display one.
 */
export function sortValue(r: SortablePage, sort: SortKey): string | number | null {
  return sort === "upload"
    ? r.pageSequence
    : sort === "date"
      ? r.latestDate
      : sort === "airframe"
        ? r.airframe ?? r.tach
        : r.tach;
}

/**
 * Ascending/descending compare with NULLS ALWAYS LAST — direction applies only
 * to present values, so an un-extracted page (no date/tach) never jumps to the
 * top when descending.
 */
export function cmpKey(
  a: string | number | null,
  b: string | number | null,
  dir: SortDir,
): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  const base = typeof a === "string" ? a.localeCompare(b as string) : a - (b as number);
  return dir === "asc" ? base : -base;
}

/**
 * Sort pages WITHIN each logbook. Logbooks stay grouped in `logbookOrder`; only
 * the pages inside a logbook reorder by the chosen key + direction. Never sorts
 * across logbooks.
 */
export function sortPages<T extends SortablePage>(
  rows: T[],
  sort: SortKey,
  dir: SortDir,
  logbookOrder: Map<string, number>,
): T[] {
  return [...rows].sort((a, b) => {
    const lg = (logbookOrder.get(a.logbookId) ?? 0) - (logbookOrder.get(b.logbookId) ?? 0);
    return lg !== 0 ? lg : cmpKey(sortValue(a, sort), sortValue(b, sort), dir);
  });
}

/**
 * The page ids of one logbook after moving `pageId` one step (dir −1 up / +1
 * down), computed against that logbook's current sequence order. Returns null if
 * the page isn't found or the move is out of bounds. Never crosses logbooks.
 */
export function movedOrder<T extends SortablePage>(
  rows: T[],
  pageId: string,
  dir: 1 | -1,
): string[] | null {
  const row = rows.find((r) => r.id === pageId);
  if (!row) return null;
  const lb = rows
    .filter((r) => r.logbookId === row.logbookId)
    .sort((a, b) => cmpKey(a.pageSequence, b.pageSequence, "asc"));
  const i = lb.findIndex((r) => r.id === pageId);
  const j = i + dir;
  if (j < 0 || j >= lb.length) return null;
  const ids = lb.map((r) => r.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/**
 * The page ids of ONE logbook in the order currently displayed — i.e. what
 * "apply this sort as the stored order" should persist.
 *
 * The move-one-step reorder above is fine for nudging a stray page, but it is
 * the wrong tool for the case that actually happens: someone uploads the SECOND
 * prop book before the first, and now fifty pages need to move fifty places.
 * Sorting by entry date already shows them correctly — this just makes that
 * arrangement the stored one.
 *
 * Returns null when the ordering would be a guess rather than a fact: sorting by
 * a key some pages don't have (an un-extracted page has no date or tach) would
 * dump those at the end and silently renumber them, which is not something to do
 * to a logbook on the user's behalf.
 */
export function displayedOrder<T extends SortablePage>(
  rows: T[],
  logbookId: string,
  sort: SortKey,
  dir: SortDir,
): string[] | null {
  const lb = rows.filter((r) => r.logbookId === logbookId);
  if (lb.length < 2) return null;
  if (sort !== "upload") {
    const missing = lb.some((r) => sortValue(r, sort) == null);
    if (missing) return null;
  }
  return sortPages(lb, sort, dir, new Map([[logbookId, 0]])).map((r) => r.id);
}
