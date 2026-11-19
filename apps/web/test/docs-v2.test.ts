import { test } from "node:test";
import assert from "node:assert/strict";
import { carryAboard, docsGap, matchesQuery, type VaultDoc } from "../src/lib/v2/docs";

const doc = (p: Partial<VaultDoc> & Pick<VaultDoc, "id" | "type">): VaultDoc => ({
  title: null, file_name: null, expires_on: null, track_expiry: false, document_date: null, ...p,
});
const today = "2026-11-18";

test("carry aboard reads each AROW paper in words", () => {
  const rows = carryAboard(
    [doc({ id: "a", type: "airworthiness_cert" }), doc({ id: "r", type: "registration", expires_on: "2029-03-31", track_expiry: true })],
    today,
    { hasRevision: true, stale: true },
  );
  assert.deepEqual(rows.map((r) => [r.label, r.state, r.kind]), [
    ["Airworthiness", "On file", "current"],
    ["Registration", "To Mar 31, 2029", "current"],
    ["Operating handbook", "Not on file", "no_record"],
    ["Weight and balance", "May be stale", "neutral"],
  ]);
  assert.equal(rows[3].href, "weight-balance");
});

test("an expired registration is overdue; no W&B at all is not on file", () => {
  const rows = carryAboard([doc({ id: "r", type: "registration", expires_on: "2026-01-31" })], today, { hasRevision: false, stale: false });
  assert.equal(rows[1].kind, "overdue");
  assert.match(rows[1].state, /^Expired/);
  assert.equal(rows[3].state, "Not on file");
});

test("the verdict names the most useful gap", () => {
  const all = [
    doc({ id: "a", type: "airworthiness_cert" }), doc({ id: "r", type: "registration", expires_on: "2029-01-01" }),
    doc({ id: "p", type: "poh_afm" }), doc({ id: "w", type: "weight_balance" }),
  ];
  const carry = (d: VaultDoc[]) => carryAboard(d, today, { hasRevision: false, stale: false });
  assert.equal(docsGap(all.slice(1), carry(all.slice(1))), "The airworthiness certificate isn't on file yet.");
  const ins = [...all, doc({ id: "i", type: "insurance", track_expiry: true })];
  assert.equal(docsGap(ins, carry(ins)), "The insurance policy has no expiry date on file yet.");
  assert.equal(docsGap(all, carry(all)), null);
});

test("search matches title, reference, notes and category", () => {
  const d = { ...doc({ id: "s", type: "stc", title: "GTN 650 install" }), reference: "SA01234WI", notes: null };
  assert.ok(matchesQuery(d, "gtn"));
  assert.ok(matchesQuery(d, "sa012"));
  assert.ok(matchesQuery(d, "stcs"));
  assert.ok(!matchesQuery(d, "insurance"));
});
