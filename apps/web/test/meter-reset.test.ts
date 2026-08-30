import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type Reading,
  type MeterReset,
  applyResets,
  resetOffset,
  toTotal,
  toFace,
  currentTach,
  currentAirframe,
  airframeTracksTach,
  meterValueAtDate,
  detectAnomalies,
  deriveRatio,
} from "../src/lib/hobbsTach";
import { buildStatusItems, meterForItem, hoursRemaining, type MeterCurrents } from "../src/lib/status";
import type { MaintenanceItem } from "../src/lib/database.types";

const R = (
  id: string,
  date: string | null,
  hobbs: number | null,
  tach: number | null,
  airframe: number | null = null,
): Reading => ({ id, source: "entry", date, hobbs, tach, airframe, reviewedAt: null });

// The owner's actual case: a tach that read 4200 was replaced and restarted at 0.
const TACH_SWAP: MeterReset[] = [{ meter: "tach", date: "2025-01-01", prior: 4200, next: 0 }];

// --- offsets ---------------------------------------------------------------
test("resetOffset: readings before the swap are untouched, after it carry the old meter's span", () => {
  assert.equal(resetOffset(TACH_SWAP, "tach", "2024-12-31"), 0);
  assert.equal(resetOffset(TACH_SWAP, "tach", "2025-01-01"), 4200);
  assert.equal(resetOffset(TACH_SWAP, "tach", "2026-06-01"), 4200);
});

test("resetOffset: only the meter that was replaced shifts", () => {
  assert.equal(resetOffset(TACH_SWAP, "hobbs", "2026-06-01"), 0);
  assert.equal(resetOffset(TACH_SWAP, "airframe", "2026-06-01"), 0);
});

test("resetOffset: an undated reading (enrollment with no date) is treated as oldest", () => {
  assert.equal(resetOffset(TACH_SWAP, "tach", null), 0);
});

test("resetOffset: two swaps of the same meter accumulate", () => {
  const twice: MeterReset[] = [
    { meter: "tach", date: "2020-01-01", prior: 4200, next: 0 },
    { meter: "tach", date: "2025-01-01", prior: 300, next: 0 },
  ];
  assert.equal(resetOffset(twice, "tach", "2019-01-01"), 0);
  assert.equal(resetOffset(twice, "tach", "2021-01-01"), 4200);
  assert.equal(resetOffset(twice, "tach", "2026-01-01"), 4500);
});

test("resetOffset: a new meter that didn't start at zero only carries the real gap", () => {
  const partial: MeterReset[] = [{ meter: "hobbs", date: "2025-01-01", prior: 980, next: 50 }];
  assert.equal(resetOffset(partial, "hobbs", "2025-06-01"), 930);
});

// --- applyResets -----------------------------------------------------------
test("applyResets: history becomes one continuous, still-increasing series", () => {
  const raw = [
    R("old1", "2024-06-01", 900, 4100),
    R("old2", "2024-12-01", 980, 4200),
    R("new1", "2025-02-01", 1000, 12.3),
  ];
  const out = applyResets(raw, TACH_SWAP);
  assert.deepEqual(out.map((r) => r.tach), [4100, 4200, 4212.3]);
  // hobbs was never replaced, so it is left exactly as recorded.
  assert.deepEqual(out.map((r) => r.hobbs), [900, 980, 1000]);
});

test("applyResets: no resets → the readings come back untouched", () => {
  const raw = [R("a", "2025-01-01", 100, 1000)];
  assert.deepEqual(applyResets(raw, []), raw);
});

test("applyResets: hobbs replacements are stitched exactly like tach", () => {
  const hobbsSwap: MeterReset[] = [{ meter: "hobbs", date: "2025-01-01", prior: 2450, next: 0 }];
  const out = applyResets(
    [R("old", "2024-06-01", 2400, null), R("new", "2025-03-01", 30.5, null)],
    hobbsSwap,
  );
  assert.deepEqual(out.map((r) => r.hobbs), [2400, 2480.5]);
});

test("applyResets: an unrecorded prior reading is inferred from the retired meter's high-water mark", () => {
  const unknownPrior: MeterReset[] = [{ meter: "tach", date: "2025-01-01", prior: null, next: 0 }];
  const out = applyResets(
    [R("old1", "2024-06-01", null, 4100), R("old2", "2024-12-01", null, 4188.4), R("new", "2025-02-01", null, 10)],
    unknownPrior,
  );
  assert.deepEqual(out.map((r) => r.tach), [4100, 4188.4, 4198.4]);
});

