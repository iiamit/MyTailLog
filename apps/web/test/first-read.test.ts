import { test } from "node:test";
import assert from "node:assert/strict";
import { firstRead } from "../src/lib/firstRead";
import type { MapInput } from "../src/lib/mapModel";

// 08 §3.7 C-BOOKS-06, 09 §4.7: first read of the airframe book.
const pages = Array.from({ length: 10 }, (_, i) => ({ id: `p${i + 1}`, logbook_id: "af", page_sequence: i + 1, extraction_status: "extracted" }));
const e = (id: string, page: string, date: string, description: string, trust: "confirmed" | "signed" | "ai_read" = "confirmed") =>
  ({ id, logbook_id: "af", page_id: page, entry_date: date, description, trust });
const input: MapInput = {
  aircraft: { id: "ac", tail_number: "N734DM", year: 1978 },
  logbook: [{ id: "af", type: "airframe" }, { id: "en", type: "engine" }],
  page: pages,
  ad_compliance: [{ id: "ad1", kind: "ad", reference: "AD 2015-19-07", recurring: false, status: "complied" } as never],
  log_entry: [
    e("e1", "p1", "1978-05-01", "Delivered. Annual inspection."),
    e("e2", "p2", "1983-04-02", "Annual inspection."),
    e("e3", "p3", "1991-06-10", "Annual inspection. Complied with AD 2015-19-07."),
    e("e4", "p4", "2005-03-03", "Engine removed for overhaul. Reinstalled."),
    e("e5", "p5", "2019-08-08", "Installed GTN 650 per STC SA02019SE, removed KX-155. Form 337 filed."),
    e("e6", "p6", "2020-01-10", "Inspected per A.D. 2011-10-09, no defects."),
    e("e7", "p7", "2021-02-02", "Annual inspection."),
  ],
  logbook_gap: [
    { id: "g1", logbook_id: "af", from_date: "1983-04-02", to_date: "1991-06-10", status: "open", source: "coverage_rule" },
    { id: "g2", logbook_id: "af", from_date: "2010-01-01", to_date: "2012-01-01", status: "dismissed", source: "coverage_rule" },
  ],
};

test("first read: ready book lists gaps, untracked ADs and big changes, each with a page", () => {
  const r = firstRead(input, "af")!;
  assert.equal(r.ready, true);
  assert.equal(r.pages, 10);
  assert.equal(r.from, "1978-05-01");
  assert.equal(r.to, "2021-02-02");
  assert.deepEqual(r.findings.map((f) => f.kind), ["gap", "untracked_ad", "big_change", "big_change"]);
  assert.equal(r.findings[0].text, "No pages, 1983 to 1991.");
  assert.deepEqual(r.findings[0].citations.map((c) => c.label), ["Airframe p. 2", "Airframe p. 3"]);
  assert.equal(r.findings[1].text, "AD 2011-10-09 is mentioned but not tracked."); // 2015-19-07 is tracked
  assert.deepEqual(r.findings[1].citations.map((c) => c.pageId), ["p6"]);
  assert.match(r.findings[3].text, /^Installed GTN 650 per STC SA02019SE, removed KX-155, 2019\.$/);
  assert.ok(r.findings.every((f) => f.citations.length >= 1 && f.citations.length <= 3));
  assert.equal(r.aiPartial, true); // recurring repairs wait for the AI pass
  assert.equal(r.nextBook?.logbook, "engine");
});

test("first read: not ready under 10 pages, while pages are being read or wait for review", () => {
  assert.equal(firstRead({ ...input, page: pages.slice(0, 9) }, "af")!.ready, false);
  const reading = firstRead({ ...input, page: pages.map((p, i) => (i ? p : { ...p, extraction_status: "queued" })) }, "af")!;
  assert.equal(reading.pagesBeingRead, 1);
  assert.equal(reading.ready, false);
  assert.deepEqual(reading.findings, []);
  const review = firstRead({ ...input, log_entry: [...input.log_entry!, e("ai", "p8", "2022-01-01", "Complied with AD 2020-01-01.", "ai_read")] }, "af")!;
  assert.equal(review.pagesToReview, 1);
  assert.equal(review.ready, false);
});

test("first read: never cites an entry read by AI and not confirmed", () => {
  // The AI-read entry sits on a page that also holds a confirmed entry and was reviewed (replaced).
  const replaced = { ...e("ai", "p8", "2022-01-01", "Complied with AD 2020-01-01. Engine overhaul.", "ai_read"), replaced_by_entry_id: "e7" };
  const r = firstRead({ ...input, log_entry: [...input.log_entry!, replaced] }, "af")!;
  assert.equal(r.ready, true);
  assert.ok(!JSON.stringify(r.findings).includes("2020-01-01"));
  assert.ok(r.findings.every((f) => f.citations.every((c) => c.entryId !== "ai")));
});

test("first read: unknown logbook is null", () => {
  assert.equal(firstRead(input, "nope"), null);
});
