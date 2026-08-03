import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, sniffDelimiter, stripFormulaGuard } from "../src/lib/csv/parse";

// The parser is a pure function over bytes real exporters actually emit, so
// this is where the weight sits: quotes, embedded newlines, delimiters, BOM,
// CRLF. Everything downstream assumes these are already right.

test("parses a plain comma file with a header", () => {
  const { header, rows, delimiter } = parseCsv("Date,Description\n2026-01-02,Oil change\n");
  assert.equal(delimiter, ",");
  assert.deepEqual(header, ["Date", "Description"]);
  assert.deepEqual(rows, [["2026-01-02", "Oil change"]]);
});

test("a quoted field may contain the delimiter", () => {
  const { rows } = parseCsv('Date,Description\n2026-01-02,"Oil change, filter, and plugs"\n');
  assert.deepEqual(rows, [["2026-01-02", "Oil change, filter, and plugs"]]);
});

test("a quoted field may contain a newline", () => {
  const { header, rows } = parseCsv('Date,Notes\n2026-01-02,"line one\nline two"\n2026-01-03,plain\n');
  assert.deepEqual(header, ["Date", "Notes"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0][1], "line one\nline two");
  assert.equal(rows[1][1], "plain");
});

test('doubled "" is an escaped quote', () => {
  const { rows } = parseCsv('A\n"he said ""ok"" then"\n');
  assert.equal(rows[0][0], 'he said "ok" then');
});

test("CRLF line endings", () => {
  const { header, rows } = parseCsv("Date,Tach\r\n2026-01-02,1204.6\r\n2026-01-03,1210.0\r\n");
  assert.deepEqual(header, ["Date", "Tach"]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ["2026-01-03", "1210.0"]);
});

test("a UTF-8 BOM does not become part of the first header name", () => {
  const { header } = parseCsv("﻿Date,Description\n2026-01-02,x\n");
  assert.deepEqual(header, ["Date", "Description"]);
});

test("semicolon and tab delimiters are sniffed", () => {
  assert.equal(parseCsv("Date;Description\n2026-01-02;Oil\n").delimiter, ";");
  assert.deepEqual(parseCsv("Date;Description\n2026-01-02;Oil\n").rows, [["2026-01-02", "Oil"]]);
  assert.equal(parseCsv("Date\tDescription\n2026-01-02\tOil\n").delimiter, "\t");
});

test("commas inside a quoted field do not out-vote the real delimiter", () => {
  // The header itself is semicolon-separated but a name contains commas.
  const text = 'Date;"Parts, labour, tax";Tach\n2026-01-02;filter;1204.6\n';
  assert.equal(sniffDelimiter(text), ";");
  const { header } = parseCsv(text);
  assert.deepEqual(header, ["Date", "Parts, labour, tax", "Tach"]);
});

test("blank lines are dropped and short rows are padded to the header width", () => {
  const { rows } = parseCsv("A,B,C\n1,2,3\n\n4,5\n");
  assert.deepEqual(rows, [["1", "2", "3"], ["4", "5", ""]]);
});

test("a file with no trailing newline still yields its last row", () => {
  const { rows } = parseCsv("A,B\n1,2");
  assert.deepEqual(rows, [["1", "2"]]);
});

test("a header-only file has no rows", () => {
  const { header, rows } = parseCsv("Date,Description\n");
  assert.deepEqual(header, ["Date", "Description"]);
  assert.deepEqual(rows, []);
});

test("the export side's formula guard is undone, and only that", () => {
  // Our own CSV export prefixes ' in front of = + - @ so a spreadsheet won't
  // execute the cell. Re-importing must not accumulate apostrophes...
  assert.equal(stripFormulaGuard("'=SUM(A1:A2)"), "=SUM(A1:A2)");
  assert.equal(stripFormulaGuard("'-40 degrees"), "-40 degrees");
  // ...but a genuine leading apostrophe in someone's text is left alone.
  assert.equal(stripFormulaGuard("'twas the annual"), "'twas the annual");
  assert.equal(stripFormulaGuard("=SUM(A1:A2)"), "=SUM(A1:A2)");
});
