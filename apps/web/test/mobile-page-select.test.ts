import { test } from "node:test";
import assert from "node:assert/strict";
import { movedOrder, sortPages } from "../src/lib/pageSort";
import {
  deleteWarning,
  entriesOnPages,
  toSortable,
  toggleSelection,
  type EntryLike,
  type PageLike,
} from "../../mobile/src/page-select";

// Page management on the phone. Tested here because apps/mobile has no runner.
// The delete warning in particular: #185 shipped a bulk delete that took log
// entries with it and never said so.

const pages: PageLike[] = [
  { id: "p1", logbook_id: "lb", page_sequence: 1 },
  { id: "p2", logbook_id: "lb", page_sequence: 2 },
  { id: "p3", logbook_id: "other", page_sequence: 1 },
];

const entries: EntryLike[] = [
  { page_id: "p1", entry_date: "2026-01-04", tach: 4100 },
  { page_id: "p1", entry_date: "2026-03-09", tach: 4141.6 },
  { page_id: "p2", entry_date: "2025-11-02", tach: 4050 },
  { page_id: null, entry_date: "2026-05-01", tach: 4200 },
];

test("toSortable takes the LATEST date and HIGHEST tach off each page", () => {
  // A page is written top to bottom and filed when it's full, so the last thing
  // on it is what places it in the book.
  const out = toSortable(pages, entries);
  const p1 = out.find((p) => p.id === "p1")!;
  assert.equal(p1.latestDate, "2026-03-09");
  assert.equal(p1.tach, 4141.6);
  assert.equal(p1.logbookId, "lb");
  const p3 = out.find((p) => p.id === "p3")!;
  assert.equal(p3.latestDate, null, "a page with no entries carries no date");
  assert.equal(p3.tach, null);
});

test("toSortable output sorts and reorders with the SAME functions the web uses", () => {
  const sortable = toSortable(pages, entries);
  // p2's only entry is older than p1's latest, so by date p2 comes first.
  const byDate = sortPages(sortable, "date", "asc", new Map([["lb", 0], ["other", 1]]));
  assert.deepEqual(byDate.map((p) => p.id), ["p2", "p1", "p3"]);
  // The un-extracted page never jumps the queue when descending.
  const desc = sortPages(sortable, "date", "desc", new Map([["lb", 0], ["other", 1]]));
  assert.deepEqual(desc.map((p) => p.id), ["p1", "p2", "p3"]);
  // Moving stays inside the logbook.
  assert.deepEqual(movedOrder(sortable, "p2", -1), ["p2", "p1"]);
  assert.equal(movedOrder(sortable, "p1", -1), null, "already first");
});

test("toggleSelection adds then removes, and keeps the order of the rest", () => {
  assert.deepEqual(toggleSelection([], "p1"), ["p1"]);
  assert.deepEqual(toggleSelection(["p1", "p2"], "p1"), ["p2"]);
  assert.deepEqual(toggleSelection(["p1"], "p2"), ["p1", "p2"]);
});

test("entriesOnPages counts only entries actually read off the chosen pages", () => {
  assert.equal(entriesOnPages(entries, ["p1"]), 2);
  assert.equal(entriesOnPages(entries, ["p1", "p2"]), 3);
  assert.equal(entriesOnPages(entries, ["p3"]), 0, "an entry with no page is nobody's");
});

test("the delete warning names the log entries that go with the scans", () => {
  const w = deleteWarning(2, 3);
  assert.match(w, /2 scans/);
  assert.match(w, /3 log entries/, "the entry count is the whole point of the warning");
  assert.match(w, /can't be undone/i);
  // Singulars read as English, not as "1 scans".
  assert.match(deleteWarning(1, 1), /1 scan\b/);
  assert.match(deleteWarning(1, 1), /1 log entry\b/);
});

test("nothing extracted yet says so rather than claiming zero entries are lost", () => {
  const w = deleteWarning(1, 0);
  assert.doesNotMatch(w, /0 log entries/);
  assert.match(w, /Nothing has been read off it/);
});
