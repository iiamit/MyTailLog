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
export type AnomalyReason = "non_monotonic" | "magnitude" | "duplicate";
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

/**
 * Drop the hobbs on any reading where hobbs === tach. Real hobbs and tach are
 * different meters and effectively never read exactly equal, so an equal pair is
 * a duplicated-value extraction artifact (the tach value keyed into both fields,
 * e.g. an engine-log entry). Treating it as hobbs would fabricate a ratio-1.0
 * co-recorded pair and could masquerade as "current hobbs". Keep the tach.
 */
export function normalizeReadings(readings: Reading[]): Reading[] {
  return readings.map((r) =>
    r.hobbs != null && r.tach != null && r.hobbs === r.tach ? { ...r, hobbs: null } : r,
  );
}

/**
 * Readings whose hobbs === tach — the tach value keyed into both fields. Flagged
 * so the owner can clear the bogus hobbs at the source (the forecast already
 * ignores it via normalizeReadings). The fix is to CLEAR hobbs, so `suggested`
 * is null. Run on RAW readings, before normalization. Skips reviewed readings.
 */
export function detectDuplicateMeters(readings: Reading[]): Anomaly[] {
  return readings
    .filter((r) => r.reviewedAt == null && r.hobbs != null && r.tach != null && r.hobbs === r.tach)
    .map((r) => ({
      readingId: r.id,
      source: r.source,
      field: "hobbs" as Meter,
      value: r.hobbs as number,
      suggested: null,
      reason: "duplicate" as AnomalyReason,
      confidence: 0.9,
    }));
}

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

// The CURRENT value of a meter = the most recent reading by DATE, not the max.
// A meter can be replaced/reset (so an old reading may read higher than now), and
// a stray/mis-keyed value (a tach number in a hobbs field, or a total-time
// enrollment) must not become "current" — the max would grab it forever.
//
// On a same-date tie we pick the value CLOSEST to the prior (earlier-date)
// reading, NOT the max — otherwise a stray reading sharing the latest date (e.g. a
// bad MFB hobbs of 6267.9 landing next to the real 957.6) hijacks "current" purely
// by being largest. Ties among equally-close → the higher (a flight's ending
// reading over a mid-day note); no earlier reading to anchor against → the higher.
function currentReading<K extends "hobbs" | "tach">(
  rows: (Reading & Record<K, number>)[],
  k: K,
): (Reading & Record<K, number>) | null {
  if (!rows.length) return null;
  const latestDate = rows.reduce((d, r) => ((r.date ?? "") > d ? r.date ?? "" : d), "");
  const onLatest = rows.filter((r) => (r.date ?? "") === latestDate);
  if (onLatest.length === 1) return onLatest[0];
  const earlier = rows.filter((r) => (r.date ?? "") < latestDate);
  if (!earlier.length) return onLatest.reduce((b, r) => (r[k] > b[k] ? r : b));
  const anchor = earlier.reduce((b, r) => ((r.date ?? "") > (b.date ?? "") ? r : b));
  return onLatest.reduce((best, r) => {
    const dr = Math.abs(r[k] - anchor[k]);
    const db = Math.abs(best[k] - anchor[k]);
    return dr < db || (dr === db && r[k] > best[k]) ? r : best;
  });
}

// The most recent (hobbs, tach) pair — the anchor forecasts walk forward from.
const latestPair = (pairs: Pair[]): Pair =>
  [...pairs].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.hobbs - b.hobbs)[pairs.length - 1];

