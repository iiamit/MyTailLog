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
  normalizeReadings,
  detectAnomalies,
  detectDuplicateMeters,
  readingSourceOf,
  READING_SOURCE_LABEL,
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

test("currentHobbs: an enrollment baseline holding a total-time/tach value is NOT current", () => {
  // The real case: entries are correct (oil hobbs 946.1, flight 947.7); the
  // 4057.9 is enrollment_hobbs (date null → oldest), NOT a log entry.
  const rs: Reading[] = [
    { id: "enroll", source: "enrollment", date: null, hobbs: 4057.9, tach: 4057.9, reviewedAt: null },
    R("oil", "2026-07-05", 946.1, 4141.6),
    R("flight", "2026-07-09", 947.7, null),
  ];
  assert.equal(currentHobbs(rs).hobbs, 947.7); // not 4057.9 → oil remaining = 996.1-947.7 = 48.4
});

test("currentHobbs: a same-date outlier does NOT hijack current (2026-07-27 incident)", () => {
  // Two MFB readings share the latest date: the real 957.6 and a bogus 6267.9. The
  // old same-date tie→max picked 6267.9 → oil "thousands overdue". Anchor to the
  // prior reading (954.0) → the close one (957.6) wins.
  const rs = [
    R("j06-26", "2026-06-26", 946.1, null),
    R("j07-12", "2026-07-12", 947.7, null),
    R("j07-23", "2026-07-23", 954.0, null),
    R("good", "2026-07-26", 957.6, null),
    R("bad", "2026-07-26", 6267.9, 4153.5), // stray MFB hobbs on the same date
  ];
  assert.equal(currentHobbs(rs).hobbs, 957.6); // not 6267.9
});

test("currentHobbs: no data → null", () => {
  assert.equal(currentHobbs([]).hobbs, null);
});

test("detectAnomalies: a gross most-recent outlier is flagged for review (6267.9)", () => {
  // The bad reading is newest (no later reading to be 'above') and isn't a digit
  // typo, so only the grossSpike gate catches it — otherwise it sits unflagged.
  const rs = [
    R("a", "2026-07-12", 947.7, null),
    R("b", "2026-07-23", 954.0, null),
    R("c", "2026-07-26", 957.6, null),
    R("bad", "2026-07-27", 6267.9, null),
  ];
  const flagged = detectAnomalies(rs).find((a) => a.readingId === "bad");
  assert.ok(flagged, "expected the 6267.9 reading to be flagged");
  assert.equal(flagged!.field, "hobbs");
  assert.equal(flagged!.reason, "magnitude");
});

test("detectAnomalies: a legitimately rising series is NOT flagged (no false spike)", () => {
  const rs = [R("a", "2026-01-01", 100, null), R("b", "2026-03-01", 150, null), R("c", "2026-06-01", 205, null)];
  assert.equal(detectAnomalies(rs).length, 0);
});

// --- normalizeReadings -----------------------------------------------------
test("normalizeReadings: hobbs === tach is a duplicated-value artifact → hobbs dropped", () => {
  // The real N9363V case: an engine-log tach 4057.9 keyed into both fields.
  const rs = normalizeReadings([R("dup", "2025-07-17", 4057.9, 4057.9), R("mfb", "2026-07-12", 947.7, null)]);
  assert.equal(rs[0].hobbs, null);
  assert.equal(rs[0].tach, 4057.9);
  assert.equal(rs[1].hobbs, 947.7);
});

test("normalizeReadings: a genuine differing hobbs/tach pair is untouched", () => {
  const rs = normalizeReadings([R("oil", "2026-07-05", 946.1, 4141.6)]);
  assert.deepEqual({ h: rs[0].hobbs, t: rs[0].tach }, { h: 946.1, t: 4141.6 });
});

test("currentHobbs: a duplicated hobbs===tach reading never becomes current (after normalize)", () => {
  const rs = normalizeReadings([R("dup", "2025-07-17", 4057.9, 4057.9), R("mfb", "2026-07-12", 947.7, null)]);
  assert.equal(currentHobbs(rs).hobbs, 947.7); // not 4057.9
});

// --- detectDuplicateMeters -------------------------------------------------
test("detectDuplicateMeters: flags hobbs===tach with a CLEAR fix (suggested null)", () => {
  const a = detectDuplicateMeters([R("dup", "2025-07-17", 4057.9, 4057.9), R("ok", "2026-07-05", 946.1, 4141.6)]);
  assert.equal(a.length, 1);
  assert.equal(a[0].readingId, "dup");
  assert.equal(a[0].field, "hobbs");
  assert.equal(a[0].reason, "duplicate");
  assert.equal(a[0].suggested, null);
});

test("detectDuplicateMeters: a reviewed duplicate is skipped", () => {
  const rs = [R("dup", "2025-07-17", 4057.9, 4057.9, "2026-01-01T00:00:00Z")];
  assert.equal(detectDuplicateMeters(rs).length, 0);
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

// --- provenance -------------------------------------------------------------
// An owner emailed asking where a current reading came from and couldn't find
// out — the value was on screen with nothing saying when or from where. Worse,
// every hours_reading row was internally tagged "mfb" regardless of its real
// source, so a hand entry and an ADS-B estimate were indistinguishable from a
// MyFlightBook sync.

test("readingSourceOf maps the stored source honestly", () => {
  assert.equal(readingSourceOf("myflightbook"), "mfb");
  assert.equal(readingSourceOf("manual"), "manual");
  assert.equal(readingSourceOf("adsb_estimate"), "adsb");
  // Unknown/absent defaults to a sync, not "entered by hand": claiming a person
  // typed something they didn't is the more misleading of the two errors.
  assert.equal(readingSourceOf(null), "mfb");
  assert.equal(readingSourceOf("something_new"), "mfb");
});

test("every ReadingSource has a human label (no raw enum can reach the UI)", () => {
  for (const s of ["entry", "mfb", "manual", "adsb", "enrollment"] as const) {
    assert.ok(READING_SOURCE_LABEL[s], s);
    assert.ok(!READING_SOURCE_LABEL[s].includes("_"), `${s} label looks like an enum`);
  }
});

test("currentTach/currentHobbs report the source they are anchored to", () => {
  const readings: Reading[] = [
    { id: "e1", source: "entry", date: "2026-01-01", hobbs: 100, tach: 90, reviewedAt: null },
    { id: "m1", source: "manual", date: "2026-06-01", hobbs: 150, tach: 135, reviewedAt: null },
  ];
  const t = currentTach(readings);
  assert.equal(t.from, "manual", "anchored to the newest reading, which was hand-entered");
  assert.equal(t.asOf, "2026-06-01");
  assert.equal(currentHobbs(readings).from, "manual");
});

test("a DERIVED value reports the source of its anchor, and stays flagged estimated", () => {
  // Hobbs only, from a sync → tach must be derived. `from` names where the
  // anchor came from; `estimated` separately says the number was computed.
  const readings: Reading[] = [
    { id: "s1", source: "mfb", date: "2026-06-01", hobbs: 200, tach: null, reviewedAt: null },
  ];
  const t = currentTach(readings);
  assert.equal(t.estimated, true);
  assert.equal(t.from, "mfb");
  assert.equal(t.asOf, "2026-06-01");
});

test("with nothing recorded there is no source to claim", () => {
  assert.equal(currentTach([]).from, null);
  assert.equal(currentHobbs([]).from, null);
});
