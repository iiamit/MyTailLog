import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  computeNextDue,
  urgencyOf,
  urgencyLabel,
  dueText,
  DUE_SOON_DAYS,
  DUE_SOON_HOURS,
} from "../src/lib/compliance";

// --- addMonths -------------------------------------------------------------
test("addMonths: adds whole calendar months (UTC)", () => {
  assert.equal(addMonths("2025-01-15", 12), "2026-01-15");
  assert.equal(addMonths("2025-01-15", 24), "2027-01-15");
  assert.equal(addMonths("2025-06-10", 1), "2025-07-10");
});

test("addMonths: zero months is a no-op", () => {
  assert.equal(addMonths("2025-03-03", 0), "2025-03-03");
});

test("addMonths: end-of-month overflow rolls into the next month (JS Date semantics)", () => {
  // Jan 31 + 1mo → Feb 31 doesn't exist → normalizes to Mar 3, 2025.
  assert.equal(addMonths("2025-01-31", 1), "2025-03-03");
});

// --- computeNextDue --------------------------------------------------------
test("computeNextDue: non-recurring → both null", () => {
  assert.deepEqual(
    computeNextDue({
      recurring: false,
      status: "complied",
      complied_date: "2025-01-01",
      complied_hours: 100,
      interval_months: 12,
      interval_hours: 50,
    }),
    { next_due_date: null, next_due_hours: null },
  );
});

test("computeNextDue: recurring but not complied → both null", () => {
  assert.deepEqual(
    computeNextDue({
      recurring: true,
      status: "open",
      complied_date: "2025-01-01",
      complied_hours: 100,
      interval_months: 12,
      interval_hours: 50,
    }),
    { next_due_date: null, next_due_hours: null },
  );
});

test("computeNextDue: recurring + complied → date and hours from interval", () => {
  assert.deepEqual(
    computeNextDue({
      recurring: true,
      status: "complied",
      complied_date: "2025-01-15",
      complied_hours: 1234.56,
      interval_months: 12,
      interval_hours: 50,
    }),
    { next_due_date: "2026-01-15", next_due_hours: 1284.6 },
  );
});

test("computeNextDue: complied_hours of 0 still computes (0 != null)", () => {
  const r = computeNextDue({
    recurring: true,
    status: "complied",
    complied_date: null,
    complied_hours: 0,
    interval_months: null,
    interval_hours: 100,
  });
  assert.equal(r.next_due_hours, 100);
  assert.equal(r.next_due_date, null);
});

test("computeNextDue: missing interval components stay null", () => {
  assert.deepEqual(
    computeNextDue({
      recurring: true,
      status: "complied",
      complied_date: "2025-01-15",
      complied_hours: null,
      interval_months: null,
      interval_hours: 50,
    }),
    { next_due_date: null, next_due_hours: null },
  );
});

// --- urgencyOf -------------------------------------------------------------
const TODAY = new Date("2026-01-01T12:00:00Z");

test("urgencyOf: no next-due at all → none", () => {
  assert.equal(urgencyOf({ next_due_date: null, next_due_hours: null }, null, TODAY), "none");
});

test("urgencyOf: past due date → overdue", () => {
  assert.equal(urgencyOf({ next_due_date: "2025-12-31", next_due_hours: null }, null, TODAY), "overdue");
});

test("urgencyOf: date within threshold → due_soon; equal-to-today counts as soon not overdue", () => {
  assert.equal(urgencyOf({ next_due_date: "2026-01-01", next_due_hours: null }, null, TODAY), "due_soon");
  const boundary = addMonths("2026-01-01", 0); // same day
  assert.equal(urgencyOf({ next_due_date: boundary, next_due_hours: null }, null, TODAY), "due_soon");
});

test("urgencyOf: date exactly DUE_SOON_DAYS out → due_soon; one day past → upcoming", () => {
  const soon = new Date(Date.parse("2026-01-01T00:00:00Z") + DUE_SOON_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const later = new Date(Date.parse("2026-01-01T00:00:00Z") + (DUE_SOON_DAYS + 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  assert.equal(urgencyOf({ next_due_date: soon, next_due_hours: null }, null, TODAY), "due_soon");
  assert.equal(urgencyOf({ next_due_date: later, next_due_hours: null }, null, TODAY), "upcoming");
});

test("urgencyOf: hours at-or-below current → overdue (equal counts as overdue)", () => {
  assert.equal(urgencyOf({ next_due_date: null, next_due_hours: 100 }, 100, TODAY), "overdue");
  assert.equal(urgencyOf({ next_due_date: null, next_due_hours: 100 }, 120, TODAY), "overdue");
});

test("urgencyOf: hours within DUE_SOON_HOURS → due_soon; beyond → upcoming", () => {
  assert.equal(urgencyOf({ next_due_date: null, next_due_hours: 100 }, 100 - DUE_SOON_HOURS, TODAY), "due_soon");
  assert.equal(urgencyOf({ next_due_date: null, next_due_hours: 100 }, 100 - DUE_SOON_HOURS - 1, TODAY), "upcoming");
});

test("urgencyOf: hours ignored when currentHours is null → upcoming", () => {
  assert.equal(urgencyOf({ next_due_date: null, next_due_hours: 100 }, null, TODAY), "upcoming");
});

test("urgencyOf: overdue on hours outranks soon on date", () => {
  assert.equal(urgencyOf({ next_due_date: "2026-01-15", next_due_hours: 100 }, 100, TODAY), "overdue");
});

// --- urgencyLabel ----------------------------------------------------------
test("urgencyLabel: maps each urgency to its display string", () => {
  assert.equal(urgencyLabel("overdue"), "OVERDUE");
  assert.equal(urgencyLabel("due_soon"), "due soon");
  assert.equal(urgencyLabel("upcoming"), "upcoming");
});

// --- dueText ---------------------------------------------------------------
test("dueText: both null → null", () => {
  assert.equal(dueText(null, null, null), null);
});

test("dueText: past date → 'Nd overdue'", () => {
  assert.equal(dueText("2000-01-01", null, null), `${daysAgo("2000-01-01")}d overdue`);
});

test("dueText: today → 'due today'", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(dueText(today, null, null), "due today");
});

test("dueText: hours only, current known → 'N hrs left' / 'N hrs over'", () => {
  assert.equal(dueText(null, 100, 90), "10 hrs left");
  assert.equal(dueText(null, 100, 110), "10 hrs over");
});

test("dueText: hours only, no current hours → 'at N hrs'", () => {
  assert.equal(dueText(null, 100, null), "at 100 hrs");
});

test("dueText: joins date and hours parts with ' · '", () => {
  assert.equal(dueText("2000-01-01", 100, 90), `${daysAgo("2000-01-01")}d overdue · 10 hrs left`);
});

// helper: whole days between an ISO date and today, matching dueText's rounding.
function daysAgo(iso: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return -Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
}
