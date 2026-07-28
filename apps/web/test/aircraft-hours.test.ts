import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCurrentTach,
  getCurrentMeters,
  getCurrentHours,
  getHoursAnomalies,
  getLatestMfbReading,
} from "../src/lib/aircraftHours";

// NOTE: every exported function in src/lib/aircraftHours.ts takes a Supabase
// client and performs DB I/O — there are NO pure functions to unit-test here.
// The pure math they delegate to (currentTach, currentHobbs, normalizeReadings,
// detectAnomalies, meterValueAtDate, …) lives in src/lib/hobbsTach.ts and is
// covered by test/hobbs-tach.test.ts. These smoke checks just assert the module
// wires up the expected async entry points.

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
