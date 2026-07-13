import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatusItems } from "../src/lib/status";
import type { MaintenanceItem } from "../src/lib/database.types";

// Minimal oil-change item (non-regulatory usage → hobbs by policy).
const oil = (lastDone: number, nextDue: number): MaintenanceItem =>
  ({
    id: "oil",
    kind: "oil_change",
    label: "Oil change",
    regulatory: false,
    interval_months: null,
    interval_hours: 50,
    last_done_date: "2025-01-01",
    last_done_hours: lastDone,
    next_due_date: null,
    next_due_hours: nextDue,
    notes: null,
  }) as MaintenanceItem;

test("healthy hobbs oil: stays on hobbs and advances (32 hrs left)", () => {
  const [s] = buildStatusItems([oil(1200, 1250)], [], { tach: 1150, hobbs: 1218 });
  assert.equal(s.meter, "hobbs");
  assert.equal(s.currentForItem, 1218);
  assert.equal(s.hoursUnreliable, false);
});

test("last-done above current hobbs but valid on tach → falls back to tach (never > interval)", () => {
  // last-done 1500 sits above hobbs 1200 (impossible flown) but below tach 1520.
  const [s] = buildStatusItems([oil(1500, 1550)], [], { tach: 1520, hobbs: 1200 });
  assert.equal(s.meter, "tach");
  assert.equal(s.currentForItem, 1520);
  assert.equal(s.hoursUnreliable, false);
  const remaining = s.nextDueHours! - s.currentForItem!; // 1550 - 1520 = 30 ≤ interval 50
  assert.ok(remaining <= 50 && remaining >= 0, `remaining=${remaining}`);
});

test("last-done above BOTH meters → flagged unreliable, not a bogus countdown", () => {
  const [s] = buildStatusItems([oil(3302, 3352)], [], { tach: 1520, hobbs: 1200 });
  assert.equal(s.hoursUnreliable, true);
  // urgency must not be driven by the impossible hours delta.
  assert.notEqual(s.urgency, "overdue");
});
