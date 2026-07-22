import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OIL_ELEMENTS,
  OIL_PROPERTIES,
  KEY_METALS,
  PROPERTY_LABEL,
  elementLabel,
} from "../src/lib/oilElements";

test("OIL_ELEMENTS: the standard 20-element spectrometric panel", () => {
  assert.equal(OIL_ELEMENTS.length, 20);
  assert.ok(OIL_ELEMENTS.includes("iron"));
  assert.ok(OIL_ELEMENTS.includes("copper"));
  assert.equal(new Set(OIL_ELEMENTS).size, OIL_ELEMENTS.length, "no duplicate elements");
});

test("KEY_METALS: every charted wear metal is part of the full panel", () => {
  for (const m of KEY_METALS) assert.ok(OIL_ELEMENTS.includes(m), `${m} in OIL_ELEMENTS`);
});

test("OIL_PROPERTIES: every property has a display label", () => {
  for (const p of OIL_PROPERTIES) assert.ok(PROPERTY_LABEL[p], `${p} has a label`);
});

test("elementLabel: capitalizes the first letter", () => {
  assert.equal(elementLabel("iron"), "Iron");
  assert.equal(elementLabel("molybdenum"), "Molybdenum");
});

test("elementLabel: empty string stays empty", () => {
  assert.equal(elementLabel(""), "");
});
