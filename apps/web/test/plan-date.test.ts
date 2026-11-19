import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 08 C-PLAN-01 / 09 §4.4, beyond the byte-for-byte fixture check in due-fixtures.test.ts.
const fixtures = JSON.parse(readFileSync(new URL("../../../packages/shared/fixtures/plan-date.json", import.meta.url), "utf8"));
const byName = (n: string) => fixtures.cases.find((c: { name: string }) => c.name.startsWith(n)).expected;
const keys = (xs: { key: string }[]) => xs.map((x) => x.key);

test("plan ahead: the 08 acceptance at the reference (Mar 1, 2027, 3 h a week)", () => {
  const p = byName("worked example");
  assert.equal(p.hoursPerWeek, 3);
  assert.equal(p.hoursUntil, 44.1);
  assert.deepEqual(keys(p.lapsed), ["mx:mx-vor"]);
  assert.deepEqual(keys(p.lapses).sort(), ["mx:mx-elt_battery", "mx:mx-oil_change", "mx:mx-pitot_static", "mx:mx-transponder"]);
  assert.deepEqual(keys(p.stillInDate).sort(), ["ad:ad-seat", "mx:mx-annual", "mx:mx-elt"]);
  assert.deepEqual(p.cannotCheck, [{ key: "doc:doc-ins", reason: "no_date" }]);
  assert.ok(p.lapses.every((l: { coveredByVisit: string | null }) => l.coveredByVisit?.startsWith("sugg:")));
});

test("rule 7.2: unconfirmed entries do not change the plan", () => {
  assert.deepEqual(byName("unconfirmed:"), byName("worked example"));
});

test("plan ahead: no flying never reaches an hours limit; no basis cannot date one", () => {
  const zero = byName("no flying");
  assert.equal(zero.hoursUntil, 0);
  assert.ok(!keys(zero.lapses).includes("mx:mx-oil_change"));
  assert.deepEqual(byName("no recent flying").cannotCheck, [{ key: "mx:mx-hundred_hour", reason: "no_recent_flying" }]);
  assert.deepEqual(byName("the chosen date is today").lapses, []);
});
