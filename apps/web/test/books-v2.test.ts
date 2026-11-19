import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptedLine, confirmPlan, deskEntry, deskFields, deskReducer, entryBox, firstUnsure, groupByYear, highlight, markName, matches,
  navigate, nextWaiting, pageDoubt, pageIsClean, parseMapParams, patchOf, withParams, zoomAround, zoomWindow,
  type DeskAction, type DeskEntryInput, type DeskState, type Mark,
} from "../src/lib/v2/books";
import { v2Rewrite } from "../src/lib/uiV2";

// The Logbooks rules an owner hits from the keyboard (04 W-BOOKS-*, 10 §10, 11 §4).

test("logbooks routes rewrite to v2; the unbuilt ones stay v1", () => {
  for (const p of ["map", "list", "review", "review/p1", "entries/e1"]) assert.equal(v2Rewrite(`/aircraft/a/logbooks/${p}`), `/v2/aircraft/a/logbooks/${p}`);
  assert.equal(v2Rewrite("/aircraft/a/logbooks/entries/new"), null, "W-BOOKS-11 is still v1");
  assert.equal(v2Rewrite("/aircraft/a/logbooks/pages"), null, "W-BOOKS-05 is still v1");
  assert.equal(v2Rewrite("/aircraft/a/logbooks/review/p1/x"), null);
});

test("map parameters: years expand to dates, reversed ranges swap, unknown books drop", () => {
  assert.deepEqual(parseMapParams({ from: "2005", to: "2015", book: "engine" }), { stop: undefined, visit: undefined, gap: undefined, q: undefined, book: "engine", from: "2005-01-01", to: "2015-12-31" });
  const r = parseMapParams({ from: "2015-02", to: "2005-03", book: "other" });
  assert.equal(r.book, undefined);
  assert.deepEqual([r.from, r.to], ["2005-03-31", "2015-02-01"].sort());
  assert.equal(parseMapParams({ from: "2005" }).from, undefined, "a window needs both ends");
  assert.equal(withParams({ book: "engine", stop: "e1" }, { stop: undefined, gap: "g1" }), "?book=engine&gap=g1");
});

test("zoom: under a year snaps to a year, wider than the life clears", () => {
  const life = { from: "1978-01-01", to: "2027-11-18" };
  const w = zoomWindow({ from: "2010-06-01", to: "2010-07-01" }, life)!;
  assert.ok(Date.parse(w.to) - Date.parse(w.from) >= 364 * 86_400_000);
  assert.equal(zoomWindow({ from: "1970-01-01", to: "2030-01-01" }, life), null);
  assert.equal(zoomAround("2000-01-01", life, 4, life), null, "zooming out past the life clears");
  const z = zoomAround("2000-01-01", life, 0.5, life)!;
  assert.ok(z.from < "2000-01-01" && z.to > "2000-01-01");
});

const M = (key: string, lines: string[], t: number, date: string): Mark => ({ key, lines, t, date, name: key });
const marks = [
  M("stop:a1", ["air"], 100, "1980-01-01"), M("stop:a2", ["air"], 200, "1995-01-01"), M("gap:g", ["air"], 250, "1996-01-01"),
  M("interchange:x", ["air", "eng"], 300, "2011-08-22"), M("stop:a3", ["air"], 400, "2020-01-01"),
  M("stop:e1", ["eng"], 150, "1985-01-01"), M("ring:oil", ["eng"], 500, "2026-12-12"),
];
const lines = ["air", "eng", "prop"];