// --- what the swap used to break ------------------------------------------
test("a replaced tach no longer reads as time running backwards", () => {
  const raw = [
    R("old1", "2024-06-01", 900, 4100),
    R("old2", "2024-12-01", 980, 4200),
    R("new1", "2025-02-01", 1000, 12.3),
    R("new2", "2025-04-01", 1030, 40.1),
  ];
  const backwards = (rs: Reading[]) =>
    detectAnomalies(rs).filter((a) => a.field === "tach" && a.reason === "non_monotonic");
  // Unstitched, the restart is flagged as a mis-keyed reading — every time.
  assert.equal(backwards(raw).length, 1);
  assert.equal(backwards(raw)[0].readingId, "new1");
  // Declared, it is just history.
  assert.deepEqual(backwards(applyResets(raw, TACH_SWAP)), []);
});

test("a replaced tach no longer poisons the hobbs↔tach ratio", () => {
  const raw = [
    R("a", "2024-01-01", 800, 3980),
    R("b", "2024-06-01", 900, 4070),
    R("c", "2024-12-01", 980, 4142),
    R("d", "2025-02-01", 1000, 20),
    R("e", "2025-06-01", 1100, 110),
  ];
  const { ratio } = deriveRatio(applyResets(raw, TACH_SWAP));
  assert.ok(Math.abs(ratio - 0.9) < 0.05, `ratio=${ratio}`);
});

test("currentTach after a swap reports total time, not the face reading", () => {
  const ct = currentTach(
    applyResets([R("old", "2024-12-01", 980, 4200), R("new", "2025-02-01", 1000, 12.3)], TACH_SWAP),
  );
  assert.equal(ct.tach, 4212.3);
  assert.equal(ct.estimated, false);
});

test("meterValueAtDate reads a pre-swap date on the same continuous scale", () => {
  const rs = applyResets(
    [R("annual", "2024-03-01", 850, 4050), R("new", "2025-02-01", 1000, 12.3)],
    TACH_SWAP,
  );
  assert.equal(meterValueAtDate(rs, "2024-03-01", "tach"), 4050);
});

// --- stored scalars --------------------------------------------------------
test("toTotal/toFace round-trip a stored last-done scalar across the swap", () => {
  assert.equal(toTotal(4050, "2024-03-01", "tach", TACH_SWAP), 4050); // recorded pre-swap
  assert.equal(toTotal(15, "2025-03-01", "tach", TACH_SWAP), 4215); // recorded post-swap
  assert.equal(toFace(4215, "2025-03-01", "tach", TACH_SWAP), 15);
  assert.equal(toTotal(null, "2025-03-01", "tach", TACH_SWAP), null);
});

// --- the end-to-end countdown ---------------------------------------------
const item = (over: Partial<MaintenanceItem>): MaintenanceItem =>
  ({
    id: "i",
    kind: "hundred_hour",
    label: "100-hour",
    regulatory: true,
    interval_months: null,
    interval_hours: 100,
    last_done_date: null,
    last_done_hours: null,
    next_due_date: null,
    next_due_hours: null,
    notes: null,
    meter: null,
    ...over,
  }) as MaintenanceItem;

test("100-hour done before a tach swap still counts down correctly after it", () => {
  const resets = TACH_SWAP;
  const currents: MeterCurrents = {
    // current tach = 12.3 on the new meter = 4212.3 total
    tach: 4212.3,
    hobbs: 1000,
    baselineFor: (date, meter) =>
      date === "2024-12-01" ? (meter === "tach" ? 4160 : 970) : null,
    toTotalHours: (v, date, meter) => toTotal(v, date, meter, resets),
  };
  // Owner recorded last-done as 4160 — the OLD meter's reading that day.
  const [s] = buildStatusItems([item({ last_done_hours: 4160, last_done_date: "2024-12-01" })], [], currents);
  assert.equal(s.meter, "tach");
  assert.equal(s.hoursUnreliable, false, "must not read as 'check last-done'");
  assert.equal(s.lastDoneForItem, 4160);
  assert.equal(s.nextDueForItem, 4260);
  assert.equal(Math.round((s.nextDueForItem! - s.currentForItem!) * 10) / 10, 47.7);
});

