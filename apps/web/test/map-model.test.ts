import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, buildMapModel, interchangeId, normCert, stopId, todayIn, type MapEntryRow, type MapInput } from "../src/lib/mapModel";
import { detectGaps, gapEvidence, reconcileGaps, type StoredGap } from "../src/lib/gaps";

const TODAY = "2026-11-18";
const logbook = [
  { id: "lb-eng", type: "engine" },
  { id: "lb-air", type: "airframe" },
  { id: "lb-prop", type: "prop" },
  { id: "lb-oth", type: "other" },
];
let n = 0;
const e = (logbook_id: string, entry_date: string | null, o: Partial<MapEntryRow> = {}): MapEntryRow =>
  ({ id: `e${++n}`, logbook_id, page_id: `p-${logbook_id}-${entry_date}`, entry_date, trust: "confirmed", ...o });
const input = (log_entry: MapEntryRow[], extra: Partial<MapInput> = {}): MapInput =>
  ({ aircraft: { id: "ac", tail_number: "N1", year: 1978 }, logbook, log_entry, ...extra });

test("stops: one per book and date, lowest trust, stable ids, Other book and replaced notes left off", () => {
  const m = buildMapModel(input([
    e("lb-air", "2024-12-03", { trust: "signed" }), e("lb-air", "2024-12-03", { trust: "ai_read", page_id: "p-1" }),
    e("lb-eng", "2024-12-03"), e("lb-air", "2020-05-01"), e("lb-air", null, { page_id: null }),
    e("lb-air", "2025-01-01", { replaced_by_entry_id: "e1" }), e("lb-air", "2025-02-01", { is_continuation: true }), e("lb-oth", "2025-03-01"),
  ]), TODAY);
  assert.deepEqual(m.lines.map((l) => l.logbook), ["airframe", "engine", "prop"]);
  assert.deepEqual(m.stops.map((s) => [s.logbook, s.date, s.trust, s.major]), [
    ["airframe", "2020-05-01", "confirmed", true],
    ["airframe", "2024-12-03", "ai_read", false],
    ["engine", "2024-12-03", "confirmed", true],
  ]);
  assert.equal(m.stops[1].id, stopId("lb-air", "2024-12-03"));
  assert.match(m.stops[1].id, /^[0-9a-f]{16}$/);
  assert.equal(m.undatedEntries, 1);
  assert.deepEqual(m.range, { from: "2020-05-01", to: "2027-11-18", scaleBreak: "2025-11-18" });
  // History under five years: no scale break (10 §4).
  assert.equal(buildMapModel(input([e("lb-air", "2022-05-01")]), TODAY).range.scaleBreak, null);
});

test("interchanges: shared certificate or tach within 0.5 h, lowest trust, id from sorted stop ids", () => {
  const m = buildMapModel(input([
    e("lb-air", "2011-08-22", { mechanic_cert_number: "A&P 3105582 IA", trust: "signed" }),
    e("lb-eng", "2011-08-22", { mechanic_cert_number: "a&p 3105582 ia", trust: "ai_read" }),
    e("lb-prop", "2011-08-22", { tach: 2700.0 }), e("lb-eng", "2011-08-22", { tach: 2700.4 }),
    e("lb-air", "2015-01-01", { tach: 100 }), e("lb-eng", "2015-01-01", { tach: 100.6 }),
  ]), TODAY);
  assert.equal(m.interchanges.length, 1);
  const x = m.interchanges[0];
  assert.equal(x.trust, "ai_read");
  assert.deepEqual(x.lineIds, ["lb-air", "lb-eng", "lb-prop"]);
  assert.equal(x.id, interchangeId(x.stopIds));
  assert.equal(normCert(" CRS #ST4R881K "), "CRSST4R881K");
});

