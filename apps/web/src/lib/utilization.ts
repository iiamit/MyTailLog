// ===========================================================================
// Utilization rate → projected calendar date (pure — no I/O; tested in
// test/utilization.test.ts).
//
// "Due in 38.4 hours" is true but unplannable. This turns it into "due ≈ 14 Mar"
// using the aircraft's OWN logged meter readings over a trailing year.
//
// It is a PLANNING ESTIMATE, never a determination. The hours figure remains the
// thing that comes due; the date is our arithmetic on how fast this airplane has
// been flown lately. Every render site shows `≈`, the confidence, and the window
// the rate came from — and at `none` confidence nothing is shown at all.
//
// A CALENDAR limit (an annual) is never touched by any of this: a date-based
// limit already has a date, and a projection must not replace or soften it. Only
// the HOURS axis of an item ever gets a projection.
// ===========================================================================

import type { Meter, MeterReset, Reading } from "./hobbsTach";

/** The meters an hours-based limit can be written against. Airframe is excluded:
 *  it is recorded-only and has no fixed relation to engine time (see hobbsTach). */
export type UtilizationMeter = Extract<Meter, "tach" | "hobbs">;

export type Confidence = "high" | "medium" | "low" | "none";

export type Utilization = {
  /** Average hours flown per calendar day over the measured window. 0 when none. */
  hoursPerDay: number;
  /** Readings that actually contributed to the rate (post reset-exclusion). */
  sampleCount: number;
  /** Calendar days actually MEASURED. Shorter than windowEnd − windowStart when
   *  an interval was dropped for spanning a meter replacement. */
  spanDays: number;
  confidence: Confidence;
  /** First and last contributing reading dates (ISO) — "the window the rate came
   *  from", shown to the owner so the number is auditable. */
  windowStart: string;
  windowEnd: string;
  meter: UtilizationMeter;
};

/** Trailing window. A year smooths seasonal flying without letting a five-year-old
 *  ownership pattern speak for how the airplane is flown now. */
export const WINDOW_DAYS = 365;

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parse = (d: string) => Date.parse(d + "T00:00:00Z");

/**
 * Confidence ladder. Both axes must clear the rung: a hundred readings over ten
 * days still can't tell you the annual rate, and two readings a year apart can't
 * tell you whether the flying was steady.
 *
 * Below `low` everything is `none` — which subsumes the "<2 readings or <14-day
 * span" floor, since nothing under 30 days can reach a rung at all.
 */
export function confidenceFor(sampleCount: number, spanDays: number): Confidence {
  if (sampleCount >= 6 && spanDays >= 180) return "high";
  if (sampleCount >= 4 && spanDays >= 90) return "medium";
  if (sampleCount >= 2 && spanDays >= 30) return "low";
  return "none";
}

const NO_RATE = (meter: UtilizationMeter, windowStart: string, windowEnd: string): Utilization => ({
  hoursPerDay: 0,
  sampleCount: 0,
  spanDays: 0,
  confidence: "none",
  windowStart,
  windowEnd,
  meter,
});

/**
 * True when a declared meter replacement falls inside the half-open interval
 * (from, to]. `reset_date` is the FIRST date on the new meter (0046), so a reset
 * dated exactly `to` means the `to` reading is already on the new scale.
 *
 * This is the single most dangerous input to a projection: a tach replaced at
 * 2,340 h and restarted at 0 makes the naive delta −2,340 h (or, the other way
 * round, a wildly inflated one). We drop the interval outright rather than try
 * to stitch it — the surrounding intervals still carry the rate.
 */
function spansReset(resets: MeterReset[], meter: Meter, from: string, to: string): boolean {
  return resets.some((r) => r.meter === meter && r.date > from && r.date <= to);
}

