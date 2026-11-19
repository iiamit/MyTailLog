import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { computeStatus, sha1Hex, suggestionKey, type DueInput } from "../src/lib/due/engine";

// 09 §3.5 suggested visits, beyond what packages/shared/fixtures/visits.json pins on both platforms.
const fixtures = JSON.parse(readFileSync(new URL("../../../packages/shared/fixtures/visits.json", import.meta.url), "utf8"));
const byName = (n: string) => fixtures.cases.find((c: { name: string }) => c.name.startsWith(n));
const worked = byName("worked example");

test("rule (13 §7.2): unconfirmed entries do not change visits", () => {
  for (const name of ["unconfirmed: a newer AI-read transponder entry", "unconfirmed: an AI-read tach"]) {
    const c = byName(name);
    assert.deepEqual(computeStatus(c.input, c.today).visits, computeStatus(worked.input, worked.today).visits, name);
  }
  // The same entries confirmed DO move them, so the rule test is not vacuous.
  const confirmed = structuredClone(byName("unconfirmed: a newer AI-read transponder entry").input) as DueInput;
  confirmed.log_entry = confirmed.log_entry!.map((e) => ({ ...e, trust: "confirmed" as const }));
  assert.notDeepEqual(computeStatus(confirmed, worked.today).visits, computeStatus(worked.input, worked.today).visits);
});

test("worked example matches 09 §3.5: week of Dec 7 with 4 items, then Feb 22", () => {
  const { suggested } = computeStatus(worked.input, worked.today).visits;
  assert.deepEqual(suggested.map((v) => [v.weekOf, v.items.length, v.clearsBeforeLapse]), [["2026-12-07", 4, 3], ["2027-02-22", 2, 2]]);
  assert.ok(suggested.every((v) => v.place === "KBED" && v.id === null && v.status === "suggested"));
});

test("Plan ahead options: horizon and limit", () => {
  const short = computeStatus(worked.input, worked.today, { horizonMonths: 2 }).visits.suggested;
  assert.deepEqual(short.map((v) => v.weekOf), ["2026-12-07"]);
  assert.equal(computeStatus(worked.input, worked.today, { horizonMonths: 24, limit: 1 }).visits.suggested.length, 1);
});

test("suggestion key: sha1 of place, sorted keys and week, 16 hex; a new week is a new key", () => {
  for (const s of ["", "abc", "KBED|mx:a,mx:b|2026-12-07", "é ünïcode ✈", "x".repeat(200)])
    assert.equal(sha1Hex(s), createHash("sha1").update(s).digest("hex"));
  const k = suggestionKey("KBED", ["mx:b", "mx:a"], "2026-12-07");
  assert.equal(k, createHash("sha1").update("KBED|mx:a,mx:b|2026-12-07").digest("hex").slice(0, 16));
  assert.notEqual(k, suggestionKey("KBED", ["mx:a", "mx:b"], "2026-12-14"));
});
