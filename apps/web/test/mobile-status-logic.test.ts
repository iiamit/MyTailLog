import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectBackwardsReading,
  validateItem,
  adStatusLine,
  numOrNull,
  shortDate,
  type AdLite,
  type ItemFields,
} from "../../mobile/src/status-logic";

// The rules behind the phone's airworthiness screens, tested here because
// apps/mobile has no runner of its own. Each of these decides something an
// owner acts on: whether a meter was replaced, whether an item can be saved,
// and whether a directive is overdue.

// --- detectBackwardsReading --------------------------------------------------

const R = (date: string, value: number | null) => ({ date, value });

test("a reading below the last one is flagged, with the value it fell below", () => {
  const hit = detectBackwardsReading([R("2026-05-01", 4100), R("2026-08-01", 4158)], 12.4);
  assert.deepEqual(hit, { prior: 4158, asOf: "2026-08-01" });
});

test("a reading at or above the last one is not flagged", () => {
  const rows = [R("2026-08-01", 4158)];
  assert.equal(detectBackwardsReading(rows, 4158), null);
  assert.equal(detectBackwardsReading(rows, 4158.1), null);
});

test("the LAST reading is the latest by date, not the last in the array", () => {
  // Rows come out of SQLite in whatever order; comparing against the wrong one
  // would call a normal reading a meter replacement.
  const hit = detectBackwardsReading([R("2026-08-01", 4158), R("2026-01-01", 3900)], 4000);
  assert.deepEqual(hit, { prior: 4158, asOf: "2026-08-01" });
});

test("no history, or no value, means nothing to compare against", () => {
  assert.equal(detectBackwardsReading([], 10), null);
  assert.equal(detectBackwardsReading([R("2026-08-01", null)], 10), null);
  assert.equal(detectBackwardsReading([R("2026-08-01", 4158)], null), null);
  assert.equal(detectBackwardsReading([R("2026-08-01", 4158)], Number.NaN), null);
});

test("a tiny drop still asks — 0.1 down is a mis-key or a swap, and only the owner knows", () => {
  assert.deepEqual(detectBackwardsReading([R("2026-08-01", 4158)], 4157.9), {
    prior: 4158,
    asOf: "2026-08-01",
  });
});

// --- validateItem ------------------------------------------------------------

const item = (o: Partial<ItemFields> = {}): ItemFields => ({
  kind: "annual",
  label: "Annual inspection",
  regulatory: true,
  interval_months: 12,
  interval_hours: null,
  last_done_date: "2026-03-04",
  last_done_hours: null,
  notes: null,
  meter: null,
  ...o,
});

test("a complete item validates", () => {
  assert.equal(validateItem(item()), null);
});

test("an item with no interval at all is refused", () => {
  // Without one it has no due date, so it would sit on the status screen
  // permanently green while nothing was tracking it.
  assert.match(validateItem(item({ interval_months: null }))!, /how often/);
});

test("intervals must be positive, and months whole", () => {
  assert.match(validateItem(item({ interval_months: 0 }))!, /whole number above zero/);
  assert.match(validateItem(item({ interval_months: 1.5 }))!, /whole number above zero/);
  assert.match(validateItem(item({ interval_months: null, interval_hours: -5 }))!, /above zero/);
});

test("last-done hours without a date is refused", () => {
  // The hours countdown anchors to the reading at the last-done DATE; hours
  // with no date can't be placed on the timeline.
  assert.match(validateItem(item({ last_done_date: null, last_done_hours: 4158 }))!, /date it was last done/);
});

test("a nameless item is refused, whitespace included", () => {
  assert.match(validateItem(item({ label: "   " }))!, /name/);
});

test("an unknown meter is refused", () => {
  assert.match(validateItem(item({ meter: "clock" as never }))!, /meter/i);
});

test("numOrNull: blank is null, a number is a number, junk stays NaN for validation to catch", () => {
  assert.equal(numOrNull(""), null);
  assert.equal(numOrNull("  "), null);
  assert.equal(numOrNull("100.5"), 100.5);
  assert.ok(Number.isNaN(numOrNull("twelve")!));
});

// --- adStatusLine ------------------------------------------------------------

const NOW = new Date("2026-09-03T12:00:00Z");

const ad = (o: Partial<AdLite> = {}): AdLite => ({
  kind: "ad",
  status: "complied",
  recurring: false,
  complied_date: "2026-03-04",
  complied_hours: 4100,
  next_due_date: null,
  next_due_hours: null,
  reason: null,
  status_changed_on: null,
  ...o,
});

test("a one-time compliance says when, and stops there", () => {
  const l = adStatusLine(ad(), 4158, NOW);
  assert.equal(l.word, "Complied");
  assert.match(l.detail, /last 4 Mar/);
  assert.match(l.detail, /one-time/);
  assert.equal(l.urgency, "none");
  assert.equal(l.open, false);
});

test("an open AD is open, and says nothing has been recorded", () => {
  const l = adStatusLine(ad({ status: "open", complied_date: null, complied_hours: null }), 4158, NOW);
  assert.equal(l.open, true);
  assert.match(l.detail, /No compliance recorded/);
});

test("a recurring AD past its date reads overdue, not complied", () => {
  const l = adStatusLine(ad({ recurring: true, next_due_date: "2026-08-01" }), 4158, NOW);
  assert.equal(l.word, "Overdue");
  assert.equal(l.urgency, "overdue");
  assert.equal(l.open, true);
  assert.match(l.detail, /33 days overdue/);
});

test("a recurring AD due on hours counts down against the current tach", () => {
  const l = adStatusLine(ad({ recurring: true, next_due_hours: 4200 }), 4158, NOW);
  assert.match(l.detail, /42 h left/);
  assert.equal(l.urgency, "upcoming");
});

test("hours-due with no tach reading states the number instead of a countdown", () => {
  const l = adStatusLine(ad({ recurring: true, next_due_hours: 4200 }), null, NOW);
  assert.match(l.detail, /next at 4200\.0 h/);
});

test("a directive that no longer applies carries its reason and date", () => {
  const l = adStatusLine(
    ad({ status: "not_applicable", reason: "Equipment removed: ADF", status_changed_on: "2026-04-01" }),
    4158,
    NOW,
  );
  assert.equal(l.word, "Does not apply");
  assert.match(l.detail, /Equipment removed: ADF/);
  assert.match(l.detail, /since 1 Apr/);
  assert.equal(l.open, false);
});

test("a recurring AD with no interval set says so rather than looking clear", () => {
  const l = adStatusLine(ad({ recurring: true }), 4158, NOW);
  assert.match(l.detail, /interval not set/);
});

test("no ISO dates reach the owner", () => {
  const lines = [
    adStatusLine(ad({ recurring: true, next_due_date: "2027-03-04" }), 4158, NOW),
    adStatusLine(ad({ status: "superseded", status_changed_on: "2026-04-01" }), 4158, NOW),
  ];
  for (const l of lines) assert.doesNotMatch(l.detail, /\d{4}-\d{2}-\d{2}/, l.detail);
});

test("shortDate drops the year only when it is this year", () => {
  assert.equal(shortDate("2026-03-04", NOW), "4 Mar");
  assert.equal(shortDate("2027-03-04", NOW), "4 Mar 2027");
  assert.equal(shortDate(null), "");
});
