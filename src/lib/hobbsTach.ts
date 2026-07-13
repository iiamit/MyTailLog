// ===========================================================================
// Hobbs ↔ Tach reconciliation (pure — no I/O; unit-tested in test/hobbs-tach).
//
// Tach is the maintenance/AD meter but is recorded rarely; hobbs shows up in
// every flight log (and MyFlightBook sync) and accrues faster. This derives the
// per-aircraft hobbs↔tach relationship from readings at the same engine-time
// point, estimates current tach from the latest hobbs when needed, and flags
// fuzzy/typo readings.
//
// KEY FACT: hobbs and tach have DIFFERENT absolute origins (either meter can be
// replaced over the aircraft's life), so only their DELTAS align. We never fit
// tach = ratio·hobbs + b globally — we work in intervals and anchor to a real
// pair. See docs/superpowers/specs/2026-07-12-hobbs-tach-reconciliation-design.md.
// ===========================================================================

export type Meter = "hobbs" | "tach";
export type ReadingSource = "entry" | "mfb" | "enrollment";

export type Reading = {
  id: string;
  source: ReadingSource;
  date: string | null; // ISO; null sorts oldest (e.g. enrollment)
  hobbs: number | null;
  tach: number | null;
  reviewedAt: string | null; // hours_reviewed_at — suppresses anomaly re-flagging
};

export type RatioConfidence = "measured" | "estimated" | "default";
export type RatioResult = { ratio: number; confidence: RatioConfidence; pairs: number };
export type CurrentTach = { tach: number | null; estimated: boolean; asOf: string | null; rough: boolean };
export type AnomalyReason = "non_monotonic" | "magnitude";
export type Anomaly = {
  readingId: string;
  source: ReadingSource;
  field: Meter;
  value: number;
  suggested: number | null;
  reason: AnomalyReason;
  confidence: number; // 0–1
};

export const DEFAULT_RATIO = 0.9; // tach/hobbs when we can't measure it
const RATIO_MIN = 0.5;
const RATIO_MAX = 1.2;
const CO_WEIGHT = 1; // co-recorded pair
const INFERRED_WEIGHT = 0.5; // last-flight-hobbs → maintenance-tach
const RECENCY_HALF_LIFE = 500; // hobbs hours; recent pairs weigh more
const MIN_DELTA = 0.1; // ignore pairs too close in hobbs for a stable slope
const ANOMALY_MIN_OFF = 5; // hours; below this a deviation isn't worth flagging
const ANOMALY_CLOSER = 0.25; // a fix must be ≥4× closer to expected than the value

const round1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Chronological order; null date is oldest, ties broken by hobbs then tach.
const chrono = (a: Reading, b: Reading) =>
  (a.date ?? "").localeCompare(b.date ?? "") ||
  (a.hobbs ?? Infinity) - (b.hobbs ?? Infinity) ||
  (a.tach ?? Infinity) - (b.tach ?? Infinity);

export type Pair = { hobbs: number; tach: number; date: string | null; weight: number };

/** Pairs of (hobbs, tach) at the same engine-time point. */
export function buildPairs(readings: Reading[]): Pair[] {
  const sorted = [...readings].sort(chrono);
  const pairs: Pair[] = [];
  let maxHobbsSoFar: number | null = null; // = the last flight's ending hobbs
  for (const r of sorted) {
    if (r.hobbs != null && r.tach != null) {
      pairs.push({ hobbs: r.hobbs, tach: r.tach, date: r.date, weight: CO_WEIGHT });
    } else if (r.tach != null && maxHobbsSoFar != null) {
      // tach-only (maintenance): nothing ran the engine since the last flight,
      // so its hobbs = the highest hobbs recorded before it.
      pairs.push({ hobbs: maxHobbsSoFar, tach: r.tach, date: r.date, weight: INFERRED_WEIGHT });
    }
    if (r.hobbs != null) maxHobbsSoFar = Math.max(maxHobbsSoFar ?? -Infinity, r.hobbs);
  }
  return pairs;
}

/** Weighted median of {value, w}. */
export function weightedMedian(items: { value: number; w: number }[]): number {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((s, i) => s + i.w, 0) / 2;
  let acc = 0;
  for (const it of sorted) {
    acc += it.w;
    if (acc >= half) return it.value;
  }
  return sorted[sorted.length - 1].value;
}

/** Per-aircraft tach/hobbs rate, from co-recorded (dominant) + inferred pairs. */
export function deriveRatio(readings: Reading[]): RatioResult {
  const pairs = buildPairs(readings);
  if (pairs.length < 2) return { ratio: DEFAULT_RATIO, confidence: "default", pairs: pairs.length };

  const byHobbs = [...pairs].sort((a, b) => a.hobbs - b.hobbs);
  const latestHobbs = Math.max(...pairs.map((p) => p.hobbs));
  const slopes: { value: number; w: number }[] = [];
  for (let i = 1; i < byHobbs.length; i++) {
    const a = byHobbs[i - 1];
    const b = byHobbs[i];
    const dh = b.hobbs - a.hobbs;
    if (dh < MIN_DELTA) continue;
    const recency = 0.5 ** ((latestHobbs - b.hobbs) / RECENCY_HALF_LIFE);
    slopes.push({ value: (b.tach - a.tach) / dh, w: Math.min(a.weight, b.weight) * recency });
  }
  if (slopes.length === 0) return { ratio: DEFAULT_RATIO, confidence: "default", pairs: pairs.length };

  const ratio = clamp(weightedMedian(slopes), RATIO_MIN, RATIO_MAX);
  const coRecorded = pairs.filter((p) => p.weight === CO_WEIGHT).length;
  return { ratio, confidence: coRecorded >= 2 ? "measured" : "estimated", pairs: pairs.length };
}

