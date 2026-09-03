import type { SortablePage } from "@/lib/pageSort";

// Selecting, counting and warning about scanned pages. Dependency-free so it
// can be unit-tested off-device — see apps/web/test/mobile-page-select.test.ts.
//
// Ordering itself is NOT re-implemented here: sortPages / movedOrder /
// displayedOrder in @/lib/pageSort are the same functions the web app reorders
// with, and the phone must not develop a second opinion about page order.

export type PageLike = {
  id: string;
  logbook_id: string;
  page_sequence: number | null;
};

export type EntryLike = {
  page_id: string | null;
  entry_date: string | null;
  tach: number | null;
};

/**
 * Map the mirror's page rows onto the shape @/lib/pageSort sorts, taking each
 * page's date and tach from the entries read off it.
 *
 * A page holds several entries; the LATEST date and the HIGHEST tach are the
 * ones that place the page in the book, because a page is filled top to bottom
 * and filed once it's full. `airframe` is left null — the mirror's log_entry
 * rows carry no airframe column, and pageSort's AFTT key already falls back to
 * the tach, which on an airframe page IS the total time.
 */
export function toSortable(pages: PageLike[], entries: EntryLike[]): SortablePage[] {
  const byPage = new Map<string, { date: string | null; tach: number | null }>();
  for (const e of entries) {
    if (!e.page_id) continue;
    const cur = byPage.get(e.page_id) ?? { date: null, tach: null };
    if (e.entry_date && (cur.date === null || e.entry_date > cur.date)) cur.date = e.entry_date;
    if (e.tach != null && (cur.tach === null || e.tach > cur.tach)) cur.tach = e.tach;
    byPage.set(e.page_id, cur);
  }
  return pages.map((p) => {
    const m = byPage.get(p.id);
    return {
      id: p.id,
      logbookId: p.logbook_id,
      pageSequence: p.page_sequence,
      latestDate: m?.date ?? null,
      tach: m?.tach ?? null,
      airframe: null,
    };
  });
}

/** Tap-to-select: in the set → out of it, and vice versa. Order is preserved. */
export function toggleSelection(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

/** How many extracted log entries were read off the pages about to be deleted. */
export function entriesOnPages(entries: EntryLike[], pageIds: string[]): number {
  const set = new Set(pageIds);
  return entries.filter((e) => e.page_id && set.has(e.page_id)).length;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What the owner is told before a bulk delete.
 *
 * The entry count is the whole point of the warning: deleting a page throws
 * away every log entry extracted from it, and #185's bulk delete shipped
 * without saying so. Silence there is how someone loses an annual sign-off.
 */
export function deleteWarning(pageCount: number, entryCount: number): string {
  const pages = plural(pageCount, "scan", "scans");
  if (entryCount === 0) {
    return `Delete ${pages}? Nothing has been read off ${pageCount === 1 ? "it" : "them"} yet. This can't be undone.`;
  }
  return `Delete ${pages}? ${plural(entryCount, "log entry", "log entries")} read from ${
    pageCount === 1 ? "it" : "them"
  } will go too. This can't be undone.`;
}