/** Current tach — actual when a recent tach anchors it, else estimated from hobbs. */
export function currentTach(readings: Reading[]): CurrentTach {
  const pairs = buildPairs(readings);
  const latestHobbs = currentReading(readings.filter((r) => r.hobbs != null) as (Reading & { hobbs: number })[], "hobbs");
  const latestTach = currentReading(readings.filter((r) => r.tach != null) as (Reading & { tach: number })[], "tach");

  if (pairs.length === 0) {
    // Can't relate the meters (no shared point). Prefer an actual tach reading —
    // it's the authoritative maintenance meter (covers the all-tach logbook).
    // ponytail: a tach-then-only-hobbs history falls back to the tach here too.
    if (latestTach) return { tach: round1(latestTach.tach), estimated: false, asOf: latestTach.date, rough: false };
    return latestHobbs
      ? { tach: round1(latestHobbs.hobbs * DEFAULT_RATIO), estimated: true, asOf: latestHobbs.date, rough: true }
      : { tach: null, estimated: false, asOf: null, rough: false };
  }

  const { ratio, confidence } = deriveRatio(readings);
  const anchor = latestPair(pairs);

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

export type CurrentHobbs = { hobbs: number | null; estimated: boolean; asOf: string | null; rough: boolean };

/**
 * Current hobbs — the meter usage items (oil, etc.) count down on. Hobbs is the
 * abundant, frequently-recorded meter, so the latest hobbs reading is normally
 * the actual value; only an all-tach logbook needs it bridged from tach via the
 * ratio (flagged estimated).
 */
export function currentHobbs(readings: Reading[]): CurrentHobbs {
  const latestHobbs = currentReading(readings.filter((r) => r.hobbs != null) as (Reading & { hobbs: number })[], "hobbs");
  if (latestHobbs) return { hobbs: round1(latestHobbs.hobbs), estimated: false, asOf: latestHobbs.date, rough: false };

  // No hobbs ever recorded — bridge from the current tach.
  const ct = currentTach(readings);
  if (ct.tach == null) return { hobbs: null, estimated: false, asOf: null, rough: false };
  const pairs = buildPairs(readings);
  if (pairs.length === 0)
    return { hobbs: round1(ct.tach / DEFAULT_RATIO), estimated: true, asOf: ct.asOf, rough: true };
  const { ratio } = deriveRatio(readings);
  const anchor = latestPair(pairs);
  return { hobbs: round1(anchor.hobbs + (ct.tach - anchor.tach) / ratio), estimated: true, asOf: ct.asOf, rough: ct.rough };
}

/**
 * The value of `meter` at (or nearest before) a date — the reading a maintenance
 * item was actually done at, on the meter it counts down on. This is why the oil
 * change advances on hobbs even though its last-done was recorded in tach: we
 * anchor to the co-recorded hobbs at that date, not the stored tach scalar.
 * Prefers the latest reading on-or-before the date; else the earliest after;
 * bridges from the other meter via the ratio when this meter has no reading.
 */
export function meterValueAtDate(readings: Reading[], date: string | null, meter: Meter): number | null {
  if (!date) return null;
  const withVal = readings.filter((r) => r[meter] != null) as (Reading & Record<Meter, number>)[];
  if (withVal.length) {
    const onOrBefore = withVal.filter((r) => (r.date ?? "") <= date);
    const pick = onOrBefore.length
      ? onOrBefore.reduce((b, r) => ((r.date ?? "") > (b.date ?? "") ? r : b))
      : withVal.reduce((b, r) => ((r.date ?? "9999") < (b.date ?? "9999") ? r : b));
    return round1(pick[meter]);
  }
  // No reading in this meter at all — bridge from the other meter at that date.
  const other: Meter = meter === "hobbs" ? "tach" : "hobbs";
  const otherVal = meterValueAtDate(readings, date, other);
  if (otherVal == null) return null;
  const pairs = buildPairs(readings);
  if (pairs.length === 0) return null;
  const { ratio } = deriveRatio(readings);
  const anchor = latestPair(pairs);
  // Δ on this meter ≈ ratio·Δhobbs; invert when converting tach→hobbs.
  return meter === "tach"
    ? round1(anchor.tach + ratio * (otherVal - anchor.hobbs))
    : round1(anchor.hobbs + (otherVal - anchor.tach) / ratio);
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
      // A gross magnitude spike no digit-edit explains and that monotonicity can't
      // catch — notably the MOST-RECENT reading (next==null, so aboveNext never
      // fires). This is what let a bad MFB hobbs of 6267.9 sit unflagged next to the
      // real 957.6. Conservative gate (>2× and >500 hrs over) to avoid nagging on a
      // legitimately large gap between sparse readings.
      const grossSpike = expected != null && value > 2 * expected && value - expected > 500;

      if (!belowPrev && !aboveNext && !farOff && !grossSpike) continue;
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
