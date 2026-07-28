import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type WBTriple,
  type EquipChange,
  completeWB,
  usefulLoad,
  staleWBChanges,
} from "../src/lib/weightBalance";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// --- completeWB ------------------------------------------------------------
test("completeWB: derives moment from weight × arm (rounded 2dp)", () => {
  const r = completeWB({ weight: 100, arm: 40, moment: null });
  assert.deepEqual(r, { weight: 100, arm: 40, moment: 4000 });
});

test("completeWB: moment rounds to 2 decimal places", () => {
  const r = completeWB({ weight: 143.7, arm: 39.53, moment: null });
  // 143.7 * 39.53 = 5680.461 → round(…,2) = 5680.46
  assert.ok(r.moment != null && near(r.moment, 5680.46), `moment=${r.moment}`);
  assert.equal(r.weight, 143.7);
  assert.equal(r.arm, 39.53);
});

test("completeWB: derives arm from moment / weight (rounded 3dp)", () => {
  const r = completeWB({ weight: 2000, arm: null, moment: 80000 });
  assert.deepEqual(r, { weight: 2000, arm: 40, moment: 80000 });
});

test("completeWB: arm rounds to 3 decimal places", () => {
  const r = completeWB({ weight: 3, arm: null, moment: 100 });
  // 100 / 3 = 33.333… → round(…,3) = 33.333
  assert.ok(r.arm != null && near(r.arm, 33.333), `arm=${r.arm}`);
});

test("completeWB: does NOT divide by zero weight → returns unchanged", () => {
  const r = completeWB({ weight: 0, arm: null, moment: 500 });
  assert.deepEqual(r, { weight: 0, arm: null, moment: 500 });
});

test("completeWB: derives weight from moment / arm (rounded 2dp)", () => {
  const r = completeWB({ weight: null, arm: 40, moment: 80000 });
  assert.deepEqual(r, { weight: 2000, arm: 40, moment: 80000 });
});

test("completeWB: weight rounds to 2 decimal places", () => {
  const r = completeWB({ weight: null, arm: 3, moment: 100 });
  // 100 / 3 = 33.333… → round(…,2) = 33.33
  assert.ok(r.weight != null && near(r.weight, 33.33), `weight=${r.weight}`);
});

test("completeWB: does NOT divide by zero arm → returns unchanged", () => {
  const r = completeWB({ weight: null, arm: 0, moment: 500 });
  assert.deepEqual(r, { weight: null, arm: 0, moment: 500 });
});

test("completeWB: all three present → returned unchanged (no branch)", () => {
  const r = completeWB({ weight: 100, arm: 40, moment: 4000 });
  assert.deepEqual(r, { weight: 100, arm: 40, moment: 4000 });
});

test("completeWB: all null → returned unchanged", () => {
  const r = completeWB({ weight: null, arm: null, moment: null });
  assert.deepEqual(r, { weight: null, arm: null, moment: null });
});

test("completeWB: only one value known → no derivation possible, unchanged", () => {
  assert.deepEqual(completeWB({ weight: 100, arm: null, moment: null }), {
    weight: 100,
    arm: null,
    moment: null,
  });
  assert.deepEqual(completeWB({ weight: null, arm: 40, moment: null }), {
    weight: null,
    arm: 40,
    moment: null,
  });
  assert.deepEqual(completeWB({ weight: null, arm: null, moment: 4000 }), {
    weight: null,
    arm: null,
    moment: 4000,
  });
});

test("completeWB: negative arm works (moment derivation)", () => {
  const r = completeWB({ weight: 50, arm: -10, moment: null });
  assert.deepEqual(r, { weight: 50, arm: -10, moment: -500 });
});

// --- usefulLoad ------------------------------------------------------------
test("usefulLoad: max gross − empty weight", () => {
  assert.equal(usefulLoad(1500, 2400), 900);
});

test("usefulLoad: rounds to 2 decimal places", () => {
  const r = usefulLoad(1200.1, 2550.35);
  // 2550.35 - 1200.1 = 1350.25
  assert.ok(r != null && near(r, 1350.25), `useful=${r}`);
});

test("usefulLoad: null empty weight → null", () => {
  assert.equal(usefulLoad(null, 2400), null);
});

test("usefulLoad: null max gross → null", () => {
  assert.equal(usefulLoad(1500, null), null);
});

test("usefulLoad: both null → null", () => {
  assert.equal(usefulLoad(null, null), null);
});

test("usefulLoad: zero empty weight is not treated as missing", () => {
  assert.equal(usefulLoad(0, 2400), 2400);
});

test("usefulLoad: negative result when empty exceeds gross", () => {
  assert.equal(usefulLoad(2500, 2400), -100);
});

// --- staleWBChanges --------------------------------------------------------
const change = (date: string, kind: EquipChange["kind"] = "install"): EquipChange => ({
  name: `eq-${date}`,
  date,
  kind,
});

test("staleWBChanges: no W&B on file → all changes, newest first", () => {
  const changes = [change("2025-01-01"), change("2025-03-01"), change("2025-02-01")];
  const out = staleWBChanges(null, changes);
  assert.deepEqual(
    out.map((c) => c.date),
    ["2025-03-01", "2025-02-01", "2025-01-01"],
  );
});

test("staleWBChanges: only changes strictly AFTER the W&B date", () => {
  const changes = [change("2025-01-01"), change("2025-02-01"), change("2025-03-01")];
  const out = staleWBChanges("2025-02-01", changes);
  assert.deepEqual(
    out.map((c) => c.date),
    ["2025-03-01"],
  );
});

test("staleWBChanges: a change ON the W&B date is excluded (strict >)", () => {
  const out = staleWBChanges("2025-02-01", [change("2025-02-01")]);
  assert.equal(out.length, 0);
});

test("staleWBChanges: empty changes → empty", () => {
  assert.deepEqual(staleWBChanges("2025-02-01", []), []);
  assert.deepEqual(staleWBChanges(null, []), []);
});

test("staleWBChanges: results sorted descending by date", () => {
  const changes = [change("2024-06-15"), change("2026-01-01"), change("2025-12-31")];
  const out = staleWBChanges(null, changes);
  assert.deepEqual(
    out.map((c) => c.date),
    ["2026-01-01", "2025-12-31", "2024-06-15"],
  );
});

test("staleWBChanges: does not mutate the input array", () => {
  const changes = [change("2025-01-01"), change("2025-03-01")];
  const snapshot = changes.map((c) => c.date);
  staleWBChanges(null, changes);
  assert.deepEqual(
    changes.map((c) => c.date),
    snapshot,
  );
});

test("staleWBChanges: preserves the kind/name payload of surfaced changes", () => {
  const out = staleWBChanges("2025-01-01", [change("2025-05-01", "removal")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "removal");
  assert.equal(out[0].name, "eq-2025-05-01");
});
