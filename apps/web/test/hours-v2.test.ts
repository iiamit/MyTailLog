import { test } from "node:test";
import assert from "node:assert/strict";
import { dateX, engineVerdict, formNumber, oilSpread, storedSourceWord } from "../src/lib/v2/hours";
import { metalFlag, oilVerdict } from "../src/lib/v2/oil";

test("engine verdict names hours since overhaul and the TBO year when it can", () => {
  assert.equal(
    engineVerdict({ sinceOverhaul: 1180.4, overhaulYear: "2011", tbo: 2000, hoursPerWeek: 3, tboYear: "2031" }),
    "The engine has run 1,180.4 hours since its 2011 overhaul. At about 3.0 hours a week, the 2,000-hour TBO comes about 2031.",
  );
  assert.equal(
    engineVerdict({ sinceOverhaul: 10, overhaulYear: "2020", tbo: 2000, hoursPerWeek: null, tboYear: null }),
    "The engine has run 10.0 hours since its 2020 overhaul.",
  );
  assert.match(engineVerdict({ sinceOverhaul: null, overhaulYear: null, tbo: 2000, hoursPerWeek: 3, tboYear: null }), /No overhaul found/);
});

test("oil spread and source words", () => {
  assert.equal(oilSpread([48.2, 31, 52.6]), "every 31 to 53 h");
  assert.equal(oilSpread([40]), null);
  assert.equal(storedSourceWord("myflightbook"), "MyFlightBook");
  assert.equal(storedSourceWord("adsb_estimate"), "an ADS-B estimate you accepted");
  assert.equal(storedSourceWord("manual"), "entered by hand");
});

test("dateX clamps to the axis and handles an empty range", () => {
  assert.equal(dateX("2020-01-01", "2020-01-01", "2022-01-01", 0, 100), 0);
  assert.equal(dateX("2030-01-01", "2020-01-01", "2022-01-01", 0, 100), 100);
  assert.ok(Math.abs(dateX("2021-01-01", "2020-01-01", "2022-01-01", 0, 100) - 50) < 0.2);
  assert.equal(dateX("2021-01-01", "2022-01-01", "2022-01-01", 7, 100), 7);
});

test("formNumber: blank is null, junk is NaN for the write to refuse", () => {
  assert.equal(formNumber(""), null);
  assert.equal(formNumber(" 12.5 "), 12.5);
  assert.ok(Number.isNaN(formNumber("abc")));
});

test("wear metals flag above and twice the average; the verdict quotes the lab", () => {
  assert.equal(metalFlag(10, 10), null);
  assert.equal(metalFlag(11, 10), "above");
  assert.equal(metalFlag(20, 10), "twice");
  assert.equal(metalFlag(20, null), null);
  const fmt = (d: string) => d;
  assert.equal(oilVerdict([], null, fmt), "No lab reports yet.");
  assert.equal(
    oilVerdict([{ sample_date: "2026-01-02", lab_comments: "Wear looks normal." }], 12.34, fmt),
    "One lab report. The lab said of the 2026-01-02 sample: “Wear looks normal.” Oil use averages 1 quart every 12.3 hours.",
  );
});
