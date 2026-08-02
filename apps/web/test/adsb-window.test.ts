import { test } from "node:test";
import assert from "node:assert/strict";
import { windowChunks, startOfUtcDay, utcDaySpan } from "../src/lib/adsb/opensky";

// Regression guard for the bug that reached the live API: OpenSky partitions by
// UTC CALENDAR DAY and allows at most 2 partitions per query. Reasoning in
// elapsed hours (a "47h window", comfortably under the documented 2 days) still
// touches THREE calendar days for any end time before 23:00 UTC, and the API
// rejects it:
//
//   400 "You can only query across 2 partitions (days).
//        Your query will naturally spill into the 3rd day."
//
// Every window we send must therefore span at most 2 UTC days, no matter where
// in the day it starts or ends.

const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);
const DAY = 86_400;

/** The invariant, asserted the way the API enforces it. */
function assertLegal(chunks: [number, number][], label: string) {
  for (const [b, e] of chunks) {
    assert.ok(b <= e, `${label}: chunk is inverted`);
    assert.ok(
      utcDaySpan(b, e) <= 2,
      `${label}: ${new Date(b * 1000).toISOString()} → ${new Date(e * 1000).toISOString()} spans ${utcDaySpan(b, e)} UTC days`,
    );
  }
}

test("startOfUtcDay: floors to midnight UTC", () => {
  assert.equal(startOfUtcDay(at("2026-08-02T23:59:59Z")), at("2026-08-02T00:00:00Z"));
  assert.equal(startOfUtcDay(at("2026-08-02T00:00:00Z")), at("2026-08-02T00:00:00Z"));
});

test("utcDaySpan: counts calendar days inclusive of both endpoints", () => {
  assert.equal(utcDaySpan(at("2026-08-02T00:00:00Z"), at("2026-08-02T23:59:59Z")), 1);
  assert.equal(utcDaySpan(at("2026-08-02T23:59:59Z"), at("2026-08-03T00:00:00Z")), 2);
  // The shipped-and-rejected 47h window, one second of spill into a 3rd day.
  assert.equal(utcDaySpan(at("2026-08-01T01:00:00Z"), at("2026-08-03T00:00:00Z")), 3);
});

test("windowChunks: the 47h window that the live API rejected is now split", () => {
  const end = at("2026-08-03T00:00:00Z");
  const chunks = windowChunks(end - 47 * 3600, end);
  assert.ok(chunks.length > 1, "a 3-calendar-day window must not go out as one request");
  assertLegal(chunks, "47h");
});

test("windowChunks: a window ending at 00:30 UTC stays legal", () => {
  // The nastiest case — 30 minutes into a new UTC day, so almost the whole
  // lookback sits in earlier days.
  const end = at("2026-08-03T00:30:00Z");
  assertLegal(windowChunks(startOfUtcDay(end - 2 * DAY), end), "00:30");
});

test("windowChunks: a window ending at 23:30 UTC stays legal", () => {
  const end = at("2026-08-03T23:30:00Z");
  assertLegal(windowChunks(startOfUtcDay(end - 2 * DAY), end), "23:30");
});

test("windowChunks: legal at every half-hour of the day (the hours-based bug had a blind spot)", () => {
  // The 47h window only worked after 23:00 UTC, which is why it looked fine in
  // one spot check. Sweep the whole clock.
  for (let m = 0; m < 24 * 60; m += 30) {
    const end = at("2026-08-03T00:00:00Z") + m * 60;
    assertLegal(windowChunks(startOfUtcDay(end - 2 * DAY), end), `+${m}m`);
  }
});

test("windowChunks: the cron's 3-calendar-day lookback → exactly 2 requests", () => {
  const end = at("2026-08-03T06:00:00Z");
  const chunks = windowChunks(startOfUtcDay(end - 2 * DAY), end);
  assert.equal(chunks.length, 2, "8 credits per aircraft per day");
  assertLegal(chunks, "cron");
  assert.equal(chunks[0][0], at("2026-08-01T00:00:00Z"));
  assert.equal(chunks[chunks.length - 1][1], end);
});

test("windowChunks: a long backfill splits into legal 2-day segments", () => {
  const begin = at("2026-07-01T00:00:00Z");
  const end = at("2026-07-31T00:00:00Z");
  const chunks = windowChunks(begin, end);
  assertLegal(chunks, "backfill");
  // Jul 1–31 inclusive is 31 calendar days: 15 full pairs, then Jul 31 alone.
  assert.equal(chunks.length, 16);
});

test("windowChunks: covers the range with no gaps and no overlap", () => {
  const begin = at("2026-08-01T07:13:00Z");
  const end = at("2026-08-09T19:47:00Z");
  const chunks = windowChunks(begin, end);
  assert.equal(chunks[0][0], begin);
  assert.equal(chunks[chunks.length - 1][1], end);
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(chunks[i][0], chunks[i - 1][1] + 1, "segments must abut exactly");
  }
  assertLegal(chunks, "coverage");
});

test("windowChunks: a sub-day window is a single request", () => {
  const chunks = windowChunks(at("2026-08-02T01:00:00Z"), at("2026-08-02T05:00:00Z"));
  assert.equal(chunks.length, 1);
  assertLegal(chunks, "sub-day");
});
