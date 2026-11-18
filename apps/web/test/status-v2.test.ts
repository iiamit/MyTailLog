import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { computeStatus, type DueInput, type DueItem } from "../src/lib/due/engine";
import {
  calendarCell, filterCounts, groupItems, groupOf, historyRows, hoursCell, lanesFor, layoutLineAhead, leftText,
  markDonePreview, monthTicks, noPageReason, ratePhrase, rowAction, LA,
} from "../src/lib/v2/status";
import { verdictParts, Verdict } from "../src/ui/Verdict";
import { StatusMark } from "../src/ui/Marks";
import { StatusSpread } from "../src/ui/StatusSpread";

// W-STATUS-01/04 view rules over the real engine output (N734DM-like aircraft, today Nov 18, 2026).
const TODAY = "2026-11-18";
const mx = (kind: string, o: Record<string, unknown> = {}) => ({
  id: `mx-${kind}`, kind, label: kind, regulatory: kind !== "oil_change", interval_months: null, interval_hours: null,
  last_done_date: null, last_done_hours: null, ...o,
});
const weekly = Array.from({ length: 12 }, (_, i) => ({
  id: `hr-${i}`, reading_date: new Date(Date.parse("2026-08-26T00:00:00Z") + i * 7 * 864e5).toISOString().slice(0, 10),
  tach: Math.round((2130 + i * 3) * 10) / 10, hobbs: null, source: "manual",
}));
const input: DueInput = {
  aircraft: { id: "ac", tail_number: "N734DM" },
  logbook: [{ id: "lb", type: "airframe" }, { id: "lb-e", type: "engine" }],
  page: [{ id: "p58", logbook_id: "lb", page_sequence: 58 }],
  maintenance_item: [
    mx("annual", { interval_months: 12, last_done_date: "2026-03-03", last_done_hours: 2100 }),
    mx("vor", { interval_months: 1, last_done_date: "2026-10-12", ifr_only: true }),
    mx("oil_change", { meter: "tach", interval_hours: 50, interval_months: 4, last_done_date: "2026-10-20", last_done_hours: 2130 }),
    mx("transponder", { interval_months: 24 }),
  ],
  item_completion: [
    { id: "c-annual", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: "e-annual", done_date: "2026-03-03", done_hours: 2100 },
    { id: "c-vor", maintenance_item_id: "mx-vor", ad_compliance_id: null, log_entry_id: null, done_date: "2026-10-12", done_hours: null },
  ],
  log_entry: [{ id: "e-annual", logbook_id: "lb", page_id: "p58", entry_date: "2026-03-03", trust: "signed" }],
  hours_reading: weekly,
};
const snap = computeStatus(input, TODAY);
const byKind = (k: string) => snap.items.find((i) => i.kind === k)!;

test("rows group by horizon, with Overdue and Next 60 days first and no record last", () => {
  assert.equal(byKind("vor").status, "overdue");
  assert.equal(groupOf(byKind("vor"), TODAY), "overdue");
  assert.equal(groupOf(byKind("oil_change"), TODAY), "next60");
  assert.equal(groupOf(byKind("transponder"), TODAY), "no_record");
  const keys = groupItems(snap.items, TODAY, "all").map((g) => g.key);
  assert.deepEqual(keys, [...keys].sort((a, b) => ["overdue", "next60", "year", "further", "no_record"].indexOf(a) - ["overdue", "next60", "year", "further", "no_record"].indexOf(b)));
  assert.deepEqual(groupItems(snap.items, TODAY, "overdue").flatMap((g) => g.items.map((i) => i.kind)), ["vor"]);
});

test("legend counts sum to All", () => {
  const c = filterCounts(snap.items);
  assert.equal(c.overdue + c.due_soon + c.current + c.no_record, c.all);
});

test("Left, limits and actions use the spec's words", () => {
  assert.equal(leftText(byKind("vor")), "lapsed 7 days ago");
  assert.equal(leftText(byKind("transponder")), "");
  const oil = byKind("oil_change");
  assert.match(hoursCell(oil, TODAY)!.limit, /^tach 2,180\.0$/);
  assert.match(hoursCell(oil, TODAY)!.note!, /^about /);
  assert.equal(calendarCell(byKind("annual"))!.note, "end of March");
  assert.deepEqual(rowAction(byKind("vor"), "ac"), { label: "Log a VOR check", href: "/aircraft/ac/status/item/mx:mx-vor?panel=done" });
  assert.equal(rowAction(oil, "ac")!.label, "Mark done");
  const noBasis: DueItem = { ...oil, hours: { ...oil.hours!, projectionBasis: "none", projectedDate: null } };
  assert.equal(hoursCell(noBasis, TODAY)!.note, `${oil.hours!.remaining.toFixed(1)} h left, no recent flying to date it`);
});

test("rate phrase names the basis, and is absent with no flying", () => {
  assert.equal(ratePhrase({ ...snap.rate, basis: "trailing_90", hoursPerWeek: 3 }), "your recent flying, about 3 hours a week");
  assert.equal(ratePhrase({ ...snap.rate, basis: "owner_estimate", hoursPerWeek: 2.5 }), "your estimate of 2.5 hours a week");
  assert.equal(ratePhrase({ ...snap.rate, basis: "none" }), null);
});

