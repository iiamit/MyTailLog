import { test } from "node:test";
import assert from "node:assert/strict";
import { batchComplete, batchProgress, pageReadSummary, readingDoneCopy } from "../src/lib/extraction/queueRules";
import { allowanceSummary, accessAllowance } from "../src/lib/extraction/allowance";
import { findDuplicate, hamming64, register, duplicateDecision } from "../src/lib/writes/pages";
import { pickTachPhoto } from "../src/lib/writes/meters";
import type { Db } from "../src/lib/writes";

// The server reading queue (09 §3.9) and the phone upload path (05 §7.2).

const entry = (o: Record<string, unknown> = {}) => ({ entry_date: "2026-03-01", tach: 2100, hobbs: null, is_continuation: false, field_confidence: { tach: 0.95 }, ...o });

test("needs_look: low confidence, alternatives, fragments, rotated text and meters running backwards", () => {
  assert.equal(pageReadSummary([entry()], false).needs_look, false);
  assert.equal(pageReadSummary([entry({ field_confidence: { tach: 0.6 } })], false).needs_look, true);
  assert.equal(pageReadSummary([entry({ field_confidence: { tach: { value: 2100, alt: [2108] } } })], false).needs_look, true);
  assert.equal(pageReadSummary([entry({ is_continuation: true })], false).needs_look, true);
  assert.equal(pageReadSummary([entry()], true).needs_look, true);
  assert.equal(pageReadSummary([entry(), entry({ entry_date: "2026-04-01", tach: 2099.8 })], false).needs_look, true);
  assert.equal(pageReadSummary([entry(), entry({ entry_date: "2026-04-01", tach: 2099.95 })], false).needs_look, false, "0.1 h of slack");
  assert.equal(pageReadSummary([entry({ entry_date: "2027-01-01" })], false, "2026-11-18").needs_look, true);
});

test("landing_date is the earliest entry date on the page", () => {
  assert.equal(pageReadSummary([entry({ entry_date: "2026-05-02" }), entry({ entry_date: "2026-03-01" }), entry({ entry_date: null })], false).landing_date, "2026-03-01");
  assert.equal(pageReadSummary([], false).landing_date, null);
});

test("batch progress counts each state; complete only when every expected page is read or failed", () => {
  const pages = [
    { extraction_status: "extracted", needs_look: true, duplicate_of_page_id: null },
    { extraction_status: "extracted", needs_look: false, duplicate_of_page_id: null },
    { extraction_status: "waiting_allowance", needs_look: null, duplicate_of_page_id: null },
    { extraction_status: "queued", needs_look: null, duplicate_of_page_id: "p0" },
  ] as const;
  assert.deepEqual(batchProgress([...pages], 6), {
    expected: 6, uploaded: 4, queued: 1, reading: 0, waitingAllowance: 1, read: 2, failed: 0, needsLook: 1, waitingDecision: 1,
  });
  assert.equal(batchComplete([...pages], 4), false);
  const done = [{ extraction_status: "extracted" }, { extraction_status: "failed" }] as { extraction_status: "extracted" | "failed"; needs_look: null; duplicate_of_page_id: null }[];
  assert.equal(batchComplete(done, 2), true);
  assert.equal(batchComplete(done, 3), false, "a page still on its way keeps the batch open");
});

test("reading-done copy (12 §8)", () => {
  assert.deepEqual(readingDoneCopy(1, 1), { title: "1 page read", body: "1 entry is ready to review. They don't count until you confirm them." });
  assert.equal(readingDoneCopy(34, 112).title, "34 pages read");
});

test("allowance: rolling 24 hours, pages approximated, next free when the oldest call ages out", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  const at = (h: number) => ({ created_at: new Date(now - h * 3_600_000).toISOString() });
  const a = allowanceSummary([at(25), at(20), at(2), at(1)], false, false, now);
  assert.equal(a.usedCalls, 3);
  assert.equal(a.pagesUsedApprox, 2);
  assert.equal(a.pagesCapApprox, Math.floor(a.capCalls / 2));
  assert.equal(a.nextFreeAt, new Date(now + 4 * 3_600_000).toISOString());
  assert.equal(allowanceSummary([], false, false, now).nextFreeAt, null);
  assert.equal(accessAllowance(a).pagesLeftApprox, a.pagesCapApprox - 2);
});

