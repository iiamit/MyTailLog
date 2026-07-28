import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceChanges, type ChangeRow } from "@mytaillog/shared";

const R = (seq: number, table: string, id: string, op: "I" | "U" | "D"): ChangeRow => ({
  seq,
  table_name: table,
  row_id: id,
  op,
});

test("reduceChanges: insert then update collapses to one upsert at the latest seq", () => {
  const out = reduceChanges([R(1, "page", "p1", "I"), R(3, "page", "p1", "U")]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { table: "page", id: "p1", op: "upsert", seq: 3 });
});

test("reduceChanges: insert then delete collapses to a single delete", () => {
  const out = reduceChanges([R(1, "log_entry", "e1", "I"), R(2, "log_entry", "e1", "D")]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { table: "log_entry", id: "e1", op: "delete", seq: 2 });
});

test("reduceChanges: distinct records are all kept, ordered by seq", () => {
  const out = reduceChanges([
    R(5, "page", "p2", "U"),
    R(2, "logbook", "l1", "I"),
    R(9, "document", "d1", "I"),
  ]);
  assert.deepEqual(
    out.map((c) => `${c.table}:${c.id}`),
    ["logbook:l1", "page:p2", "document:d1"], // seq 2, 5, 9
  );
});

test("reduceChanges: same id across different tables is not merged", () => {
  const out = reduceChanges([R(1, "page", "x", "I"), R(2, "document", "x", "I")]);
  assert.equal(out.length, 2);
});

test("reduceChanges: empty in → empty out", () => {
  assert.deepEqual(reduceChanges([]), []);
});
