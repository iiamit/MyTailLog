// Records coverage per logbook: how far back the digitized entries go and
// where they skip. Feeds the overview's coverage bars and the guided start.
// Same 24-month gap threshold as auditContinuity (lib/audit.ts), but grouped by
// logbook, because "airframe 1978–2026, engine only from 2008" is the useful read.

import type { LogbookType } from "@/lib/database.types";

export const COVERAGE_GAP_MONTHS = 24;

export type CoverageGap = { from: string; to: string };
export type LogbookCoverage = {
  logbookId: string;
  type: LogbookType;
  count: number;
  undated: number;
  first: string | null;
  last: string | null;
  gaps: CoverageGap[];
};

const months = (a: string, b: string) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

/** Logbooks that carry dated maintenance history (W&B / AD reports live in "other"). */
const TRACKED: LogbookType[] = ["airframe", "engine", "prop", "avionics"];

export function coverageByLogbook(
  logbooks: { id: string; type: LogbookType }[],
  entries: { logbook_id: string | null; entry_date: string | null }[],
): LogbookCoverage[] {
  return logbooks
    .filter((l) => TRACKED.includes(l.type))
    .sort((a, b) => TRACKED.indexOf(a.type) - TRACKED.indexOf(b.type))
    .map((l) => {
      const mine = entries.filter((e) => e.logbook_id === l.id);
      const dates = mine
        .map((e) => e.entry_date)
        .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d))
        .sort();
      const gaps: CoverageGap[] = [];
      for (let i = 1; i < dates.length; i++) {
        if (months(dates[i - 1], dates[i]) >= COVERAGE_GAP_MONTHS) gaps.push({ from: dates[i - 1], to: dates[i] });
      }
      return {
        logbookId: l.id,
        type: l.type,
        count: mine.length,
        undated: mine.length - dates.length,
        first: dates[0] ?? null,
        last: dates.at(-1) ?? null,
        gaps,
      };
    });
}

/** Position of a date on a [start, end] year axis, as a 0–100 percentage. */
export function axisPercent(date: string, startYear: number, endYear: number): number {
  const [y, m] = date.split("-").map(Number);
  const span = Math.max(1, endYear + 1 - startYear);
  const pos = (y - startYear + (m - 1) / 12) / span;
  return Math.min(100, Math.max(0, pos * 100));
}
