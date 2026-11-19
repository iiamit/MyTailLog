import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowanceCopy, dHash, inFlight, insertAfter, newlyCompleted, pageState, pagesPhrase, queueTotals, readCopy, shotProblem, sortPages, stateFilter,
  type QueueBatch,
} from "../src/lib/v2/capture";
import { hamming64, movePages, requeue } from "../src/lib/writes/pages";
import type { Db } from "../src/lib/writes";

// Pages library and Add pages (04 W-BOOKS-05, W-BOOKS-06; 09 §3.9, §4.8).

test("page state: reader status first, then the trust of its entries", () => {
  const pg = (extraction_status: string, o: Record<string, unknown> = {}) => ({ extraction_status, needs_look: null, duplicate_of_page_id: null, ...o });
  assert.equal(pageState(pg("failed"), []), "failed");
  assert.equal(pageState(pg("processing"), []), "processing");
  assert.equal(pageState(pg("waiting_allowance"), []), "waiting_allowance");
  assert.equal(pageState(pg("queued"), []), "queued");
  assert.equal(pageState(pg("queued", { duplicate_of_page_id: "p0" }), []), "duplicate");
  assert.equal(pageState(pg("pending"), []), "not_read");
  assert.equal(pageState(pg("extracted"), [{ trust: "confirmed" }, { trust: "ai_read" }]), "ai_read");
  assert.equal(pageState(pg("extracted", { needs_look: true }), [{ trust: "ai_read" }]), "needs_look");
  assert.equal(pageState(pg("extracted", { needs_look: true }), [{ trust: "confirmed" }]), "confirmed", "a look is only owed on unconfirmed entries");
  assert.equal(pageState(pg("extracted"), []), "no_entries");
  assert.equal(stateFilter("needs_look"), "review");
  assert.equal(stateFilter("duplicate"), "reading");
  assert.equal(stateFilter("no_entries"), null);
});

test("sort: paper, date, tach and upload order; missing values last in either direction", () => {
  const p = (id: string, seq: number, date: string | null, tach: number | null, created: string) => ({ id, page_sequence: seq, date, tach, created_at: created });
  const pages = [p("a", 2, "1990-01-01", 100, "2026-01-03"), p("b", 1, null, 50, "2026-01-02"), p("c", 3, "1980-01-01", null, "2026-01-01")];
  assert.deepEqual(sortPages(pages, "paper").map((x) => x.id), ["b", "a", "c"]);
  assert.deepEqual(sortPages(pages, "date").map((x) => x.id), ["c", "a", "b"]);
  assert.deepEqual(sortPages(pages, "date", true).map((x) => x.id), ["a", "c", "b"]);
  assert.deepEqual(sortPages(pages, "tach").map((x) => x.id), ["b", "a", "c"]);
  assert.deepEqual(sortPages(pages, "upload").map((x) => x.id), ["c", "b", "a"]);
});

test("selection phrase and place-after order", () => {
  assert.equal(pagesPhrase([32, 30, 31]), "pp. 30 to 32");
  assert.equal(pagesPhrase([12, 4, 9]), "pp. 4, 9 and 12");
  assert.equal(pagesPhrase([7, null]), "p. 7");
  assert.equal(pagesPhrase([]), "");
  // New pages arrived at the end (x, y); the owner asked for them after page 1.
  assert.deepEqual(insertAfter(["a", "b", "c", "x", "y"], ["x", "y"], 1), ["a", "x", "y", "b", "c"]);
  assert.deepEqual(insertAfter(["a", "x"], ["x"], 0), ["x", "a"]);
  assert.deepEqual(insertAfter(["a", "x"], ["x"], 99), ["a", "x"]);
});

test("dHash: 64 bits from 9 × 8 greyscale, near-identical images stay within the duplicate distance", () => {
  const ramp = Array.from({ length: 72 }, (_, i) => 255 - (i % 9) * 20);
  assert.equal(dHash(ramp), "ffffffffffffffff");
  assert.equal(dHash(ramp.map((v) => 255 - v)), "0000000000000000");
  const noisy = ramp.map((v, i) => (i === 4 ? v + 25 : v));
  assert.ok(hamming64(dHash(ramp), dHash(noisy)) <= 6);
  assert.throws(() => dHash([1, 2, 3]));
});

