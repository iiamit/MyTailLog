import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeUtilization,
  utilizationFor,
  confidenceFor,
  projectDueDate,
  projectionLabel,
  projectionTitle,
  WINDOW_DAYS,
} from "../src/lib/utilization";
import type { MeterReset, Reading } from "../src/lib/hobbsTach";

// Fixed "today" so the trailing-365-day window is deterministic.
const TODAY = new Date("2026-08-01T00:00:00Z");
const DAY_MS = 86_400_000;

/** ISO date `n` days before TODAY. */
const ago = (n: number) => new Date(TODAY.getTime() - n * DAY_MS).toISOString().slice(0, 10);

let seq = 0;
const reading = (p: {
  date: string;
  tach?: number;
  hobbs?: number;
  estimated?: boolean;
}): Reading => ({
  id: `r${seq++}`,
  source: "entry",
  date: p.date,
  hobbs: p.hobbs ?? null,
  tach: p.tach ?? null,
  reviewedAt: null,
  estimated: p.estimated,
});

/** n evenly spaced tach readings ending today, accruing `perDay` hours/day. */
function ladder(n: number, spanDays: number, perDay: number, meter: "tach" | "hobbs" = "tach") {
  const step = spanDays / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const daysAgo = Math.round(spanDays - i * step);
    const value = 1000 + (spanDays - daysAgo) * perDay;
    return reading({ date: ago(daysAgo), [meter]: Math.round(value * 10) / 10 });
  });
}

// --- confidence ladder -----------------------------------------------------
test("confidenceFor: both sample count AND span must clear the rung", () => {
  assert.equal(confidenceFor(6, 180), "high");
  assert.equal(confidenceFor(20, 179), "medium"); // plenty of readings, short span
  assert.equal(confidenceFor(5, 400), "medium"); // long span, too few readings
  assert.equal(confidenceFor(4, 90), "medium");
  assert.equal(confidenceFor(2, 30), "low");
  assert.equal(confidenceFor(1, 365), "none"); // never project from one point
  assert.equal(confidenceFor(2, 29), "none");
  assert.equal(confidenceFor(0, 0), "none");
});

// --- rate math -------------------------------------------------------------
test("rate math: hours flown / days elapsed", () => {
  // 200 h over 200 days = 1.0 h/day, from 5 readings.
  const u = computeUtilization(ladder(5, 200, 1.0), [], TODAY);
  assert.equal(u.meter, "tach");
  assert.ok(Math.abs(u.hoursPerDay - 1.0) < 0.01, `got ${u.hoursPerDay}`);
  assert.equal(u.sampleCount, 5);
  assert.equal(u.spanDays, 200);
  assert.equal(u.confidence, "medium"); // 5 readings → not yet 6 for high
  assert.equal(u.windowEnd, ago(0));
});

test("rate math: a realistic 8 h/month owner reaches high confidence", () => {
  const u = computeUtilization(ladder(8, 300, 8 / 30.4), [], TODAY);
  assert.equal(u.confidence, "high");
  assert.ok(Math.abs(u.hoursPerDay * 30.4 - 8) < 0.2);
});

test("readings older than the trailing window are ignored", () => {
  const stale = [
    reading({ date: ago(WINDOW_DAYS + 200), tach: 100 }),
    reading({ date: ago(WINDOW_DAYS + 100), tach: 900 }), // 800 h — would blow up the rate
    ...ladder(6, 200, 0.5),
  ];
  const u = computeUtilization(stale, [], TODAY);
  assert.ok(Math.abs(u.hoursPerDay - 0.5) < 0.02, `got ${u.hoursPerDay}`);
  assert.equal(u.windowStart, ago(200));
});

test("same-date readings collapse to the day's highest, no zero-day interval", () => {
  const u = computeUtilization(
    [
      reading({ date: ago(100), tach: 1000 }),
      reading({ date: ago(100), tach: 1002 }), // same day, later flight
      reading({ date: ago(0), tach: 1102 }),
    ],
    [],
    TODAY,
  );
  assert.equal(u.sampleCount, 2);
  assert.equal(u.spanDays, 100);
  assert.ok(Math.abs(u.hoursPerDay - 1.0) < 0.01, `got ${u.hoursPerDay}`);
});

test("a backwards reading with no declared reset drops only its interval", () => {
  const u = computeUtilization(
    [
      reading({ date: ago(300), tach: 1000 }),
      reading({ date: ago(200), tach: 1100 }), // +100 over 100d
      reading({ date: ago(150), tach: 900 }), // bogus dip — interval dropped
      reading({ date: ago(100), tach: 1150 }), // dropped too (delta from 900 is fake)
      reading({ date: ago(0), tach: 1250 }), // +100 over 100d
    ],
    [],
    TODAY,
  );
  // Only the two clean 100 h / 100 d intervals survive... plus the 900→1150 rise,
  // which is a real forward delta we cannot distinguish from flying. What must NOT
  // happen is a negative contribution.
  assert.ok(u.hoursPerDay > 0, "rate must stay positive");
  assert.ok(u.hoursPerDay < 2, `rate must stay plausible, got ${u.hoursPerDay}`);
});