test("map keyboard: tab in on the most recent stop, arrows walk and hop lines", () => {
  assert.deepEqual(navigate(marks, lines, null, ""), { key: "stop:a3", line: "air" });
  const at = (key: string, line = "air") => ({ key, line });
  assert.deepEqual(navigate(marks, lines, at("stop:a2"), "ArrowRight"), at("gap:g"), "gaps are on the walk");
  assert.deepEqual(navigate(marks, lines, at("gap:g"), "ArrowRight"), at("interchange:x"));
  assert.deepEqual(navigate(marks, lines, at("stop:a1"), "ArrowLeft"), null, "nothing before the first");
  assert.deepEqual(navigate(marks, lines, at("stop:a1"), "End"), at("stop:a3"));
  assert.deepEqual(navigate(marks, lines, at("stop:a3"), "Home"), at("stop:a1"));
  // An interchange sits on both lines; moving down from it lands on the nearest engine mark in time.
  assert.deepEqual(navigate(marks, lines, at("interchange:x"), "ArrowDown"), { key: "interchange:x", line: "eng" });
  assert.deepEqual(navigate(marks, lines, { key: "interchange:x", line: "eng" }, "ArrowRight"), { key: "ring:oil", line: "eng" });
  assert.deepEqual(navigate(marks, lines, { key: "stop:e1", line: "eng" }, "ArrowUp"), at("stop:a1"));
  assert.equal(navigate(marks, lines, { key: "stop:e1", line: "eng" }, "ArrowDown"), null, "no marks below: stay");
  assert.deepEqual(navigate(marks, lines, at("stop:a1"), "PageDown"), at("stop:a2"), "a year on, the next mark after");
  assert.deepEqual(navigate(marks, lines, at("stop:a3"), "PageUp"), at("interchange:x"));
});

test("mark names say book, date, trust and page in words (10 §10)", () => {
  assert.equal(
    markName({ title: "Annual inspection", date: "2011-08-22", books: ["airframe", "engine", "prop"], trust: "confirmed", page: 41 }),
    "Annual inspection, August 22, 2011, Airframe, Engine and Propeller, confirmed by you, page 41",
  );
  assert.match(markName({ title: null, date: "2026-03-02", books: ["airframe"], trust: "ai_read" }), /read by AI, not yet confirmed$/);
});

// --- Review desk ---------------------------------------------------------------------------------------------

const E = (o: Partial<DeskEntryInput> = {}): DeskEntryInput => ({
  id: "e1", logbook_id: "b1", entry_date: "1992-04-18", tach: 1874.6, hobbs: null, airframe: null, description: "Oil change.",
  work_performed: null, parts: null, signature_name: "M. Torres", mechanic_cert_number: "A&P 1", ad_refs: [], sb_refs: [],
  confidence: 0.9, field_confidence: { entry_date: 0.95, tach: 0.95, description: 0.95 }, owner_confirmed: false, ...o,
});
const ctx = { samePage: [], sameBook: [], today: "2026-11-18", aircraftYear: 1978 };

test("doubt order: plausibility first, then ascending confidence, with reasons in words", () => {
  const e = E({ id: "e2", tach: 1814.6, field_confidence: { entry_date: 0.6, tach: 0.95, description: 0.7 } });
  const fs = deskFields(e, { ...ctx, sameBook: [{ id: "e0", entry_date: "1992-03-01", tach: 1861.2, hobbs: null, page: 2 }] });
  assert.deepEqual(fs.slice(0, 3).map((f) => f.field), ["tach", "entry_date", "description"]);
  assert.match(fs[0].doubt!, /Lower than the entry before it: 1,861.2 on Mar 1, 1992 on p. 2/);
  assert.match(fs[1].doubt!, /60% sure/);
  assert.equal(fs.find((f) => f.field === "hobbs")!.doubt, null);
});

test("doubt: a 300 h jump in under a year, a future date, a date before the aircraft, out of order on the page", () => {
  const prev = [{ id: "p", entry_date: "1992-01-01", tach: 1000, hobbs: null, page: 1 }];
  assert.match(deskFields(E({ tach: 1400 }), { ...ctx, sameBook: prev })[0].doubt!, /400.0 hours after/);
  assert.equal(deskFields(E({ entry_date: "2030-01-01" }), ctx)[0].doubt, "This date is in the future.");
  assert.match(deskFields(E({ entry_date: "1970-01-01" }), ctx)[0].doubt!, /before the aircraft was built/);
  const page = [
    { id: "a", entry_date: "1992-02-03", tach: null, hobbs: null, page: 3 },
    { id: "e1", entry_date: "1998-06-12", tach: null, hobbs: null, page: 3 },
    { id: "c", entry_date: "1992-09-28", tach: null, hobbs: null, page: 3 },
  ];
  assert.match(deskFields(E({ entry_date: "1998-06-12" }), { ...ctx, samePage: page })[0].doubt!, /Later than the entry below it/);
});

