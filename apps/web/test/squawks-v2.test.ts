import { test } from "node:test";
import assert from "node:assert/strict";
import { intervalLabel, keywords, relatedEntries, sortOpen } from "../src/lib/v2/squawks";

test("open squawks sort Ground, Watch, Low, then newest", () => {
  const rows = [
    { id: "a", severity: "low" as const, reported_at: "2026-03-01" },
    { id: "b", severity: "high" as const, reported_at: "2026-01-01" },
    { id: "c", severity: "low" as const, reported_at: "2026-05-01" },
    { id: "d", severity: "medium" as const, reported_at: "2026-02-01" },
  ];
  assert.deepEqual(sortOpen(rows).map((r) => r.id), ["b", "d", "c", "a"]);
});

test("related entries share a significant word, newest first", () => {
  assert.deepEqual(keywords("Left brake feels soft on taxi"), ["brake"]);
  const entries = [
    { id: "1", description: "Replaced left brake linings", work_performed: null, entry_date: "2019-04-02" },
    { id: "2", description: "Annual inspection, left mag checked", work_performed: null, entry_date: "2024-07-01" },
    { id: "3", description: null, work_performed: "Bled brakes, serviced master cylinder", entry_date: "2023-02-11" },
    { id: "4", description: "brake", work_performed: null, entry_date: null },
  ];
  assert.deepEqual(relatedEntries("Left brake feels soft on taxi", entries).map((e) => e.id), ["3", "1"]);
  assert.deepEqual(relatedEntries("Left feels soft", entries), [], "only stop words: nothing related");
});

test("intervals read in years, months under a year", () => {
  assert.equal(intervalLabel("2019-04-02", "2021-06-15"), "2.2 years");
  assert.equal(intervalLabel("2024-01-01", "2024-04-01"), "3 months");
});
