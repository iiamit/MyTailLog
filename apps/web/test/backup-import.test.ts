import { test } from "node:test";
import assert from "node:assert/strict";
import { restorableEntry } from "../src/lib/backup/import";

test("restored entries drop the e-signature, generated and server columns but keep the content", () => {
  const signed = {
    id: "e1", created_at: "x", updated_at: "x", trust: "signed",
    authored_signed_at: "2026-11-01T00:00:00Z", authored_digest: "abc", authored_by: "u1",
    supersedes_entry_id: "e0", authored_superseded_by: "e2",
    description: "Annual inspection", signature_name: "J. Smith", mechanic_cert_number: "A&P 123",
    authored_payload: { text: "Annual inspection" },
  };
  const o = restorableEntry(signed);
  for (const col of ["id", "created_at", "updated_at", "trust", "authored_signed_at", "authored_digest", "authored_by",
    "supersedes_entry_id", "authored_superseded_by"]) {
    assert.equal(col in o, false, col);
  }
  assert.equal(o.description, "Annual inspection");
  assert.equal(o.signature_name, "J. Smith");
  assert.deepEqual(o.authored_payload, { text: "Annual inspection" });
  assert.equal(signed.authored_signed_at, "2026-11-01T00:00:00Z", "input not mutated");
});

test("AD links survive a restore into another database by matching the AD number", async () => {
  const { resolveAdReference } = await import("../src/lib/backup/import");
  const known = new Map([["same-db-id", "same-db-id"], ["ad:2020-01-01", "test-db-id"]]);
  assert.equal(resolveAdReference({ ad_reference_id: "same-db-id", reference: "x" }, known), "same-db-id");
  assert.equal(resolveAdReference({ ad_reference_id: "prod-id", reference: "2020-01-01" }, known), "test-db-id");
  assert.equal(resolveAdReference({ ad_reference_id: "prod-id", reference: "1999-99-99" }, known), null);
  assert.equal(resolveAdReference({ ad_reference_id: null, reference: "2020-01-01" }, known), null);
});

test("links to tables the backup doesn't carry are dropped", () => {
  const o = restorableEntry({ id: "e", provider_id: "p", batch_id: "b", description: "x" });
  assert.equal("provider_id" in o, false);
  assert.equal("batch_id" in o, false);
});