const state = (inputs: DeskEntryInput[]): DeskState => ({
  entries: inputs.map((i) => deskEntry(i, deskFields(i, ctx).filter((f) => ["entry_date", "tach", "description"].includes(f.field)))),
  entry: 0, field: 0, editing: false, notice: null,
});
const run = (s: DeskState, ...as: DeskAction[]) => as.reduce(deskReducer, s);

test("A accepts and moves on, E then Enter saves an edit, X empties, Esc leaves an edit untouched", () => {
  let s = state([E({ field_confidence: { tach: 0.5 } })]);
  assert.equal(s.entries[0].fields[0].field, "tach", "the least certain field opens first");
  s = run(s, { type: "accept" });
  assert.equal(s.entries[0].outcome.tach, "accepted");
  assert.equal(s.field, 1);
  s = run(s, { type: "edit" });
  assert.equal(s.editing, true);
  s = run(s, { type: "cancel" });
  assert.equal(s.editing, false);
  assert.equal(s.entries[0].outcome[s.entries[0].fields[1].field], "pending", "Esc saves nothing");
  s = run(s, { type: "edit" }, { type: "commit", value: "1992-04-19" });
  assert.equal(s.entries[0].values.entry_date, "1992-04-19");
  assert.equal(s.entries[0].outcome.entry_date, "edited");
  s = run(s, { type: "absent" });
  assert.equal(s.entries[0].values.description, "");
  assert.equal(s.entries[0].outcome.description, "absent");
  s = run(s, { type: "undo", entry: 0, field: "description" });
  assert.equal(s.entries[0].values.description, "Oil change.");
  // Committing the same value counts as accepted, not edited.
  const d = state([E()]);
  s = run(d, { type: "select", entry: 0, field: d.entries[0].fields.findIndex((f) => f.field === "description") }, { type: "edit" }, { type: "commit", value: "Oil change." });
  assert.equal(s.entries[0].outcome.description, "accepted");
});

test("J and K walk across entries and stop at the ends", () => {
  let s = state([E({ id: "a" }), E({ id: "b" })]);
  s = run(s, { type: "prev" });
  assert.deepEqual([s.entry, s.field], [0, 0]);
  s = run(s, { type: "next" }, { type: "next" }, { type: "next" });
  assert.deepEqual([s.entry, s.field], [1, 0]);
  s = run(s, { type: "prev" });
  assert.deepEqual([s.entry, s.field], [0, 2]);
});

test("Confirm page is blocked while a field is unsure and moves focus to it", () => {
  const s = state([E({ id: "a" }), E({ id: "b", field_confidence: { tach: 0.4 } })]);
  const plan = confirmPlan(s);
  assert.ok("blocked" in plan);
  if ("blocked" in plan) {
    assert.deepEqual([plan.blocked.entry, plan.blocked.field], [1, 0]);
    assert.equal(plan.blocked.message, "1 field to check on entry 2 first.");
  }
  assert.equal(acceptedLine(s), "Entry 1 is ready.");
  assert.ok("writes" in confirmPlan(s, 0), "Ctrl+Enter on the clean entry is not blocked by the other");
});

test("Confirm page writes: unchanged entries confirm, edited ones save typed fields, confirmed ones skip", () => {
  let s = state([E({ id: "a" }), E({ id: "b" }), E({ id: "c", owner_confirmed: true })]);
  s = run(s, { type: "select", entry: 1, field: s.entries[1].fields.findIndex((f) => f.field === "tach") }, { type: "edit" }, { type: "commit", value: "1,875.0" });
  const plan = confirmPlan(s);
  assert.ok("writes" in plan);
  if ("writes" in plan) {
    assert.deepEqual(plan.writes, [
      { id: "a", isNew: false, fields: null },
      { id: "b", isNew: false, fields: { tach: 1875 } },
    ]);
  }
  const t = state([E()]);
  const bad = confirmPlan(run(t, { type: "select", entry: 0, field: t.entries[0].fields.findIndex((f) => f.field === "tach") }, { type: "edit" }, { type: "commit", value: "twelve" }));
  assert.deepEqual(bad, { error: "Entry 1: Tach must be a number." });
  assert.deepEqual(patchOf({ ...deskEntry(E(), []), values: { ...deskEntry(E(), []).values, tach: "x" } }), { error: "Tach must be a number." });
  assert.deepEqual(patchOf({ ...deskEntry(E(), []), values: { ...deskEntry(E(), []).values, ad_refs: "2011-10-09, 2020-01-01" } }), { ad_refs: ["2011-10-09", "2020-01-01"] });
});

