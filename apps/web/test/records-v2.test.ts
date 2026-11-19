import { test } from "node:test";
import assert from "node:assert/strict";
import { deletePageQuestion, gapTitle, readingReason, settledWord, splitGaps } from "../src/lib/v2/records";

test("gaps split into open findings and settled ones; filled gaps drop out", () => {
  const g = (id: string, status: string) => ({ id, status });
  const { open, settled } = splitGaps([g("a", "open"), g("b", "no_pages_exist"), g("c", "asked_previous_owner"), g("d", "dismissed"), g("e", "filled")]);
  assert.deepEqual(open.map((x) => x.id), ["a"]);
  assert.deepEqual(settled.map((x) => x.id), ["b", "c", "d"]);
  assert.equal(settledWord("asked_previous_owner"), "You noted: asked the previous owner.");
  assert.equal(settledWord("open"), "");
});

test("finding words", () => {
  assert.equal(gapTitle("Airframe", "1983-02-01", "1991-06-30"), "No airframe pages for 1983 to 1991");
  assert.equal(gapTitle("Engine", "1987-01-01", "1987-12-01"), "No engine pages for 1987");
  assert.equal(readingReason("duplicate", "hobbs", "mfb"), "MyFlightBook · hobbs is the same value as tach");
  assert.equal(readingReason("non_monotonic", "tach", "entry"), "lower than an earlier reading");
  assert.equal(deletePageQuestion("Engine p. 23", 3, 0), "Delete Engine p. 23? Its 3 entries go with it, none confirmed. This can't be undone.");
  assert.equal(deletePageQuestion("Engine p. 23", 1, 1), "Delete Engine p. 23? Its 1 entry goes with it, 1 of them confirmed by you. This can't be undone.");
  assert.equal(deletePageQuestion("Engine p. 23", 0, 0), "Delete Engine p. 23? It has no entries. This can't be undone.");
});