test("rows without a page say why", () => {
  assert.match(noPageReason(byKind("vor")).text, /^You marked it done on Oct 12, 2026/);
  assert.equal(noPageReason(byKind("transponder")).text, "No record of this item has been found.");
  assert.equal(byKind("annual").lastDone!.pageLabel, "Airframe p. 58");
});

test("line ahead places rings in their lanes and never overlaps labels", () => {
  const lanes = lanesFor(["airframe", "engine"], ["avionics"]);
  assert.deepEqual(lanes, ["airframe", "engine", "avionics"]);
  const rings = Array.from({ length: 8 }, (_, i) => ({
    key: `k${i}`, line: "airframe", date: `2026-12-0${i + 1}`, status: "due_soon" as const, label: `Item number ${i}, 9.7 h`, projected: false, left: "",
  }));
  const { rings: placed, more } = layoutLineAhead(rings, lanes, TODAY, "2027-11-18");
  const boxes = placed.filter((r) => r.labelX != null).map((r) => {
    const w = r.label.length * 7;
    const x0 = r.anchor === "start" ? r.labelX! : r.labelX! - w;
    return [x0, r.labelY! - 11, x0 + w, r.labelY! + 3];
  });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `labels ${i} and ${j} overlap`);
    }
  assert.equal(boxes.length + more, 8, "every ring is either labelled or counted in 'more'");
  assert.ok(placed.every((r) => r.x >= LA.todayX && r.x <= LA.horizonX));
  const close = placed.filter((r) => r.y !== r.laneY);
  assert.ok(close.length > 0, "rings closer than 14 units are offset");
});

test("month ticks start at Today and end at the horizon with its year", () => {
  const t = monthTicks(TODAY, "2027-11-18");
  assert.equal(t[0].label, "Today");
  assert.equal(t[t.length - 1].label, "Nov 2027");
  for (let i = 1; i < t.length; i++) assert.ok(t[i].x - t[i - 1].x >= 40);
});

test("history flags late renewals and repeated tach readings", () => {
  const rows = historyRows([
    { id: "a", date: "2022-06-10", hours: 1900, entryId: null, pageId: null, pageLabel: null, trust: "confirmed", signer: null },
    { id: "b", date: "2024-07-20", hours: 2000, entryId: null, pageId: null, pageLabel: null, trust: "confirmed", signer: null },
    { id: "c", date: "2026-06-01", hours: 2000, entryId: null, pageId: null, pageLabel: null, trust: "confirmed", signer: null },
  ], "transponder", 24);
  assert.deepEqual(rows.map((r) => r.id), ["c", "b", "a"]);
  assert.equal(rows[1].lateDays, 20, "due Jun 30, 2024 (end of month), done Jul 20");
  assert.equal(rows[0].lateDays, null);
  assert.equal(rows[0].sameTachAs, "2024-07-20");
  assert.equal(rows[1].after, 100);
});

test("mark-done preview applies the calendar-month rule and the hours interval", () => {
  assert.equal(markDonePreview("annual", "2026-11-18", null, "tach", 12, null), "Next due Nov 30, 2027.");
  assert.equal(markDonePreview("oil_change", "2026-11-18", 2165.3, "tach", 4, 50), "Next due Mar 18, 2027 or at tach 2,215.3, whichever first.");
  assert.equal(markDonePreview("vor", "2026-11-18", null, "tach", 1, null), "Next due Dec 18, 2026.");
});

test("verdict renders bold runs from emphasis ranges and pairs overdue with a word", () => {
  assert.deepEqual(verdictParts({ text: "One check has lapsed, and it only matters for IFR.", emphasis: [[0, 20]] }), [
    { text: "One check has lapsed", strong: true },
    { text: ", and it only matters for IFR.", strong: false },
  ]);
  const html = renderToStaticMarkup(createElement(Verdict, { verdict: snap.verdict, overdue: true }));
  assert.match(html, /<h2/);
  assert.match(html, /Overdue/);
  assert.match(renderToStaticMarkup(createElement(StatusMark, { kind: "due_soon" })), /Due soon/);
});

const router = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const spread = (canEdit: boolean, filter: "all" | "current" | "no_record" = "all") =>
  renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router },
    createElement(StatusSpread, {
      aircraftId: "ac", today: TODAY, items: snap.items, lineAhead: snap.lineAhead, lanes: ["airframe", "engine", "avionics"],
      filter, canEdit, head: null, foot: null,
    })));

test("due table: every state has a word, page cites or 'your note', viewers get no actions", () => {
  const html = spread(true);
  for (const w of ["Overdue", "No record"]) assert.ok(html.includes(w), w);
  assert.match(spread(true, "current"), /aria-label="Airframe logbook, page 58"/, "a filter opens the later groups it matches");
  assert.match(html, /<h2[^>]*>Airframe logbook, page 58<\/h2>/, "the first row with a page is on the mat");
  assert.match(html, /your note/);
  assert.match(html, />Log a VOR check</);
  assert.match(html, /<th scope="rowgroup"/);
  assert.match(html, /aria-expanded="false"[^>]*>Later · 2 items</);
  const viewer = spread(false);
  assert.doesNotMatch(viewer, /Mark done|Log a VOR check|Add date/);
  assert.match(spread(false, "no_record"), /No date/);
  assert.match(spread(true, "no_record"), />Add date</);
});
