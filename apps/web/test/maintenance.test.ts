import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maintenanceNextDue,
  effectiveNextDue,
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
