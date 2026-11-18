import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatus, type DueInput } from "../src/lib/due/engine";

// 13 §7.2 rule tests for phase 1 (09 §3.1–3.3, 12 §4).
const TODAY = "2026-11-18";
const item = (kind: string, o: Record<string, unknown> = {}) => ({
  id: `mx-${kind}`, kind, label: kind, regulatory: kind !== "oil_change", interval_months: null, interval_hours: null,
  last_done_date: null, last_done_hours: null, ...o,
});
const weekly = Array.from({ length: 12 }, (_, i) => ({
  id: `hr-${i}`, reading_date: new Date(Date.parse("2026-08-26T00:00:00Z") + i * 7 * 864e5).toISOString().slice(0, 10),
  tach: Math.round((2130 + i * 3) * 10) / 10, hobbs: null, source: "manual",
}));
const base: DueInput = {
  aircraft: { id: "ac", tail_number: "N734DM" },
  logbook: [{ id: "lb", type: "airframe" }],
  maintenance_item: [
    item("annual", { interval_months: 12, last_done_date: "2026-03-03", last_done_hours: 2100 }),
    item("vor", { interval_months: 1, last_done_date: "2026-10-12", ifr_only: true }),
    item("hundred_hour", { interval_hours: 100, last_done_date: "2026-06-10", last_done_hours: 2100 }),
    item("oil_change", { meter: "tach", interval_hours: 50, interval_months: 4, last_done_date: "2026-10-20", last_done_hours: 2130 }),
  ],
  item_completion: [
    { id: "c-annual", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: "e-annual", done_date: "2026-03-03", done_hours: 2100 },
    { id: "c-100", maintenance_item_id: "mx-hundred_hour", ad_compliance_id: null, log_entry_id: null, done_date: "2026-06-10", done_hours: 2100 },
    { id: "c-vor", maintenance_item_id: "mx-vor", ad_compliance_id: null, log_entry_id: null, done_date: "2026-10-12", done_hours: null },
  ],
  log_entry: [{ id: "e-annual", logbook_id: "lb", entry_date: "2026-03-03", trust: "signed" }],
  hours_reading: weekly,
};
/** The same aircraft plus a batch of pages read by AI: newer completions, higher meters, more readings. */
const withUnconfirmed: DueInput = {
  ...base,
  log_entry: [
    ...base.log_entry!,
    { id: "ai-1", logbook_id: "lb", page_id: "p1", entry_date: "2026-11-15", tach: 2190, hobbs: 2400, trust: "ai_read" },
    { id: "ai-2", logbook_id: "lb", page_id: "p1", entry_date: "2026-11-16", tach: 2210, trust: "ai_read" },
    { id: "rep", logbook_id: "lb", entry_date: "2026-11-01", tach: 2300, trust: "confirmed", replaced_by_entry_id: "x" },
  ],
  item_completion: [
    ...base.item_completion!,
    { id: "c-ai-vor", maintenance_item_id: "mx-vor", ad_compliance_id: null, log_entry_id: "ai-1", done_date: "2026-11-15", done_hours: null },
    { id: "c-ai-ann", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: "ai-2", done_date: "2026-11-16", done_hours: 2210 },
    { id: "c-rep", maintenance_item_id: "mx-hundred_hour", ad_compliance_id: null, log_entry_id: "rep", done_date: "2026-11-01", done_hours: 2160 },
  ],
};
const a = computeStatus(base, TODAY);
const b = computeStatus(withUnconfirmed, TODAY);

test("unconfirmed entries do not change due status", () => {
  const status = (s: typeof a) => s.items.map((i) => [i.key, i.status, i.calendar, i.lastDone]);
  assert.deepEqual(status(b), status(a));
  assert.equal(a.items.find((i) => i.key === "mx:mx-vor")!.status, "overdue");
  assert.equal(b.items.find((i) => i.key === "mx:mx-vor")!.waitingEntryId, "ai-1");
});

test("unconfirmed entries do not change meters or projections", () => {
  assert.deepEqual(b.meters, a.meters);
  assert.deepEqual(b.rate, a.rate);
  assert.equal(a.rate.basis, "trailing_90");
  const hours = (s: typeof a) => s.items.map((i) => [i.key, i.hours, i.first, i.firstDate]);
  assert.deepEqual(hours(b), hours(a));
});

test("unconfirmed entries do not change the Verdict, only add the waiting line", () => {
  assert.equal(b.verdict.text, a.verdict.text);
  assert.deepEqual(b.verdict.emphasis, a.verdict.emphasis);
  assert.equal(a.verdict.text, "1 item has lapsed: VOR check, 7 days ago (IFR only).");
  assert.deepEqual(b.verdict.lines, ["2 entries read by AI are waiting for you. They don't count until you confirm them."]);
  assert.deepEqual(a.verdict.lines, []);
});

test("unconfirmed entries do not change the line ahead", () => {
  assert.deepEqual(b.lineAhead, a.lineAhead);
  assert.equal(b.situation, a.situation);
});

test("both limits are shown and the earlier is named first", () => {
  const oil = a.items.find((i) => i.key === "mx:mx-oil_change")!;
  assert.ok(oil.calendar && oil.hours, "both limits present");
  assert.equal(oil.calendar!.dueDate, "2027-02-20");
  assert.ok(oil.hours!.projectedDate! < oil.calendar!.dueDate);
  assert.equal(oil.first, "hours");
  assert.equal(oil.firstDate, oil.hours!.projectedDate);
  // Push the hours out past the date: calendar is now first.
  const later = computeStatus({ ...base, maintenance_item: base.maintenance_item!.map((m) =>
    m.kind === "oil_change" ? { ...m, interval_hours: 200 } : m) }, TODAY);
  const oil2 = later.items.find((i) => i.key === "mx:mx-oil_change")!;
  assert.equal(oil2.first, "calendar");
  assert.equal(oil2.firstDate, "2027-02-20");
});

test("calendar-month items are due at the end of the month", () => {
  for (const [kind, doneOn, months, due] of [
    ["annual", "2025-12-03", 12, "2026-12-31"],
    ["transponder", "2024-02-29", 24, "2026-02-28"],
    ["pitot_static", "2025-01-01", 24, "2027-01-31"],
    ["elt", "2026-04-30", 12, "2027-04-30"],
  ] as const) {
    const s = computeStatus({ aircraft: base.aircraft, maintenance_item: [item(kind, { interval_months: months, last_done_date: doneOn })] }, TODAY);
    assert.equal(s.items[0].calendar!.dueDate, due, kind);
    assert.equal(s.items[0].calendar!.calendarMonthRule, true);
  }
});
