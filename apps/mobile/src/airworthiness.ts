import { getByAircraft, getRows } from "./db";
import {
  toReadings,
  currentMetersFrom,
  type CurrentMeters,
  type EntryRowLite,
  type HoursRowLite,
} from "@/lib/aircraftHours";
import { buildStatusItems, hoursRemaining, type StatusItem } from "@/lib/status";
import { dueText, type Urgency } from "@/lib/compliance";
import { projectDueDate, projectionLabel } from "@/lib/utilization";
import type { Meter, MeterReset } from "@/lib/hobbsTach";

// ===========================================================================
// "Am I legal right now?" — computed ON DEVICE, offline, from the synced mirror.
//
// Every number here comes from the SAME pure functions the web app uses
// (@/… resolves into apps/web/src — see vite.config.ts). Nothing about
// airworthiness is re-derived locally: this file only reads rows out of SQLite
// and hands them over. If a countdown is wrong, it is wrong in one place.
// ===========================================================================

type AircraftRow = {
  id: string;
  enrollment_hobbs: number | null;
  enrollment_tach: number | null;
  enrollment_airframe: number | null;
  enrollment_date: string | null;
};

type MeterResetRow = {
  meter: string;
  reset_date: string | null;
  prior_value: number | null;
  new_value: number | null;
};

/** An AD or maintenance item, judged and ready to render. */
export type StatusLine = {
  item: StatusItem;
  urgency: Urgency;
  /** "Due in 21 days", "42.3 h remaining", "OVERDUE by 4 days" — already worded. */
  due: string;
  /** Approximate calendar date an hours-based item lands on, when we can say. */
  projection: string | null;
};

export type Airworthiness = {
  meters: CurrentMeters;
  lines: StatusLine[];
  /** Worst urgency present, for the aircraft-list badge. */
  worst: Urgency | null;
};

export async function computeAirworthiness(aircraftId: string): Promise<Airworthiness> {
  const [aircraftRows, entries, readings, resetRows, items, ads] = await Promise.all([
    getRows<AircraftRow>("aircraft"),
    getByAircraft<EntryRowLite>("log_entry", aircraftId),
    getByAircraft<HoursRowLite>("hours_reading", aircraftId),
    getByAircraft<MeterResetRow>("meter_reset", aircraftId),
    getByAircraft<Parameters<typeof buildStatusItems>[0][number]>("maintenance_item", aircraftId),
    getByAircraft<Parameters<typeof buildStatusItems>[1][number]>("ad_compliance", aircraftId),
  ]);

  const ac = aircraftRows.find((a) => a.id === aircraftId);
  const raw = toReadings(entries, readings, {
    hobbs: ac?.enrollment_hobbs ?? null,
    tach: ac?.enrollment_tach ?? null,
    airframe: ac?.enrollment_airframe ?? null,
    date: ac?.enrollment_date ?? null,
  });

  // A reset with no date can't be placed on the timeline, so it can't be applied
  // — dropping it is the only safe reading (see MeterReset.date: string).
  const resets: MeterReset[] = resetRows
    .filter((r): r is MeterResetRow & { reset_date: string } => !!r.reset_date)
    .map((r) => ({
      meter: r.meter as Meter,
      date: r.reset_date,
      prior: r.prior_value,
      next: r.new_value ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const meters = currentMetersFrom(raw, resets);

  // Recurring ADs only, and never the ones that don't apply — same filter the
  // server's reminder pass uses.
  const recurringAds = ads.filter(
    (a) => (a as { recurring?: boolean }).recurring && !["not_applicable", "superseded"].includes(String((a as { status?: string }).status)),
  );

  const lines: StatusLine[] = buildStatusItems(items, recurringAds, {
    tach: meters.tach.tach,
    hobbs: meters.hobbs.hobbs,
    airframe: meters.airframe.airframe,
    tachEstimated: meters.tach.estimated,
    hobbsEstimated: meters.hobbs.estimated,
    baselineFor: meters.baselineFor,
    toTotalHours: meters.toTotalHours,
  }).map((item) => {
    // buildStatusItems already judged urgency — reuse it rather than re-deriving,
    // so the phone can never disagree with the web about what's overdue.
    const projection = projectDueDate(
      hoursRemaining(item.nextDueForItem, item.currentForItem),
      meters.utilization,
    );
    return {
      item,
      urgency: item.urgency,
      due: dueText(item.nextDueDate, item.nextDueForItem, item.currentForItem) ?? "—",
      projection: projection ? projectionLabel(projection) : null,
    };
  });

  // Worst first: an overdue annual must not sit below a fine oil change.
  const rank: Record<Urgency, number> = { overdue: 0, due_soon: 1, upcoming: 2, none: 3 };
  lines.sort((a, b) => rank[a.urgency] - rank[b.urgency]);

  return { meters, lines, worst: lines[0]?.urgency ?? null };
}
