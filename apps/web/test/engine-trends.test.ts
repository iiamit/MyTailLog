import assert from "node:assert/strict";
import test from "node:test";
import { engineTrends, isOilChange, parseCompression, type TrendEntry } from "../src/lib/engineTrends";

test("compression parser accepts cylinder labels and shared-reference sequences", () => {
  assert.deepEqual(parseCompression("Differential compression: Cylinder #1: 76/80, Cyl 2 74/80"), [
    { cylinder: 1, psi: 76, reference: 80 }, { cylinder: 2, psi: 74, reference: 80 },
  ]);
  assert.deepEqual(parseCompression("Compressions 76/78/75/77 over 80"), [
    { cylinder: 1, psi: 76, reference: 80 }, { cylinder: 2, psi: 78, reference: 80 },
    { cylinder: 3, psi: 75, reference: 80 }, { cylinder: 4, psi: 77, reference: 80 },
  ]);
  assert.deepEqual(parseCompression("Compression satisfactory. See attached sheet."), []);
  assert.deepEqual(parseCompression("Compression cyl 1 81/80"), []);
});

test("oil intervals use like meters and stop at a meter reset", () => {
  const entry = (id: string, date: string, hobbs: number, description: string): TrendEntry => ({
    id, page_id: id, entry_date: date, hobbs, tach: null, description,
    work_performed: null, parts: null, owner_confirmed: true,
  });
  assert.equal(isOilChange("Replaced oil filter"), false);
  const entries = [
    entry("1", "2023-01-01", 100, "Changed oil and filter"),
    entry("2", "2023-03-01", 149.5, "Oil service"),
    entry("3", "2023-05-01", 20, "Changed engine oil"),
    { ...entry("4", "2023-06-01", 70, "Oil change"), owner_confirmed: false },
  ];
  const trend = engineTrends(entries, [{ meter: "hobbs", reset_date: "2023-04-01" }]);
  assert.equal(trend.oilChanges.length, 4);
  assert.deepEqual(trend.oilIntervals.map((i) => i.hours), [49.5]);
});

test("unparseable compression remains visible for review; superseded entries disappear", () => {
  const entry: TrendEntry = {
    id: "a", page_id: "p", entry_date: "2020-01-01", hobbs: null, tach: null,
    description: "Compression checked; see worksheet", work_performed: null,
    parts: null, owner_confirmed: true,
  };
  assert.equal(engineTrends([entry]).needsReview.length, 1);
  assert.equal(engineTrends([{ ...entry, authored_superseded_by: "b" }]).needsReview.length, 0);
});
