import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSeverity, pickSquawkFields } from "../src/lib/writes/squawks";
import { pickDocumentFields } from "../src/lib/writes/documents";
import { validateTopOff } from "../src/lib/writes/oil";
import { validateWB } from "../src/lib/writes/weightBalance";
import { pickEnrollFields } from "../src/lib/writes/aircraft";

// --- squawks -----------------------------------------------------------------

test("severity: known values pass, anything else falls back to low", () => {
  assert.equal(normalizeSeverity("high"), "high");
  assert.equal(normalizeSeverity("medium"), "medium");
  assert.equal(normalizeSeverity("urgent"), "low");
  assert.equal(normalizeSeverity(undefined), "low");
});

test("squawk patch: trims, refuses blank, drops unknown keys", () => {
  assert.deepEqual(pickSquawkFields({ description: "  brake squeal ", severity: "high", status: "resolved" }), {
    fields: { description: "brake squeal", severity: "high" },
  });
  assert.deepEqual(pickSquawkFields({ description: "   " }), { error: "Describe the issue." });
  assert.deepEqual(pickSquawkFields({ status: "resolved" }), { error: "Nothing to change." });
  assert.ok("error" in pickSquawkFields(null));
});

// --- documents ---------------------------------------------------------------

test("document fields: only editable columns pass, with their types", () => {
  const r = pickDocumentFields({
    type: "form_337",
    title: " Field approval ",
    reference: null,
    document_date: "2024-05-01",
    storage_path: "evil",
    log_entry_id: "x",
  });
  assert.deepEqual(r, {
    fields: { type: "form_337", title: "Field approval", reference: null, document_date: "2024-05-01" },
  });
  assert.deepEqual(pickDocumentFields({ type: "receipt" }), { error: "Pick a document type." });
  assert.deepEqual(pickDocumentFields({ document_date: "May 2024" }), { error: "Document date must be a full date." });
  assert.deepEqual(pickDocumentFields({ title: 5 }), { error: "Title must be text." });
  assert.deepEqual(pickDocumentFields({ notes: "  " }), { fields: { notes: null } });
  assert.deepEqual(pickDocumentFields({}), { error: "Nothing to change." });
});

// --- oil ---------------------------------------------------------------------

test("top-off: quarts > 0 and a full date are required; meters optional", () => {
  assert.deepEqual(validateTopOff({ date: "2026-08-01", quarts: "1.5", hobbs: "", tach: 1234.5, notes: " ok " }), {
    row: { added_date: "2026-08-01", quarts: 1.5, hobbs: null, tach: 1234.5, notes: "ok" },
  });
  assert.deepEqual(validateTopOff({ date: "2026-08-01", quarts: 0 }), { error: "Enter how many quarts were added." });
  assert.deepEqual(validateTopOff({ date: "", quarts: 1 }), { error: "Pick a date." });
  assert.deepEqual(validateTopOff({ date: "2026-08-01", quarts: 1, tach: -3 }), {
    error: "Tach must be zero or a positive number.",
  });
});

// --- weight & balance --------------------------------------------------------

test("W&B: derives the missing one of weight/arm/moment", () => {
  const r = validateWB({ revision_date: "2026-01-15", empty_weight: 1500, empty_weight_arm: 40, method: "weighed" });
  assert.ok("fields" in r);
  assert.equal(r.fields.empty_weight_moment, 60000);
  const r2 = validateWB({ revision_date: "2026-01-15", empty_weight: "1500", empty_weight_moment: "60000" });
  assert.ok("fields" in r2);
  assert.equal(r2.fields.empty_weight_arm, 40);
  assert.equal(r2.fields.method, null);
});

test("W&B: validation messages", () => {
  assert.deepEqual(validateWB({ revision_date: "" }), { error: "Revision date is required." });
  assert.deepEqual(validateWB({ revision_date: "2026-01-15", empty_weight: "abc" }), { error: "Empty weight must be a number." });
  assert.deepEqual(validateWB({ revision_date: "2026-01-15", empty_weight: -1 }), { error: "Empty weight can't be negative." });
  assert.deepEqual(validateWB({ revision_date: "2026-01-15", method: "guessed" }), { error: "Method must be weighed or computed." });
  const r = validateWB({ revision_date: "2026-01-15", empty_weight_arm: -2.5, reference: " POH ", notes: "" });
  assert.ok("fields" in r);
  assert.equal(r.fields.empty_weight_arm, -2.5);
  assert.equal(r.fields.reference, "POH");
  assert.equal(r.fields.notes, null);
});

// --- enrollment --------------------------------------------------------------

test("enroll: form strings and JSON both normalise to the aircraft row", () => {
  const form = pickEnrollFields({
    tail_number: " n12345 ",
    make: "Cessna",
    year: "1978",
    engine_serials: "L-123, L-456",
    enrollment_hobbs: "1234.5",
  });
  assert.deepEqual(form, {
    fields: {
      tail_number: "N12345",
      make: "Cessna",
      model: null,
      serial_number: null,
      home_base: null,
      year: 1978,
      engine_serials: ["L-123", "L-456"],
      prop_serials: [],
      enrollment_hobbs: 1234.5,
      enrollment_tach: null,
      enrollment_airframe: null,
    },
  });
  const json = pickEnrollFields({ tail: "N1", engine_serials: ["a", " b "] });
  assert.ok("fields" in json);
  assert.deepEqual(json.fields.engine_serials, ["a", "b"]);
  assert.deepEqual(pickEnrollFields({ make: "Cessna" }), { error: "Tail number is required." });
  assert.deepEqual(pickEnrollFields({ tail_number: "N1", year: "1978.5" }), { error: "Year must be a whole number." });
  assert.deepEqual(pickEnrollFields({ tail_number: "N1", enrollment_tach: "x" }), { error: "tach must be a number." });
});
