import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findEntryDuplicates,
  findPageDuplicates,
  filterEntryClusters,
  type DupEntry,
} from "../src/lib/duplicates";

const e = (o: Partial<DupEntry> & { id: string }): DupEntry => ({
  page_id: null,
  logbook_id: "L",
  entry_date: null,
  tach: null,
  hobbs: null,
  text: "",
  owner_confirmed: false,
  created_at: "2024-01-01T00:00:00Z",
  ...o,
});

test("findEntryDuplicates: identical entries at the same date+tach cluster, keeping the confirmed one", () => {
  const c = findEntryDuplicates([
    e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good", owner_confirmed: true, created_at: "t1" }),
    e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good", created_at: "t2" }),
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].ids.sort(), ["a", "b"]);
  assert.equal(c[0].keepId, "a");
});

test("findEntryDuplicates: with no confirmed member, keep the earliest captured", () => {
  const c = findEntryDuplicates([
    e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good", created_at: "2024-03-02T00:00:00Z" }),
    e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good", created_at: "2024-03-01T00:00:00Z" }),
  ]);
  assert.equal(c.length, 1);
  assert.equal(c[0].keepId, "b");
});

test("findEntryDuplicates: verbatim text on a DIFFERENT date is not a duplicate (recurring maintenance)", () => {
  assert.equal(
    findEntryDuplicates([
      e({ id: "a", entry_date: "2023-03-01", tach: 1100.0, text: "Oil change and filter, ground run good" }),
      e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good" }),
    ]).length,
    0,
  );
});

test("findEntryDuplicates: same date but a conflicting tach rules out a duplicate", () => {
  assert.equal(
    findEntryDuplicates([
      e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good" }),
      e({ id: "b", entry_date: "2024-03-01", tach: 1250.0, text: "Oil change and filter, ground run good" }),
    ]).length,
    0,
  );
});

test("findEntryDuplicates: same date+meter but different work text is not a duplicate", () => {
  assert.equal(
    findEntryDuplicates([
      e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "replaced left magneto" }),
      e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "annual inspection completed airworthy" }),
    ]).length,
    0,
  );
});

test("findEntryDuplicates: a shared meter anchor with no dates still clusters identical text", () => {
  const c = findEntryDuplicates([
    e({ id: "a", tach: 1200.5, text: "oil change and filter replaced ground run" }),
    e({ id: "b", tach: 1200.53, text: "oil change and filter replaced ground run" }), // within METER_EPS 0.05
  ]);
  assert.equal(c.length, 1);
});

test("findEntryDuplicates: contentless entries never cluster", () => {
  assert.equal(findEntryDuplicates([e({ id: "a" }), e({ id: "b" })]).length, 0);
});

test("findEntryDuplicates: entries in different logbooks never cluster", () => {
  assert.equal(
    findEntryDuplicates([
      e({ id: "a", logbook_id: "L1", entry_date: "2024-03-01", tach: 1200.5, text: "oil change and filter replaced" }),
      e({ id: "b", logbook_id: "L2", entry_date: "2024-03-01", tach: 1200.5, text: "oil change and filter replaced" }),
    ]).length,
    0,
  );
});

test("findPageDuplicates + filterEntryClusters: two pages of all-duplicate entries cluster, and the covered entry cluster is filtered out", () => {
  const entries = [
    e({ id: "a", page_id: "p1", entry_date: "2024-03-01", tach: 1200.5, text: "oil change and filter, ground run good", created_at: "t1" }),
    e({ id: "b", page_id: "p2", entry_date: "2024-03-01", tach: 1200.5, text: "oil change and filter, ground run good", created_at: "t2" }),
  ];
  const ec = findEntryDuplicates(entries);
  const pc = findPageDuplicates(
    [
      { id: "p1", logbook_id: "L", ocr_text: null, created_at: "t1", entryIds: ["a"] },
      { id: "p2", logbook_id: "L", ocr_text: null, created_at: "t2", entryIds: ["b"] },
    ],
    ec,
  );
  assert.equal(pc.length, 1);
  assert.equal(pc[0].keepId, "p1");
  const pageOf = new Map(entries.map((x) => [x.id, x.page_id]));
  assert.equal(filterEntryClusters(ec, pc, pageOf).length, 0);
});

test("findPageDuplicates: high OCR-text overlap alone clusters two pages", () => {
  const shared = "annual inspection complied with airworthiness directives serviced battery replaced filter";
  const pc = findPageDuplicates(
    [
      { id: "p1", logbook_id: "L", ocr_text: shared, created_at: "t1", entryIds: [] },
      { id: "p2", logbook_id: "L", ocr_text: shared, created_at: "t2", entryIds: [] },
    ],
    [],
  );
  assert.equal(pc.length, 1);
  assert.equal(pc[0].keepId, "p1");
});

test("filterEntryClusters: with no doomed pages the clusters pass through unchanged", () => {
  const ec = [{ ids: ["a", "b"], keepId: "a" }];
  assert.equal(filterEntryClusters(ec, [], new Map()), ec);
});
