import { test } from "node:test";
import assert from "node:assert/strict";
import { safeIsoDate } from "../src/lib/extraction/date";

test("safeIsoDate: the reported bug — clamps an impossible day to month end", () => {
  assert.equal(safeIsoDate("1987-11-31"), "1987-11-30"); // November has 30 days
  assert.equal(safeIsoDate("2021-04-31"), "2021-04-30");
});

test("safeIsoDate: February respects leap years", () => {
  assert.equal(safeIsoDate("2020-02-30"), "2020-02-29"); // leap
  assert.equal(safeIsoDate("2021-02-30"), "2021-02-28"); // non-leap
});

test("safeIsoDate: a valid date passes through unchanged", () => {
  assert.equal(safeIsoDate("2021-05-15"), "2021-05-15");
  assert.equal(safeIsoDate("2021-05-15T00:00:00Z"), "2021-05-15"); // trailing time tolerated
});

test("safeIsoDate: structurally-bad input → null (never throws)", () => {
  assert.equal(safeIsoDate("2021-13-01"), null); // month 13
  assert.equal(safeIsoDate("2021-00-10"), null); // month 0
  assert.equal(safeIsoDate("2021-05-00"), null); // day 0
  assert.equal(safeIsoDate("not a date"), null);
  assert.equal(safeIsoDate(""), null);
  assert.equal(safeIsoDate(null), null);
  assert.equal(safeIsoDate(undefined), null);
});