// --- meter reset exclusion -------------------------------------------------
test("meter reset: the spanning interval is excluded, not counted", () => {
  // Tach replaced 150 days ago: old meter read 2400, new one started at 0.
  const resets: MeterReset[] = [
    { meter: "tach", date: ago(150), prior: 2400, next: 0 },
  ];
  const readings = [
    reading({ date: ago(300), tach: 2300 }),
    reading({ date: ago(200), tach: 2400 }), // +100 over 100d on the OLD meter
    reading({ date: ago(150), tach: 0 }), // first reading on the NEW meter
    reading({ date: ago(50), tach: 100 }), // +100 over 100d on the NEW meter
    reading({ date: ago(0), tach: 150 }), // +50 over 50d
  ];

  const u = computeUtilization(readings, resets, TODAY);
  // 250 h over 250 measured days = 1.0/day. The −2400 h boundary interval is gone.
  assert.ok(Math.abs(u.hoursPerDay - 1.0) < 0.01, `got ${u.hoursPerDay}`);
  assert.equal(u.spanDays, 250, "the 50-day reset interval is not measured");
  assert.equal(u.sampleCount, 5);

  // Note: for a DOWNWARD replacement the negative-delta guard would have caught
  // this interval anyway. The exclusion earns its keep on the upward case below,
  // which no amount of sanity-checking the delta can detect.
  const naive = computeUtilization(readings, [], TODAY);
  assert.equal(naive.spanDays, u.spanDays);
});

test("meter reset: an UPWARD replacement is the case only the exclusion catches", () => {
  // The genuinely dangerous shape: the replacement meter was set to airframe
  // total time (3200) rather than restarted at zero, so the naive delta is a
  // POSITIVE 2,700 hours in ten days. The negative-delta guard cannot see this.
  const readings = [
    reading({ date: ago(300), tach: 400 }),
    reading({ date: ago(160), tach: 500 }), // +100 over 140d on the old meter
    reading({ date: ago(150), tach: 3200 }), // new meter, seeded at airframe total
    reading({ date: ago(0), tach: 3350 }), // +150 over 150d on the new meter
  ];
  const resets: MeterReset[] = [
    { meter: "tach", date: ago(150), prior: 500, next: 3200 },
  ];

  const naive = computeUtilization(readings, [], TODAY);
  assert.ok(naive.hoursPerDay > 8, `naive rate is nonsense: ${naive.hoursPerDay}/day`);

  const u = computeUtilization(readings, resets, TODAY);
  assert.ok(Math.abs(u.hoursPerDay - 250 / 290) < 0.01, `got ${u.hoursPerDay}`);
  assert.equal(u.spanDays, 290, "the 10-day reset interval is not measured");

  // And the projection that falls out is sane (116 days) rather than "next week".
  const p = projectDueDate(100, u, TODAY);
  assert.equal(p?.date, "2026-11-25");
  assert.equal(projectDueDate(100, naive, TODAY)?.date, "2026-08-11");
});

test("meter reset: a reset on the OTHER meter doesn't touch this meter's rate", () => {
  const readings = ladder(6, 300, 1.0); // tach
  const hobbsReset: MeterReset[] = [{ meter: "hobbs", date: ago(150), prior: 900, next: 0 }];
  const withReset = computeUtilization(readings, hobbsReset, TODAY);
  const without = computeUtilization(readings, [], TODAY);
  assert.equal(withReset.hoursPerDay, without.hoursPerDay);
  assert.equal(withReset.spanDays, without.spanDays);
});

test("meter reset: reset_date is the first date on the NEW meter (half-open)", () => {
  // A reset dated exactly on a reading means that reading is already post-reset,
  // so the interval ENDING there spans it and the one starting there does not.
  const resets: MeterReset[] = [{ meter: "tach", date: ago(100), prior: 500, next: 0 }];
  const u = computeUtilization(
    [
      reading({ date: ago(200), tach: 400 }),
      reading({ date: ago(100), tach: 0 }),
      reading({ date: ago(0), tach: 100 }),
    ],
    resets,
    TODAY,
  );
  assert.equal(u.spanDays, 100, "only the post-reset interval is measured");
  assert.ok(Math.abs(u.hoursPerDay - 1.0) < 0.01);
});

// --- low sample count ------------------------------------------------------
test("low sample count: one reading yields no rate and no projection", () => {
  const u = computeUtilization([reading({ date: ago(10), tach: 1000 })], [], TODAY);
  assert.equal(u.confidence, "none");
  assert.equal(u.hoursPerDay, 0);
  assert.equal(u.sampleCount, 0);
  assert.equal(projectDueDate(40, u, TODAY), null, "never guess from one data point");
});

