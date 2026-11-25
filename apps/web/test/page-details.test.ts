import { PAGE_DETAILS_SCHEMA } from "../src/lib/extraction/pageDetails";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePageDetails } from "../src/lib/extraction/normalizePageDetails";
import { validateDetailDecision } from "../src/lib/writes/pageDetails";
import { isEngineComponent } from "../src/lib/engineComponent";
import { parseCompression } from "../src/lib/engineTrends";
import { buildEngineHistory } from "../src/lib/owner/engineHistory";
import type { Component } from "../src/lib/database.types";

test("identity suggestions retain identifiers, separate mixed content, and never trust model review states", () => {
  const input = { content_kinds: ["identity", "maintenance", "invented"], identity_suggestions: [{
    id: "model-id", subject: "engine", name: "Engine", fields: { serial_number: "000123", make: "Example", tail_number: "wrong-target" },
    quote: "Engine Example serial 000123", confidence: 0.7, status: "accepted",
  }] };
  const result = normalizePageDetails(input);
  assert.deepEqual(result.content_kinds, ["identity", "maintenance"]);
  assert.equal(result.identity_suggestions[0].fields.serial_number, "000123");
  assert.equal(result.identity_suggestions[0].fields.tail_number, undefined);
  assert.equal(result.identity_suggestions[0].status, "pending");
  assert.match(result.identity_suggestions[0].id, /^[a-f0-9]{24}$/);
  assert.equal(result.identity_suggestions[0].id, normalizePageDetails(input).identity_suggestions[0].id);
  assert.equal(normalizePageDetails({ identity_suggestions: [{ ...input.identity_suggestions[0], quote: "" }] }).identity_suggestions.length, 0);
  assert.equal(normalizePageDetails(null).identity_suggestions.length, 0);
});

test("identity decisions reject malformed destinations, fields, flags and page types", () => {
  const valid = { action: "accept", suggestionId: "a".repeat(24), fields: { serial_number: "000123" }, targetId: "11190000-0000-4000-a000-000000000001", installed: false };
  assert.equal(validateDetailDecision(valid), null);
  for (const d of [{ ...valid, fields: { owner_id: "other" } }, { ...valid, fields: { make: 123 } }, { ...valid, fields: {} }, { ...valid, targetBase: "bad" }, { ...valid, targetId: "../other" }, { ...valid, installed: "true" }, { action: "classify", kinds: [] }, { action: "classify", kinds: ["other-kind"] }]) assert.ok(validateDetailDecision(d));
  assert.equal(validateDetailDecision({ action: "classify", kinds: ["identity", "reference"] }), null);
});

test("engine-system accessories never become complete engines, and historical pressures remain visible", () => {
  const c = (name: string) => ({ id: name, name, category: "engine", install_date: "2000-01-01", removal_date: null }) as Component;
  for (const name of ["Vacuum pump Model 211", "Right magneto", "Alternator", "Electric fuel pump", "Engine oil filter", "Exhaust system", "Engine monitor", "Engine mount"]) assert.equal(isEngineComponent(c(name)), false, name);
  for (const name of ["Engine", "Left engine", "Lycoming IO-360-A1A", "Continental TSIO-520", "Rotax 912"]) assert.equal(isEngineComponent(c(name)), true, name);
  assert.equal(isEngineComponent({ ...c("Engine"), component_kind: "accessory" }), false);
  assert.equal(isEngineComponent({ ...c("Powerplant"), component_kind: "engine" }), true);
  const entry = { id: "entry", page_id: "page", entry_date: "2026-03-01", hobbs: null, tach: null, description: "Compressions: #1:79/80 #2:75/80 #3:79/80 #4:76/80", work_performed: null, parts: null, owner_confirmed: true };
  const result = buildEngineHistory([c("Vacuum pump")], [], [entry], [], [], []);
  assert.equal(result.components.length, 0);
  assert.equal(result.groups.length, 0);
  assert.equal(result.unassigned.compression.length, 1);
  assert.equal(result.unassigned.compression[0].readings.length, 4);
});

test("compression supports numbered cylinders, repeated identical transcription, and rejects conflicts or missing reference", () => {
  assert.equal(parseCompression("Compression test: 1. 75/80 2. 76/80 3. 77/80 4. 74/80").length, 4);
  assert.equal(parseCompression("Compressions: #1:79/80 #2:75/80. Work performed: #1:79/80 #2:75/80").length, 2);
  assert.equal(parseCompression("Compressions: #1:79/80 #1:76/80").length, 0);
  assert.equal(parseCompression("Compression: #1:75, #2:76, #3:77, #4:78").length, 0);
});

test("identity schema avoids nullable branches and drops empty unknown fields", () => {
  for (const field of Object.values(PAGE_DETAILS_SCHEMA.identity_suggestions.items.properties.fields.properties)) assert.equal(field.type, "string");
  const parsed = normalizePageDetails({ content_kinds: ["identity"], identity_suggestions: [{ subject: "aircraft", name: "Aircraft", fields: { make: "Mooney", model: "M20F", serial_number: "", part_number: "", tail_number: "N123AB" }, quote: "Mooney M20F N123AB", confidence: 0.9 }] });
  assert.deepEqual(parsed.identity_suggestions[0].fields, { make: "Mooney", model: "M20F", tail_number: "N123AB" });
});
