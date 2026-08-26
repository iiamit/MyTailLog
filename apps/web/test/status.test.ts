import { test } from "node:test";
import assert from "node:assert/strict";
import {
  meterForItem,
  buildStatusItems,
  sortStatusItems,
  daysUntil,
  hoursRemaining,
} from "../src/lib/status";
import type { MaintenanceItem } from "../src/lib/database.types";

// --- meterForItem ----------------------------------------------------------
test("meterForItem: oil_change runs on hobbs; everything else on tach", () => {
  assert.equal(meterForItem("oil_change"), "hobbs");
  assert.equal(meterForItem("hundred_hour"), "tach");
  assert.equal(meterForItem("annual"), "tach");
  assert.equal(meterForItem("engine_tbo"), "tach"); // advisory but engine-time
  assert.equal(meterForItem("prop_overhaul"), "tach");
  assert.equal(meterForItem("ad"), "tach");
  assert.equal(meterForItem("something_unknown"), "tach"); // unknown → default tach
});

// --- buildStatusItems ------------------------------------------------------
// A tach hours-driven item (engine_tbo: not hundred_hour, so effectiveNextDue
// passes its stored next-due straight through — no cross-item reset).
const tbo = (lastDoneHours: number, nextDueHours: number): MaintenanceItem =>
  ({
    id: "tbo",
    kind: "engine_tbo",
    label: "Engine TBO",
    regulatory: false,
    interval_months: null,
    interval_hours: 200,
    last_done_date: "2020-01-01",
    last_done_hours: lastDoneHours,
    next_due_date: null,
    next_due_hours: nextDueHours,
    notes: null,
  }) as MaintenanceItem;

// A date-driven regulatory item (annual). No hours → hours re-anchor is skipped.
const annual = (nextDueDate: string): MaintenanceItem =>
  ({
    id: "annual",
    kind: "annual",
    label: "Annual inspection",
    regulatory: true,
    interval_months: 12,
    interval_hours: null,
    last_done_date: "2000-01-01",
    last_done_hours: null,
    next_due_date: nextDueDate,
    next_due_hours: null,
    notes: null,
  }) as MaintenanceItem;

test("buildStatusItems: hours-driven tach item, next-due already passed → overdue", () => {
  const [s] = buildStatusItems([tbo(4000, 4200)], [], { tach: 4300, hobbs: 900 });
  assert.equal(s.meter, "tach");
  assert.equal(s.currentForItem, 4300);
  assert.equal(s.nextDueForItem, 4200);
  assert.equal(s.nextDueHours, 4200); // stored scalar passthrough
  assert.equal(s.urgency, "overdue");
});

test("buildStatusItems: hours-driven tach item within 10 hrs → due_soon", () => {
  const [s] = buildStatusItems([tbo(4000, 4200)], [], { tach: 4195, hobbs: 900 });
  assert.equal(s.urgency, "due_soon"); // 5 hrs left
  assert.equal(s.hoursUnreliable, false);
});

test("buildStatusItems: hours-driven tach item far from due → upcoming", () => {
  const [s] = buildStatusItems([tbo(4000, 4200)], [], { tach: 4050, hobbs: 900 });
  assert.equal(s.urgency, "upcoming"); // 150 hrs left
});

test("buildStatusItems: date-driven annual long past due → overdue", () => {
  const [s] = buildStatusItems([annual("2001-01-01")], [], { tach: null, hobbs: null });
  assert.equal(s.meter, "tach");
  assert.equal(s.nextDueDate, "2001-01-01"); // passthrough
  assert.equal(s.nextDueForItem, null); // no hours on a date-only item
  assert.equal(s.urgency, "overdue");
});

test("buildStatusItems: date-driven annual far in the future → upcoming", () => {
  const [s] = buildStatusItems([annual("2099-01-01")], [], { tach: null, hobbs: null });
  assert.equal(s.urgency, "upcoming"); // > 90 days out
  assert.equal(s.nextDueDate, "2099-01-01");
});

