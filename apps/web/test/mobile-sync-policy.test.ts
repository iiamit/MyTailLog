import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryDecision, backoffMs, nextRetryAt, purgePlan, BACKOFF_CAP_MS, BACKOFF_BASE_MS } from "../../mobile/src/sync-policy";

test("mobile writes sync online and stay pending offline", () => {
  assert.equal(deliveryDecision(true, 1), "sync");
  assert.equal(deliveryDecision(false, 1), "pending");
  assert.equal(deliveryDecision(false, 0), "synced");
});

// --- retry schedule ----------------------------------------------------------

test("backoff doubles from the base and stops growing at the cap", () => {
  assert.equal(backoffMs(0), BACKOFF_BASE_MS);
  assert.equal(backoffMs(1), BACKOFF_BASE_MS * 2);
  assert.equal(backoffMs(2), BACKOFF_BASE_MS * 4);
  assert.equal(backoffMs(20), BACKOFF_CAP_MS, "bounded: a long outage never grows past the cap");
  assert.equal(backoffMs(1000), BACKOFF_CAP_MS, "no overflow to Infinity/NaN");
  assert.equal(backoffMs(-3), BACKOFF_BASE_MS, "a negative attempt count is treated as the first");
});

test("nextRetryAt is an ISO time in the future by exactly the backoff", () => {
  const now = Date.parse("2026-09-02T12:00:00.000Z");
  assert.equal(nextRetryAt(0, now), "2026-09-02T12:00:05.000Z");
  assert.equal(Date.parse(nextRetryAt(3, now)) - now, BACKOFF_BASE_MS * 8);
});

// --- blob cache ceiling -------------------------------------------------------

const f = (name: string, size: number, mtime: number) => ({ name, size, mtime });
const pinned = (n: string) => n.startsWith("document_");

test("under the ceiling nothing is purged", () => {
  assert.deepEqual(purgePlan([f("page_1", 100, 1), f("page_2", 100, 2)], 200, pinned), []);
});

test("oldest unpinned files go first, and only as many as needed", () => {
  const files = [f("page_new", 100, 30), f("page_old", 100, 10), f("page_mid", 100, 20)];
  assert.deepEqual(purgePlan(files, 250, pinned), ["page_old"]);
  assert.deepEqual(purgePlan(files, 150, pinned), ["page_old", "page_mid"]);
});

test("pinned documents survive even when they alone exceed the ceiling", () => {
  const files = [f("document_poh", 900, 1), f("page_1", 100, 2)];
  assert.deepEqual(purgePlan(files, 500, pinned), ["page_1"], "the page goes, the POH stays");
  assert.deepEqual(purgePlan([f("document_poh", 900, 1)], 500, pinned), []);
});
