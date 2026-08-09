import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maintenanceNextDue,
  effectiveNextDue,
  calendarMonthsDue,
  CALENDAR_MONTH_KINDS,
  STANDARD_ITEMS,
  DEFAULT_SEED_KINDS,
} from "../src/lib/maintenance";

// --- maintenanceNextDue ----------------------------------------------------
test("maintenanceNextDue: computes date and hours from last-done + interval", () => {
  assert.deepEqual(
    maintenanceNextDue({
      interval_months: 12,
      interval_hours: 50,
      last_done_date: "2025-01-15",
      last_done_hours: 1200.05,
    }),
    { next_due_date: "2026-01-15", next_due_hours: 1250.1 },
  );
});

test("maintenanceNextDue: null last-done components stay null", () => {
  assert.deepEqual(
    maintenanceNextDue({
      interval_months: 12,
      interval_hours: 50,
      last_done_date: null,
      last_done_hours: null,
    }),
    { next_due_date: null, next_due_hours: null },
  );
});

test("maintenanceNextDue: null intervals stay null even with a last-done value", () => {
  assert.deepEqual(
    maintenanceNextDue({
      interval_months: null,
      interval_hours: null,
      last_done_date: "2025-01-15",
      last_done_hours: 1200,
    }),
    { next_due_date: null, next_due_hours: null },
  );
});

test("maintenanceNextDue: last_done_hours of 0 still computes (0 != null)", () => {
  assert.equal(
    maintenanceNextDue({
      interval_months: null,
      interval_hours: 50,
      last_done_date: null,
      last_done_hours: 0,
    }).next_due_hours,
    50,
  );
});

// --- effectiveNextDue ------------------------------------------------------
const hundred = (over: Partial<{ interval_hours: number | null; last_done_hours: number | null; next_due_hours: number | null; next_due_date: string | null }> = {}) => ({
  kind: "hundred_hour",
  interval_hours: 100 as number | null,
  last_done_hours: 1000 as number | null,
  next_due_date: "2026-01-01" as string | null,
  next_due_hours: 1100 as number | null,
  ...over,
});

test("effectiveNextDue: a later annual resets the 100-hour clock (uses max base + interval)", () => {
  const item = hundred({ last_done_hours: 1000 });
  const annual = { kind: "annual", interval_hours: null, last_done_hours: 1080, next_due_date: null, next_due_hours: null };
  const r = effectiveNextDue(item, [item, annual]);
  assert.equal(r.next_due_hours, 1180); // max(1000, 1080) + 100
  assert.equal(r.next_due_date, "2026-01-01"); // date unchanged
});

test("effectiveNextDue: 100-hour's own last-done wins when it's later than the annual", () => {
  const item = hundred({ last_done_hours: 1200 });
  const annual = { kind: "annual", interval_hours: null, last_done_hours: 1080, next_due_date: null, next_due_hours: null };
  assert.equal(effectiveNextDue(item, [item, annual]).next_due_hours, 1300); // max(1200,1080)+100
});

test("effectiveNextDue: 100-hour with no bases falls back to stored next_due_hours", () => {
  const item = hundred({ last_done_hours: null, next_due_hours: 999 });
  assert.equal(effectiveNextDue(item, [item]).next_due_hours, 999); // no annual, own last-done null
});

test("effectiveNextDue: 100-hour with null interval falls through to stored next_due", () => {
  const item = hundred({ interval_hours: null, next_due_hours: 777 });
  const annual = { kind: "annual", interval_hours: null, last_done_hours: 1080, next_due_date: null, next_due_hours: null };
  assert.equal(effectiveNextDue(item, [item, annual]).next_due_hours, 777);
});

test("effectiveNextDue: an annual (missing 100-hour) uses annual's own last-done base", () => {
  // Only the annual is present → max([1080]) + 100.
  const item = hundred({ last_done_hours: null, next_due_hours: 500 });
  const annual = { kind: "annual", interval_hours: null, last_done_hours: 1080, next_due_date: null, next_due_hours: null };
  assert.equal(effectiveNextDue(item, [item, annual]).next_due_hours, 1180);
});

test("effectiveNextDue: non-100-hour item just returns its own stored next-due", () => {
  const oil = { kind: "oil_change", interval_hours: 50, last_done_hours: 1000, next_due_date: "2026-03-01", next_due_hours: 1050 };
  assert.deepEqual(effectiveNextDue(oil, [oil]), { next_due_date: "2026-03-01", next_due_hours: 1050 });
});

