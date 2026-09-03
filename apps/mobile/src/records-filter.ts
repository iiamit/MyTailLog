import type { Category, HistoryEntry } from "./history";

// Filtering the maintenance history: what work, which year, and free text.
// Dependency-free so it can be unit-tested off-device (apps/mobile has no
// runner — see apps/web/test/mobile-records-filter.test.ts).
//
// The list this filters is already de-duplicated and titled by history.ts, so a
// query has to search BOTH the written title/summary an owner can see and the
// original logbook text underneath it — someone looking for "Phillips 66" is
// reading the shelf, not our summary.

export type HistoryFilter = {
  /** "all" or one of the four history categories. */
  category: Category | "all";
  /** "all" or a four-digit year. */
  year: string;
  query: string;
};

export const NO_FILTER: HistoryFilter = { category: "all", year: "all", query: "" };

export function isFiltering(f: HistoryFilter): boolean {
  return f.category !== "all" || f.year !== "all" || f.query.trim() !== "";
}

/** Years present in the list, newest first. Undated entries contribute none. */
export function yearsOf(list: HistoryEntry[]): string[] {
  const years = new Set<string>();
  for (const h of list) {
    const d = h.entry.entry_date;
    if (d && d.length >= 4) years.add(d.slice(0, 4));
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

function haystack(h: HistoryEntry): string {
  const e = h.entry;
  return [h.title, h.summary, e.description, e.work_performed, e.parts, e.signature_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Every term must appear somewhere, so "oil 2026" narrows rather than widens. */
export function matchesQuery(h: HistoryEntry, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = haystack(h);
  return terms.every((t) => hay.includes(t));
}

export function filterHistory(list: HistoryEntry[], f: HistoryFilter): HistoryEntry[] {
  return list.filter(
    (h) =>
      (f.category === "all" || h.category === f.category) &&
      (f.year === "all" || (h.entry.entry_date ?? "").slice(0, 4) === f.year) &&
      matchesQuery(h, f.query),
  );
}