test("gaps: drawn statuses only, unconfirmed pages counted inside the span", () => {
  const m = buildMapModel(input([e("lb-air", "1980-01-01"), e("lb-air", "1985-03-01", { trust: "ai_read" }), e("lb-air", "1992-01-01")], {
    logbook_gap: [
      { id: "g1", logbook_id: "lb-air", from_date: "1980-01-01", to_date: "1992-01-01", status: "open" },
      { id: "g2", logbook_id: "lb-air", from_date: "1970-01-01", to_date: "1980-01-01", status: "dismissed" },
      { id: "g3", logbook_id: "lb-eng", from_date: "1990-01-01", to_date: "1999-01-01", status: "filled" },
    ],
  }), TODAY);
  assert.deepEqual(m.gaps.map((g) => [g.id, g.status, g.unconfirmedPages]), [["g1", "open", 1]]);
  assert.equal(m.range.from, "1980-01-01", "a dismissed gap does not stretch the map");
  assert.equal(m.range.scaleBreak, "2025-11-18");
});

// 13 §7.2 / 00 §3 rule 2: unconfirmed entries never change rings, visits or eras on the map.
test("rule: unconfirmed entries never move a ring, a visit or an era", () => {
  const mx = [
    { id: "mx-a", kind: "annual", label: "Annual", regulatory: true, interval_months: 12, interval_hours: null, last_done_date: "2026-03-10", last_done_hours: null },
    { id: "mx-t", kind: "engine_tbo", label: "Engine TBO", regulatory: false, interval_months: null, interval_hours: 2000, last_done_date: "2005-09-14", last_done_hours: 2390 },
  ];
  const confirmed = [e("lb-eng", "2005-09-14", { id: "ov", entry_kind: "engine_overhaul", tach: 2390 }), e("lb-air", "2026-03-10", { id: "an", entry_kind: "annual" })];
  const base = input(confirmed, {
    maintenance_item: mx,
    item_completion: [
      { id: "c-a", maintenance_item_id: "mx-a", ad_compliance_id: null, log_entry_id: "an", done_date: "2026-03-10", done_hours: null },
      { id: "c-t", maintenance_item_id: "mx-t", ad_compliance_id: null, log_entry_id: "ov", done_date: "2005-09-14", done_hours: 2390 },
    ],
    hours_reading: [{ id: "r1", reading_date: "2026-11-10", tach: 4200, hobbs: null, source: "manual" }],
    planned_visit: [{ id: "v", status: "planned", week_of: "2027-02-08", visit_date: null, provider_id: null }],
    planned_visit_item: [{ visit_id: "v", item_key: "mx:mx-a" }],
  });
  const ai = (o: Partial<MapEntryRow>) => e("lb-eng", "2026-11-01", { trust: "ai_read", ...o });
  const withAi: MapInput = {
    ...base,
    log_entry: [...confirmed, ai({ id: "ai-ov", entry_kind: "engine_overhaul", tach: 4199 }), ai({ id: "ai-an", logbook_id: "lb-air", entry_kind: "annual" })],
    item_completion: [...base.item_completion!,
      { id: "c-a2", maintenance_item_id: "mx-a", ad_compliance_id: null, log_entry_id: "ai-an", done_date: "2026-11-01", done_hours: null },
      { id: "c-t2", maintenance_item_id: "mx-t", ad_compliance_id: null, log_entry_id: "ai-ov", done_date: "2026-11-01", done_hours: 4199 }],
  };
  const [a, b] = [buildMapModel(base, TODAY), buildMapModel(withAi, TODAY)];
  assert.ok(a.rings.length > 0 && a.eras.length === 1 && a.visits.length === 1);
  assert.deepEqual(b.rings, a.rings);
  assert.deepEqual(b.visits, a.visits);
  assert.deepEqual(b.eras, a.eras);
  assert.equal(a.eras[0].label, "1,810 h since overhaul");
  // The unconfirmed entries are on the map, dotted.
  assert.equal(b.stops.filter((s) => s.trust === "ai_read").length, 2);
});

test("rule: unconfirmed entries never open or close a gap", () => {
  const rows = [e("lb-air", "2000-01-01"), e("lb-air", "2005-01-01"), e("lb-air", "2003-01-01", { trust: "ai_read" })];
  const gaps = detectGaps({ year: 1999, logbook, log_entry: rows });
  assert.deepEqual(gaps.map((g) => [g.from_date, g.to_date, g.source]), [["2000-01-01", "2005-01-01", "coverage_rule"]]);
});

