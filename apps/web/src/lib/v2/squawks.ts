import type { SquawkSeverity } from "@/lib/database.types";

/** Stored low / medium / high, shown Low / Watch / Ground (12-copy-and-voice, W-MAINT-03). */
export const SEVERITY_WORD: Record<SquawkSeverity, string> = { low: "Low", medium: "Watch", high: "Ground" };
export const SEVERITY_HELP: Record<SquawkSeverity, string> = {
  low: "Fix at the next convenient visit.",
  medium: "Check it before each flight.",
  high: "You have chosen not to fly until it is looked at.",
};
const RANK: Record<SquawkSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Open list order: Ground, Watch, Low, then newest first. */
export function sortOpen<T extends { severity: SquawkSeverity; reported_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.reported_at.localeCompare(a.reported_at));
}

// Words too common in logbook entries to tie a squawk to one ("left brake soft" must not match every "left").
const STOP = new Set(
  ("the and for with from that this was were has have not but are its into onto when then than they them there " +
    "left right check checked checks found replaced replace inspected inspect aircraft engine airframe prop propeller " +
    "feels feel seems seem noticed during flight taxi after before some little very soft hard needs need "+
    "per iaw ref see note notes work performed installed install removed remove serviced service").split(" "),
);

export function keywords(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])].filter((w) => !STOP.has(w));
}

/**
 * Earlier confirmed entries about the same thing (08 C-SQ-04 "related entries"): an entry matches when it shares a
 * significant word with the squawk. Newest first, capped.
 * shortcut: plain keyword overlap, no component link (squawk has no component column yet); upgrade when it does.
 */
export function relatedEntries<E extends { description: string | null; work_performed: string | null; entry_date: string | null }>(
  squawk: string,
  entries: E[],
  limit = 6,
): E[] {
  const words = keywords(squawk);
  if (!words.length) return [];
  return entries
    .filter((e) => e.entry_date && words.some((w) => `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase().includes(w)))
    .sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""))
    .slice(0, limit);
}

/** "2.2 years" between two ISO dates; months under a year. */
export function intervalLabel(from: string, to: string): string {
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days < 365) {
    const m = Math.max(1, Math.round(days / 30.4));
    return `${m} ${m === 1 ? "month" : "months"}`;
  }
  return `${(days / 365.25).toFixed(1)} years`;
}
