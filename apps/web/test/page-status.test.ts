import { test } from "node:test";
import assert from "node:assert/strict";
import { pageNeedsReview, applyExtraction, pageMeter } from "../src/lib/pageStatus";

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

// Which meter a page row shows. An airframe logbook is kept in airframe total
// time; tach is the ENGINE's counter and resets when an engine is replaced, so
// the two must not be shown interchangeably.

test("an airframe page shows AFTT, not the engine's tach", () => {
  assert.deepEqual(
    pageMeter({ logbookType: "airframe", airframe: 4310.2, tach: 812.4, hobbs: 900 }),
    { value: 4310.2, label: "AFTT" },
  );
});

test("every other logbook still shows tach", () => {
  assert.deepEqual(
    pageMeter({ logbookType: "engine", airframe: 4310.2, tach: 812.4, hobbs: 900 }),
    { value: 812.4, label: "tach" },
  );
});

test("an airframe page with no separate AFTT shows its tach as the AFTT", () => {
  // Most airframe books never write an airframe total: the tach is the
  // instrument the total is kept in, and it does not restart when an engine is
  // changed, so the reading IS the page's total time.
  assert.deepEqual(
    pageMeter({ logbookType: "airframe", airframe: null, tach: 4310.2, hobbs: null }),
    { value: 4310.2, label: "AFTT" },
  );
});

test("a separately recorded airframe total wins over the tach", () => {
  assert.deepEqual(
    pageMeter({ logbookType: "airframe", airframe: 4310.2, tach: 4309.8, hobbs: null }),
    { value: 4310.2, label: "AFTT" },
  );
});

test("the AFTT label stays out of other logbooks", () => {
  // Only the airframe book is kept in airframe time; an engine book means tach.
  assert.deepEqual(
    pageMeter({ logbookType: "engine", airframe: null, tach: 812.4, hobbs: null }),
    { value: 812.4, label: "tach" },
  );
});

test("hobbs is the last resort", () => {
  assert.deepEqual(
    pageMeter({ logbookType: "prop", airframe: null, tach: null, hobbs: 965.1 }),
    { value: 965.1, label: "hobbs" },
  );
});

test("a page with no hours at all shows nothing", () => {
  assert.equal(pageMeter({ logbookType: "airframe", airframe: null, tach: null, hobbs: null }), null);
});
