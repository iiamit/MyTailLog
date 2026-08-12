import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCurrentTach,
  getCurrentMeters,
  getCurrentHours,
  getHoursAnomalies,
  getLatestMfbReading,
  toReadings,
  currentMetersFrom,
  type EntryRowLite,
  type HoursRowLite,
} from "../src/lib/aircraftHours";
import type { MeterReset } from "../src/lib/hobbsTach";

// The async entry points take a Supabase client and do I/O, so they stay smoke
// checks. But toReadings() and currentMetersFrom() are PURE and are now a shared
// API: the native app (apps/mobile) calls them with rows out of its own SQLite
// mirror so the phone and the web derive "current hours" from one implementation.
// That makes them a seam between two apps, and worth real coverage.

test("aircraftHours: exports the expected DB-backed entry points as functions", () => {
  for (const fn of [
    getCurrentTach,
    getCurrentMeters,
    getCurrentHours,
    getHoursAnomalies,
    getLatestMfbReading,
  ]) {
    assert.equal(typeof fn, "function");
  }
});

const entry = (o: Partial<EntryRowLite> = {}): EntryRowLite => ({
  id: "e1",
  entry_date: "2026-07-01",
  hobbs: null,
  tach: 1000,
  airframe: null,
  hours_reviewed_at: null,
  ...o,
});

const reading = (o: Partial<HoursRowLite> = {}): HoursRowLite => ({
  id: "r1",
  reading_date: "2026-07-10",
  hobbs: 500,
  tach: null,
  airframe: null,
  hours_reviewed_at: null,
  source: "myflightbook",
  ...o,
});

// --- toReadings -------------------------------------------------------------

test("toReadings: a log entry becomes an `entry` reading", () => {
  const [r] = toReadings([entry()], []);
  assert.equal(r.source, "entry");
  assert.equal(r.date, "2026-07-01");
  assert.equal(r.tach, 1000);
});

test("toReadings: hours_reading source is mapped, not passed through", () => {
  const out = toReadings(
    [],
    [
      reading({ id: "a", source: "myflightbook" }),
      reading({ id: "b", source: "manual" }),
      reading({ id: "c", source: "adsb_estimate" }),
    ],
  );
  assert.deepEqual(
    out.map((r) => r.source),
    ["mfb", "manual", "adsb"],
  );
});

test("toReadings: only *_estimate rows are flagged estimated", () => {
  // The utilization rate excludes estimates — treating an ADS-B guess as a real
  // meter read would make the rate partly a function of its own output.
  const out = toReadings(
    [],
    [reading({ id: "a", source: "myflightbook" }), reading({ id: "b", source: "adsb_estimate" })],
  );
  assert.equal(out[0].estimated, false);
  assert.equal(out[1].estimated, true);
});

test("toReadings: enrollment is appended as an oldest-origin anchor", () => {
  const out = toReadings([], [], { hobbs: 10, tach: 20, airframe: 30, date: "2020-01-01" });
  const anchor = out.find((r) => r.id === "enrollment");
  assert.ok(anchor);
  assert.equal(anchor.source, "enrollment");
  assert.equal(anchor.tach, 20);
  assert.equal(anchor.date, "2020-01-01");
});

test("toReadings: an all-null enrollment adds nothing", () => {
  assert.equal(toReadings([], [], { hobbs: null, tach: null, airframe: null }).length, 0);
  assert.equal(toReadings([], [], null).length, 0);
  assert.equal(toReadings([], []).length, 0);
});

// --- currentMetersFrom ------------------------------------------------------

test("currentMetersFrom: latest readings become the current meters", () => {
  const m = currentMetersFrom(
    toReadings([entry({ entry_date: "2026-07-01", tach: 1000 })], [reading({ reading_date: "2026-07-10", hobbs: 500 })]),
    [],
  );
  assert.equal(m.tach.tach, 1000);
  assert.equal(m.hobbs.hobbs, 500);
});

test("currentMetersFrom: no readings at all → nulls, not a throw", () => {
  const m = currentMetersFrom([], []);
  assert.equal(m.tach.tach, null);
  assert.equal(m.hobbs.hobbs, null);
  assert.equal(typeof m.baselineFor, "function");
  assert.equal(typeof m.toTotalHours, "function");
});

test("currentMetersFrom: a meter replacement is stitched, so time doesn't run backwards", () => {
  // Tach replaced on 2026-06-01: old meter read 1200, new one started at 0.
  // A later reading of 40 on the new meter is really 1240 total.
  const resets: MeterReset[] = [{ meter: "tach", date: "2026-06-01", prior: 1200, next: 0 }];
  const readings = toReadings(
    [
      entry({ id: "old", entry_date: "2026-05-01", tach: 1200 }),
      entry({ id: "new", entry_date: "2026-07-01", tach: 40 }),
    ],
    [],
  );

  const stitched = currentMetersFrom(readings, resets);
  assert.equal(stitched.tach.tach, 1240, "post-reset reading must be lifted onto the total scale");

  // Without the reset declared, the same rows read as the meter going backwards.
  assert.equal(currentMetersFrom(readings, []).tach.tach, 40);
});

test("currentMetersFrom: toTotalHours lifts a stored scalar onto the readings' scale", () => {
  const resets: MeterReset[] = [{ meter: "tach", date: "2026-06-01", prior: 1200, next: 0 }];
  const m = currentMetersFrom(toReadings([entry({ entry_date: "2026-07-01", tach: 40 })], []), resets);
  // A last-done of 20 recorded AFTER the swap is 1220 in total time.
  assert.equal(m.toTotalHours(20, "2026-07-01", "tach"), 1220);
  // Identity when there is no reset to apply.
  assert.equal(currentMetersFrom([], []).toTotalHours(20, "2026-07-01", "tach"), 20);
});
