import { test } from "node:test";
import assert from "node:assert/strict";
import { oilConsumption } from "../src/lib/oilConsumption";

const A = (tach: number | null, quarts: number, date = "2026-01-01", hobbs: number | null = null) => ({
  added_date: date,
  quarts,
  tach,
  hobbs,
});

test("oilConsumption: hours/quart per interval between consecutive top-offs", () => {
  // +1qt at 1000, +1qt at 1008 → 8 hrs / 1 qt = 8 hrs/qt for that interval.
  const { points, avgHoursPerQuart } = oilConsumption([A(1000, 1), A(1008, 1), A(1020, 2)]);
  assert.equal(points.length, 2);
  assert.equal(points[0].hoursPerQuart, 8); // (1008-1000)/1
  assert.equal(points[1].hoursPerQuart, 6); // (1020-1008)/2
  assert.equal(avgHoursPerQuart, 7);
});

test("oilConsumption: fewer than two metered top-offs → no points", () => {
  // A lone top-off can't bound an interval, so no meter is usable — and it is
  // reported as excluded rather than vanishing.
  assert.deepEqual(oilConsumption([A(1000, 1)]), {
    points: [],
    avgHoursPerQuart: null,
    meter: null,
    excluded: 1,
  });
  assert.deepEqual(oilConsumption([]), {
    points: [],
    avgHoursPerQuart: null,
    meter: null,
    excluded: 0,
  });
});

test("oilConsumption: sorts by meter, not input order", () => {
  const { points } = oilConsumption([A(1020, 2), A(1000, 1), A(1008, 1)]);
  assert.equal(points[0].hoursPerQuart, 8);
  assert.equal(points[1].hoursPerQuart, 6);
});

test("oilConsumption: falls back to hobbs when tach is absent", () => {
  const { points } = oilConsumption([A(null, 1, "2026-01-01", 500), A(null, 1, "2026-02-01", 510)]);
  assert.equal(points.length, 1);
  assert.equal(points[0].hoursPerQuart, 10);
});

test("oilConsumption: skips a non-advancing meter and drops unmetered/zero-quart rows", () => {
  const { points } = oilConsumption([A(1000, 1), A(1000, 1), A(null, 2), A(1010, 0), A(1010, 1)]);
  // 1000→1000 skipped (0 hrs); unmetered + zero-quart dropped; 1000→1010 counts.
  assert.equal(points.length, 1);
  assert.equal(points[0].hoursPerQuart, 10);
});

// --- One meter for the whole series ----------------------------------------
// Regression for a real report (2026-08-15): the meter used to be chosen PER
// ROW (`a.tach ?? a.hobbs`), so a top-off logged with tach only (~4141) and the
// next logged with hobbs only (~965) were sorted and subtracted against each
// other. 19 hours of flying on one quart came out as 3176 "hours" and 453 h/qt,
// attributed to the wrong date because the mixed-scale sort reversed the order
// too. Every part of that error read reassuringly, which is the wrong direction
// to be wrong about oil consumption.

test("oilConsumption: never measures an interval across two different meters", () => {
  const out = oilConsumption([
    { added_date: "2026-07-05", quarts: 7, hobbs: 946.1, tach: 4141.6 },
    { added_date: "2026-08-14", quarts: 1, hobbs: 965.1, tach: null },
  ]);
  // Only one row has tach, so the series falls back to hobbs — and uses it for
  // BOTH rows: 946.1 → 965.1 = 19.0 h on the 1 qt added at the later top-off.
  assert.equal(out.meter, "hobbs");
  assert.equal(out.points.length, 1);
  assert.equal(out.points[0].hours, 19);
  assert.equal(out.points[0].quarts, 1);
  assert.equal(out.points[0].date, "2026-08-14", "the interval belongs to the LATER top-off");
  assert.equal(out.avgHoursPerQuart, 19);
});

test("oilConsumption: prefers tach, and reports what it left out", () => {
  // Tach can carry the series on its own, so the hobbs-only row is excluded
  // rather than mixed in — but the caller is told, so the UI can explain it.
  const out = oilConsumption([
    { added_date: "2026-01-01", quarts: 1, hobbs: 500, tach: 1000 },
    { added_date: "2026-02-01", quarts: 1, hobbs: 512, tach: 1008 },
    { added_date: "2026-03-01", quarts: 1, hobbs: 530, tach: null },
  ]);
  assert.equal(out.meter, "tach");
  assert.equal(out.excluded, 1);
  assert.equal(out.points.length, 1);
  assert.equal(out.points[0].hours, 8); // tach 1000 → 1008, NOT anything involving 530
});

test("oilConsumption: falls back to hobbs when tach can't make one interval", () => {
  const out = oilConsumption([
    { added_date: "2026-01-01", quarts: 1, hobbs: 500, tach: 1000 },
    { added_date: "2026-02-01", quarts: 1, hobbs: 510, tach: null },
    { added_date: "2026-03-01", quarts: 1, hobbs: 525, tach: null },
  ]);
  assert.equal(out.meter, "hobbs");
  assert.equal(out.excluded, 0);
  assert.deepEqual(out.points.map((p) => p.hours), [10, 15]);
});

test("oilConsumption: no usable meter at all → no points, everything excluded", () => {
  const out = oilConsumption([
    { added_date: "2026-01-01", quarts: 1, hobbs: null, tach: null },
    { added_date: "2026-02-01", quarts: 1, hobbs: 510, tach: null },
  ]);
  assert.equal(out.meter, null);
  assert.equal(out.points.length, 0);
  assert.equal(out.avgHoursPerQuart, null);
  assert.equal(out.excluded, 2);
});