test("shot check gives the three reasons in order", () => {
  const ok = { width: 1500, height: 2000, sharpness: 200, glareRatio: 0.01 };
  assert.equal(shotProblem(ok), null);
  assert.equal(shotProblem({ ...ok, width: 720, sharpness: 10 }), "Too small to read. Move closer.");
  assert.equal(shotProblem({ ...ok, sharpness: 40 }), "Looks blurry. Hold steady and let the camera focus.");
  assert.equal(shotProblem({ ...ok, glareRatio: 0.08 }), "Glare on the page. Tilt it or move away from the light.");
});

const batch = (o: Partial<QueueBatch> = {}): QueueBatch => ({
  id: "b1", logbook: "airframe", logbookId: "l1", createdAt: "2026-11-18T10:00:00Z", expected: 6, uploaded: 6, queued: 0, reading: 0,
  waitingAllowance: 0, read: 0, failed: 0, needsLook: 0, waitingDecision: 0, completedAt: null, ...o,
});

test("queue totals, polling and the one announcement per batch", () => {
  const open = batch({ uploaded: 4, queued: 3, waitingDecision: 1 });
  const t = queueTotals([open, batch({ id: "b0", read: 5, needsLook: 2, failed: 1, completedAt: "2026-11-17T00:00:00Z" })]);
  assert.equal(t.arriving, 2);
  assert.equal(t.queued, 2, "pages held for a duplicate decision are counted apart");
  assert.equal(t.decision, 1);
  assert.equal(t.failed, 1);
  assert.deepEqual(t.lastRead, { createdAt: "2026-11-18T10:00:00Z", clean: 3, doubtful: 2 });
  assert.equal(inFlight([open]), true);
  assert.equal(inFlight([batch({ read: 6, completedAt: "x" })]), false);
  const done = batch({ read: 6, needsLook: 2, completedAt: "2026-11-18T10:05:00Z" });
  assert.deepEqual(newlyCompleted([batch()], [done]).map((b) => b.id), ["b1"]);
  assert.deepEqual(newlyCompleted([done], [done]), [], "never twice");
  assert.equal(readCopy(done), "6 pages are read. 2 need a look.");
  assert.equal(readCopy(batch({ read: 1 })), "1 page is read.");
});

test("allowance copy: pages, what fits, past the cap, own key and paused", () => {
  const a = { usedCalls: 62, capCalls: 100, pagesUsedApprox: 31, pagesCapApprox: 50, nextFreeAt: null, ownKey: false, globalPaused: false };
  assert.equal(allowanceCopy(a, 0).head, "31 of 50 pages used");
  assert.equal(allowanceCopy(a, 0).source, "shared allowance");
  assert.match(allowanceCopy(a, 0).note, /Each page frees up 24 hours after it was read/);
  assert.equal(allowanceCopy(a, 12).note, "The 12 pages left fit.");
  const over = allowanceCopy(a, 40);
  assert.equal(over.note, "19 of these fit today. The rest wait their turn tomorrow, or add your own key.");
  assert.equal(over.over, true);
  assert.equal(allowanceCopy({ ...a, ownKey: true }, 0).source, "your own key");
  assert.match(allowanceCopy({ ...a, globalPaused: true }, 5).note, /^Reading is paused today/);
});

test("read again and move refuse viewers before touching a page", async () => {
  let touched = false;
  const viewer = {
    rpc: async () => ({ data: false }),
    from: () => { touched = true; throw new Error("no table access expected"); },
  } as unknown as Db;
  const ctx = { aircraftId: "a1", userId: "u1" };
  assert.equal((await requeue(viewer, ctx, { pageIds: ["p1"] })).status, "error");
  assert.equal((await movePages(viewer, ctx, { pageIds: ["p1"], logbookId: "00000000-0000-4000-8000-000000000000" })).status, "error");
  assert.equal((await requeue(viewer, ctx, { pageIds: [] })).status, "error");
  assert.equal(touched, false);
});
