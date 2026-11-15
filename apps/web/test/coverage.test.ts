import { test } from "node:test";
import assert from "node:assert/strict";
import { axisPercent, coverageByLogbook } from "../src/lib/coverage";

const books = [
  { id: "eng", type: "engine" as const },
  { id: "air", type: "airframe" as const },
  { id: "oth", type: "other" as const },
];

test("groups by logbook in airframe-first order and skips 'other'", () => {
  const c = coverageByLogbook(books, []);
  assert.deepEqual(c.map((x) => x.type), ["airframe", "engine"]);
  assert.equal(c[0].first, null);
  assert.equal(c[0].count, 0);
});

test("first/last/undated and gaps at the 24-month threshold", () => {
  const c = coverageByLogbook(books, [
    { logbook_id: "air", entry_date: "2001-03-01" },
    { logbook_id: "air", entry_date: "1999-03-01" }, // exactly 24 months before → gap
    { logbook_id: "air", entry_date: "2002-12-01" }, // 21 months → no gap
    { logbook_id: "air", entry_date: null },
    { logbook_id: "eng", entry_date: "2010-05-05" },
  ]);
  const air = c.find((x) => x.type === "airframe")!;
  assert.equal(air.first, "1999-03-01");
  assert.equal(air.last, "2002-12-01");
  assert.equal(air.count, 4);
  assert.equal(air.undated, 1);
  assert.deepEqual(air.gaps, [{ from: "1999-03-01", to: "2001-03-01" }]);
  const eng = c.find((x) => x.type === "engine")!;
  assert.equal(eng.first, eng.last);
  assert.deepEqual(eng.gaps, []);
});

test("axisPercent clamps and scales by year", () => {
  assert.equal(axisPercent("1978-01-01", 1978, 1987), 0);
  assert.equal(axisPercent("1983-01-15", 1978, 1987), 50);
  assert.equal(axisPercent("2030-01-01", 1978, 1987), 100);
});
