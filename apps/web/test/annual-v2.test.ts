import { test } from "node:test";
import assert from "node:assert/strict";
import type { DueItem, VisitView } from "../src/lib/due/engine";
import { annualPlan } from "../src/lib/v2/annual";
import { moveWeekFor, visitNotices, visitRowNotes, visitLines, capLabel } from "../src/lib/v2/visits";

const item = (key: string, kind: string, firstDate: string | null, status: DueItem["status"] = "current", line = "airframe") =>
  ({ key, kind, label: key, source: key.startsWith("ad:") ? "ad" : "maintenance", firstDate, status, line }) as unknown as DueItem;
const visit = (o: Partial<VisitView>): VisitView => ({
  id: null, suggestionKey: "0123456789abcdef", status: "suggested", weekOf: "2026-12-07", visitDate: null, place: "KBED",
  providerIds: [], items: [], clearsBeforeLapse: 0, atRisk: [], ...o,
});

test("annual prep groups ride-alongs, items on the way and recurring ADs", () => {
  const items = [
    item("mx:annual", "annual", "2027-01-31"),
    item("mx:elt", "elt", "2027-01-20"),
    item("mx:xpdr", "transponder", "2026-12-15"),
    item("mx:oil", "oil", "2027-06-01"),
    item("mx:vor", "vor", "2026-11-01", "overdue"),
    item("ad:1", "ad", "2026-12-20"),
  ];
  const p = annualPlan(items, [], "2026-11-18", new Set(["ad:1"]));
  assert.equal(p.due, "2027-01-31");
  assert.equal(p.daysLeft, 74);
  assert.deepEqual(p.ridesAlong.map((i) => i.key), ["mx:annual", "mx:elt"]);
  assert.deepEqual(p.before.map((i) => i.key), ["mx:xpdr", "mx:vor"]);

  const withVisit = annualPlan(items, [visit({ items: [{ key: "mx:annual", earlyBy: null, status: "current", done: false }, { key: "mx:xpdr", earlyBy: null, status: "current", done: false }] })], "2026-11-18", new Set());
  assert.deepEqual(withVisit.ridesAlong.map((i) => i.key), ["mx:annual", "mx:xpdr"]);
});

test("unknown annual looks 90 days ahead", () => {
  const p = annualPlan([item("mx:annual", "annual", null, "no_record"), item("mx:xpdr", "transponder", "2027-01-10")], [], "2026-11-18", new Set());
  assert.equal(p.due, null);
  assert.equal(p.horizon, "2027-02-16");
  assert.deepEqual(p.before.map((i) => i.key), ["mx:xpdr"]);
  const lapsed = annualPlan([item("mx:annual", "annual", "2026-07-31", "overdue")], [], "2026-11-18", new Set());
  assert.equal(lapsed.daysLeft, -110);
  assert.equal(lapsed.horizon, "2027-02-16", "a lapsed annual looks ahead from today, never backwards");
});

test("visit notices: at risk, in the shop, did it happen; two at most", () => {
  const planned = [
    visit({ id: "v1", status: "planned", weekOf: "2026-12-07", atRisk: [{ itemKey: "mx:xpdr", firstDate: "2026-12-01" }] }),
    visit({ id: "v2", status: "planned", weekOf: "2026-11-16" }),
    visit({ id: "v3", status: "awaiting_records", weekOf: "2026-11-02" }),
  ];
  const n = visitNotices(planned, "2026-11-18");
  assert.deepEqual(n.map((x) => x.kind), ["at_risk", "in_shop"]);
  assert.equal(n[0].kind === "at_risk" && n[0].daysBefore, 6);
  assert.equal(n[0].kind === "at_risk" && n[0].moveTo, "2026-11-23", "never in the past: next week at the earliest");
  assert.equal(moveWeekFor("2027-02-10", "2026-11-18"), "2027-02-01");
  assert.equal(new Date("2027-02-01T00:00:00Z").getUTCDay(), 1, "a Monday");
});

test("caps and row notes", () => {
  const v = visit({ id: "v1", status: "planned", visitDate: "2026-12-09", items: [
    { key: "mx:oil", earlyBy: null, status: "current", done: false },
    { key: "squawk:x", earlyBy: null, status: "open", done: false },
    { key: "mx:elt", earlyBy: null, status: "current", done: true },
  ] });
  assert.equal(capLabel(v, 0), "Dec 9 visit");
  assert.equal(capLabel(visit({}), 1), "Visit 1, Dec 7");
  assert.deepEqual(visitLines(v, (k) => (k === "mx:oil" ? "engine" : null), ["airframe", "engine", "prop"]), ["airframe", "engine"]);
  assert.deepEqual(visitRowNotes([v]), { "mx:oil": "In the Dec 9 visit", "squawk:x": "In the Dec 9 visit" });
});
