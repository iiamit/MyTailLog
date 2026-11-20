import { test } from "node:test";
import assert from "node:assert/strict";
import { hit } from "../src/lib/rateLimit";
import { DUP_SCAN_WARN, findEntryDuplicates, type DupEntry } from "../src/lib/duplicates";

function capture<T>(fn: () => T): { result: T; logs: unknown[][] } {
  const logs: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void logs.push(args);
  try {
    return { result: fn(), logs };
  } finally {
    console.warn = warn;
  }
}

test("a rate limit logs its trigger once per window, with numbers only, and keeps refusing", () => {
  const key = `user-${Math.random()}@example.com`;
  const { result, logs } = capture(() => [0, 1, 2, 3, 4].map((i) => hit(key, 2, 60_000, 1_000 + i)));
  assert.deepEqual(result.map((r) => r !== null), [false, false, true, true, true]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "[shortcut-trigger]");
  assert.ok(!JSON.stringify(logs[0]).includes("example.com"));
  // A new window starts clean and can log again.
  const again = capture(() => [hit(key, 2, 60_000, 70_000), hit(key, 2, 60_000, 70_001), hit(key, 2, 60_000, 70_002)]);
  assert.equal(again.logs.length, 1);
});

test("the duplicate scan logs only when one logbook passes the threshold", () => {
  const e = (i: number, logbook: string): DupEntry => ({
    id: `${logbook}${i}`, page_id: null, logbook_id: logbook, entry_date: null, tach: null, hobbs: null,
    text: "", owner_confirmed: false, created_at: "2026-01-01",
  });
  const half = Array.from({ length: DUP_SCAN_WARN / 2 + 1 }, (_, i) => e(i, "A"));
  const otherHalf = Array.from({ length: DUP_SCAN_WARN / 2 + 1 }, (_, i) => e(i, "B"));
  assert.equal(capture(() => findEntryDuplicates([...half, ...otherHalf])).logs.length, 0);
  const big = Array.from({ length: DUP_SCAN_WARN + 1 }, (_, i) => e(i, "A"));
  const { logs } = capture(() => findEntryDuplicates(big));
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0][1], { at: "lib/duplicates.ts:163", entries: DUP_SCAN_WARN + 1 });
});
