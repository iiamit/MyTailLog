import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileAdsb, type LatestReading } from "../src/lib/adsb/reconcile";

// A flight starting on `date`, lasting `minutes`.
const F = (date: string, minutes: number, dismissed: string | null = null) => ({
  first_seen: `${date}T15:00:00.000Z`,
  airborne_minutes: minutes,
  dismissed_at: dismissed,
});

const R = (date: string, tach: number | null, source = "myflightbook"): LatestReading => ({
  date,
  tach,
  hobbs: null,
  source,
});

test("reconcileAdsb: MyFlightBook already covers the dates → silent", () => {
  // Two flights, both on or before the last MFB reading. Hobbs/tach are
  // cumulative, so that reading already contains them.
  const out = reconcileAdsb({
    flights: [F("2026-07-10", 120), F("2026-07-12", 150)],
    latestReading: R("2026-07-12", 1234.5),
  });
  assert.equal(out, null);
});

test("reconcileAdsb: a manual reading wins the same way MFB does", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-12", 240)],
    latestReading: R("2026-07-12", 1234.5, "manual"),
  });
  assert.equal(out, null);
});

test("reconcileAdsb: flying with no reading to account for it → suggestion", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-14", 90), F("2026-07-16", 78), F("2026-07-18", 84)],
    latestReading: R("2026-07-12", 1234.5),
  });
  assert.ok(out);
  assert.equal(out.flights, 3);
  assert.equal(out.hours, 4.2); // (90+78+84)/60
  assert.equal(out.meter, "tach");
  assert.equal(out.from, 1234.5);
  assert.equal(out.to, 1238.7);
  assert.equal(out.since?.date, "2026-07-12");
});

test("reconcileAdsb: partial overlap → the suggestion covers ONLY the gap", () => {
  // Five flights spanning the reading date; only the two after it are uncovered.
  const out = reconcileAdsb({
    flights: [
      F("2026-07-08", 300),
      F("2026-07-10", 300),
      F("2026-07-12", 300), // same day as the reading → covered
      F("2026-07-14", 60),
      F("2026-07-15", 90),
    ],
    latestReading: R("2026-07-12", 1000),
  });
  assert.ok(out);
  assert.equal(out.flights, 2);
  assert.equal(out.hours, 2.5); // (60+90)/60 — the 15h before the cutoff is ignored
  assert.equal(out.to, 1002.5);
});

test("reconcileAdsb: a meter replaced after the cutoff → silent (base value is on the old scale)", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-20", 240)],
    latestReading: R("2026-07-12", 1234.5),
    resetDates: ["2026-07-15"],
  });
  assert.equal(out, null);
});

test("reconcileAdsb: a reset BEFORE the cutoff is already baked in → still suggests", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-20", 240)],
    latestReading: R("2026-07-12", 12.5),
    resetDates: ["2026-07-01"],
  });
  assert.ok(out);
  assert.equal(out.hours, 4);
  assert.equal(out.to, 16.5);
});

test("reconcileAdsb: no flights → silent", () => {
  assert.equal(reconcileAdsb({ flights: [], latestReading: R("2026-07-12", 1234.5) }), null);
});

test("reconcileAdsb: dismissed flights don't count", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-14", 90, "2026-07-15T00:00:00.000Z"), F("2026-07-16", 6)],
    latestReading: R("2026-07-12", 1234.5),
  });
  assert.equal(out, null); // the only live flight is 0.1h — below the noise floor
});

test("reconcileAdsb: below the noise floor → silent", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-14", 8)],
    latestReading: R("2026-07-12", 1234.5),
  });
  assert.equal(out, null);
});

test("reconcileAdsb: falls back to hobbs when there is no tach reading", () => {
  const out = reconcileAdsb({
    flights: [F("2026-07-14", 120)],
    latestReading: { date: "2026-07-12", tach: null, hobbs: 800.4, source: "myflightbook" },
  });
  assert.ok(out);
  assert.equal(out.meter, "hobbs");
  assert.equal(out.to, 802.4);
});

test("reconcileAdsb: nothing ever recorded → reports the flying, names no number", () => {
  const out = reconcileAdsb({ flights: [F("2026-07-14", 120)], latestReading: null });
  assert.ok(out);
  assert.equal(out.hours, 2);
  assert.equal(out.meter, null);
  assert.equal(out.to, null);
});
