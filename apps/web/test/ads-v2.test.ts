import { test } from "node:test";
import assert from "node:assert/strict";
import { adState, axisX, intervalSummary, miniAxis, nextDueChoice, previewNextDue, untrackedRefs, whyItCameUp } from "../src/lib/v2/ads";

test("Find ADs says why each candidate came up and ranks part and model matches first", () => {
  const ac = { make: "Cessna", model: "172N" };
  const parts = new Map([["mccauley", "propeller"]]);
  assert.deepEqual(whyItCameUp({ kind: "model", term: "172N", models: ["172N"], matched: ["172N"] }, ac, parts), { why: "Names Cessna 172N", strength: 0, makeOnly: false });
  assert.equal(whyItCameUp({ kind: "manufacturer", term: "McCauley", models: [], matched: [] }, ac, parts).why, "Names your propeller");
  assert.deepEqual(whyItCameUp({ kind: "manufacturer", term: "Cessna", models: ["182P"], matched: [] }, ac, parts), { why: "Names Cessna, not 172N", strength: 4, makeOnly: true });
});

const base = { recurring: false, interval_hours: null, interval_months: null, reason: null, status_changed_on: null };

test("ADs read in four plain states", () => {
  assert.deepEqual(adState({ ...base, status: "open" }), { word: "Open", detail: "no compliance recorded", mark: "no_record" });
  assert.equal(adState({ ...base, status: "complied", recurring: true, interval_hours: 100, interval_months: null }).detail, "every 100 hours");
  assert.equal(adState({ ...base, status: "complied" }).detail, "one-time AD");
  assert.equal(adState({ ...base, status: "previously_complied" }).detail, "before these records");
  assert.equal(adState({ ...base, status: "not_applicable", reason: "Different pump P/N" }).detail, "Different pump P/N");
  assert.match(adState({ ...base, status: "superseded", reason: "by 2020-01-01", status_changed_on: "2020-03-01" }).detail, /on Mar 1, 2020/);
});

test("mini line axis starts on a decade and ends two years out", () => {
  const axis = miniAxis(["2011-05-01", "2016-02-01"], "2026-11-18");
  assert.equal(axis.from, "2010-01-01");
  assert.equal(axis.to, "2028-12-31");
  assert.deepEqual(axis.ticks, ["2010", "2020"]);
  assert.equal(axisX("2000-01-01", axis), 0);
  assert.equal(axisX("2030-01-01", axis), 1);
});

test("interval summary names overruns in words", () => {
  const ok = intervalSummary([{ date: "2011-01-01", hours: 100 }, { date: "2012-01-01", hours: 180 }, { date: "2013-01-01", hours: 270 }], 100, null);
  assert.deepEqual(ok, { over: false, text: "Every interval on the line is under 100 hours. The longest was 90 h, from 2012 to 2013." });
  const over = intervalSummary([{ date: "2011-01-01", hours: 100 }, { date: "2012-01-01", hours: 230 }], 100, null);
  assert.equal(over?.over, true);
  assert.match(over!.text, /1 interval ran over 100 hours: 2011 to 2012 \(130 h\)/);
  assert.equal(intervalSummary([{ date: "2011-01-01", hours: 1 }], 100, null), null);
});

test("untracked references skip tracked ones and keep the first mention", () => {
  const refs = untrackedRefs(
    [
      { id: "b", page_id: "p2", entry_date: "2015-01-01", ad_refs: ["2011-10-09"], sb_refs: ["388C"] },
      { id: "a", page_id: "p1", entry_date: "2012-01-01", ad_refs: ["2011-10-09", "80-04-03"], sb_refs: null },
    ],
    [{ kind: "ad", reference: "80-04-03" }],
  );
  assert.deepEqual(refs.map((r) => [r.kind, r.reference, r.entryId]), [["ad", "2011-10-09", "a"], ["sb", "388C", "b"]]);
});

test("next due previews and Find ADs choices", () => {
  assert.equal(previewNextDue("2026-01-15", 4100, 100, 12), "Jan 15, 2027 or tach 4200.0");
  assert.equal(previewNextDue("2026-01-15", null, 100, null), null);
  assert.deepEqual(nextDueChoice("annual", "", "2027-07-31"), { nextDueDate: "2027-07-31", nextDueHours: null });
  assert.deepEqual(nextDueChoice("tach", "4268.3", null), { nextDueDate: null, nextDueHours: 4268.3 });
});
