// Pure page-list ordering: sorting and manual reorder, always WITHIN a logbook.
// Extracted from PagesPanel so it's unit-testable (test/page-sort.test.ts).

export type SortKey = "upload" | "date" | "tach";
export type SortDir = "asc" | "desc";

export type SortablePage = {
  id: string;
  logbookId: string;
  pageSequence: number | null;
  latestDate: string | null;
  tach: number | null;
};

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
  const key = (r: T) =>
    sort === "upload" ? r.pageSequence : sort === "date" ? r.latestDate : r.tach;
  return [...rows].sort((a, b) => {
    const lg = (logbookOrder.get(a.logbookId) ?? 0) - (logbookOrder.get(b.logbookId) ?? 0);
    return lg !== 0 ? lg : cmpKey(key(a), key(b), dir);
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