test("without the swap declared, that same item reads as unreliable (the bug being fixed)", () => {
  const currents: MeterCurrents = {
    tach: 12.3, // face value, no stitching
    hobbs: 1000,
    baselineFor: () => null,
  };
  const [s] = buildStatusItems([item({ last_done_hours: 4160, last_done_date: "2024-12-01" })], [], currents);
  assert.equal(s.hoursUnreliable, true);
});

// --- per-item meter override (owner feedback: "oil is on tach for us") -----
test("meterForItem: the default is unchanged — oil on hobbs, everything else on tach", () => {
  assert.equal(meterForItem("oil_change"), "hobbs");
  assert.equal(meterForItem("hundred_hour"), "tach");
  assert.equal(meterForItem("other"), "tach");
});

test("meterForItem: an explicit override wins for any kind", () => {
  assert.equal(meterForItem("oil_change", "tach"), "tach");
  assert.equal(meterForItem("hundred_hour", "hobbs"), "hobbs");
  assert.equal(meterForItem("annual", "airframe"), "airframe");
});

const oil = (over: Partial<MaintenanceItem> = {}): MaintenanceItem =>
  ({
    id: "oil",
    kind: "oil_change",
    label: "Oil change",
    regulatory: false,
    interval_months: null,
    interval_hours: 50,
    last_done_date: "2026-01-01",
    last_done_hours: 4000,
    next_due_date: null,
    next_due_hours: 4050,
    notes: null,
    meter: null,
    ...over,
  }) as MaintenanceItem;

test("oil set to tach counts down on the tach, not hobbs", () => {
  const currents: MeterCurrents = {
    tach: 4030,
    hobbs: 900,
    baselineFor: (date, meter) => (date === "2026-01-01" ? (meter === "tach" ? 4000 : 880) : null),
  };
  const [s] = buildStatusItems([oil({ meter: "tach" })], [], currents);
  assert.equal(s.meter, "tach");
  assert.equal(s.currentForItem, 4030);
  assert.equal(s.nextDueForItem, 4050);
});

test("no hobbs meter on the aircraft → oil falls back to tach instead of an invented hobbs", () => {
  // currentHobbs() bridges from tach at the default ratio when nothing was ever
  // recorded, and flags it estimated. That number must not drive a countdown.
  const currents: MeterCurrents = {
    tach: 4030,
    hobbs: 3627, // 4030 / 0.9 — fabricated
    hobbsEstimated: true,
    baselineFor: (date, meter) => (date === "2026-01-01" ? (meter === "tach" ? 4000 : 3600) : null),
  };
  const [s] = buildStatusItems([oil()], [], currents);
  assert.equal(s.meter, "tach");
  assert.equal(s.currentForItem, 4030);
});

test("an owner who explicitly picked hobbs keeps hobbs, estimate or not", () => {
  const currents: MeterCurrents = {
    tach: 4030,
    hobbs: 3627,
    hobbsEstimated: true,
    baselineFor: () => null,
  };
  const [s] = buildStatusItems([oil({ meter: "hobbs", last_done_hours: 3600 })], [], currents);
  assert.equal(s.meter, "hobbs");
});

// --- airframe (owner feedback: sailplanes) ---------------------------------
test("currentAirframe: a recorded reading is used as-is, not estimated", () => {
  const ca = currentAirframe([
    R("a", "2025-01-01", null, null, 3100),
    R("b", "2025-06-01", null, null, 3180.5),
  ]);
  assert.equal(ca.airframe, 3180.5);
  assert.equal(ca.estimated, false);
});

// Most logbooks write total time straight off the tach and never fill an
// airframe column, so an airframe-hours inspection had no countdown at all.
// The tach now stands in — but only where the book itself shows the two have
// never disagreed.

test("currentAirframe: the tach stands in when the logbook never wrote a total", () => {
  const ca = currentAirframe([R("a", "2025-01-01", 900, 4000)]);
  assert.equal(ca.airframe, 4000);
  // Marked estimated: the hours are real, but nobody wrote them in the airframe
  // column, and every consumer that distinguishes derived values keeps doing so.
  assert.equal(ca.estimated, true);
});

test("currentAirframe: one divergent co-recorded pair stops the substitution", () => {
  // 3100 airframe against 900 tach on the same reading — this aircraft keeps the
  // two apart. The later tach-only reading must NOT become the airframe total;
  // the answer stays the last thing actually written in the airframe column.
  const rs = [R("a", "2024-01-01", 800, 900, 3100), R("b", "2025-01-01", null, 4000)];
  const ca = currentAirframe(rs);
  assert.equal(ca.airframe, 3100, "the tach must not be adopted as the total");
  assert.equal(ca.estimated, false);
});

