import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatusItems, type MeterCurrents } from "../src/lib/status";
import type { MaintenanceItem } from "../src/lib/database.types";

// Minimal oil-change item (non-regulatory usage → hobbs by policy).
const oil = (lastDone: number, lastDate: string | null): MaintenanceItem =>
  ({
    id: "oil",
    kind: "oil_change",
    label: "Oil change",
    regulatory: false,
    interval_months: null,
    interval_hours: 50,
    last_done_date: lastDate,
    last_done_hours: lastDone,
    next_due_date: null,
    next_due_hours: lastDone + 50,
    notes: null,
  }) as MaintenanceItem;

test("the real case: oil done at tach 4141.6 / hobbs 946.1, now hobbs 947.7 → 48.4 hrs left on hobbs", () => {
  const currents: MeterCurrents = {
    tach: 4141.6,
    hobbs: 947.7,
    // last-done stored as the tach value 4141.6; the hobbs at that date is 946.1
    baselineFor: (date, meter) =>
      date === "2026-07-05" ? (meter === "hobbs" ? 946.1 : 4141.6) : null,
  };
  const [s] = buildStatusItems([oil(4141.6, "2026-07-05")], [], currents);
  assert.equal(s.meter, "hobbs");
  assert.equal(s.hoursUnreliable, false);
  assert.equal(s.lastDoneForItem, 946.1);
  assert.equal(s.nextDueForItem, 996.1);
  assert.equal(s.currentForItem, 947.7);
  const remaining = Math.round((s.nextDueForItem! - s.currentForItem!) * 10) / 10;
  assert.equal(remaining, 48.4);
});

test("oil recorded directly in hobbs still works (no re-anchor needed)", () => {
  const [s] = buildStatusItems([oil(946.1, "2026-07-05")], [], { tach: 1150, hobbs: 947.7 });
  assert.equal(s.meter, "hobbs");
  assert.equal(s.lastDoneForItem, 946.1);
  assert.equal(s.nextDueForItem, 996.1);
  assert.equal(s.hoursUnreliable, false);
});

test("oil recorded in tach when tach < hobbs re-anchors to hobbs (asymmetric-guard bug)", () => {
  // Low-time engine: oil logged at tach 284 (a SMALL number), but oil counts down
  // on hobbs (current 957.6). The old guard only re-anchored when current < stored,
  // so 957.6 ≥ 284 skipped it → used 284 as a hobbs baseline → falsely overdue.
  const currents: MeterCurrents = {
    tach: 300,
    hobbs: 957.6,
    baselineFor: (date, meter) =>
      date === "2026-07-05" ? (meter === "hobbs" ? 946.1 : 284) : null,
  };
  const [s] = buildStatusItems([oil(284, "2026-07-05")], [], currents);
  assert.equal(s.meter, "hobbs");
  assert.equal(s.lastDoneForItem, 946.1); // re-anchored, not 284
  assert.equal(s.nextDueForItem, 996.1);
  assert.notEqual(s.urgency, "overdue"); // remaining ≈ 38.5, not thousands
});

test("no same-meter baseline and last-done above both meters → flagged unreliable", () => {
  const [s] = buildStatusItems([oil(4141.6, "2026-07-05")], [], {
    tach: 1150,
    hobbs: 947.7,
    baselineFor: () => null,
  });
  assert.equal(s.hoursUnreliable, true);
  assert.notEqual(s.urgency, "overdue");
});

test("Engine TBO counts down on tach, not hobbs (advisory but engine-time)", () => {
  const tbo = {
    id: "tbo",
    kind: "engine_tbo",
    label: "Engine TBO",
    regulatory: false, // advisory — but must NOT go on hobbs
    interval_months: null,
    interval_hours: 2000,
    last_done_date: "2020-01-01",
    last_done_hours: 2100, // tach at last overhaul
    next_due_date: null,
    next_due_hours: 4100,
    notes: null,
  } as MaintenanceItem;
  const [s] = buildStatusItems([tbo], [], { tach: 4141.6, hobbs: 947.7 });
  assert.equal(s.meter, "tach");
  assert.equal(s.currentForItem, 4141.6);
});

test("regulatory tach item keeps its stored tach next-due (no re-anchor)", () => {
  const item = {
    id: "100hr",
    kind: "hundred_hour",
    label: "100-hour",
    regulatory: true,
    interval_months: null,
    interval_hours: 100,
    last_done_date: "2026-01-01",
    last_done_hours: 4100,
    next_due_date: null,
    next_due_hours: 4200,
    notes: null,
  } as MaintenanceItem;
  const [s] = buildStatusItems([item], [], { tach: 4141.6, hobbs: 947.7 });
  assert.equal(s.meter, "tach");
  assert.equal(s.nextDueForItem, 4200);
  assert.equal(s.currentForItem, 4141.6);
});
