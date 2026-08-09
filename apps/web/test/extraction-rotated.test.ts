import { test } from "node:test";
import assert from "node:assert/strict";
import { stillUnreadAfterRetry } from "../src/lib/extraction/extract";
import { EXTRACTION_JSON_SCHEMA, EXTRACTION_SYSTEM_PROMPT } from "../src/lib/extraction/schema";

// From the field: a page carried an upright sticker and one rotated 90°, and
// only the upright one was extracted. The rotated entry wasn't wrong, it was
// ABSENT — and an absent entry has no low-confidence field to catch the eye, so
// the owner had no way to know. These guard the two halves of the fix: telling
// the model to look, and keeping the warning when it still can't.

test("the warning is cleared only when the retry actually read something", () => {
  // Retry found entries and reports nothing outstanding → safe to clear.
  assert.equal(
    stillUnreadAfterRetry({ unread_rotated_content: false, entries: [{}] }),
    false,
  );
});

test("the warning SURVIVES a retry that returned nothing", () => {
  // The dangerous case: an empty retry must not be read as "all clear". If this
  // inverted, the page would look fully extracted while an entry was missing —
  // exactly the silent miss being fixed.
  assert.equal(
    stillUnreadAfterRetry({ unread_rotated_content: false, entries: [] }),
    true,
    "an empty retry is not evidence the page is clean",
  );
});

test("the warning survives a retry that still reports rotated content", () => {
  assert.equal(stillUnreadAfterRetry({ unread_rotated_content: true, entries: [{}] }), true);
  assert.equal(stillUnreadAfterRetry({ unread_rotated_content: true, entries: [] }), true);
});

test("the schema REQUIRES the flag, so the model can't quietly omit it", () => {
  const props = EXTRACTION_JSON_SCHEMA.properties as Record<string, unknown>;
  assert.ok("unread_rotated_content" in props, "flag must be in the page schema");
  assert.ok(
    (EXTRACTION_JSON_SCHEMA.required as string[]).includes("unread_rotated_content"),
    "flag must be required — an optional flag would default to a silent false",
  );
});

test("the prompt tells the model stickers are separate entries at any orientation", () => {
  const p = EXTRACTION_SYSTEM_PROMPT.toLowerCase();
  // The original prompt mentioned stickers only as content to MERGE into one
  // entry, and ordered entries "top-to-bottom" — which has no slot for a
  // sideways sticker. Both had to change.
  assert.ok(p.includes("rotated 90"), "must name the actual failure: 90° rotation");
  assert.ok(p.includes("own"), "must say a sticker is its own entry");
  assert.ok(
    p.includes("unread_rotated_content"),
    "must tell the model how to report content it could not read",
  );
});