/** Rate on ONE meter. Exported for tests; callers want computeUtilization. */
export function utilizationFor(
  readings: Reading[],
  resets: MeterReset[],
  meter: UtilizationMeter,
  today: Date = new Date(),
): Utilization {
  const endMs = Date.parse(today.toISOString().slice(0, 10) + "T00:00:00Z");
  const windowEnd = iso(endMs);
  const windowStart = iso(endMs - WINDOW_DAYS * DAY_MS);

  // Dated, MEASURED readings on this meter, inside the trailing window, oldest
  // first. Inferred readings (ADS-B estimates) are excluded: a rate derived from
  // numbers we projected ourselves would be circular.
  const dated = readings
    .filter((r) => r.date != null && r[meter] != null && !r.estimated)
    .map((r) => ({ date: r.date as string, value: r[meter] as number }))
    .filter((p) => p.date >= windowStart && p.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.value - b.value);

  // Collapse same-date readings to the highest — a day's ending reading is the
  // one that carries the day's flying, and keeping both yields a 0-day interval.
  const pts: { date: string; value: number }[] = [];
  for (const p of dated) {
    if (pts.length && pts[pts.length - 1].date === p.date) pts[pts.length - 1] = p;
    else pts.push(p);
  }
  if (pts.length < 2) return NO_RATE(meter, windowStart, windowEnd);

  let hours = 0;
  let days = 0;
  const contributing = new Set<string>();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (spansReset(resets, meter, a.date, b.date)) continue;
    const delta = b.value - a.value;
    // A meter can't run backwards. Without a declared reset to explain it this is
    // a bad reading, not negative flying — skip the interval, keep the rest.
    if (delta < 0) continue;
    hours += delta;
    days += (parse(b.date) - parse(a.date)) / DAY_MS;
    contributing.add(a.date);
    contributing.add(b.date);
  }
  if (days <= 0 || contributing.size < 2) return NO_RATE(meter, windowStart, windowEnd);

  const dates = [...contributing].sort();
  const sampleCount = contributing.size;
  return {
    hoursPerDay: hours / days,
    sampleCount,
    spanDays: days,
    confidence: confidenceFor(sampleCount, days),
    windowStart: dates[0],
    windowEnd: dates[dates.length - 1],
    meter,
  };
}

/**
 * The aircraft's utilization rate, preferring TACH.
 *
 * Hour-based limits — the 100-hour, TBO, hour-interval ADs — are written against
 * engine time, so the rate that predicts them is the tach rate. Hobbs is only a
 * fallback for an aircraft that doesn't record tach, and the meter used is
 * labelled everywhere the projection appears.
 *
 * ponytail: the fallback rate is in HOBBS hours/day, applied to hours remaining
 * that may be on the tach scale — roughly a 10% error, in the direction of
 * projecting too soon (hobbs runs faster). That is the safe direction and it is
 * disclosed by the meter label. Bridge it through deriveRatio if that ever
 * proves too coarse.
 *
 * `readings` are RAW (unstitched) — the reset exclusion above is deliberately
 * done here rather than reading a stitched scale, so a replacement drops the
 * interval instead of silently smoothing over it.
 */
export function computeUtilization(
  readings: Reading[],
  resets: MeterReset[],
  today: Date = new Date(),
): Utilization {
  const tach = utilizationFor(readings, resets, "tach", today);
  if (tach.confidence !== "none") return tach;
  const hobbs = utilizationFor(readings, resets, "hobbs", today);
  return hobbs.confidence !== "none" ? hobbs : tach;
}

export type Projection = { date: string; confidence: Exclude<Confidence, "none"> };

/**
 * When `hoursRemaining` runs out, at this aircraft's recent rate. ISO date.
 *
 * Null — meaning "render exactly what we rendered before this feature existed" —
 * whenever we can't stand behind a date: no usable rate, or the item is already
 * due (a projection into the past tells the owner nothing they don't know).
 */
export function projectDueDate(
  hoursRemaining: number | null,
  u: Utilization,
  today: Date = new Date(),
): Projection | null {
  if (hoursRemaining == null || hoursRemaining <= 0) return null;
  if (u.confidence === "none" || u.hoursPerDay <= 0) return null;
  const days = Math.round(hoursRemaining / u.hoursPerDay);
  if (!Number.isFinite(days)) return null;
  const endMs = Date.parse(today.toISOString().slice(0, 10) + "T00:00:00Z");
  return { date: iso(endMs + days * DAY_MS), confidence: u.confidence };
}

// --- Presentation ----------------------------------------------------------
// Shared so the Status grid, the forecast table, the AD rows and the reminder
// email all say the same thing in the same words.

/** "14 Mar 2027" — short, unambiguous, no locale surprises on the server. */
export function formatProjectedDate(isoDate: string): string {
  return new Date(isoDate + "T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The inline text: always the `≈`, always the confidence. */
export function projectionLabel(p: Projection): string {
  return `≈ ${formatProjectedDate(p.date)} (${p.confidence} confidence)`;
}

/** The hover/detail text: where the rate came from, and what it is not. */
export function projectionTitle(u: Utilization): string {
  const perMonth = Math.round(u.hoursPerDay * 30.4 * 10) / 10;
  return (
    `Planning estimate, not a compliance determination — the hours figure is what comes due. ` +
    `Projected from ${perMonth} hrs/month (${u.sampleCount} ${u.meter} readings between ` +
    `${u.windowStart} and ${u.windowEnd}). Actual utilization will vary.`
  );
}
