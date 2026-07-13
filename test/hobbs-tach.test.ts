import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Reading,
  DEFAULT_RATIO,
  buildPairs,
  weightedMedian,
  digitEditCandidates,
  deriveRatio,
  currentTach,
  currentHobbs,
  meterValueAtDate,
  detectAnomalies,
} from "../src/lib/hobbsTach";

// Reading builder. Note hobbs/tach have DIFFERENT absolute origins across tests
// on purpose — only their deltas should matter.
const R = (
  id: string,
  date: string | null,
  hobbs: number | null,
  tach: number | null,
  reviewedAt: string | null = null,
): Reading => ({ id, source: "entry", date, hobbs, tach, reviewedAt });

// --- buildPairs ------------------------------------------------------------
test("buildPairs: a co-recorded reading is one pair at full weight", () => {
  const pairs = buildPairs([R("a", "2025-01-01", 100, 1000)]);
  assert.equal(pairs.length, 1);
  assert.deepEqual({ h: pairs[0].hobbs, t: pairs[0].tach, w: pairs[0].weight }, { h: 100, t: 1000, w: 1 });
});

test("buildPairs: a tach-only maintenance pairs with the last flight's hobbs (inferred, half weight)", () => {
  const pairs = buildPairs([
    R("flight1", "2025-01-01", 100, null), // flight, ending hobbs 100
    R("flight2", "2025-01-05", 110, null), // flight, ending hobbs 110
    R("annual", "2025-01-08", null, 1180), // maintenance, tach only
  ]);
  // one inferred pair: (max hobbs before maintenance = 110, tach 1180), weight 0.5
  assert.equal(pairs.length, 1);
  assert.deepEqual({ h: pairs[0].hobbs, t: pairs[0].tach, w: pairs[0].weight }, { h: 110, t: 1180, w: 0.5 });
});

test("buildPairs: a tach-only reading with no prior hobbs yields no pair", () => {
  assert.equal(buildPairs([R("m", "2025-01-08", null, 1180)]).length, 0);
});

// --- weightedMedian --------------------------------------------------------
test("weightedMedian: weight shifts the median toward the heavier value", () => {
  assert.equal(weightedMedian([{ value: 1, w: 1 }, { value: 9, w: 1 }, { value: 9, w: 1 }]), 9);
  assert.equal(weightedMedian([{ value: 0.9, w: 10 }, { value: -5, w: 1 }]), 0.9);
});

// --- deriveRatio -----------------------------------------------------------
test("deriveRatio: from clean co-recorded pairs, ratio = Δtach/Δhobbs (origins differ)", () => {
  const rs = [
    R("a", "2025-01-01", 100, 1000),
    R("b", "2025-02-01", 200, 1090),
    R("c", "2025-03-01", 300, 1180),
  ];
  const { ratio, confidence } = deriveRatio(rs);
  assert.ok(Math.abs(ratio - 0.9) < 1e-9, `ratio=${ratio}`);
  assert.equal(confidence, "measured");
});

test("deriveRatio: fewer than two pairs falls back to the default", () => {
  const { ratio, confidence } = deriveRatio([R("a", "2025-01-01", 100, 1000)]);
  assert.equal(ratio, DEFAULT_RATIO);
  assert.equal(confidence, "default");
});

test("deriveRatio: only inferred pairs → confidence 'estimated'", () => {
  const rs = [
    R("f1", "2025-01-01", 100, null),
    R("m1", "2025-01-02", null, 1000),
    R("f2", "2025-02-01", 200, null),
    R("m2", "2025-02-02", null, 1090),
  ];
  const { ratio, confidence } = deriveRatio(rs);
  assert.ok(Math.abs(ratio - 0.9) < 1e-9, `ratio=${ratio}`);
  assert.equal(confidence, "estimated");
});

test("deriveRatio: robust to a single bad pair (weighted median, clamped)", () => {
  const rs = [
    R("a", "2025-01-01", 100, 1000),
    R("b", "2025-02-01", 200, 1090),
    R("c", "2025-03-01", 300, 1180),
    R("d", "2025-04-01", 400, 999999), // typo pair
  ];
  const { ratio } = deriveRatio(rs);
  assert.ok(ratio >= 0.5 && ratio <= 1.2, `ratio=${ratio}`);
});

// --- currentTach -----------------------------------------------------------
test("currentTach: newer hobbs than the anchor → estimated forward via ratio", () => {
  const rs = [
    R("a", "2025-01-01", 100, 1000),
    R("b", "2025-02-01", 200, 1090), // anchor (latest pair), ratio 0.9
    R("f", "2025-03-01", 250, null), // later flight, hobbs 250
  ];
  const ct = currentTach(rs);
  assert.equal(ct.estimated, true);
  assert.equal(ct.tach, 1135); // 1090 + 0.9*(250-200)
});

test("currentTach: latest reading is a tach → actual, not estimated", () => {
  const rs = [
    R("a", "2025-01-01", 100, 1000),
    R("b", "2025-02-01", 200, 1090),
    R("m", "2025-03-01", null, 1120), // fresh maintenance tach, no flights since
  ];
  const ct = currentTach(rs);
  assert.equal(ct.estimated, false);
  assert.equal(ct.tach, 1120);
});

test("currentTach: no tach ever recorded → rough estimate from hobbs × default ratio", () => {
  const ct = currentTach([R("f", "2025-01-01", 1000, null)]);
  assert.equal(ct.estimated, true);
  assert.equal(ct.rough, true);
  assert.equal(ct.tach, 900); // 1000 * 0.9
});

test("currentTach: all-tach logbook (no hobbs ever) → latest tach, actual", () => {
  const ct = currentTach([R("a", "2025-01-01", null, 1200), R("b", "2025-02-01", null, 1250)]);
  assert.equal(ct.estimated, false);
  assert.equal(ct.tach, 1250);
});