test("an owner confirms 100 entries without a mouse (13 §5 phase 2 exit)", () => {
  // 20 pages of 5 entries; every third entry has an unsure tach. Keys only: A on each unsure field, Shift+Enter per page.
  let confirmed = 0;
  let presses = 0;
  for (let page = 0; page < 20; page++) {
    let s = state(Array.from({ length: 5 }, (_, i) => E({ id: `p${page}e${i}`, field_confidence: (page * 5 + i) % 3 === 0 ? { tach: 0.5 } : null })));
    for (let guard = 0; guard < 50; guard++) {
      const plan = confirmPlan(s); // Shift+Enter
      presses++;
      if ("writes" in plan) {
        confirmed += plan.writes.length;
        break;
      }
      assert.ok("blocked" in plan, "a blocked confirm says why");
      if ("blocked" in plan) s = run(s, { type: "select", entry: plan.blocked.entry, field: plan.blocked.field }, { type: "accept" }); // focus moved there; A
      presses++;
    }
    assert.equal(firstUnsure(s), null);
  }
  assert.equal(confirmed, 100);
  assert.ok(presses < 200, `took ${presses} key presses`);
});

test("next waiting page: same book by sequence, then the other books in book order", () => {
  const pages = [
    { id: "e2", logbook: "engine", sequence: 2, created_at: "b" }, { id: "a5", logbook: "airframe", sequence: 5, created_at: "a" },
    { id: "a3", logbook: "airframe", sequence: 3, created_at: "c" }, { id: "p1", logbook: "prop", sequence: 1, created_at: "d" },
  ];
  assert.equal(nextWaiting(pages, "e2", "engine"), "a3");
  assert.equal(nextWaiting(pages, "a3", "airframe"), "a5");
  assert.equal(nextWaiting(pages.filter((p) => p.logbook !== "airframe"), "e2", "engine"), "p1");
  assert.equal(nextWaiting([pages[0]], "e2", "engine"), null);
});

test("Review all: clean pages and the doubt in words", () => {
  assert.equal(pageIsClean([E(), E({ owner_confirmed: true, confidence: 0.1 })]), true);
  assert.equal(pageIsClean([E({ field_confidence: { tach: 0.5 } })]), false);
  assert.equal(pageIsClean([]), false);
  const s = state([E({ id: "a" }), E({ id: "b", field_confidence: { tach: 0.5 } })]);
  assert.match(pageDoubt(s.entries)!, /^Tach on entry 2: the reader was 50% sure/);
});

test("list: year groups newest first with Undated last, search ANDs terms, highlight splits hits", () => {
  const g = groupByYear([{ entry_date: "2001-01-01" }, { entry_date: null }, { entry_date: "2011-05-01" }, { entry_date: "2011-01-01" }]);
  assert.deepEqual(g.map((x) => [x.year, x.rows.length]), [["2011", 2], ["2001", 1], ["Undated", 1]]);
  assert.equal(g[0].rows[0].entry_date, "2011-05-01");
  assert.ok(matches("Replaced vacuum pump, Rapco", "vacuum rapco"));
  assert.ok(!matches("Replaced vacuum pump", "vacuum alternator"));
  assert.deepEqual(highlight("Oil and filter", "oil"), [{ text: "Oil", hit: true }, { text: " and filter", hit: false }]);
});

test("entry region is the union of its field boxes", () => {
  const b = entryBox({ field_boxes: { a: { x: 0.1, y: 0.2, w: 0.2, h: 0.1 }, b: { x: 0.2, y: 0.25, w: 0.3, h: 0.1 }, c: null } })!;
  assert.deepEqual([b.x, b.y, b.w, b.h].map((v) => v.toFixed(3)), ["0.100", "0.200", "0.400", "0.150"]);
  assert.equal(entryBox({ field_boxes: { a: { x: 0, y: 0, w: 0, h: 0 } } }), null);
});
