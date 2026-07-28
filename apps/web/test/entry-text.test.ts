import { test } from "node:test";
import assert from "node:assert/strict";
import { entryText } from "../src/lib/extraction/entryText";

test("entryText: joins all three fields with an em-dash separator", () => {
  assert.equal(
    entryText({ description: "Annual", work_performed: "Inspected", parts: "oil filter" }),
    "Annual — Inspected — oil filter",
  );
});

test("entryText: null fields are dropped", () => {
  assert.equal(
    entryText({ description: "Annual", work_performed: null, parts: "oil filter" }),
    "Annual — oil filter",
  );
});

test("entryText: all-null yields empty string", () => {
  assert.equal(entryText({ description: null, work_performed: null, parts: null }), "");
});

test("entryText: fields are trimmed", () => {
  assert.equal(
    entryText({ description: "  Annual  ", work_performed: null, parts: null }),
    "Annual",
  );
});

test("entryText: whitespace-only fields are treated as empty and dropped", () => {
  assert.equal(
    entryText({ description: "   ", work_performed: "Inspected", parts: null }),
    "Inspected",
  );
});

test("entryText: a single field yields no separator", () => {
  assert.equal(entryText({ description: null, work_performed: "Ground run", parts: null }), "Ground run");
});
