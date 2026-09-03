import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickEntryFields,
  cleanLinks,
  joinText,
  unionRefs,
  mergeEntryFields,
  pickHead,
  fullyConfirmedPages,
  isStale,
} from "../src/lib/writes/entries";
import { reorderPlan } from "../src/lib/writes/pages";

const entry = (over: Partial<Parameters<typeof mergeEntryFields>[0]> = {}) => ({
  entry_date: null,
  hobbs: null,
  airframe: null,
  tach: null,
  description: null,
  work_performed: null,
  parts: null,
  signature_name: null,
  mechanic_cert_number: null,
  ad_refs: [],
  sb_refs: [],
  continues_next: false,
  is_continuation: false,
  ...over,
});

test("pickEntryFields keeps only editable columns with their types", () => {
  const r = pickEntryFields({
    entry_date: "2024-05-01",
    hobbs: 1234.5,
    tach: null,
    description: "Annual",
    ad_refs: ["2020-01-02"],
    // must never pass through from a phone payload
    aircraft_id: "x",
    owner_confirmed: false,
    confidence: 0.1,
    reference_links: [{ label: "STC", url: "https://faa.gov/stc" }, { label: "bad", url: "javascript:alert(1)" }],
  });
  assert.ok("fields" in r);
  assert.deepEqual(r.fields, {
    entry_date: "2024-05-01",
    hobbs: 1234.5,
    tach: null,
    description: "Annual",
    ad_refs: ["2020-01-02"],
    reference_links: [{ label: "STC", url: "https://faa.gov/stc" }],
  });
});

test("pickEntryFields rejects wrong types and non-objects", () => {
  assert.ok("error" in pickEntryFields(null));
  assert.ok("error" in pickEntryFields([]));
  assert.ok("error" in pickEntryFields({ hobbs: "1234" }));
  assert.ok("error" in pickEntryFields({ hobbs: Infinity }));
  assert.ok("error" in pickEntryFields({ description: 5 }));
  assert.ok("error" in pickEntryFields({ ad_refs: "2020-01-02" }));
  assert.ok("error" in pickEntryFields({ sb_refs: [1] }));
  // an empty patch is valid — nothing to change
  assert.deepEqual(pickEntryFields({}), { fields: {} });
});

test("cleanLinks keeps http(s) only, trims and bounds", () => {
  const links = cleanLinks([
    { label: "  ok ", url: " https://a.example " },
    { label: "http", url: "http://b.example" },
    { label: "js", url: "javascript:alert(1)" },
    { label: "rel", url: "/local" },
    { label: "x".repeat(200), url: "https://c.example" },
    "garbage",
    null,
  ]);
  assert.deepEqual(links.map((l) => l.url), ["https://a.example", "http://b.example", "https://c.example"]);
  assert.equal(links[0].label, "ok");
  assert.equal(links[2].label.length, 120);
  assert.equal(cleanLinks("nope").length, 0);
  assert.equal(cleanLinks(Array.from({ length: 30 }, (_, i) => ({ label: "", url: `https://x/${i}` }))).length, 20);
});

test("joinText / unionRefs", () => {
  assert.equal(joinText("a ", " b"), "a b");
  assert.equal(joinText(null, "b"), "b");
  assert.equal(joinText("  ", null), null);
  assert.deepEqual(unionRefs(["1", "2"], ["2", "3"]), ["1", "2", "3"]);
  assert.deepEqual(unionRefs(null, null), []);
});

test("mergeEntryFields: head keeps date/meters, tail supplies signature, text concatenates", () => {
  const head = entry({
    entry_date: "2024-05-01",
    tach: 100,
    hobbs: null,
    description: "Removed",
    work_performed: "Part A",
    ad_refs: ["AD-1"],
    continues_next: true,
    is_continuation: false,
  });
  const tail = entry({
    entry_date: "2024-05-02",
    tach: 999,
    hobbs: 50,
    description: "and replaced",
    work_performed: "Part B",
    signature_name: "J. Mech",
    mechanic_cert_number: "A&P 123",
    ad_refs: ["AD-1", "AD-2"],
    continues_next: true, // 3-page entry: the merged head still runs onward
    is_continuation: true,
  });
  assert.deepEqual(mergeEntryFields(head, tail), {
    entry_date: "2024-05-01",
    hobbs: 50,
    airframe: null,
    tach: 100,
    description: "Removed and replaced",
    work_performed: "Part A Part B",
    parts: null,
    signature_name: "J. Mech",
    mechanic_cert_number: "A&P 123",
    ad_refs: ["AD-1", "AD-2"],
    sb_refs: [],
    continues_next: true,
    is_continuation: false,
    field_confidence: null,
    owner_confirmed: false,
  });
});

test("pickHead prefers the flagged continuation, then an unsigned entry, then the last", () => {
  const flagged = { id: "f", continues_next: true, signature_name: "x" };
  const open = { id: "o", continues_next: false, signature_name: null };
  const last = { id: "l", continues_next: false, signature_name: "y" };
  assert.equal(pickHead([last, open, flagged])?.id, "f");
  assert.equal(pickHead([last, open])?.id, "o");
  assert.equal(pickHead([last])?.id, "l");
  assert.equal(pickHead([]), undefined);
});

test("fullyConfirmedPages ignores pageless entries and partial pages", () => {
  const pages = fullyConfirmedPages([
    { page_id: "p1", owner_confirmed: true },
    { page_id: "p1", owner_confirmed: true },
    { page_id: "p2", owner_confirmed: true },
    { page_id: "p2", owner_confirmed: false },
    { page_id: null, owner_confirmed: true },
  ]);
  assert.deepEqual(pages, ["p1"]);
});

test("isStale: only a newer server row conflicts; no base means no check", () => {
  assert.equal(isStale("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"), true);
  assert.equal(isStale("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), false);
  assert.equal(isStale("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"), false);
  assert.equal(isStale("2026-01-02T00:00:00Z", undefined), false);
});

test("reorderPlan numbers 1..N and rejects duplicates or junk", () => {
  assert.deepEqual(reorderPlan(["b", "a", "c"]), {
    rows: [
      { id: "b", page_sequence: 1 },
      { id: "a", page_sequence: 2 },
      { id: "c", page_sequence: 3 },
    ],
  });
  assert.deepEqual(reorderPlan([]), { rows: [] });
  assert.ok("error" in reorderPlan(["a", "a"]));
  assert.ok("error" in reorderPlan(["a", 3]));
  assert.ok("error" in reorderPlan("a"));
});