test("gap detection: coverage, annual chain, before the first entry; reconciliation keeps owner statuses", () => {
  const rows = [
    e("lb-air", "1980-06-01", { entry_kind: "annual" }), e("lb-air", "1981-06-01", { description: "Annual inspection" }),
    e("lb-air", "1982-12-01", { description: "Annual inspection" }), e("lb-air", "1983-06-01"), e("lb-air", "1990-01-01"),
  ];
  const found = detectGaps({ year: 1975, logbook, log_entry: rows });
  assert.deepEqual(found.map((g) => [g.from_date, g.to_date, g.source]), [
    ["1975-01-01", "1980-06-01", "coverage_rule"],
    ["1981-06-01", "1982-12-01", "annual_chain"],
    ["1983-06-01", "1990-01-01", "coverage_rule"],
  ]);
  const stored: StoredGap[] = [
    { id: "s1", logbook_id: "lb-air", from_date: "1983-01-01", to_date: "1990-01-01", status: "no_pages_exist", source: "coverage_rule" },
    { id: "s2", logbook_id: "lb-air", from_date: "1960-01-01", to_date: "1961-01-01", status: "open", source: "coverage_rule" },
    { id: "s3", logbook_id: "lb-air", from_date: "1960-01-01", to_date: "1961-01-01", status: "dismissed", source: "coverage_rule" },
    { id: "s4", logbook_id: "lb-air", from_date: "1960-01-01", to_date: "1961-01-01", status: "open", source: "owner" },
  ];
  const plan = reconcileGaps(stored, found, logbook);
  assert.deepEqual(plan.insert.map((g) => g.from_date), ["1975-01-01", "1981-06-01"]);
  assert.deepEqual(plan.update, [
    { id: "s1", from_date: "1983-06-01", to_date: "1990-01-01" },
    { id: "s2", from_date: "1960-01-01", to_date: "1961-01-01", status: "filled" },
  ]);
});

test("gap evidence: other books, hours, verdict and neighbour pages from confirmed entries", () => {
  const rows = [
    e("lb-air", "1982-01-01", { tach: 500 }), e("lb-air", "1991-01-01", { tach: 1400 }),
    e("lb-eng", "1985-06-01", { tach: 760, entry_kind: "annual", page_id: "pe6" }), e("lb-eng", "1988-06-01", { tach: 1340, page_id: "pe11" }),
    e("lb-eng", "1987-06-01", { trust: "ai_read", tach: 9999 }), e("lb-air", "1986-01-01", { trust: "ai_read", page_id: "pa9" }),
  ];
  const ev = gapEvidence({
    gap: { id: "g", logbook_id: "lb-air", from_date: "1982-01-01", to_date: "1991-01-01", status: "open", source: "coverage_rule" },
    logbook, log_entry: rows,
    page: [{ id: "pe6", logbook_id: "lb-eng", page_sequence: 6 }, { id: "pe11", logbook_id: "lb-eng", page_sequence: 11 }, { id: "p-lb-air-1982-01-01", logbook_id: "lb-air", page_sequence: 40 }],
  })!;
  const eng = ev.otherBooks.find((b) => b.logbook === "engine")!;
  assert.deepEqual(eng, { logbook: "engine", entries: 2, annuals: 1, tachFrom: 760, tachTo: 1340, pageRange: "Engine p. 6 to 11" });
  assert.equal(ev.hoursFlownApprox, 580);
  assert.equal(ev.unconfirmedPagesInGap, 1);
  assert.equal(ev.verdict, "The aircraft flew and was inspected. The airframe pages for those years are what is missing.");
  assert.equal(ev.neighbourPages.before?.label, "Airframe p. 40");
  assert.equal(ev.neighbourPages.after?.pageNumber, null);
});

test("dates: month arithmetic clamps, today follows the owner's zone", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-11-18", -12), "2025-11-18");
  const lateUtc = new Date("2026-11-19T03:00:00Z");
  assert.equal(todayIn("America/New_York", lateUtc), "2026-11-18");
  assert.equal(todayIn(null, lateUtc), "2026-11-19");
  assert.equal(todayIn("Not/AZone", lateUtc), "2026-11-19");
});
