import { test } from "node:test";
import assert from "node:assert/strict";
import { changeStatements } from "../../mobile/src/sync-apply";

// The offline client's apply path, tested here because apps/mobile has no runner
// of its own. Only the statement building is covered — executing them needs a
// device — but that is where the cascade rule lives, and a silently-wrong rule
// leaves deleted aircraft on the phone, which is exactly what was reported.

const upsert = (table: string, id: string, row: Record<string, unknown>) =>
  ({ table, op: "upsert" as const, id, seq: 1, row });
const del = (table: string, id: string) => ({ table, op: "delete" as const, id, seq: 2 });

test("an upsert replaces the row", () => {
  const [s] = changeStatements([upsert("page", "p1", { id: "p1", aircraft_id: "a1" })]);
  assert.match(s.statement, /INSERT OR REPLACE INTO records/);
  assert.deepEqual(s.values.slice(0, 2), ["page", "p1"]);
});

test("deleting a child row removes only that row", () => {
  const set = changeStatements([del("page", "p1")]);
  assert.equal(set.length, 1, "a child delete must not cascade");
  assert.match(set[0].statement, /DELETE FROM records WHERE table_name=\? AND id=\?/);
});

test("deleting an aircraft also purges its children", () => {
  // The server cascade's own change rows are announced against an aircraft the
  // policy can no longer resolve, so they never arrive. Without a local cascade
  // the pages and entries of a deleted aircraft sit in SQLite forever.
  const set = changeStatements([del("aircraft", "a1")]);
  assert.equal(set.length, 2);
  assert.match(set[1].statement, /json_extract\(data,'\$\.aircraft_id'\) = \?/);
  assert.deepEqual(set[1].values, ["a1"]);
});

test("the cascade purges only the deleted aircraft's children", () => {
  const set = changeStatements([del("aircraft", "a1")]);
  // Parameterised, not interpolated — the id reaches SQLite as a bound value.
  assert.ok(!set[1].statement.includes("a1"), "the id must be bound, not inlined");
  assert.deepEqual(set[1].values, ["a1"]);
});

test("a batch keeps its order so an upsert after a delete survives", () => {
  const set = changeStatements([del("aircraft", "a1"), upsert("aircraft", "a2", { id: "a2" })]);
  assert.equal(set.length, 3);
  assert.match(set[2].statement, /INSERT OR REPLACE/);
});