test("currentTach: no data → null", () => {
  assert.equal(currentTach([]).tach, null);
});

// --- currentHobbs ----------------------------------------------------------
test("currentHobbs: latest hobbs reading is the actual current hobbs", () => {
  const rs = [R("a", "2025-01-01", 1200, 1080), R("b", "2025-03-01", 1218, null)];
  const ch = currentHobbs(rs);
  assert.equal(ch.estimated, false);
  assert.equal(ch.hobbs, 1218);
});

test("currentHobbs: advances with a newer hobbs-only reading (the oil-change case)", () => {
  // last oil change at hobbs 1200; two more flights → 1218. 'hours since' = 18.
  const rs = [R("oil", "2025-01-01", 1200, null), R("f1", "2025-02-01", 1210, null), R("f2", "2025-03-01", 1218, null)];
  assert.equal(currentHobbs(rs).hobbs, 1218);
});

test("currentHobbs: all-tach logbook → bridged from tach via ratio, flagged estimated", () => {
  const rs = [R("a", "2025-01-01", null, 900), R("b", "2025-02-01", null, 990)];
  const ch = currentHobbs(rs);
  assert.equal(ch.estimated, true);
  assert.ok(ch.hobbs != null && ch.hobbs > 990, `hobbs=${ch.hobbs}`); // tach/0.9 > tach
});

test("currentHobbs: a stray/old high reading does NOT become current (latest by date, not max)", () => {
  // e.g. a tach value mis-keyed into hobbs, or a pre-replacement hobbs meter.
  const rs = [
    R("stray", "2024-01-01", 4057.9, null), // old, high (wrong-origin) hobbs
    R("oil", "2026-07-05", 946.1, 4141.6),
    R("flight", "2026-07-09", 947.7, null), // the actual latest hobbs
  ];
  assert.equal(currentHobbs(rs).hobbs, 947.7);
});

test("currentHobbs: no data → null", () => {
  assert.equal(currentHobbs([]).hobbs, null);
});

// --- meterValueAtDate ------------------------------------------------------
test("meterValueAtDate: the real oil-change case — hobbs at the last-done date is the baseline", () => {
  // Oil change co-recorded tach 4141.6 + hobbs 946.1 on 2026-07-05; later flights → 947.7 hobbs.
  const rs = [
    R("oil", "2026-07-05", 946.1, 4141.6),
    R("f1", "2026-07-09", 947.7, null),
  ];
  assert.equal(meterValueAtDate(rs, "2026-07-05", "hobbs"), 946.1); // → remaining = 50 - (947.7-946.1) = 48.4
  assert.equal(meterValueAtDate(rs, "2026-07-05", "tach"), 4141.6);
});

test("meterValueAtDate: picks the latest reading on-or-before the date", () => {
  const rs = [R("a", "2025-01-01", 100, null), R("b", "2025-02-01", 110, null), R("c", "2025-03-01", 120, null)];
  assert.equal(meterValueAtDate(rs, "2025-02-15", "hobbs"), 110);
});

test("meterValueAtDate: reads each meter at the date (co-recorded maintenance)", () => {
  const rs = [R("p1", "2025-01-01", 100, 1000), R("p2", "2025-02-01", 200, 1090), R("m", "2025-03-01", null, 1180)];
  assert.equal(meterValueAtDate(rs, "2025-03-01", "tach"), 1180); // tach recorded that day
  assert.equal(meterValueAtDate(rs, "2025-03-01", "hobbs"), 200); // no hobbs then → last known hobbs
});

test("meterValueAtDate: no date → null", () => {
  assert.equal(meterValueAtDate([R("a", "2025-01-01", 100, null)], null, "hobbs"), null);
});

// --- digitEditCandidates ---------------------------------------------------
test("digitEditCandidates: dropped and extra digit both reach the true value", () => {
  assert.ok(digitEditCandidates(303).includes(3303), "insert digit");
  assert.ok(digitEditCandidates(33303).includes(3303), "delete digit");
});

// --- detectAnomalies -------------------------------------------------------
test("detectAnomalies: a value below the previous reading (dropped digit) is flagged with a fix", () => {
  const rs = [R("a", "2025-01-01", 3300, null), R("b", "2025-01-02", 303, null), R("c", "2025-01-03", 3305, null)];
  const a = detectAnomalies(rs).find((x) => x.readingId === "b");
  assert.ok(a, "flagged");
  assert.equal(a!.reason, "non_monotonic");
  assert.equal(a!.suggested, 3303);
});

test("detectAnomalies: a fat-fingered high value as the latest reading is flagged with a fix", () => {
  const rs = [R("a", "2025-01-01", 3302, null), R("b", "2025-01-02", 33303, null)];
  const a = detectAnomalies(rs).find((x) => x.readingId === "b");
  assert.ok(a, "flagged");
  assert.equal(a!.reason, "magnitude");
  assert.equal(a!.suggested, 3303);
});

test("detectAnomalies: a normal monotonic series is NOT flagged", () => {
  const rs = [R("a", "2025-01-01", 3300, null), R("b", "2025-01-02", 3302, null), R("c", "2025-01-03", 3305, null)];
  assert.equal(detectAnomalies(rs).length, 0);
});

test("detectAnomalies: a reviewed reading is skipped", () => {
  const rs = [
    R("a", "2025-01-01", 3300, null),
    R("b", "2025-01-02", 303, null, "2025-01-02T00:00:00Z"), // reviewed
    R("c", "2025-01-03", 3305, null),
  ];
  assert.equal(detectAnomalies(rs).find((x) => x.readingId === "b"), undefined);
});
