import { test } from "node:test";
import assert from "node:assert/strict";
import { cmpKey, sortPages, movedOrder, type SortablePage, displayedOrder } from "../src/lib/pageSort";

const P = (
  id: string,
  logbookId: string,
  pageSequence: number | null,
  latestDate: string | null,
  tach: number | null,
  airframe: number | null = null,
): SortablePage => ({ id, logbookId, pageSequence, latestDate, tach, airframe });

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

// --- Persisting the displayed order ----------------------------------------
// The realistic mess: the second prop book was uploaded before the first, so
// upload order is exactly backwards. Sorting by entry date already displays it
// right; displayedOrder() is what makes that the STORED order in one step,
// rather than fifty move-one-step nudges.

const DP = (
  id: string,
  logbookId: string,
  pageSequence: number | null,
  latestDate: string | null = null,
  tach: number | null = null,
  airframe: number | null = null,
) => ({ id, logbookId, pageSequence, latestDate, tach, airframe });

test("displayedOrder: entry-date order becomes the stored order", () => {
  const rows = [
    DP("b1", "prop", 1, "2019-06-01"), // uploaded first, but the LATER book
    DP("b2", "prop", 2, "2020-07-01"),
    DP("a1", "prop", 3, "2011-03-01"), // the earlier book, uploaded second
    DP("a2", "prop", 4, "2012-04-01"),
  ];
  assert.deepEqual(displayedOrder(rows, "prop", "date", "asc"), ["a1", "a2", "b1", "b2"]);
});

test("displayedOrder: refuses when some pages lack the sort key", () => {
  // An un-extracted page has no date. Sorting dumps it at the end; persisting
  // that would renumber a logbook off the back of a value we don't have.
  const rows = [DP("x", "prop", 1, "2019-06-01"), DP("y", "prop", 2, null)];
  assert.equal(displayedOrder(rows, "prop", "date", "asc"), null);
  // Upload order is always known, so it stays available.
  assert.deepEqual(displayedOrder(rows, "prop", "upload", "asc"), ["x", "y"]);
});

test("displayedOrder: never crosses logbooks, and needs at least two pages", () => {
  const rows = [DP("p1", "prop", 1, "2019-06-01"), DP("e1", "engine", 1, "2011-01-01")];
  assert.equal(displayedOrder(rows, "prop", "date", "asc"), null, "one page = nothing to order");
  assert.deepEqual(
    displayedOrder([...rows, DP("p2", "prop", 2, "2015-01-01")], "prop", "date", "asc"),
    ["p2", "p1"],
    "engine's page must not appear in prop's order",
  );
});

test("displayedOrder: descending is honoured", () => {
  const rows = [DP("a", "prop", 1, "2011-01-01"), DP("b", "prop", 2, "2020-01-01")];
  assert.deepEqual(displayedOrder(rows, "prop", "date", "desc"), ["b", "a"]);
});

// AFTT (airframe total time). An airframe logbook is ordered by the airframe's
// own hours, not by the engine's tach — the two are unrelated counters, and a
// replaced engine resets tach while AFTT keeps climbing.

test("sortPages: airframe orders by AFTT, not tach", () => {
  // Tach order here is the REVERSE of AFTT order, so a sort that quietly fell
  // back to tach would produce the opposite list.
  const rows = [
    P("p1", "A", 1, null, 900, 4100),
    P("p2", "A", 2, null, 800, 4200),
    P("p3", "A", 3, null, 700, 4300),
  ];
  assert.deepEqual(
    sortPages(rows, "airframe", "asc", order).map((r) => r.id),
    ["p1", "p2", "p3"],
  );
  assert.deepEqual(
    sortPages(rows, "airframe", "desc", order).map((r) => r.id),
    ["p3", "p2", "p1"],
  );
});

test("sortPages: a page with no hours at all sorts last in both directions", () => {
  // "No AFTT" is not enough to be null now that tach stands in — it takes a page
  // with neither, i.e. one that was never extracted.
  const rows = [P("has", "A", 1, null, null, 4200), P("none", "A", 2, null, null, null)];
  assert.deepEqual(sortPages(rows, "airframe", "asc", order).map((r) => r.id), ["has", "none"]);
  assert.deepEqual(sortPages(rows, "airframe", "desc", order).map((r) => r.id), ["has", "none"]);
});

test("sortPages: AFTT still never reorders across logbooks", () => {
  const rows = [P("b", "B", 1, null, null, 100), P("a", "A", 1, null, null, 9000)];
  assert.deepEqual(sortPages(rows, "airframe", "asc", order).map((r) => r.id), ["a", "b"]);
});

test("displayedOrder: refuses to persist AFTT order when a page has no hours at all", () => {
  // Renumbering a logbook off a value some pages don't have stays refused — the
  // tach fallback just means fewer pages are missing one.
  const rows = [DP("x", "prop", 1, null, null, 4100), DP("y", "prop", 2, null, null, null)];
  assert.equal(displayedOrder(rows, "prop", "airframe", "asc"), null);
});

test("displayedOrder: AFTT order becomes the stored order when every page has one", () => {
  const rows = [DP("late", "prop", 1, null, null, 4300), DP("early", "prop", 2, null, null, 4100)];
  assert.deepEqual(displayedOrder(rows, "prop", "airframe", "asc"), ["early", "late"]);
});

test("sortPages: AFTT falls back to tach, so an ordinary airframe book still sorts", () => {
  // Most airframe books record no separate airframe total. Without the fallback
  // every page would be a null, sort to the bottom, and order nothing at all.
  const rows = [
    P("mid", "A", 1, null, 850, null),
    P("old", "A", 2, null, 700, null),
    P("new", "A", 3, null, 900, null),
  ];
  assert.deepEqual(
    sortPages(rows, "airframe", "asc", order).map((r) => r.id),
    ["old", "mid", "new"],
  );
});

test("sortPages: a recorded AFTT outranks the tach standing in for one", () => {
  // The page with a real airframe total must sort on THAT, not on its tach.
  const recorded = P("recorded", "A", 1, null, 100, 4300);
  const inferred = P("inferred", "A", 2, null, 4200, null);
  assert.deepEqual(
    sortPages([recorded, inferred], "airframe", "asc", order).map((r) => r.id),
    ["inferred", "recorded"],
  );
});

test("displayedOrder: AFTT order persists when tach stands in for every page", () => {
  const rows = [DP("late", "prop", 1, null, 900, null), DP("early", "prop", 2, null, 700, null)];
  assert.deepEqual(displayedOrder(rows, "prop", "airframe", "asc"), ["early", "late"]);
});
