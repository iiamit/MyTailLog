import { test } from "node:test";
import assert from "node:assert/strict";
import { build, stale } from "../../../packages/shared/scripts/build-due-fixtures";

test("due fixtures: committed files are current and cover the phase 1 rules", () => {
  assert.deepEqual(stale(), [], "fixtures are stale: cd apps/web && node --import tsx ../../packages/shared/scripts/build-due-fixtures.ts");
  const files = Object.fromEntries(Object.entries(build()).map(([f, t]) => [f, JSON.parse(t)]));
  const cases = Object.values(files).flatMap((f) => f.cases);
  assert.ok(cases.length >= 60, `${cases.length} cases`);
  for (const f of Object.values(files)) {
    assert.ok(f.rule && Number.isInteger(f.algoVersion));
    for (const c of f.cases) assert.deepEqual(Object.keys(c), ["name", "today", "input", "expected"]);
  }
  const names = cases.map((c) => c.name).join("\n");
  for (const topic of [/both limits/, /calendar month/, /stale/, /no record/, /unconfirmed/, /due soon/])
    assert.match(names, topic);
});