test("currentAirframe: a sparse TT column is filled forward from the tach", () => {
  // The ordinary book: TT written once, tach every time. Without filling, the
  // current airframe would be stuck at the 2024 entry.
  const rs = [R("a", "2024-01-01", 800, 4000, 4000), R("b", "2025-06-01", 950, 4210)];
  const ca = currentAirframe(rs);
  assert.equal(ca.airframe, 4210);
  assert.equal(ca.estimated, true, "derived from the tach, not written down");
  assert.equal(ca.asOf, "2025-06-01");
});

test("currentAirframe: a recorded airframe total always wins over the tach", () => {
  const ca = currentAirframe([R("a", "2025-01-01", 900, 4000, 3180.5)]);
  assert.equal(ca.airframe, 3180.5);
  assert.equal(ca.estimated, false);
});

test("airframeTracksTach: transcription slop is not divergence", () => {
  // Same number written twice, rounded differently — not two different meters.
  assert.equal(airframeTracksTach([R("a", "2025-01-01", 900, 4000.2, 4000)]), true);
  assert.equal(airframeTracksTach([R("a", "2025-01-01", 900, 4000, 3100)]), false);
});

test("airframeTracksTach: no co-recorded pair is not evidence of divergence", () => {
  assert.equal(airframeTracksTach([R("a", "2025-01-01", 900, 4000)]), true);
  assert.equal(airframeTracksTach([]), true);
});

test("meterValueAtDate: airframe takes the tach at that date when they track", () => {
  const rs = [R("a", "2025-01-01", 900, 4000)];
  assert.equal(meterValueAtDate(rs, "2025-01-01", "airframe"), 4000);
});

test("meterValueAtDate: a diverged book keeps its own airframe series", () => {
  // No synthesis: the 2025 tach of 4000 must not answer for airframe.
  const rs = [R("a", "2024-01-01", 800, 900, 3100), R("b", "2025-01-01", null, 4000)];
  assert.equal(meterValueAtDate(rs, "2025-01-01", "airframe"), 3100);
});

test("meterValueAtDate: a tracking book answers at the date asked, not the nearest TT", () => {
  // This is the point of filling: an inspection done in 2025 anchors to the 2025
  // hours, not to the one TT someone wrote in 2024.
  const rs = [R("a", "2024-01-01", 800, 4000, 4000), R("b", "2025-06-01", 950, 4210)];
  assert.equal(meterValueAtDate(rs, "2025-06-01", "airframe"), 4210);
});

test("meterValueAtDate: airframe is still never SCALED from hobbs", () => {
  // The substitution is a direct read of the tach, never ratio math — there is
  // no fixed relationship between airframe hours and hobbs to scale across.
  const rs = [R("a", "2025-01-01", 900, null)];
  assert.equal(meterValueAtDate(rs, "2025-01-01", "airframe"), null);
});

test("a glider's annual counts down on airframe time", () => {
  const currents: MeterCurrents = {
    tach: null,
    hobbs: null,
    airframe: 3180.5,
    baselineFor: (date, meter) =>
      date === "2025-06-01" && meter === "airframe" ? 3100 : null,
  };
  const [s] = buildStatusItems(
    [
      oil({
        id: "insp",
        kind: "hundred_hour",
        label: "100-hour",
        meter: "airframe",
        interval_hours: 100,
        last_done_date: "2025-06-01",
        last_done_hours: 3100,
        next_due_hours: 3200,
      }),
    ],
    [],
    currents,
  );
  assert.equal(s.meter, "airframe");
  assert.equal(s.hoursUnreliable, false);
  assert.equal(s.currentForItem, 3180.5);
  assert.equal(s.nextDueForItem, 3200);
});

test("an airframe item with no airframe reading shows no countdown rather than a fake one", () => {
  const currents: MeterCurrents = { tach: 4030, hobbs: 900, airframe: null, baselineFor: () => null };
  const [s] = buildStatusItems([oil({ meter: "airframe" })], [], currents);
  // It must NOT silently re-home onto the tach and count down against 4030.
  assert.equal(s.meter, "airframe");
  assert.equal(s.currentForItem, null);
  // No hours to compare → no hours countdown at all (urgency falls back to dates).
  assert.equal(hoursRemaining(s.nextDueForItem, s.currentForItem), null);
});
