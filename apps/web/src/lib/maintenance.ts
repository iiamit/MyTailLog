import { addMonths } from "@/lib/compliance";

// Standard recurring maintenance items. Regulatory items are mandatory under
// Part 91; advisory items (TBO, prop overhaul, oil) are NOT regulatory — the UI
// must keep them visually distinct so they aren't mistaken for legal
// requirements. Intervals are defaults the owner can adjust.
export type StandardItem = {
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
  /**
   * The regulation counts CALENDAR months, so the item stays legal until the end
   * of the due month. An annual signed off on 15 Mar 2025 is good through
   * 31 Mar 2026, not 15 Mar. See calendarMonthsDue().
   */
  calendar_months?: boolean;
};

export const STANDARD_ITEMS: StandardItem[] = [
  // 91.409 / 91.413 / 91.411 / 91.207 all say "calendar months".
  { kind: "annual", label: "Annual inspection (91.409)", regulatory: true, interval_months: 12, interval_hours: null, calendar_months: true },
  { kind: "transponder", label: "Transponder test (91.413)", regulatory: true, interval_months: 24, interval_hours: null, calendar_months: true },
  { kind: "pitot_static", label: "Pitot-static / altimeter (91.411)", regulatory: true, interval_months: 24, interval_hours: null, calendar_months: true },
  { kind: "elt", label: "ELT inspection (91.207)", regulatory: true, interval_months: 12, interval_hours: null, calendar_months: true },
  // NOT calendar months: 91.171 is "within the preceding 30 days". Modelling it
  // as one month is an approximation that runs a day or two either side of the
  // real limit depending on month length — kept for now, but do not "fix" it by
  // adding calendar_months, which would make it markedly LATER and unsafe.
  { kind: "vor", label: "VOR check (91.171) — IFR", regulatory: true, interval_months: 1, interval_hours: null },
  { kind: "hundred_hour", label: "100-hour inspection (91.409)", regulatory: true, interval_months: null, interval_hours: 100 },
  { kind: "oil_change", label: "Oil change", regulatory: false, interval_months: null, interval_hours: 50 },
  { kind: "engine_tbo", label: "Engine TBO (advisory)", regulatory: false, interval_months: null, interval_hours: 2000 },
  // Advisory and manufacturer-specified: no regulation to read "calendar" into,
  // so the exact-month reading stays (and is the earlier, safer one).
  { kind: "prop_overhaul", label: "Propeller overhaul (advisory)", regulatory: false, interval_months: 72, interval_hours: null },
];

/** Items whose month interval is counted in CALENDAR months. */
export const CALENDAR_MONTH_KINDS = new Set(
  STANDARD_ITEMS.filter((i) => i.calendar_months).map((i) => i.kind),
);

// The common Part 91 set most owners want seeded (excludes IFR/for-hire/advisory).
export const DEFAULT_SEED_KINDS = ["annual", "transponder", "pitot_static", "elt"];

/**
 * Due date for an interval counted in CALENDAR months: the LAST DAY of the month
 * `months` after the one the work was done in.
 *
 * 14 CFR 91.409 and friends say "within the preceding N calendar months", which
 * means the day of the month the work happened is irrelevant — an annual signed
 * off on 15 Mar 2025 is good through 31 Mar 2026. Adding exact months made it
 * read 15 Mar, showing owners up to a month less planning room than they have.
 * (Reported by an owner; we were the ones getting it wrong.)
 *
 * Uses UTC throughout, like addMonths, so a local timezone can't roll the answer
 * into an adjacent month. Day 0 of month N+1 is the last day of month N, which
 * also gets February and leap years right without a table.
 */
export function calendarMonthsDue(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const endOfDueMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months + 1, 0),
  );
  return endOfDueMonth.toISOString().slice(0, 10);
}

/** Next-due from last-done + interval. Null components stay null (not yet done). */
export function maintenanceNextDue(item: {
  kind?: string;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
}): { next_due_date: string | null; next_due_hours: number | null } {
  const byCalendarMonth = item.kind != null && CALENDAR_MONTH_KINDS.has(item.kind);
  return {
    next_due_date:
      item.last_done_date && item.interval_months
        ? byCalendarMonth
          ? calendarMonthsDue(item.last_done_date, item.interval_months)
          : addMonths(item.last_done_date, item.interval_months)
        : null,
    next_due_hours:
      item.last_done_hours != null && item.interval_hours != null
        ? Math.round((item.last_done_hours + item.interval_hours) * 10) / 10
        : null,
  };
}

type MxItemLite = {
  kind: string;
  interval_hours: number | null;
  last_done_hours: number | null;
  next_due_date: string | null;
  next_due_hours: number | null;
};

/**
 * Effective next-due for an item, accounting for cross-item resets. A 100-hour
 * inspection is due 100 hours after the LATER of the last 100-hour or the last
 * annual — an annual inspection resets the 100-hour clock. So the 100-hour's
 * next-due-hours is computed from max(its own last-done, the annual's last-done)
 * + interval. Everything else uses its own stored next-due.
 */
export function effectiveNextDue(
  item: MxItemLite,
  allItems: MxItemLite[],
): { next_due_date: string | null; next_due_hours: number | null } {
  if (item.kind === "hundred_hour" && item.interval_hours != null) {
    const annual = allItems.find((i) => i.kind === "annual");
    const bases = [item.last_done_hours, annual?.last_done_hours].filter(
      (v): v is number => v != null,
    );
    if (bases.length > 0) {
      return {
        next_due_date: item.next_due_date,
        next_due_hours: Math.round((Math.max(...bases) + item.interval_hours) * 10) / 10,
      };
    }
  }
  return { next_due_date: item.next_due_date, next_due_hours: item.next_due_hours };
}
