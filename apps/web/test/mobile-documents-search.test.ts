import { test } from "node:test";
import assert from "node:assert/strict";
import { matchDocument, searchDocuments, type SearchableDoc } from "../../mobile/src/documents-search";

// Documents search on iOS, tested here because apps/mobile has no runner.
//
// Reported from the field: "the search itself doesn't really work… after
// entering a search term and pressing enter nothing happens." The field was a
// live filter applied to ONE section, so searching for any of the four AROW
// documents changed nothing on screen.

const D = (o: Partial<SearchableDoc>): SearchableDoc =>
  ({ type: "other", title: null, reference: null, file_name: null, ...o }) as SearchableDoc;

const registration = D({ type: "registration" });
const airworthiness = D({ type: "airworthiness_cert" });
const invoice = D({ type: "other", title: "Annual invoice 2026", file_name: "annual-2026.pdf" });
const radio = D({ type: "other", title: "Radio station licence", reference: "KA-4471" });

test("search covers the AROW documents too — the reported bug", () => {
  // The bug was SCOPE, not matching. The old screen filtered only its
  // "Everything else" list, which is defined as everything NOT in AROW — so the
  // four documents people reach for most could never appear in a result, and
  // typing their names changed nothing on screen.
  const AROW = ["airworthiness_cert", "registration", "poh_afm", "weight_balance"];
  const all = [registration, airworthiness, invoice, radio];

  const oldScope = all.filter((d) => !AROW.includes(d.type));
  assert.deepEqual(
    oldScope.filter((d) => matchDocument(d, "registration")),
    [],
    "the old scope could never return an AROW document, however good the matcher",
  );

  assert.deepEqual(searchDocuments(all, "registration"), [registration]);
  assert.deepEqual(searchDocuments(all, "airworthiness"), [airworthiness]);
});

test("a document with no title is found by the type label shown on its row", () => {
  // Most vault documents have no title, so the row renders the type label.
  // Searching for what you can read has to work.
  assert.equal(registration.title, null);
  assert.ok(matchDocument(registration, "regis"));
});

test("reference numbers and file names are searchable", () => {
  assert.ok(matchDocument(radio, "KA-4471"), "a document is often known by its number");
  assert.ok(matchDocument(invoice, "annual-2026.pdf"));
});

test("matching is case-insensitive and ignores surrounding space", () => {
  assert.ok(matchDocument(radio, "  RADIO  "));
});

test("every term must match, so extra words narrow rather than widen", () => {
  assert.ok(matchDocument(invoice, "annual invoice"));
  assert.ok(!matchDocument(invoice, "annual logbook"));
});

test("terms may match across different fields, in any order", () => {
  // "licence" is in the title, "4471" in the reference.
  assert.ok(matchDocument(radio, "4471 licence"));
});

test("an empty or whitespace query returns everything, not nothing", () => {
  const all = [registration, invoice];
  assert.deepEqual(searchDocuments(all, ""), all);
  assert.deepEqual(searchDocuments(all, "   "), all);
});

test("a query matching nothing returns an empty list the UI can report", () => {
  // The old screen hid a section heading instead, which is indistinguishable
  // from a search that never ran.
  assert.deepEqual(searchDocuments([registration, invoice], "zzz"), []);
});