/** Current tach — actual when a recent tach anchors it, else estimated from hobbs. */
export function currentTach(readings: Reading[]): CurrentTach {
  const pairs = buildPairs(readings);
  const hobbsReadings = readings.filter((r) => r.hobbs != null) as (Reading & { hobbs: number })[];
  // Current hobbs = the highest reading (monotonic meter); tie → latest date.
  const latestHobbs = hobbsReadings.length
    ? hobbsReadings.reduce((best, r) =>
        r.hobbs > best.hobbs || (r.hobbs === best.hobbs && (r.date ?? "") > (best.date ?? "")) ? r : best,
      )
    : null;

  if (pairs.length === 0) {
    return latestHobbs
      ? { tach: round1(latestHobbs.hobbs * DEFAULT_RATIO), estimated: true, asOf: latestHobbs.date, rough: true }
      : { tach: null, estimated: false, asOf: null, rough: false };
  }

  const { ratio, confidence } = deriveRatio(readings);
  const anchor = [...pairs].sort(
    (a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.hobbs - b.hobbs,
  )[pairs.length - 1]; // most recent pair

  if (latestHobbs && latestHobbs.hobbs > anchor.hobbs) {
    return {
      tach: round1(anchor.tach + ratio * (latestHobbs.hobbs - anchor.hobbs)),
      estimated: true,
      asOf: latestHobbs.date,
      rough: confidence === "default",
    };
  }
  return { tach: round1(anchor.tach), estimated: false, asOf: anchor.date, rough: false };
}

/** Plausible typo-corrections of a reading: digit insert/delete/transpose + decimal shift. */
export function digitEditCandidates(value: number): number[] {
  const out = new Set<number>();
  const add = (n: number) => {
    if (Number.isFinite(n) && n > 0) out.add(round1(n));
  };
  const intPart = Math.trunc(value);
  const frac = value - intPart;
  const ds = String(intPart);
  for (let i = 0; i < ds.length; i++) {
    const s = ds.slice(0, i) + ds.slice(i + 1); // delete one digit
    if (s) add(parseInt(s, 10) + frac);
  }
  for (let i = 0; i <= ds.length; i++)
    for (let d = 0; d <= 9; d++) add(parseInt(ds.slice(0, i) + d + ds.slice(i), 10) + frac); // insert
  for (let i = 0; i < ds.length - 1; i++) {
    const a = ds.split(""); // transpose adjacent
    [a[i], a[i + 1]] = [a[i + 1], a[i]];
    add(parseInt(a.join(""), 10) + frac);
  }
  add(value * 10);
  add(value / 10);
  add(value * 100);
  add(value / 100);
  out.delete(round1(value));
  return [...out];
}

/** Flag hobbs/tach values that read like typos, with a suggested correction. */
export function detectAnomalies(readings: Reading[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const field of ["hobbs", "tach"] as Meter[]) {
    const series = readings
      .filter((r) => r[field] != null)
      .sort(chrono)
      .map((r) => ({ id: r.id, source: r.source, value: r[field] as number, reviewedAt: r.reviewedAt }));

    for (let i = 0; i < series.length; i++) {
      const cur = series[i];
      if (cur.reviewedAt != null) continue;
      const prev = i > 0 ? series[i - 1].value : null;
      const next = i < series.length - 1 ? series[i + 1].value : null;
      const value = cur.value;
      const expected = prev != null && next != null ? (prev + next) / 2 : prev ?? next;
      if (expected == null) continue; // a single reading — nothing to compare against

      const best = digitEditCandidates(value)
        .filter((c) => (prev == null || c >= prev) && (next == null || c <= next))
        .reduce<number | null>(
          (b, c) => (b == null || Math.abs(c - expected) < Math.abs(b - expected) ? c : b),
          null,
        );

      const belowPrev = prev != null && value < prev;
      const aboveNext = next != null && value > next;
      // A value far from expected that a single digit-edit would land right by it.
      const farOff =
        best != null &&
        Math.abs(value - expected) > ANOMALY_MIN_OFF &&
        Math.abs(best - expected) < ANOMALY_CLOSER * Math.abs(value - expected);

      if (!belowPrev && !aboveNext && !farOff) continue;
      anomalies.push({
        readingId: cur.id,
        source: cur.source,
        field,
        value,
        suggested: best != null ? round1(best) : null,
        reason: belowPrev ? "non_monotonic" : "magnitude",
        confidence: best != null ? 0.8 : 0.5,
      });
    }
  }
  return anomalies;
}
