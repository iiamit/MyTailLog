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
  assert.deepEqual(oilConsumption([A(1000, 1)]), { points: [], avgHoursPerQuart: null });
  assert.deepEqual(oilConsumption([]), { points: [], avgHoursPerQuart: null });
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
