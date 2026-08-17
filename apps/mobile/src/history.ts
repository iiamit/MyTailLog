// Maintenance history — turning imported logbook text into something readable.
//
// The current screen renders imported text verbatim, so entries appear in ALL
// CAPS, run to twelve lines, and the same oil change shows up twice because two
// sources recorded it. These are the presentation-level fixes: a written title,
// a one-line summary, and de-duplication. The FULL original text is kept and
// shown verbatim in the detail view, because that is the legal record.

import type { LogEntry } from "./types";

export type Category = "oil" | "avionics" | "inspection" | "other";

export type HistoryEntry = {
  id: string;
  entry: LogEntry;
  /** Short written title, title-cased even when the source shouted. */
  title: string;
  /** One line, so the list can be scanned standing next to a mechanic. */
  summary: string;
  category: Category;
  /** How many source entries collapsed into this one. */
  merged: number;
};

/** Tokens that must keep their capitalisation regardless of position. */
const KEEP = /^(?:[A-Z]{2,}\d|N\d|\d|AD|SB|STC|IA|A&P|TBO|CHT|EGT|VOR|ELT|IFR|VFR|FAA|PMA|OEM|RPM|SMOH|TT|MT|C&W|W&B|LH|RH|\d+[A-Z])/;

/**
 * SENTENCE-case a shouted source string without mangling genuine abbreviations.
 * "CHANGE OIL AND FILTER" → "Change oil and filter", while "COMPLY WITH AD
 * 2021-05-12" keeps its "AD".
 *
 * Sentence case, not Title Case: the design's own titles read "Oil & filter
 * change" and "Annual inspection — airframe, engine & prop". Title Case would
 * make a maintenance list look like a set of headlines.
 */
export function titleCase(raw: string): string {
  const words = raw.trim().split(/\s+/);
  return words
    .map((w, i) => {
      if (KEEP.test(w)) return w;
      const lower = w.toLowerCase();
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

/** First sentence, trimmed to something that fits one line. */
export function firstSentence(raw: string, max = 96): string {
  const flat = raw.replace(/\s+/g, " ").trim();
  const stop = flat.search(/[.!?](?:\s|$)/);
  const first = stop > 0 ? flat.slice(0, stop + 1) : flat;
  return first.length <= max ? first : `${first.slice(0, max - 1).trimEnd()}…`;
}

export function categorize(textIn: string): Category {
  const t = textIn.toLowerCase();
  if (/\boil\b|filter|lubric/.test(t)) return "oil";
  if (/transponder|pitot|static|altimeter|avionic|vor|encoder|radio/.test(t)) return "avionics";
  if (/annual|inspection|100.?hour|airworth/.test(t)) return "inspection";
  return "other";
}

/**
 * Key for de-duplication: the same work, recorded twice by two sources. Matching
 * on date + tach + category is deliberately conservative — merging two DIFFERENT
 * jobs done the same day would hide one of them, which is worse than showing a
 * duplicate.
 */
function mergeKey(e: LogEntry, category: Category): string {
  return [e.entry_date ?? "", e.tach ?? "", category].join("|");
}

/** Build the display list: titled, summarised, de-duplicated, newest first. */
export function buildHistory(entries: LogEntry[]): HistoryEntry[] {
  const groups = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const source = e.description || e.work_performed || "";
    const key = mergeKey(e, categorize(source));
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const out: HistoryEntry[] = [];
  for (const list of groups.values()) {
    // Keep the richest source as the representative — the longest text usually
    // has the detail the shorter one dropped.
    const best = [...list].sort(
      (a, b) => (b.work_performed?.length ?? 0) + (b.description?.length ?? 0)
        - ((a.work_performed?.length ?? 0) + (a.description?.length ?? 0)),
    )[0];
    const source = best.description || best.work_performed || "(no description)";
    const detail = best.work_performed || best.description || "";
    out.push({
      id: best.id,
      entry: best,
      title: titleCase(firstSentence(source, 60).replace(/[.]$/, "")),
      summary: firstSentence(detail === source ? "" : detail) || firstSentence(source),
      category: categorize(source),
      merged: list.length,
    });
  }

  return out.sort((a, b) => (b.entry.entry_date ?? "").localeCompare(a.entry.entry_date ?? ""));
}

/** "AUGUST 2026" section labels, in order. */
export function byMonth(list: HistoryEntry[]): { label: string; items: HistoryEntry[] }[] {
  const out: { label: string; items: HistoryEntry[] }[] = [];
  for (const h of list) {
    const d = h.entry.entry_date;
    const label = d
      ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase()
      : "UNDATED";
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(h);
    else out.push({ label, items: [h] });
  }
  return out;
}
