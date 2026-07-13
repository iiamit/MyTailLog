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
  // Last-done and next-due expressed on the item's countdown METER — anchored to
  // the reading at the last-done date, so oil advances on hobbs even when its
  // last-done was recorded in tach. Use these (not lastDoneHours/nextDueHours,
  // which are the raw stored scalars) for the hours countdown + display.
  lastDoneForItem: number | null;
  nextDueForItem: number | null;
  // True when last-done sits above every current reading (a meter/origin
  // mismatch) → the hours countdown can't be trusted; show "check last-done".
  hoursUnreliable: boolean;
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
  // The meter's value at a maintenance item's last-done date — the same-meter
  // baseline its countdown anchors to. From getCurrentMeters (reading history).
  baselineFor?: (date: string | null, meter: "hobbs" | "tach") => number | null;
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

  const round1 = (x: number) => Math.round(x * 10) / 10;
  const out: StatusItem[] = [];
  for (const m of items) {
    const due = effectiveNextDue(m, items);
    // The countdown must compare last-done and current ON THE SAME meter.
    // Policy meter: regulatory → tach, usage (oil) → hobbs.
    let meter = meterForItem(m.regulatory);
    let cur = currentFor(meter);
    // Default: the stored scalars (correct when last-done was recorded on the
    // item's meter — always true for regulatory/tach items).
    let lastDoneForItem = m.last_done_hours;
    let nextDueForItem = due.next_due_hours;
    let hoursUnreliable = false;

    if (m.last_done_hours != null && m.interval_hours != null) {
      const stillOwed = cur.value != null && cur.value >= m.last_done_hours;
      if (!stillOwed) {
        // current < stored last-done on this meter — impossible (can't fly
        // negative hours). The last-done was recorded on the OTHER meter. Re-anchor
        // to THIS meter's reading at the last-done date (e.g. the co-recorded hobbs
        // for a tach-recorded oil change) so the countdown advances correctly.
        const baseline = currents.baselineFor?.(m.last_done_date, meter) ?? null;
        if (baseline != null && cur.value != null && cur.value >= baseline) {
          lastDoneForItem = baseline;
          nextDueForItem = round1(baseline + m.interval_hours);
        } else {
          // Fall back to the other meter with the stored scalar (Phase-52 guard).
          const otherMeter = meter === "tach" ? "hobbs" : "tach";
          const other = currentFor(otherMeter);
          if (other.value != null && other.value >= m.last_done_hours) {
            meter = otherMeter;
            cur = other;
          } else if (cur.value != null || other.value != null) {
            hoursUnreliable = true; // last-done sits above every current reading
          }
        }
      }
    }
    // Judge urgency on the meter-consistent next-due; date-only when unreliable.
    const urgencyDue = hoursUnreliable
      ? { next_due_date: due.next_due_date, next_due_hours: null }
      : { next_due_date: due.next_due_date, next_due_hours: nextDueForItem };
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
      urgency: urgencyOf(urgencyDue, cur.value),
      meter,
      currentForItem: cur.value,
      currentEstimated: cur.estimated,
      lastDoneForItem,
      nextDueForItem,
      hoursUnreliable,
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
      lastDoneForItem: null,
      nextDueForItem: a.next_due_hours,
      hoursUnreliable: false,
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
