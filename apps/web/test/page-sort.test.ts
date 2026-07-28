import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpKey, sortPages, movedOrder, type SortablePage } from "../src/lib/pageSort";

const P = (
  id: string,
  logbookId: string,
  pageSequence: number | null,
  latestDate: string | null,
  tach: number | null,
): SortablePage => ({ id, logbookId, pageSequence, latestDate, tach });

const order = new Map([
  ["A", 0],
  ["B", 1],
]); // logbook A groups before B

test("cmpKey: nulls always last, regardless of direction", () => {
  assert.equal(Math.sign(cmpKey(null, 5, "asc")), 1);
  assert.equal(Math.sign(cmpKey(5, null, "asc")), -1);
  assert.equal(Math.sign(cmpKey(null, 5, "desc")), 1); // still last when descending
  assert.equal(Math.sign(cmpKey(5, null, "desc")), -1);
  assert.equal(cmpKey(null, null, "asc"), 0);
});

test("sortPages by date keeps logbooks grouped, sorts within each", () => {
  const rows = [
    P("b2", "B", 2, "2020-06-01", null),
    P("a2", "A", 2, "2019-05-01", null),
    P("b1", "B", 1, "2018-01-01", null),
    P("a1", "A", 1, "2021-01-01", null),
  ];
  // A first (dates 2019,2021 → a2,a1), then B (2018,2020 → b1,b2).
  assert.deepEqual(sortPages(rows, "date", "asc", order).map((r) => r.id), [
    "a2",
    "a1",
    "b1",
    "b2",
  ]);
});

test("sortPages descending reverses within a logbook but keeps un-dated pages last", () => {
  const rows = [
    P("a1", "A", 1, "2019-01-01", null),
    P("a2", "A", 2, "2021-01-01", null),
    P("a3", "A", 3, null, null), // not extracted
  ];
  assert.deepEqual(sortPages(rows, "date", "asc", order).map((r) => r.id), ["a1", "a2", "a3"]);
  assert.deepEqual(sortPages(rows, "date", "desc", order).map((r) => r.id), ["a2", "a1", "a3"]);
});

test("sortPages upload = page_sequence within logbook", () => {
  const rows = [
    P("a3", "A", 3, null, null),
    P("a1", "A", 1, null, null),
    P("a2", "A", 2, null, null),
  ];
  assert.deepEqual(sortPages(rows, "upload", "asc", order).map((r) => r.id), ["a1", "a2", "a3"]);
});

test("movedOrder moves within a logbook and respects bounds", () => {
  const rows = [
    P("a1", "A", 1, null, null),
    P("a2", "A", 2, null, null),
    P("a3", "A", 3, null, null),
    P("b1", "B", 1, null, null),
  ];
  assert.deepEqual(movedOrder(rows, "a2", -1), ["a2", "a1", "a3"]); // up
  assert.deepEqual(movedOrder(rows, "a2", 1), ["a1", "a3", "a2"]); // down
  assert.equal(movedOrder(rows, "a1", -1), null); // first can't go up
  assert.equal(movedOrder(rows, "a3", 1), null); // last can't go down
});

test("movedOrder never crosses logbooks", () => {
  const rows = [
    P("a1", "A", 1, null, null),
    P("b1", "B", 1, null, null),
    P("b2", "B", 2, null, null),
  ];
  assert.equal(movedOrder(rows, "b1", -1), null); // first in B
  assert.deepEqual(movedOrder(rows, "b2", -1), ["b2", "b1"]); // stays within B
});
