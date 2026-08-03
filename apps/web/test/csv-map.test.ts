import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/lib/csv/parse";
import {
  coerceRows, detectForMapping, normalizeProposals, parseReading, sanitizeMapping,
  type Mapping,
} from "../src/lib/csv/map";

// The row transform is the deterministic half of the feature: given a confirmed
// mapping, the same file must always import the same way, and a row that can't
// be read must be REPORTED rather than quietly turned into a zero or a null.

const FILE = [
  "Date,Squawk,Tach,A&P,Invoice #",
  "03/04/2026,Annual inspection,1204.6,J. Smith,INV-1",
  "03/14/2026,Oil change,1210.0,J. Smith,INV-2",
].join("\n");

const MAPPING: Mapping = ["entry_date", "description", "tach", "signature_name", "ignore"];

test("a confirmed mapping is applied to every row identically", () => {
  const parsed = parseCsv(FILE);
  const detection = detectForMapping(parsed, MAPPING)!;
  assert.equal(detection.kind, "resolved"); // 03/14 settles it as month/day
  const { entries, errors } = coerceRows(parsed, MAPPING, "mdy");
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].entry_date, "2026-03-04");
  assert.equal(entries[0].description, "Annual inspection");
  assert.equal(entries[0].tach, 1204.6);
  assert.equal(entries[0].signature_name, "J. Smith");
  // The ignored column contributes nothing at all.
  assert.equal(JSON.stringify(entries[0]).includes("INV-1"), false);
});

test("the two date readings produce different entries from the same file", () => {
  const parsed = parseCsv("Date,Squawk\n03/04/2026,Annual\n");
  const m: Mapping = ["entry_date", "description"];
  assert.equal(coerceRows(parsed, m, "mdy").entries[0].entry_date, "2026-03-04");
  assert.equal(coerceRows(parsed, m, "dmy").entries[0].entry_date, "2026-04-03");
});

test("an absurd reading fails the row instead of importing as 0", () => {
  const parsed = parseCsv("Date,Squawk,Tach\n2026-01-02,Annual,1204.6\n2026-01-03,Oil,4815162342\n");
  const { entries, errors } = coerceRows(parsed, ["entry_date", "description", "tach"], "iso");
  assert.equal(entries.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].row, 2);
  assert.match(errors[0].message, /not a plausible reading/);
});

test("a non-numeric reading fails the row, naming the row and the value", () => {
  const parsed = parseCsv("Date,Squawk,Tach\n2026-01-02,Annual,see invoice\n");
  const { entries, errors } = coerceRows(parsed, ["entry_date", "description", "tach"], "iso");
  assert.deepEqual(entries, []);
  assert.equal(errors[0].row, 1);
  assert.match(errors[0].message, /Tach: "see invoice" is not a number/);
});

test("an unreadable date fails only its own row; the rest still import", () => {
  const parsed = parseCsv("Date,Squawk\n2026-01-02,Annual\nsomeday,Oil\n2026-01-04,Plugs\n");
  const { entries, errors } = coerceRows(parsed, ["entry_date", "description"], "iso");
  assert.equal(entries.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].row, 2);
  assert.match(errors[0].message, /couldn't read the date/);
});

test("a row with no date is reported, not imported undated", () => {
  const parsed = parseCsv("Date,Squawk\n,Orphan work\n");
  const { entries, errors } = coerceRows(parsed, ["entry_date", "description"], "iso");
  assert.deepEqual(entries, []);
  assert.deepEqual(errors, [{ row: 1, message: "no date" }]);
});

test("empty cells become null, not empty strings", () => {
  const parsed = parseCsv("Date,Squawk,Tach,Parts\n2026-01-02,Annual,,\n");
  const { entries } = coerceRows(parsed, ["entry_date", "description", "tach", "parts"], "iso");
  assert.equal(entries[0].tach, null);
  assert.equal(entries[0].parts, null);
});

test("AD/SB columns split into arrays", () => {
  const parsed = parseCsv('Date,Squawk,ADs\n2026-01-02,Annual,"2015-19-07, 2011-10-09"\n');
  const { entries } = coerceRows(parsed, ["entry_date", "description", "ad_refs"], "iso");
  assert.deepEqual(entries[0].ad_refs, ["2015-19-07", "2011-10-09"]);
});

test("a formula cell is imported as text — never evaluated", () => {
  const parsed = parseCsv('Date,Squawk\n2026-01-02,"=HYPERLINK(""http://evil"",""click"")"\n');
  const { entries } = coerceRows(parsed, ["entry_date", "description"], "iso");
  assert.equal(entries[0].description, '=HYPERLINK("http://evil","click")');
});

test("numbers: thousands separators and the European decimal comma", () => {
  assert.deepEqual(parseReading("1,234.5"), { value: 1234.5 });
  assert.deepEqual(parseReading("1234,5"), { value: 1234.5 });
  assert.deepEqual(parseReading("  1204.6 "), { value: 1204.6 });
  assert.deepEqual(parseReading(""), { value: null });
  assert.ok("error" in parseReading("-12"));
  assert.ok("error" in parseReading("12 hours"));
});

test("an unknown field name from the model degrades to ignore", () => {
  const out = normalizeProposals(
    [
      { index: 0, field: "entry_date", confidence: 0.99 },
      { index: 1, field: "pilot_name", confidence: 0.9 }, // not a real field
      { index: 9, field: "tach", confidence: 0.9 }, // out of range
    ],
    3,
  );
  assert.deepEqual(out.map((c) => c.field), ["entry_date", "ignore", "ignore"]);
});

test("a field claimed twice is kept on the first column only", () => {
  const out = normalizeProposals(
    [
      { index: 0, field: "description", confidence: 0.9 },
      { index: 1, field: "description", confidence: 0.8 },
    ],
    2,
  );
  assert.deepEqual(out.map((c) => c.field), ["description", "ignore"]);
  // Same rule for a mapping hand-edited in the browser.
  assert.deepEqual(sanitizeMapping(["tach", "tach", "nonsense"], 3), ["tach", "ignore", "ignore"]);
});

test("detectForMapping returns null when no date column is mapped", () => {
  assert.equal(detectForMapping(parseCsv(FILE), ["ignore", "description", "ignore", "ignore", "ignore"]), null);
});