test("buildStatusItems: legacy VOR rows are recalculated to exactly 30 days", () => {
  const item = {
    ...annual("2025-04-15"),
    id: "vor",
    kind: "vor",
    label: "VOR check (91.171) — IFR",
    interval_months: 1,
    last_done_date: "2025-03-15",
  } as MaintenanceItem;
  const [s] = buildStatusItems([item], [], { tach: null, hobbs: null });
  assert.equal(s.nextDueDate, "2025-04-14");
});

test("buildStatusItems: an AD row is labeled, tach-metered, and verified when a page backs it", () => {
  const items = buildStatusItems([], [
    {
      id: "ad1",
      reference: "2020-01-05",
      kind: "ad",
      next_due_date: "2001-01-01", // long past → overdue
      next_due_hours: null,
      status: "open",
      verified_report_page_id: "page-9",
      verified_at: "2026-01-01T00:00:00Z",
    },
  ], { tach: 4300, hobbs: 900 });
  const [s] = items;
  assert.equal(s.source, "ad");
  assert.equal(s.label, "AD 2020-01-05");
  assert.equal(s.meter, "tach");
  assert.equal(s.verifiedReport, true);
  assert.equal(s.verifiedReportAt, "2026-01-01T00:00:00Z");
  assert.equal(s.urgency, "overdue");
});

// --- sortStatusItems -------------------------------------------------------
test("sortStatusItems: orders by urgency rank, then soonest next-due date", () => {
  const items = [
    { urgency: "upcoming" as const, nextDueDate: "2030-01-01" },
    { urgency: "overdue" as const, nextDueDate: "2020-06-01" },
    { urgency: "overdue" as const, nextDueDate: "2020-01-01" },
    { urgency: "due_soon" as const, nextDueDate: "2026-01-01" },
    { urgency: "none" as const, nextDueDate: null },
  ];
  const sorted = sortStatusItems(items);
  assert.deepEqual(
    sorted.map((s) => [s.urgency, s.nextDueDate]),
    [
      ["overdue", "2020-01-01"], // overdue, earliest date first
      ["overdue", "2020-06-01"],
      ["due_soon", "2026-01-01"],
      ["upcoming", "2030-01-01"],
      ["none", null], // null date sorts last within its rank
    ],
  );
});

test("sortStatusItems: null next-due date sorts after real dates in the same rank", () => {
  const sorted = sortStatusItems([
    { urgency: "upcoming" as const, nextDueDate: null },
    { urgency: "upcoming" as const, nextDueDate: "2040-01-01" },
  ]);
  assert.deepEqual(sorted.map((s) => s.nextDueDate), ["2040-01-01", null]);
});

test("sortStatusItems: does not mutate the input array", () => {
  const input = [
    { urgency: "upcoming" as const, nextDueDate: "2030-01-01" },
    { urgency: "overdue" as const, nextDueDate: "2020-01-01" },
  ];
  sortStatusItems(input);
  assert.equal(input[0].urgency, "upcoming"); // original order intact
});

// --- daysUntil -------------------------------------------------------------
const TODAY = new Date("2026-07-21T12:00:00Z");
test("daysUntil: positive for a future date, negative for past, zero for today", () => {
  assert.equal(daysUntil("2026-07-31", TODAY), 10);
  assert.equal(daysUntil("2026-07-11", TODAY), -10);
  assert.equal(daysUntil("2026-07-21", TODAY), 0);
});

test("daysUntil: null date → null", () => {
  assert.equal(daysUntil(null, TODAY), null);
});

// --- hoursRemaining --------------------------------------------------------
test("hoursRemaining: next-due minus current, rounded to one decimal", () => {
  assert.equal(hoursRemaining(4200, 4150), 50);
  assert.equal(hoursRemaining(4150, 4200), -50); // overdue → negative
  assert.equal(hoursRemaining(4200.7, 4141.6), 59.1); // floating rounding
});

test("hoursRemaining: null when either operand is null", () => {
  assert.equal(hoursRemaining(null, 4150), null);
  assert.equal(hoursRemaining(4200, null), null);
  assert.equal(hoursRemaining(null, null), null);
});
