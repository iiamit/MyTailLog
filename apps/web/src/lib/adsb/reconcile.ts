// ===========================================================================
// Reconciling observed ADS-B flying against the RECORDED hours — the point of
// the whole feature.
//
// MyFlightBook (and any hand-entered reading, and any logbook entry) is the
// pilot's own record and wins outright. ADS-B is only ever the fallback
// observer: it speaks up when the aircraft demonstrably flew and no recorded
// reading accounts for it.
//
// Hobbs and tach are CUMULATIVE meters, not per-flight durations: a reading
// dated 20 Jul already contains every hour flown before 20 Jul, however many
// flights that was. So the rule is not per-flight matching — it is a single
// cutoff. Only flights that started AFTER the most recent recorded reading are
// uncovered. That also makes accepting a suggestion self-silencing: the row it
// writes becomes the new cutoff.
//
// Honest limits (stated in the UI, not buried): ADS-B airborne wall-clock is
// neither tach nor hobbs — it excludes taxi and runup, and drifts from tach with
// RPM. Ground coverage has gaps. Not every GA aircraft broadcasts ADS-B Out.
// This is an estimate that PROMPTS a real reading; it is never authoritative.
// ===========================================================================

export type AdsbFlightRow = {
  first_seen: string; // ISO timestamp
  last_seen: string; // ISO timestamp
  airborne_minutes: number;
  dismissed_at: string | null;
};

export type LatestReading = {
  date: string; // YYYY-MM-DD
  tach: number | null;
  hobbs: number | null;
  source: string;
};

export type AdsbSuggestion = {
  flights: number;
  /** Observed airborne time since the cutoff, hours to 0.1. */
  hours: number;
  /** The reading we're measuring from — null when nothing has ever been recorded. */
  since: LatestReading | null;
  /** Which meter the suggestion is expressed in. */
  meter: "tach" | "hobbs" | null;
  /** Current recorded value of that meter, and where ADS-B says it may now be. */
  from: number | null;
  to: number | null;
};

/** Below this the noise (a taxi test, a coverage blip) outweighs the signal. */
const MIN_HOURS = 0.2;

const day = (iso: string): string => iso.slice(0, 10);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Total wall-clock minutes covered by these observations, counting overlapping
 * ones ONCE.
 *
 * OpenSky really does emit overlapping records for a single flight. Observed for
 * N9363V on 2026-08-11:
 *
 *   22:12 → 23:24Z  (71 min)  KFZY→KCDW
 *   23:01 → 23:24Z  (23 min)  KMSV→(none)
 *
 * The second is contained in the first — same landing, two receiver-coverage
 * segments. Summing airborne_minutes reports 3.4 h for 3.0 h of flying, and
 * since this number is what we suggest the owner add to their tach, an inflated
 * estimate is the one failure mode this feature cannot afford.
 *
 * Classic sweep: sort by start, merge anything that starts before the running
 * segment ends.
 */
export function mergedMinutes(flights: AdsbFlightRow[]): number {
  const spans = flights
    .map((f) => [Date.parse(f.first_seen), Date.parse(f.last_seen)] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);

  let total = 0;
  let start = 0;
  let end = -1;
  for (const [a, b] of spans) {
    if (a > end) {
      if (end > start) total += end - start;
      start = a;
      end = b;
    } else if (b > end) {
      end = b;
    }
  }
  if (end > start) total += end - start;
  return total / 60_000;
}

/**
 * Returns a suggestion, or null when we should say nothing.
 *
 * Silent when: no flights; every flight is covered by a recorded reading; the
 * uncovered time is below the noise floor; or a meter was replaced after the
 * cutoff (the base value is then on the old scale and any arithmetic off it
 * would be wrong — the owner is mid-paperwork, stay out of the way).
 */
export function reconcileAdsb(input: {
  flights: AdsbFlightRow[];
  latestReading: LatestReading | null;
  /** Meter replacements, as reset dates. Usually empty. */
  resetDates?: string[];
}): AdsbSuggestion | null {
  const { flights, latestReading, resetDates = [] } = input;
  const cutoff = latestReading?.date ?? null;

  // A meter replaced after the cutoff invalidates the base number.
  if (cutoff && resetDates.some((d) => d > cutoff)) return null;

  const uncovered = flights.filter(
    (f) => !f.dismissed_at && (!cutoff || day(f.first_seen) > cutoff),
  );
  if (uncovered.length === 0) return null;

  const hours = round1(mergedMinutes(uncovered) / 60);
  if (hours < MIN_HOURS) return null;

  // Tach is the maintenance meter, so express the suggestion there when we have
  // one; hobbs otherwise. With neither, we still report the flying — we just
  // can't name a number.
  const meter = latestReading?.tach != null ? "tach" : latestReading?.hobbs != null ? "hobbs" : null;
  const from = meter ? latestReading![meter] : null;

  return {
    flights: uncovered.length,
    hours,
    since: latestReading,
    meter,
    from,
    to: from != null ? round1(from + hours) : null,
  };
}
