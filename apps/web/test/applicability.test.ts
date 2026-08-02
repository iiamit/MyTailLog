import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractModels,
  modelMatches,
  matchedModels,
} from "../src/lib/faa/applicability";

// The fixtures below are real Federal Register titles/abstracts and real DRS
// titles, pulled from live searches for Cessna/Lycoming/McCauley ADs.

// --- extractModels: the "Model(s)" keyword form -----------------------------
test("extractModels: 'Model X and Y airplanes' — both, stopping at the noun", () => {
  assert.deepEqual(
    extractModels(
      "Airworthiness Directives; Textron Aviation Inc. Airplanes",
      "The FAA is adopting a new airworthiness directive (AD) for certain Textron Aviation Inc. (Textron) Model B300 and B300C airplanes. This AD was prompted by the manufacturer's revision of the airworthiness limitations manual (ALM).",
    ),
    ["B300", "B300C"],
  );
});

test("extractModels: a long comma-separated variant list", () => {
  assert.deepEqual(
    extractModels(
      "Airworthiness Directives; Textron Aviation Inc. Airplanes",
      "The FAA is adopting a new airworthiness directive (AD) for certain Textron Aviation Inc. (Textron) Model 172N, 172P, 172Q, 172RG, F172N, F172P, FR172K airplanes.",
    ),
    ["172N", "172P", "172Q", "172RG", "F172N", "F172P", "FR172K"],
  );
});

test("extractModels: engine designations with dashes", () => {
  assert.deepEqual(
    extractModels(
      "TEXTRON LYCOMING Models O-320, IO-320, LIO-320, AIO-320, AEIO-320, O-340, O-360, LO-360 Engines",
    ),
    ["O-320", "IO-320", "LIO-320", "AIO-320", "AEIO-320", "O-340", "O-360", "LO-360"],
  );
});

test("extractModels: glues a short letters prefix onto its designation", () => {
  assert.deepEqual(
    extractModels(
      "Airworthiness Directives; Thielert Aircraft Engines GmbH Model TAE 125-02-99 Engines",
    ),
    ["TAE 125-02-99"],
  );
});

// --- extractModels: the product-noun form (no "Model" keyword) --------------
test("extractModels: 'Make 172, 175, … and 210 Series Airplanes' walks back from the noun", () => {
  assert.deepEqual(
    extractModels(
      "Airworthiness Directives; Cessna Aircraft Company 172, 175, 180, 182, 185, 206, 207, 208 and 210 Series Airplanes",
    ),
    ["172", "175", "180", "182", "185", "206", "207", "208", "210"],
  );
});

test("extractModels: 'Series' between the list and the noun doesn't end the run", () => {
  assert.deepEqual(
    extractModels("MCCAULEY Models 2A36, B2A36, C2A36, D2A36, 2D36 Series Propellers"),
    ["2A36", "B2A36", "C2A36", "D2A36", "2D36"],
  );
});

// --- extractModels: what must NOT be picked up ------------------------------
test("extractModels: part numbers in prose are not models", () => {
  assert.deepEqual(
    extractModels(
      "Airworthiness Directives; Aerospace Welding Minneapolis, Inc., Mufflers",
      "We are adopting a new airworthiness directive (AD) for certain Aerospace Welding Minneapolis, Inc. mufflers, part numbers A1754001-23 and A1754001-25, installed on airplanes.",
    ),
    [],
  );
});

test("extractModels: AD numbers and years are excluded", () => {
  // "80-04-08" is an AD number and "2019" a year — neither is a model, but the
  // three-group "125-02-99" (3-digit lead) is.
  assert.deepEqual(
    extractModels("Model 125-02-99 engines", "This amendment supersedes AD 80-04-08 from 2019."),
    ["125-02-99"],
  );
});

test("extractModels: no model text at all → empty, never a throw", () => {
  assert.deepEqual(extractModels(null, undefined), []);
  assert.deepEqual(extractModels(""), []);
  assert.deepEqual(extractModels("Airworthiness Directives; Aspen Avionics, Inc."), []);
});

test("extractModels: deduplicates case-insensitively across title and abstract", () => {
  assert.deepEqual(
    extractModels("Cessna Model 172N Airplanes", "…applies to Model 172n airplanes."),
    ["172N"],
  );
});

// --- modelMatches ----------------------------------------------------------
test("modelMatches: exact match, ignoring case and punctuation", () => {
  assert.equal(modelMatches("172N", "172n"), true);
  assert.equal(modelMatches("O-320", "O320"), true);
});

test("modelMatches: a base series covers its letter variants, either direction", () => {
  assert.equal(modelMatches("172", "172N"), true);
  assert.equal(modelMatches("172N", "172"), true);
  assert.equal(modelMatches("525", "525B"), true);
  assert.equal(modelMatches("O-320", "O-320-D2J"), true);
});

test("modelMatches: a digit suffix is a different model, not a variant", () => {
  assert.equal(modelMatches("17", "172"), false);
  assert.equal(modelMatches("20", "206"), false);
});

test("modelMatches: a different prefix is a different model", () => {
  assert.equal(modelMatches("F172N", "172N"), false);
  assert.equal(modelMatches("182", "172"), false);
});

test("modelMatches: a one-character stem is noise, not a series", () => {
  assert.equal(modelMatches("5", "5B"), false);
});

test("modelMatches: empty input never matches", () => {
  assert.equal(modelMatches("", "172N"), false);
  assert.equal(modelMatches("172N", "   "), false);
});

// --- matchedModels ---------------------------------------------------------
test("matchedModels: returns only the designations covering the owner's model", () => {
  assert.deepEqual(
    matchedModels(["172N", "172P", "F172N", "172"], "172n"),
    ["172N", "172"],
  );
});

test("matchedModels: no owner model → nothing matched (not everything)", () => {
  assert.deepEqual(matchedModels(["172N", "172P"], null), []);
  assert.deepEqual(matchedModels(["172N", "172P"], "  "), []);
});
