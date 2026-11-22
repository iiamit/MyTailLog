import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAdLine, type AdLine } from "../src/lib/extraction/otherDocument";

test("model AD output cannot turn unknown status, malformed numbers or invalid dates through the review boundary unchanged", () => {
  const normalized = normalizeAdLine({
    reference: "2015-19-07", status: "N/A", title: null, method: null,
    complied_date: "2026-02-31", next_due_date: "2027-02-28", complied_hours: Infinity,
    next_due_hours: "unknown", recurring: "yes",
  } as unknown as AdLine);
  assert.equal(normalized.status, null);
  assert.equal(normalized.complied_date, "2026-02-28");
  assert.equal(normalized.next_due_date, "2027-02-28");
  assert.equal(normalized.complied_hours, null);
  assert.equal(normalized.next_due_hours, null);
  assert.equal(normalized.recurring, false);
  assert.equal(normalizeAdLine({ ...normalized, status: "complied", complied_hours: 142.1 }).status, "complied");
});
