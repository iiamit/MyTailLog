import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDateFormat, parseDate, readings } from "../src/lib/csv/dates";

// Getting 03/04/2026 the wrong way round shifts a maintenance date by up to
// eleven months, and that date drives annual-due, 100-hour and AD compliance.
// So: the whole column decides, and we only ever ask when it genuinely can't.

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const detect = (values: string[]) => detectDateFormat(values, rows(values.length));

test("ISO dates resolve themselves and never prompt", () => {
  const d = detect(["2026-01-02", "2026-03-04", "2026-11-30"]);
  assert.equal(d.kind, "resolved");
  assert.equal(parseDate("2026-03-04", "iso"), "2026-03-04");
});

test("one day past the 12th anywhere in the file settles the whole column", () => {
  // Every row but the last is ambiguous; row 300 is not. No prompt.
  const values = [...Array(299).fill("01/02/2026"), "13/02/2026"];
  const d = detect(values);
  assert.equal(d.kind, "resolved");
  assert.equal(d.kind === "resolved" && d.format, "dmy");
  // And that reading is then applied to the ambiguous rows too.
  assert.equal(parseDate("01/02/2026", "dmy"), "2026-02-01");
});

test("a US file settles the other way", () => {
  const d = detect(["01/02/2026", "03/14/2026"]);
  assert.equal(d.kind === "resolved" && d.format, "mdy");
  assert.equal(parseDate("01/02/2026", "mdy"), "2026-01-02");
});

test("a file where EVERY row reads both ways asks the user, with both readings", () => {
  const d = detect(["03/04/2026", "01/02/2026", "05/06/2026"]);
  assert.equal(d.kind, "ambiguous");
  if (d.kind !== "ambiguous") return;
  assert.deepEqual(d.samples[0], { raw: "03/04/2026", mdy: "2026-03-04", dmy: "2026-04-03" });
  assert.ok(d.samples.length <= 5, "only a few samples are shown");
});

test("an internally inconsistent column is a broken file, not an ambiguous one", () => {
  // Row 2 only reads as month/day; row 3 only as day/month. Picking either
  // would scatter the other's dates across the calendar.
  const d = detect(["01/02/2026", "03/14/2026", "22/03/2026"]);
  assert.equal(d.kind, "conflict");
  if (d.kind !== "conflict") return;
  assert.deepEqual(d.mdyRows, [2]);
  assert.deepEqual(d.dmyRows, [3]);
});

test("a column that holds no dates at all is reported as unrecognized", () => {
  const d = detect(["N/A", "see invoice", "TBD"]);
  assert.equal(d.kind, "unrecognized");
});

test("textual months are self-describing, whichever order they're written in", () => {
  assert.deepEqual(readings("3 Apr 2026"), { mdy: "2026-04-03", dmy: "2026-04-03" });
  assert.deepEqual(readings("Apr 3, 2026"), { mdy: "2026-04-03", dmy: "2026-04-03" });
  assert.equal(detect(["3 Apr 2026", "14 Mar 2026"]).kind, "resolved");
});

test("impossible dates are rejected, not clamped — the cell value is exact", () => {
  assert.equal(parseDate("02/30/2026", "mdy"), null);
  assert.equal(parseDate("13/13/2026", "mdy"), null);
  assert.equal(parseDate("", "iso"), null);
  assert.equal(parseDate("not a date", "iso"), null);
});

test("two-digit years land in the century an aircraft logbook actually spans", () => {
  assert.equal(parseDate("06/15/72", "mdy"), "1972-06-15");
  assert.equal(parseDate("06/15/26", "mdy"), "2026-06-15");
});

test("a trailing time of day is trimmed off", () => {
  assert.equal(parseDate("2026-01-02T00:00:00Z", "iso"), "2026-01-02");
  assert.equal(parseDate("01/02/2026 14:30", "mdy"), "2026-01-02");
});

test("dotted and dashed separators parse like slashes", () => {
  assert.equal(parseDate("14.03.2026", "dmy"), "2026-03-14");
  assert.equal(parseDate("3-14-2026", "mdy"), "2026-03-14");
});