test("low sample count: no readings at all", () => {
  const u = computeUtilization([], [], TODAY);
  assert.equal(u.confidence, "none");
  assert.equal(projectDueDate(40, u, TODAY), null);
});

test("low sample count: two readings 20 days apart is still 'none'", () => {
  const u = computeUtilization(
    [reading({ date: ago(20), tach: 1000 }), reading({ date: ago(0), tach: 1040 })],
    [],
    TODAY,
  );
  assert.equal(u.confidence, "none");
  assert.equal(projectDueDate(40, u, TODAY), null);
});

test("low sample count: two readings 40 days apart is 'low' and DOES project", () => {
  const u = computeUtilization(
    [reading({ date: ago(40), tach: 1000 }), reading({ date: ago(0), tach: 1040 })],
    [],
    TODAY,
  );
  assert.equal(u.confidence, "low");
  assert.ok(Math.abs(u.hoursPerDay - 1.0) < 0.01);
  const p = projectDueDate(40, u, TODAY);
  assert.equal(p?.confidence, "low");
  assert.equal(p?.date, "2026-09-10"); // 40 h at 1 h/day
});

// --- tach vs hobbs preference ---------------------------------------------
test("tach is preferred when it can carry a rate on its own", () => {
  // Hobbs is the abundant meter and accrues faster; tach still wins.
  const readings = [
    ...ladder(6, 300, 0.9, "tach"),
    ...ladder(30, 300, 1.0, "hobbs"),
  ];
  const u = computeUtilization(readings, [], TODAY);
  assert.equal(u.meter, "tach");
  assert.ok(Math.abs(u.hoursPerDay - 0.9) < 0.02, `got ${u.hoursPerDay}`);
});

test("hobbs is the labelled fallback when tach can't support a rate", () => {
  const readings = [
    reading({ date: ago(0), tach: 1500 }), // a lone tach reading — unusable
    ...ladder(8, 300, 1.0, "hobbs"),
  ];
  const u = computeUtilization(readings, [], TODAY);
  assert.equal(u.meter, "hobbs", "must fall back AND say so");
  assert.equal(u.confidence, "high");
  assert.ok(projectionTitle(u).includes("hobbs readings"));
});

test("no usable rate on either meter reports tach with 'none'", () => {
  const u = computeUtilization([reading({ date: ago(5), hobbs: 10 })], [], TODAY);
  assert.equal(u.confidence, "none");
  assert.equal(u.meter, "tach");
});

test("utilizationFor targets one meter without falling back", () => {
  const readings = ladder(8, 300, 1.0, "hobbs");
  assert.equal(utilizationFor(readings, [], "tach", TODAY).confidence, "none");
  assert.equal(utilizationFor(readings, [], "hobbs", TODAY).confidence, "high");
});

// --- inferred readings never feed the rate (ADS-B estimates) ---------------
test("estimated readings are excluded — a projected number can't feed the rate", () => {
  const real = ladder(6, 300, 0.5);
  const withEstimate = [
    ...real,
    reading({ date: ago(0), tach: 99999, estimated: true }), // absurd, must be ignored
  ];
  assert.equal(
    computeUtilization(withEstimate, [], TODAY).hoursPerDay,
    computeUtilization(real, [], TODAY).hoursPerDay,
  );
});

// --- projectDueDate --------------------------------------------------------
test("projectDueDate: hours remaining / rate, rounded to whole days", () => {
  const u = computeUtilization(ladder(6, 200, 2.0), [], TODAY); // 2 h/day
  const p = projectDueDate(50, u, TODAY);
  assert.equal(p?.date, "2026-08-26"); // 25 days out
  assert.equal(p?.confidence, u.confidence);
});

test("projectDueDate: nothing to project for a null, zero, or overdue balance", () => {
  const u = computeUtilization(ladder(6, 200, 1.0), [], TODAY);
  assert.equal(projectDueDate(null, u, TODAY), null);
  assert.equal(projectDueDate(0, u, TODAY), null);
  assert.equal(projectDueDate(-12.5, u, TODAY), null, "already due — the date adds nothing");
});

// --- presentation guardrails ----------------------------------------------
test("the label always carries ≈ and the confidence", () => {
  const u = computeUtilization(ladder(8, 300, 1.0), [], TODAY);
  const p = projectDueDate(30, u, TODAY);
  assert.ok(p);
  const label = projectionLabel(p);
  assert.ok(label.startsWith("≈ "), label);
  assert.ok(label.includes("high confidence"), label);
});

test("the detail text names the window, the rate, and that it isn't a determination", () => {
  const u = computeUtilization(ladder(8, 300, 1.0), [], TODAY);
  const title = projectionTitle(u);
  assert.ok(title.includes("not a compliance determination"), title);
  assert.ok(title.includes(u.windowStart) && title.includes(u.windowEnd), title);
  assert.ok(title.includes("hrs/month"), title);
  assert.ok(title.includes("8 tach readings"), title);
});
