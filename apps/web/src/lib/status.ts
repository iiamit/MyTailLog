// ===========================================================================
// Airworthiness status — the unified compliance list used by both the
// maintenance forecast and the at-a-glance Status grid. One source of truth so
// the two views never drift. Pure functions over already-loaded rows.
// ===========================================================================

import { effectiveNextDue } from "./maintenance";
import { urgencyOf, type Urgency } from "./compliance";
import type { Meter } from "./hobbsTach";
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
  meter: Meter;
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
  airframe?: number | null;
  tachEstimated?: boolean;
  hobbsEstimated?: boolean;
  // The meter's value at a maintenance item's last-done date — the same-meter
  // baseline its countdown anchors to. From getCurrentMeters (reading history).
  baselineFor?: (date: string | null, meter: Meter) => number | null;
  // Stored meter scalars (last_done_hours, next_due_hours) were typed against
  // whatever the meter physically read that day. When a meter has been replaced,
  // readings are on a continuous total-time scale and those scalars are not —
  // this lifts them onto it so the comparison stays apples-to-apples.
  toTotalHours?: (value: number | null, date: string | null, meter: Meter) => number | null;
};

// Items tracked on the HOBBS meter (operating/clock time). Everything else
// hour-based counts on TACH — the engine/airframe meter maintenance uses,
// including Engine TBO, 100-hour, and prop overhaul. Oil is the notable
// owner-tracked-on-hobbs exception. Keyed by kind, NOT the regulatory flag
// (advisory ≠ hobbs — Engine TBO is advisory but tach-based).
//
// This is only the DEFAULT. Plenty of owners run oil on tach, and some aircraft
// have no hobbs meter at all, so maintenance_item.meter overrides it per item.
const HOBBS_METER_KINDS = new Set<string>(["oil_change"]);

/**
 * The meter an item's hour-countdown uses. An explicit per-item `meter` wins;
 * otherwise oil → hobbs and everything else → tach.
 */
export function meterForItem(kind: string, override?: Meter | null): Meter {
  if (override) return override;
  return HOBBS_METER_KINDS.has(kind) ? "hobbs" : "tach";
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
  const currentFor = (meter: Meter) =>
    meter === "tach"
      ? { value: currents.tach, estimated: Boolean(currents.tachEstimated) }
      : meter === "airframe"
        ? { value: currents.airframe ?? null, estimated: false }
        : { value: currents.hobbs, estimated: Boolean(currents.hobbsEstimated) };

  const round1 = (x: number) => Math.round(x * 10) / 10;
  const out: StatusItem[] = [];
  for (const m of items) {
    const due = effectiveNextDue(m, items);
    // The countdown must compare last-done and current ON THE SAME meter.
    // Explicit per-item meter wins; else oil → hobbs, everything else → tach.
    let meter = meterForItem(m.kind, m.meter);
    // No hobbs meter on this aircraft (its "current hobbs" was bridged from tach
    // by a default ratio) → count on tach, the meter actually read, instead of a
    // number we invented. Only when the owner hasn't chosen a meter themselves.
    if (!m.meter && meter === "hobbs" && currents.hobbsEstimated && currents.tach != null)
      meter = "tach";
    let cur = currentFor(meter);
    // Stored scalars lifted onto the readings' scale (a no-op unless the meter
    // has been replaced) — the countdown compares them against readings.
    const onScale = (v: number | null, mtr: Meter) =>
      currents.toTotalHours?.(v, m.last_done_date, mtr) ?? v;
    let lastDone = onScale(m.last_done_hours, meter);
    // Default: the stored scalars (correct when last-done was recorded on the
    // item's meter — always true for regulatory/tach items).
    let lastDoneForItem = lastDone;
    let nextDueForItem = onScale(due.next_due_hours, meter);
    let hoursUnreliable = false;

    if (lastDone != null && m.interval_hours != null) {
      // Airframe stands alone — there is no ratio to re-anchor it against, so it
      // never re-homes to another meter (see currentAirframe in hobbsTach).
      const otherMeter: Meter | null =
        meter === "airframe" ? null : meter === "tach" ? "hobbs" : "tach";
      const baseline = currents.baselineFor?.(m.last_done_date, meter) ?? null;
      const otherBaseline = otherMeter
        ? currents.baselineFor?.(m.last_done_date, otherMeter) ?? null
        : null;
      // `last_done_hours` is a meter-LESS scalar. It was recorded on the OTHER
      // meter only when it sits CLOSER to that meter's reading at the last-done
      // date than to this meter's (e.g. a tach value keyed into a hobbs oil
      // change) — then re-anchor to this meter's reading so the countdown stays
      // same-meter. A mere date-gap (hours flown between the maintenance event
      // and the nearest reading) is NOT a mismatch: the stored value stays
      // closest to its own meter, so we leave it and keep any annual-reset due.
      const recordedOnOther =
        baseline != null &&
        otherBaseline != null &&
        Math.abs(lastDone - otherBaseline) < Math.abs(lastDone - baseline);
      if (recordedOnOther && cur.value != null && cur.value >= baseline) {
        lastDoneForItem = baseline;
        nextDueForItem = round1(baseline + m.interval_hours);
      } else if (cur.value == null || cur.value < lastDone) {
        // Current sits below the stored last-done on this meter (can't fly negative
        // hours) → try the other meter with the stored scalar (Phase-52 guard);
        // else last-done sits above every reading → flag unreliable.
        const other = otherMeter ? currentFor(otherMeter) : { value: null, estimated: false };
        const lastDoneOther = otherMeter ? onScale(m.last_done_hours, otherMeter) : null;
        if (otherMeter && other.value != null && lastDoneOther != null && other.value >= lastDoneOther) {
          meter = otherMeter;
          cur = other;
          lastDone = lastDoneOther;
          lastDoneForItem = lastDoneOther;
          nextDueForItem = onScale(due.next_due_hours, otherMeter);
        } else if (cur.value != null || other.value != null) {
          hoursUnreliable = true;
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
    // Same scale lift as maintenance items — an AD due-at recorded before a tach
    // replacement is on the retired meter's numbering.
    const adNextDue =
      currents.toTotalHours?.(a.next_due_hours, a.next_due_date, "tach") ?? a.next_due_hours;
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
        { next_due_date: a.next_due_date, next_due_hours: adNextDue },
        cur.value,
      ),
      meter: "tach",
      currentForItem: cur.value,
      currentEstimated: cur.estimated,
      lastDoneForItem: null,
      nextDueForItem: adNextDue,
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
