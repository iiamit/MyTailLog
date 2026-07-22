import { test } from "node:test";
import assert from "node:assert/strict";
import { logbookLabel, LOGBOOK_TYPES, LOGBOOK_LABEL } from "../src/lib/logbooks";

test("logbookLabel: known types map to their display label", () => {
  assert.equal(logbookLabel("airframe"), "Airframe");
  assert.equal(logbookLabel("engine"), "Engine");
  assert.equal(logbookLabel("prop"), "Propeller");
  assert.equal(logbookLabel("avionics"), "Avionics");
  assert.equal(logbookLabel("other"), "Other");
});

test("logbookLabel: a provided title overrides the type label", () => {
  assert.equal(logbookLabel("engine", "Left Engine"), "Left Engine");
});

test("logbookLabel: null title falls through to the type label", () => {
  assert.equal(logbookLabel("prop", null), "Propeller");
});

test("logbookLabel: an unknown type with no title passes the type through", () => {
  assert.equal(logbookLabel("mystery"), "mystery");
});

test("logbookLabel: an empty-string title is returned as-is (?? only guards null)", () => {
  assert.equal(logbookLabel("engine", ""), "");
});

test("LOGBOOK_TYPES: the five standard books in display order", () => {
  assert.deepEqual(LOGBOOK_TYPES, ["airframe", "engine", "prop", "avionics", "other"]);
});

test("LOGBOOK_LABEL: covers every type", () => {
  for (const t of LOGBOOK_TYPES) assert.ok(LOGBOOK_LABEL[t], `${t} has a label`);
});
