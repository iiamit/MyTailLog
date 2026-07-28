import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAdNumber, adNumbersMatch } from "../src/lib/faa/adNumber";

test("cleanAdNumber: strips an 'AD ' prefix", () => {
  assert.equal(cleanAdNumber("AD 2015-19-07"), "2015-19-07");
});

test("cleanAdNumber: strips a punctuated 'A.D.-' prefix", () => {
  assert.equal(cleanAdNumber("A.D.-79-10-14"), "79-10-14");
});

test("cleanAdNumber: a bare number is unchanged (aside from trimming)", () => {
  assert.equal(cleanAdNumber("  2015-19-07 "), "2015-19-07");
});

test("cleanAdNumber: case-insensitive prefix with extra spacing", () => {
  assert.equal(cleanAdNumber("ad   2015-19-07"), "2015-19-07");
});

test("adNumbersMatch: identical numbers match", () => {
  assert.ok(adNumbersMatch("2015-19-07", "2015-19-07"));
});

test("adNumbersMatch: whitespace and case are ignored", () => {
  assert.ok(adNumbersMatch(" 2015-19-07 ", "2015-19-07"));
});

test("adNumbersMatch: a trailing revision is ignored on either side", () => {
  assert.ok(adNumbersMatch("2015-19-07R1", "2015-19-07"));
  assert.ok(adNumbersMatch("2015-19-07R2", "2015-19-07R3"));
});

test("adNumbersMatch: genuinely different numbers do not match", () => {
  assert.ok(!adNumbersMatch("2015-19-07", "2015-19-08"));
});
