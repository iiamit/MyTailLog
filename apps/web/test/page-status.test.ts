import { test } from "node:test";
import assert from "node:assert/strict";
import { pageNeedsReview, applyExtraction } from "../src/lib/pageStatus";

// The pages list badge. Reported from the field: "If I try to extract a single
// log from the pages, it automatically extracts and marks it as reviewed."
//
// Nothing server-side ever marked it reviewed — the row's own state went stale.

const pending = { extractionStatus: "pending", entryCount: 0, unconfirmedCount: 0 };

test("a freshly extracted page with entries needs review — the reported bug", () => {
  // Before the fix the patch carried entryCount but not unconfirmedCount. That
  // count is 0 on an unextracted page, so it stayed 0 while extractionStatus
  // flipped to "extracted", and the row rendered "✓ reviewed" immediately.
  const after = applyExtraction(pending, { entryCount: 4, unconfirmedCount: 4 });
  assert.equal(after.unconfirmedCount, 4, "the count must come from the server response");
  assert.equal(pageNeedsReview(after), true, "an unconfirmed entry means it needs review");
});

test("dropping unconfirmedCount is exactly what produced the false badge", () => {
  // The old patch, reproduced: everything except the count that drives the rule.
  const stale = { ...pending, extractionStatus: "extracted", entryCount: 4 };
  assert.equal(pageNeedsReview(stale), false, "this is the bug — 4 entries, reads as reviewed");
});

test("a page that extracts to no entries is genuinely reviewed", () => {
  // Covers, certificates and blanks produce nothing to review. They should read
  // "reviewed" and stay there — this is by design, not the bug above.
  const after = applyExtraction(pending, { entryCount: 0, unconfirmedCount: 0 });
  assert.equal(pageNeedsReview(after), false);
});

test("re-extracting a page whose entries were all confirmed leaves it reviewed", () => {
  // Re-extraction keeps confirmed entries and replaces only unconfirmed ones,
  // so a fully-confirmed page comes back with entries but nothing outstanding.
  const confirmed = { extractionStatus: "extracted", entryCount: 3, unconfirmedCount: 0 };
  const after = applyExtraction(confirmed, { entryCount: 3, unconfirmedCount: 0 });
  assert.equal(pageNeedsReview(after), false);
});

test("re-extraction reports the page total, not just the new rows", () => {
  // Two entries survived confirmation, two were re-read: 4 on the page, 2 to review.
  const after = applyExtraction(
    { extractionStatus: "extracted", entryCount: 2, unconfirmedCount: 0 },
    { entryCount: 4, unconfirmedCount: 2 },
  );
  assert.equal(after.entryCount, 4);
  assert.equal(pageNeedsReview(after), true);
});

test("an unextracted page never needs review, whatever its counts say", () => {
  assert.equal(pageNeedsReview({ ...pending, unconfirmedCount: 9 }), false);
});

test("a missing count is treated as zero rather than NaN", () => {
  const after = applyExtraction(pending, {});
  assert.equal(after.unconfirmedCount, 0);
  assert.equal(after.entryCount, 0);
});
