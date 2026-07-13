// ===========================================================================
// Airworthiness status — the unified compliance list used by both the
// maintenance forecast and the at-a-glance Status grid. One source of truth so
// the two views never drift. Pure functions over already-loaded rows.
// ===========================================================================

import { effectiveNextDue } from "./maintenance";
import { urgencyOf, type Urgency } from "./compliance";
import type { MaintenanceItem } from "./database.types";

export type StatusItem = {
  id: string;
  source: "maintenance" | "ad";
  label: string;
  kind: string;
  regulatory: boolean;
  intervalMonths: number | null;
  intervalHours: number | null;
  lastDoneDate: string | null;
  lastDoneHours: number | null;
  nextDueDate: string | null;
  nextDueHours: number | null;
  notes: string | null;
  urgency: Urgency;
  // Which meter this item's hour-countdown uses, and the current value in it.
  // Regulatory items (100-hr, annual) run on tach; usage items (oil, advisory)
  // run on hobbs — the meter they're recorded and flown against.
  meter: "hobbs" | "tach";
  currentForItem: number | null;
  currentEstimated: boolean;
  // True for an AD corroborated by a scanned A&P compliance report.
  verifiedReport: boolean;
  verifiedReportAt: string | null;
};

/** Current value of each meter, with whether it's an estimate (hobbs↔tach bridged). */
export type MeterCurrents = {
  tach: number | null;
  hobbs: number | null;
  tachEstimated?: boolean;
  hobbsEstimated?: boolean;
};

/** The meter an item counts down on: regulatory → tach, usage → hobbs. */
export function meterForItem(regulatory: boolean): "hobbs" | "tach" {
  return regulatory ? "tach" : "hobbs";
}

export type AdLite = {
  id: string;
  reference: string;
  kind: string;
  next_due_date: string | null;
  next_due_hours: number | null;
  status: string;
  verified_report_page_id: string | null;
  verified_at: string | null;
};

/** Build the unified list from maintenance items + recurring ADs. The 100-hour
 *  resets off the last annual too, so its effective next-due considers it. */
export function buildStatusItems(
  items: MaintenanceItem[],
  ads: AdLite[],
  currents: MeterCurrents,
): StatusItem[] {
  // The current hours to judge an item against, in the item's own meter.
  const currentFor = (meter: "hobbs" | "tach") =>
    meter === "tach"
      ? { value: currents.tach, estimated: Boolean(currents.tachEstimated) }
      : { value: currents.hobbs, estimated: Boolean(currents.hobbsEstimated) };

  const out: StatusItem[] = [];
  for (const m of items) {
    const due = effectiveNextDue(m, items);
    const meter = meterForItem(m.regulatory);
    const cur = currentFor(meter);
    out.push({
      id: m.id,
      source: "maintenance",
      label: m.label,
      kind: m.kind,
      regulatory: m.regulatory,
      intervalMonths: m.interval_months,
      intervalHours: m.interval_hours,
      lastDoneDate: m.last_done_date,
      lastDoneHours: m.last_done_hours,
      nextDueDate: due.next_due_date,
      nextDueHours: due.next_due_hours,
      notes: m.notes,
      urgency: urgencyOf(due, cur.value),
      meter,
      currentForItem: cur.value,
      currentEstimated: cur.estimated,
      verifiedReport: false,
      verifiedReportAt: null,
    });
  }
  for (const a of ads) {
    // ADs are airworthiness/regulatory → tach.
    const cur = currentFor("tach");
    out.push({
      id: a.id,
      source: "ad",
      label: `${a.kind.toUpperCase()} ${a.reference}`,
      kind: "ad",
      regulatory: true,
      intervalMonths: null,
      intervalHours: null,
      lastDoneDate: null,
      lastDoneHours: null,
      nextDueDate: a.next_due_date,
      nextDueHours: a.next_due_hours,
      notes: null,
      urgency: urgencyOf(
        { next_due_date: a.next_due_date, next_due_hours: a.next_due_hours },
        cur.value,
      ),
      meter: "tach",
      currentForItem: cur.value,
      currentEstimated: cur.estimated,
      verifiedReport: Boolean(a.verified_report_page_id),
      verifiedReportAt: a.verified_at,
    });
  }
  return out;
}

export const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 0,
  due_soon: 1,
  upcoming: 2,
  none: 3,
};

/** Sort by urgency (overdue first), then soonest next-due date. */
export function sortStatusItems<T extends { urgency: Urgency; nextDueDate: string | null }>(
  list: T[],
): T[] {
  return [...list].sort(
    (a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"),
  );
}

/** Whole days from today until a date (negative = overdue). */
export function daysUntil(dateStr: string | null, today = new Date()): number | null {
  if (!dateStr) return null;
  const d = Date.parse(dateStr + "T00:00:00Z");
  const t = Date.parse(today.toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((d - t) / 86_400_000);
}

/** Hours remaining until an hour-based due (negative = overdue). */
export function hoursRemaining(
  nextDueHours: number | null,
  currentHours: number | null,
): number | null {
  if (nextDueHours == null || currentHours == null) return null;
  return Math.round((nextDueHours - currentHours) * 10) / 10;
}
