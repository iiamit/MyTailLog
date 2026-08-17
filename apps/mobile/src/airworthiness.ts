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
import { semanticOf, type Semantic } from "./tokens";

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

// --- The verdict ------------------------------------------------------------
// "Can I fly today?" answered before any list. Everything here is DERIVED from
// the lines above — nothing new is stored.

export type Verdict = {
  semantic: Semantic;
  /** "Grounded — annual overdue" / "One item due soon" / "Airworthy". */
  headline: string;
  /** "VOR check by 12 Sep. Everything else is clear." */
  detail: string;
  /** The countdown number and its unit, adapting to the interval. */
  value: string;
  unit: string;
  /** 0–1, how much of the interval has elapsed — the ring's arc sweep. */
  progress: number;
  /** The item the countdown refers to, when there is one. */
  item: StatusItem | null;
};

const DAY = 86_400_000;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / DAY);
}

/** Short human date — "12 Sep", or "12 Sep 2027" when it isn't this year. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

/**
 * How far through its interval an item is, 0–1. The ring fills as the deadline
 * approaches, so a glance reads "nearly due" without reading the number.
 */
function elapsedFraction(item: StatusItem): number {
  const days = daysUntil(item.nextDueDate);
  if (days != null && item.intervalMonths) {
    const total = item.intervalMonths * 30.44;
    return Math.max(0, Math.min(1, (total - days) / total));
  }
  if (item.nextDueForItem != null && item.currentForItem != null && item.intervalHours) {
    const remaining = item.nextDueForItem - item.currentForItem;
    return Math.max(0, Math.min(1, (item.intervalHours - remaining) / item.intervalHours));
  }
  return 0;
}

export function buildVerdict(lines: StatusLine[]): Verdict {
  const worst = lines[0] ?? null; // already sorted worst-first
  if (!worst) {
    return {
      semantic: "airworthy", headline: "Airworthy",
      detail: "Nothing tracked yet — add maintenance items on the web app.",
      value: "—", unit: "", progress: 0, item: null,
    };
  }

  const sem = semanticOf(worst.urgency);
  const item = worst.item;
  const days = daysUntil(item.nextDueDate);
  const hours =
    item.nextDueForItem != null && item.currentForItem != null
      ? Math.round(item.nextDueForItem - item.currentForItem)
      : null;

  // Unit adapts: days under 90, months beyond, hours for hour-driven items.
  let value = "—";
  let unit = "";
  if (days != null) {
    if (days < 0) {
      value = String(Math.abs(days));
      unit = Math.abs(days) === 1 ? "day overdue" : "days overdue";
    } else if (days < 90) {
      value = String(days);
      unit = days === 1 ? "day to next" : "days to next";
    } else {
      value = String(Math.round(days / 30.44));
      unit = "months to next";
    }
  } else if (hours != null) {
    value = String(Math.abs(hours));
    unit = hours < 0 ? "hours over" : "hours to next";
  }

  const others = lines.length - 1;
  const headline =
    sem === "grounded"
      ? `Grounded — ${item.label.toLowerCase().replace(/\s*\(.*\)\s*/, "")} overdue`
      : sem === "due"
        ? lines.filter((l) => semanticOf(l.urgency) !== "airworthy").length === 1
          ? "One item due soon"
          : `${lines.filter((l) => semanticOf(l.urgency) !== "airworthy").length} items due soon`
        : "Airworthy";

  const when = item.nextDueDate ? ` by ${shortDate(item.nextDueDate)}` : "";
  const detail =
    sem === "airworthy"
      ? item.label
        ? `Next up: ${item.label.replace(/\s*\(.*\)\s*/, "")}${when}.`
        : "Everything is clear."
      : `${item.label.replace(/\s*\(.*\)\s*/, "")}${when}.${others > 0 ? " Everything else is clear." : ""}`;

  return { semantic: sem, headline, detail, value, unit, progress: elapsedFraction(item), item };
}