test("duplicate pages: dHash distance of 6 bits or fewer", () => {
  assert.equal(hamming64("ffffffffffffffff", "fffffffffffffff0"), 4);
  assert.equal(hamming64("0000000000000000", "ffffffffffffffff"), 64);
  const pages = [{ id: "far", image_phash: "00000000000000ff" }, { id: "near", image_phash: "000000000000000f" }, { id: "none", image_phash: null }];
  assert.equal(findDuplicate("0000000000000003", pages)?.id, "near");
  assert.equal(findDuplicate("ffff000000000000", pages), null);
});

test("tach photo: source and OCR fields only for tach_photo, photo path pinned to the reading", () => {
  assert.deepEqual(pickTachPhoto({ id: "r1" }, "ac"), {});
  const ok = pickTachPhoto({ id: "r1", source: "tach_photo", ocrValue: 2212.4, ocrConfidence: 0.91, ownerEdited: true, photoPath: "ac/meters/r1.jpg" }, "ac");
  assert.ok(!("error" in ok));
  assert.equal(ok.source, "tach_photo");
  assert.equal(ok.owner_edited, true);
  assert.ok("error" in pickTachPhoto({ id: "r1", source: "tach_photo", photoPath: "other/meters/r1.jpg" }, "ac"));
  assert.ok("error" in pickTachPhoto({ id: "r1", source: "tach_photo", ocrConfidence: 3 }, "ac"));
});

// A stand-in that records writes; can_edit_aircraft answers `editor`.
function fake(editor: boolean, page: Record<string, unknown> | null = null) {
  const writes: { table: string; op: string; patch?: unknown }[] = [];
  const from = (table: string) => {
    let op = "select";
    let patch: unknown;
    const run = async () => {
      if (op !== "select") writes.push({ table, op, patch });
      return { data: table === "page" ? page : null, error: null };
    };
    const q = {
      select: () => q, eq: () => q, in: () => q,
      update: (p: unknown) => ((op = "update"), (patch = p), q),
      delete: () => ((op = "delete"), q),
      maybeSingle: run, then: (res: (v: unknown) => unknown) => run().then(res),
    };
    return q;
  };
  return { db: { from, rpc: async () => ({ data: editor }) } as unknown as Db, writes };
}
const ctx = { aircraftId: "ac", userId: "u" };
const uuid = "11111111-1111-4111-8111-111111111111";
const book = "22222222-2222-4222-8222-222222222222";

test("page.register: viewers refused; the storage path must be the page's own", async () => {
  const viewer = await register(fake(false).db, ctx, { id: uuid, logbookId: book, storagePath: `ac/${book}/${uuid}.jpg` });
  assert.equal(viewer.status === "error" && viewer.httpStatus, 403);
  const elsewhere = await register(fake(true).db, ctx, { id: uuid, logbookId: book, storagePath: `other/${book}/${uuid}.jpg` });
  assert.equal(elsewhere.status === "error" && elsewhere.httpStatus, 400);
});

test("page.duplicateDecision: keep both clears the question; a retried skip of a gone page is ok", async () => {
  const { db, writes } = fake(true, { id: "p", batch_id: null, duplicate_of_page_id: "p0" });
  assert.equal((await duplicateDecision(db, ctx, { pageId: "p", decision: "keep_both" })).status, "ok");
  assert.deepEqual(writes[0], { table: "page", op: "update", patch: { duplicate_of_page_id: null } });
  assert.equal((await duplicateDecision(fake(true, null).db, ctx, { pageId: "p", decision: "skip" })).status, "ok");
  assert.equal((await duplicateDecision(fake(false, null).db, ctx, { pageId: "p", decision: "skip" })).status, "error");
});
