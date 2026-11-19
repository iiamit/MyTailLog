import { addDays, daysBetween, type DueItem, type VisitView } from "@/lib/due/engine";

/** When the annual's date is unknown, Annual prep looks this far ahead (W-MAINT-04 States). */
export const ANNUAL_FALLBACK_DAYS = 90;

export type AnnualPlan = {
  annual: DueItem | null;
  /** The annual's due date when known. */
  due: string | null;
  /** Today to the annual (or today + 90 days when unknown). */
  horizon: string;
  daysLeft: number | null;
  rideVisit: VisitView | null;
  ridesAlong: DueItem[];
  before: DueItem[];
};

/**
 * W-MAINT-04's grouping: what rides along with the annual (the visit holding it, else items due the same month)
 * and what else falls due on the way. Recurring ADs have their own section, so they are left out of `before`.
 */
export function annualPlan(items: DueItem[], visits: VisitView[], today: string, recurringAdKeys: Set<string>): AnnualPlan {
  const annual = items.find((i) => i.kind === "annual" && i.source === "maintenance") ?? null;
  const due = annual && annual.status !== "no_record" ? annual.firstDate : null;
  // A lapsed annual still needs a look ahead: the next 90 days, as when its date is unknown.
  const horizon = due && due > today ? due : addDays(today, ANNUAL_FALLBACK_DAYS);
  const rideVisit = annual ? visits.find((v) => v.items.some((i) => i.key === annual.key)) ?? null : null;
  const byKey = new Map(items.map((i) => [i.key, i]));
  const ridesAlong = rideVisit
    ? rideVisit.items.map((i) => byKey.get(i.key)).filter((i): i is DueItem => !!i)
    : due
      ? items.filter((i) => i === annual || (i.firstDate?.slice(0, 7) === due.slice(0, 7) && !recurringAdKeys.has(i.key)))
      : [];
  const riding = new Set(ridesAlong.map((i) => i.key));
  const before = items.filter(
    (i) => i !== annual && !riding.has(i.key) && !recurringAdKeys.has(i.key) &&
      (i.status === "overdue" || (i.firstDate != null && i.firstDate <= horizon)),
  );
  return { annual, due, horizon, daysLeft: due ? daysBetween(today, due) : null, rideVisit, ridesAlong, before };
}
