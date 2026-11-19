import { test } from "node:test";
import assert from "node:assert/strict";
import type { DueItem } from "../src/lib/due/engine";
import type { PlanResult } from "../src/lib/due/plan";
import { clampPlanDate, defaultPlanDate, parseRate, planAnswer, planHelper, planRings, scrubberText, stillInDateText } from "../src/lib/v2/plan";

// W-STATUS-03 Plan ahead, the web's pure helpers (the plan itself is lib/due/plan.ts, tested with the phones' fixture).

test("default date: today + 90 days, rounded up to the 1st of the next month (Mar 1, 2027 at the reference)", () => {
  assert.equal(defaultPlanDate("2026-11-18"), "2027-03-01");
  assert.equal(defaultPlanDate("2026-01-01"), "2026-05-01");
});

test("the chosen date stays between today and 24 months out", () => {
  assert.equal(clampPlanDate("2020-01-01", "2026-11-18"), "2026-11-18");
  assert.equal(clampPlanDate("2030-01-01", "2026-11-18"), "2028-11-18");
  assert.equal(clampPlanDate("2027-03-01", "2026-11-18"), "2027-03-01");
});

test("flying rate: 0 to 60 in half hours, blank is no rate", () => {
  assert.equal(parseRate("3"), 3);
  assert.equal(parseRate("3.3"), 3.5);
  assert.equal(parseRate("99"), 60);
  assert.equal(parseRate("-2"), 0);
  assert.equal(parseRate(""), null);
  assert.equal(parseRate("abc"), null);
});

const plan = (over: Partial<PlanResult>): PlanResult => ({
  date: "2027-03-01", hoursPerWeek: 3, hoursUntil: 43.7, metersOnDate: { tach: 4256.1, hobbs: null }, lapsed: [], lapses: [], stillInDate: [], cannotCheck: [], ...over,
});

test("the answer, helper and spoken value follow 12's plurals with numerals", () => {
  const five = plan({ lapsed: [{ key: "a", when: "already", dueDate: null, coveredByVisit: null }], lapses: ["b", "c", "d", "e"].map((key) => ({ key, when: "by_date" as const, dueDate: "2027-01-01", coveredByVisit: null })) });
  assert.equal(planAnswer(five), "By Mar 1, 5 items will have lapsed unless they are done first.");
  assert.equal(planAnswer(plan({ lapses: [{ key: "a", when: "by_date", dueDate: null, coveredByVisit: null }] })), "By Mar 1, 1 item will have lapsed unless it is done first.");
  assert.equal(planAnswer(plan({})), "By Mar 1, nothing tracked will have lapsed.");
  assert.equal(planHelper(plan({})), "About 44 hours, so the tach reads about 4,256.1 that day.");
  assert.equal(planHelper(plan({ hoursUntil: null })), null);
  assert.equal(scrubberText(five), "March 1, 2027, 5 items lapse");
  assert.equal(scrubberText(plan({})), "March 1, 2027, nothing lapses");
});

test("still in date names the spare days and hours", () => {
  const p = plan({ stillInDate: [{ key: "ad", spare: { hours: 12 } }, { key: "annual", spare: { days: 152 } }] });
  assert.equal(stillInDateText(p, (k) => `the ${k}`), "Still in date on Mar 1: the ad, with about 12.0 h to spare; and the annual, with 152 days.");
  assert.equal(stillInDateText(plan({}), (k) => k), null);
});

test("rings over 24 months: lapsing items turn overdue, documents and undated items stay off the line", () => {
  const item = (key: string, o: Partial<DueItem>): DueItem => ({ key, source: "maintenance", line: "airframe", status: "current", firstDate: "2027-06-01", first: "calendar", ...o } as DueItem);
  const rings = planRings([
    item("a", {}),
    item("b", { status: "overdue", firstDate: "2026-01-01" }),
    item("c", { firstDate: "2029-01-01" }),
    item("d", { source: "document" }),
    item("e", { firstDate: null }),
  ], "2026-11-18", "2028-11-18", new Set(["a"]));
  assert.deepEqual(rings.map((r) => [r.itemKey, r.date, r.status]), [["a", "2027-06-01", "overdue"], ["b", "2026-11-18", "overdue"]]);
});