// --- constants -------------------------------------------------------------
test("DEFAULT_SEED_KINDS are all present in STANDARD_ITEMS and are regulatory", () => {
  for (const kind of DEFAULT_SEED_KINDS) {
    const item = STANDARD_ITEMS.find((i) => i.kind === kind);
    assert.ok(item, `missing standard item: ${kind}`);
    assert.equal(item!.regulatory, true);
  }
});

test("STANDARD_ITEMS: advisory items are flagged non-regulatory", () => {
  const oil = STANDARD_ITEMS.find((i) => i.kind === "oil_change");
  assert.equal(oil!.regulatory, false);
  assert.equal(oil!.interval_hours, 50);
});

// --- calendar months (14 CFR "within the preceding N calendar months") -------
// Reported by an owner: we were adding EXACT months, so an annual signed off on
// 15 Mar showed as due 15 Mar the following year when the reg gives you through
// the 31st. We were up to a month early — the safe direction, but still wrong,
// and it costs real scheduling room. These move due dates LATER, so they get
// tested case by case.

test("calendarMonthsDue: the day of the month is irrelevant — due end of month", () => {
  // Every annual done in March 2025 is good through 31 Mar 2026.
  for (const day of ["01", "15", "31"]) {
    assert.equal(calendarMonthsDue(`2025-03-${day}`, 12), "2026-03-31");
  }
});

test("calendarMonthsDue: short months and leap years land on the real last day", () => {
  assert.equal(calendarMonthsDue("2024-02-15", 12), "2025-02-28"); // non-leap target
  assert.equal(calendarMonthsDue("2023-02-15", 12), "2024-02-29"); // leap target
  assert.equal(calendarMonthsDue("2025-01-31", 12), "2026-01-31");
  assert.equal(calendarMonthsDue("2025-04-10", 12), "2026-04-30"); // 30-day month
});

test("calendarMonthsDue: 24-month intervals roll the year correctly", () => {
  assert.equal(calendarMonthsDue("2025-06-05", 24), "2027-06-30");
  assert.equal(calendarMonthsDue("2025-12-20", 24), "2027-12-31"); // year boundary
});

test("maintenanceNextDue: the calendar-month regs use end-of-month", () => {
  for (const kind of ["annual", "transponder", "pitot_static", "elt"]) {
    const months = STANDARD_ITEMS.find((i) => i.kind === kind)!.interval_months!;
    const { next_due_date } = maintenanceNextDue({
      kind,
      interval_months: months,
      interval_hours: null,
      last_done_date: "2025-03-15",
      last_done_hours: null,
    });
    assert.equal(next_due_date, calendarMonthsDue("2025-03-15", months), kind);
    assert.ok(next_due_date!.endsWith("-31") || next_due_date!.endsWith("-30"), kind);
  }
});

test("VOR is NOT a calendar-month item — 91.171 is 30 days, not a month", () => {
  // Marking it calendar would push it to end-of-month, which is markedly LATER
  // than the reg allows. Being early here is the safe side.
  assert.ok(!CALENDAR_MONTH_KINDS.has("vor"));
  assert.equal(
    maintenanceNextDue({
      kind: "vor",
      interval_months: 1,
      interval_hours: null,
      last_done_date: "2025-03-15",
      last_done_hours: null,
    }).next_due_date,
    "2025-04-15",
  );
});

test("advisory month items keep exact months (no reg to read 'calendar' into)", () => {
  assert.ok(!CALENDAR_MONTH_KINDS.has("prop_overhaul"));
  assert.equal(
    maintenanceNextDue({
      kind: "prop_overhaul",
      interval_months: 72,
      interval_hours: null,
      last_done_date: "2025-03-15",
      last_done_hours: null,
    }).next_due_date,
    "2031-03-15",
  );
});

test("an unknown kind, or no kind at all, keeps the old exact-month behaviour", () => {
  for (const kind of ["other", undefined]) {
    assert.equal(
      maintenanceNextDue({
        kind,
        interval_months: 12,
        interval_hours: null,
        last_done_date: "2025-03-15",
        last_done_hours: null,
      }).next_due_date,
      "2026-03-15",
      String(kind),
    );
  }
});
