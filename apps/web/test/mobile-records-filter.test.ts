import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHistory } from "../../mobile/src/history";
import { filterHistory, isFiltering, matchesQuery, yearsOf, NO_FILTER } from "../../mobile/src/records-filter";

// The History segment's filters. Tested here because apps/mobile has no runner.
// Worth covering: a filter that quietly drops the entry someone is looking for
// is indistinguishable from a logbook that never recorded it.

const E = (o: Record<string, unknown>) =>
  ({
    id: "e",
    entry_date: "2026-07-05",
    hobbs: null,
    tach: null,
    description: "",
    work_performed: "",
    parts: null,
    signature_name: null,
    page_id: null,
    ...o,
  }) as never;

const list = buildHistory([
  E({ id: "a", entry_date: "2026-07-05", tach: 4141.6, description: "Change oil and filter", work_performed: "Serviced with 7 qt Phillips 66 20W-50", signature_name: "R. Hall" }),
  E({ id: "b", entry_date: "2025-03-11", tach: 4000.1, description: "Annual inspection of airframe" }),
  E({ id: "c", entry_date: "2025-09-02", tach: 4080.0, description: "Transponder and pitot-static test" }),
  E({ id: "d", entry_date: null, tach: null, description: "Replaced nav light bulb" }),
]);

test("no filter keeps everything, and knows it is filtering nothing", () => {
  assert.equal(isFiltering(NO_FILTER), false);
  assert.equal(filterHistory(list, NO_FILTER).length, list.length);
});

test("category narrows to the work someone is looking for", () => {
  const oil = filterHistory(list, { ...NO_FILTER, category: "oil" });
  assert.deepEqual(oil.map((h) => h.id), ["a"]);
  assert.equal(filterHistory(list, { ...NO_FILTER, category: "inspection" }).length, 1);
});

test("year filters on the entry date, and an undated entry is in no year", () => {
  const y2025 = filterHistory(list, { ...NO_FILTER, year: "2025" });
  assert.deepEqual(y2025.map((h) => h.id).sort(), ["b", "c"]);
  assert.equal(filterHistory(list, { ...NO_FILTER, year: "2026" }).length, 1);
  assert.deepEqual(yearsOf(list), ["2026", "2025"], "newest year first, undated contributes none");
});

test("search reads the ORIGINAL logbook text, not only our summary", () => {
  // "Phillips 66" is in work_performed and nowhere in the written title — the
  // whole reason someone searches is to find the words on the page.
  const hit = filterHistory(list, { ...NO_FILTER, query: "phillips" });
  assert.deepEqual(hit.map((h) => h.id), ["a"]);
  assert.deepEqual(filterHistory(list, { ...NO_FILTER, query: "hall" }).map((h) => h.id), ["a"]);
});

test("every term must match, so a second word narrows", () => {
  const both = filterHistory(list, { ...NO_FILTER, query: "oil filter" });
  assert.equal(both.length, 1);
  assert.equal(filterHistory(list, { ...NO_FILTER, query: "oil transponder" }).length, 0);
  assert.equal(matchesQuery(list[0], "   "), true, "whitespace is not a query");
});

test("filters compose — category AND year AND text", () => {
  const out = filterHistory(list, { category: "avionics", year: "2025", query: "pitot" });
  assert.deepEqual(out.map((h) => h.id), ["c"]);
  assert.equal(filterHistory(list, { category: "avionics", year: "2026", query: "pitot" }).length, 0);
});
