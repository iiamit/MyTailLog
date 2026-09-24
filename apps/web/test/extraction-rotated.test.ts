import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from "../src/lib/extraction/schema";

// The explicit flag still matters when the model sees writing it cannot read;
// the coverage check in extraction-orientation.test.ts also catches cases where
// the model quietly sets this flag false.

test("the schema REQUIRES the flag, so the model can't quietly omit it", () => {
  const props = EXTRACTION_JSON_SCHEMA.properties as Record<string, unknown>;
  assert.ok("unread_rotated_content" in props, "flag must be in the page schema");
  assert.ok(
    (EXTRACTION_JSON_SCHEMA.required as string[]).includes("unread_rotated_content"),
    "flag must be required — an optional flag would default to a silent false",
  );
});

test("the prompt asks for every orientation without forcing a second event", () => {
  const p = EXTRACTION_SYSTEM_PROMPT.toLowerCase();
  assert.ok(p.includes("rotated 90"), "must name the actual failure: 90° rotation");
  assert.ok(p.includes("same dated maintenance event"), "certification may belong to the same work");
  assert.ok(
    p.includes("unread_rotated_content"),
    "must tell the model how to report content missing from structured entries",
  );
});
