// Map fixtures (fixtures/README.md): runs the TypeScript MapModel derivation and map layout on each
// case and writes packages/shared/fixtures/map-*.json. Never edit the JSON by hand.
//   cd apps/web && node --import tsx ../../packages/shared/scripts/build-map-fixtures.ts [--check]
// apps/web/test/map-fixtures.test.ts fails when a committed file is stale.
//
// The five aircraft of 10 §11 (N734DM, a 2-aircraft hangar, nothing scanned, a twin, a 5,000-entry
// stress case) are built here from what 09/10 state about them; everything else is inferred and
// listed in fixtures/README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMapModel, type MapInput, type MapEntryRow, type MapModel } from "../../../apps/web/src/lib/mapModel";
import { layoutMap, type LayoutOptions } from "../../../apps/web/src/ui/map/map-layout";
import type { MaintenanceItemRow, HoursReadingRow } from "../../../apps/web/src/lib/due/engine";

const TODAY = "2026-11-18";
const FIXTURES = new URL("../fixtures/", import.meta.url);
export const MAP_ALGO_VERSION = 1;

// --- Row builders -------------------------------------------------------------------

const BOOKS = { airframe: "lb-air", engine: "lb-eng", prop: "lb-prop", avionics: "lb-avi", other: "lb-oth" } as const;
type Book = keyof typeof BOOKS;
const logbooks = (types: Book[]) => types.map((t) => ({ id: BOOKS[t], type: t, component_ref: null, title: null }));
let n = 0;
const entry = (book: string, date: string | null, o: Partial<MapEntryRow> = {}): MapEntryRow => ({
  id: `e-${++n}`, logbook_id: book, page_id: `p-${book}-${date ?? "x"}`, entry_date: date, trust: "confirmed", ...o,
});
const STD: Record<string, [string, boolean, number | null, number | null]> = {
  annual: ["Annual inspection (91.409)", true, 12, null],
  transponder: ["Transponder test (91.413)", true, 24, null],
  pitot_static: ["Pitot-static / altimeter (91.411)", true, 24, null],
  vor: ["VOR check (91.171) — IFR", true, 1, null],
  oil_change: ["Oil change", false, null, 50],
  engine_tbo: ["Engine TBO (advisory)", false, null, 2000],
  elt_battery: ["ELT battery", true, null, null],
};
const mx = (kind: string, o: Partial<MaintenanceItemRow> = {}): MaintenanceItemRow => {
  const [label, regulatory, months, hours] = STD[kind];
  return { id: `mx-${kind}`, kind, label, regulatory, interval_months: months, interval_hours: hours, last_done_date: null, last_done_hours: null, ...o };
};
/** Weekly readings ending at `today`, `perWeek` hours a week, ending at `tach`. */
function flying(weeks: number, tach: number, perWeek: number): HoursReadingRow[] {
  return Array.from({ length: weeks }, (_, i) => {
    const back = weeks - 1 - i;
    const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - (back * 7 + 1) * 864e5).toISOString().slice(0, 10);
    return { id: `hr-${i}`, reading_date: d, tach: Math.round((tach - back * perWeek) * 10) / 10, hobbs: null, source: "manual" };
  });
}
const aircraft = (tail: string, year: number) => ({ id: `ac-${tail.toLowerCase()}`, tail_number: tail, year, expected_hours_per_week: 3 });

// --- The five aircraft (10 §11) -------------------------------------------------------

/** N734DM: 1978 Cessna, four books, the 1983–1991 airframe gap, the 2005 engine overhaul, the
 *  three-book annual of Aug 22, 2011, the GTN 650 in 2019, an unconfirmed 2026 annual. */
function n734dm(): MapInput {
  n = 0;
  const A = BOOKS.airframe, E = BOOKS.engine, P = BOOKS.prop, V = BOOKS.avionics;
  const IA = "A&P 3105582 IA";
  const annualYears = [1979, 1980, 1981, 1982, 1991, 1993, 1995, 1997, 1999, 2001, 2003, 2005, 2007, 2009, 2011, 2013, 2015, 2017, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const e: MapEntryRow[] = [entry(A, "1978-06-02", { description: "Delivered. Weight and balance, equipment list.", trust: "signed", tach: 0 })];
  for (const y of annualYears) {
    const d = y === 2011 ? "2011-08-22" : y === 2024 ? "2024-12-03" : y === 2025 ? "2025-07-20" : `${y}-0${(y % 9) + 1}-15`;
    const tach = Math.round((y - 1978) * 88.5 * 10) / 10;
    e.push(entry(A, d, { description: "Annual inspection completed.", entry_kind: "annual", tach, mechanic_cert_number: y >= 2011 ? IA : `IA ${y}`, signature_name: "D. Alvarez" }));
    if (y === 2011 || y === 2024) {
      e.push(entry(E, d, { description: "Annual inspection, engine.", entry_kind: "annual", tach, mechanic_cert_number: IA }));
      e.push(entry(P, d, { description: "Annual inspection, propeller.", tach, mechanic_cert_number: IA }));
    }
    if (y === 2025) e.push(entry(P, d, { description: "Annual, propeller checked.", tach, mechanic_cert_number: "A&P 3105582  ia" }));
  }
  e.push(
    entry(E, "2005-09-14", { description: "Engine overhauled by Lycoming, zero time.", entry_kind: "engine_overhaul", tach: 2390.0, mechanic_cert_number: "RS LYCR123K" }),
    entry(E, "2007-05-02", { description: "Oil and filter changed.", entry_kind: "oil_change", tach: 2570.4 }),
    entry(E, "2009-04-11", { description: "Oil and filter changed.", entry_kind: "oil_change", tach: 2740.0 }),
    entry(E, "2024-06-01", { description: "Oil and filter changed.", entry_kind: "oil_change", tach: 4120.2 }),
    entry(E, "2025-06-10", { description: "Oil and filter changed.", entry_kind: "oil_change", tach: 4160.0 }),
    entry(V, "2019-03-12", { description: "Installed Garmin GTN 650 per STC.", entry_kind: "install", tach: 3891.2, mechanic_cert_number: "CRS #ST4R881K" }),
    entry(A, "2019-03-12", { description: "Form 337 for GTN 650 installation.", entry_kind: "major_alteration", tach: 3891.2, mechanic_cert_number: "CRS #ST4R881K" }),
    entry(V, "2023-02-11", { description: "Transponder and encoder tests.", tach: 4010.3 }),
    // Read by AI, not yet confirmed: an annual across two books (dotted interchange) and an oil change.
    entry(A, "2026-07-18", { description: "Annual inspection.", entry_kind: "annual", tach: 4219.6, trust: "ai_read", mechanic_cert_number: IA }),
    entry(E, "2026-07-18", { description: "Annual, engine.", entry_kind: "annual", tach: 4219.6, trust: "ai_read", mechanic_cert_number: IA }),
    entry(E, "2026-09-30", { description: "Oil changed.", entry_kind: "oil_change", tach: 4240.1, trust: "ai_read" }),
    // Never drawn: replaced owner note, continuation fragment, an entry on a page still being read; the Other book.
    entry(A, "2025-01-05", { description: "Owner note: oil added.", replaced_by_entry_id: "e-1", page_id: null }),
    entry(A, "2025-02-01", { is_continuation: true }),
    entry(A, "2026-11-10", { page_id: "p-queued" }),
    entry(BOOKS.other, "2024-03-01", { description: "Insurance certificate." }),
    // Undated: one with a page landing date (drawn there), one without (counted under the map).
    entry(A, null, { page_id: "p-landing", description: "Wheel bearing repacked." }),
    entry(A, null, { page_id: "p-nodate", description: "Tire replaced." }),
  );
  const engineOverhaul = e.find((x) => x.entry_kind === "engine_overhaul")!;
  return {
    aircraft: aircraft("N734DM", 1978),
    logbook: logbooks(["airframe", "engine", "prop", "avionics", "other"]),
    log_entry: e,
    page: [
      { id: "p-queued", logbook_id: A, page_sequence: 60, extraction_status: "queued" },
      { id: "p-landing", logbook_id: A, page_sequence: 61, extraction_status: "extracted", landing_date: "2026-03-14" },
    ],
    maintenance_item: [
      mx("annual", { last_done_date: "2025-07-20", last_done_hours: 4168.3 }),
      mx("oil_change", { last_done_date: "2026-08-20", last_done_hours: 4205.6 }),
      mx("transponder", { last_done_date: "2024-12-03" }),
      mx("pitot_static", { last_done_date: "2024-12-03" }),
      mx("vor", { last_done_date: "2026-10-11", ifr_only: true }),
      mx("engine_tbo", { last_done_date: "2005-09-14", last_done_hours: 2390.0 }),
      mx("elt_battery", { expires_on: "2027-02-28" }),
    ],
    item_completion: [
      { id: "c-tbo", maintenance_item_id: "mx-engine_tbo", ad_compliance_id: null, log_entry_id: engineOverhaul.id, done_date: "2005-09-14", done_hours: 2390.0 },
      // An overhaul read by AI and not confirmed: never starts an era (09 §3.1).
      { id: "c-tbo-ai", maintenance_item_id: "mx-engine_tbo", ad_compliance_id: null, log_entry_id: "e-ai-overhaul", done_date: "2026-09-01", done_hours: 4230.0 },
    ],
    hours_reading: flying(16, 4231.5, 3),
    logbook_gap: [
      { id: "g-air", logbook_id: A, from_date: "1982-03-15", to_date: "1991-02-15", status: "open" },
      { id: "g-air-before", logbook_id: A, from_date: "1970-01-01", to_date: "1978-06-02", status: "dismissed" },
      { id: "g-eng", logbook_id: E, from_date: "2011-08-22", to_date: "2024-06-01", status: "asked_previous_owner" },
      { id: "g-prop", logbook_id: P, from_date: "2011-08-22", to_date: "2024-12-03", status: "no_pages_exist" },
      { id: "g-filled", logbook_id: E, from_date: "2007-05-02", to_date: "2009-04-11", status: "filled" },
    ],
    squawk: [
      { id: "sq-open", description: "Left brake feels soft.", severity: "medium", status: "open", reported_at: "2026-10-01T15:00:00Z" },
      { id: "sq-done", description: "Prop spinner crack.", severity: "low", status: "resolved", reported_at: "2025-06-01T12:00:00Z", resolved_at: "2025-07-20T12:00:00Z", resolved_log_entry_id: e.find((x) => x.logbook_id === P && x.entry_date === "2025-07-20")!.id },
    ],
    planned_visit: [{ id: "v-dec", status: "planned", week_of: "2026-12-07", visit_date: null, provider_id: null, airport: "KBED" }],
    planned_visit_item: [{ visit_id: "v-dec", item_key: "mx:mx-transponder" }, { visit_id: "v-dec", item_key: "mx:mx-pitot_static" }],
  };
}

/** The hangar's second aircraft: a 2009 Piper scanned only from 2022, two books, short history (no scale break). */
function n4321j(): MapInput {
  n = 1000;
  const A = BOOKS.airframe, E = BOOKS.engine;
  return {
    aircraft: aircraft("N4321J", 2009),
    logbook: logbooks(["airframe", "engine"]),
    log_entry: [
      entry(A, "2022-04-02", { entry_kind: "annual", tach: 1802.3, mechanic_cert_number: "IA 4477" }),
      entry(E, "2022-04-02", { entry_kind: "annual", tach: 1802.3 }),
      entry(A, "2023-04-11", { entry_kind: "annual", tach: 1890.0 }),
      entry(A, "2024-04-20", { entry_kind: "annual", tach: 1975.5, mechanic_cert_number: "IA 4477" }),
      entry(E, "2024-04-20", { entry_kind: "annual", tach: 1975.8, mechanic_cert_number: "IA 4477" }),
      entry(E, "2024-04-21", { entry_kind: "oil_change", tach: 1975.9 }),
      entry(E, "2024-04-22", { entry_kind: "oil_change", tach: 1976.0 }),
      entry(A, "2025-04-18", { entry_kind: "annual", tach: 2050.1, trust: "ai_read" }),
    ],
    maintenance_item: [mx("annual", { last_done_date: "2025-12-01" }), mx("oil_change", { last_done_date: "2026-10-01", last_done_hours: 2121.0 })],
    hours_reading: flying(12, 2140.0, 2),
    logbook_gap: [{ id: "g-4321-before", logbook_id: A, from_date: "2009-01-01", to_date: "2022-04-02", status: "open" }],
  };
}

/** Nothing scanned yet: books and the setup answers, no entries. Rings only. */
function nothingScanned(): MapInput {
  return {
    aircraft: aircraft("N100NS", 1998),
    logbook: logbooks(["airframe", "engine", "prop"]),
    log_entry: [],
    maintenance_item: [mx("annual", { last_done_date: "2026-03-10" }), mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 980.0 })],
    hours_reading: flying(10, 1010.0, 2),
  };
}

/** A twin (Baron): engines and propellers 1 and 2 as their own lanes (component_ref), one annual across five books. */
function twin(): MapInput {
  n = 2000;
  const books = [
    { id: "lb-air", type: "airframe", component_ref: null, title: null },
    { id: "lb-eng-l", type: "engine", component_ref: "L", title: "Left engine" },
    { id: "lb-eng-r", type: "engine", component_ref: "R", title: "Right engine" },
    { id: "lb-prop-l", type: "prop", component_ref: "L", title: null },
    { id: "lb-prop-r", type: "prop", component_ref: "R", title: null },
    // A second volume of the airframe book: the same line.
    { id: "lb-air2", type: "airframe", component_ref: null, title: "Vol. 2" },
  ];
  const IA = "IA 2290114";
  const e: MapEntryRow[] = [];
  for (const y of [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
    const d = `${y}-05-10`;
    const tach = 1200 + (y - 2015) * 140;
    e.push(entry(y >= 2021 ? "lb-air2" : "lb-air", d, { entry_kind: "annual", tach, mechanic_cert_number: IA }));
    if (y % 3 === 0) for (const b of ["lb-eng-l", "lb-eng-r", "lb-prop-l", "lb-prop-r"]) e.push(entry(b, d, { entry_kind: "annual", tach, mechanic_cert_number: IA }));
  }
  e.push(entry("lb-eng-r", "2019-11-02", { entry_kind: "engine_overhaul", tach: 1730.0, description: "Right engine overhauled." }));
  return {
    aircraft: aircraft("N58TW", 2014),
    logbook: books,
    log_entry: e,
    maintenance_item: [mx("annual", { last_done_date: "2026-05-10" })],
    item_completion: [],
    hours_reading: flying(12, 2900.0, 4),
  };
}

/** 5,000 entries over sixty years on four books, about 15 % unconfirmed, an annual interchange every year. */
function stress(): MapInput {
  n = 10_000;
  let seed = 734;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const types: Book[] = ["airframe", "engine", "prop", "avionics"];
  const e: MapEntryRow[] = [];
  const start = Date.parse("1966-01-01T00:00:00Z");
  const span = Date.parse("2026-11-01T00:00:00Z") - start;
  for (let i = 0; e.length < 5000; i++) {
    if (i % 80 === 0) {
      const y = 1966 + i / 80;
      const d = `${y}-06-15`;
      for (const t of types.slice(0, y >= 1990 ? 4 : 3)) e.push(entry(BOOKS[t], d, { entry_kind: "annual", tach: (y - 1966) * 70, mechanic_cert_number: `IA ${y}`, page_id: null }));
      continue;
    }
    const t = types[Math.floor(rnd() * (rnd() < 0.5 ? 2 : 4))];
    const d = new Date(start + Math.floor(rnd() * span / 864e5) * 864e5).toISOString().slice(0, 10);
    // No page ids, so the committed fixture stays small.
    e.push(entry(BOOKS[t], d, { trust: rnd() < 0.15 ? "ai_read" : "confirmed", tach: Math.round(rnd() * 4000 * 10) / 10, page_id: null }));
  }
  return {
    aircraft: aircraft("N5000X", 1965),
    logbook: logbooks(["airframe", "engine", "prop", "avionics"]),
    log_entry: e.slice(0, 5000),
    maintenance_item: [mx("annual", { last_done_date: "2026-06-15" }), mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 4100.0 })],
    hours_reading: flying(10, 4120.0, 3),
  };
}

// --- Grouping cases (09 §3.7 stops and interchanges; the phones' offline subset, 09 §3.12 item 7) ---

function grouping(): { name: string; input: MapInput }[] {
  n = 5000;
  const ac = aircraft("N1", 2000);
  const books = logbooks(["airframe", "engine", "prop", "other"]);
  const A = BOOKS.airframe, E = BOOKS.engine, P = BOOKS.prop;
  const c = (name: string, log_entry: MapEntryRow[], extra: Partial<MapInput> = {}) => ({ name, input: { aircraft: ac, logbook: books, log_entry, ...extra } });
  return [
    c("one stop per book and date, lowest trust", [entry(A, "2020-05-01", { trust: "signed" }), entry(A, "2020-05-01", { trust: "ai_read" }), entry(A, "2021-05-01")]),
    c("interchange by shared certificate, spaces and case ignored", [entry(A, "2020-05-01", { mechanic_cert_number: "A&P 123 IA" }), entry(E, "2020-05-01", { mechanic_cert_number: "a&p123ia" })]),
    c("interchange by tach within 0.5 h", [entry(A, "2020-05-01", { tach: 1000.0 }), entry(P, "2020-05-01", { tach: 1000.5 })]),
    c("no interchange when tach is 0.6 h apart and no certificate", [entry(A, "2020-05-01", { tach: 1000.0 }), entry(E, "2020-05-01", { tach: 1000.6 })]),
    c("three books, one chained by tach, one by certificate", [entry(A, "2020-05-01", { tach: 1000.0 }), entry(E, "2020-05-01", { tach: 1000.2, mechanic_cert_number: "IA 9" }), entry(P, "2020-05-01", { mechanic_cert_number: "IA 9" })]),
    c("an unconfirmed stop joins the interchange and lowers its trust", [entry(A, "2020-05-01", { tach: 1000.0, trust: "signed" }), entry(E, "2020-05-01", { tach: 1000.0, trust: "ai_read" })]),
    c("replaced notes, continuations and the Other book are not drawn", [entry(A, "2020-05-01", { replaced_by_entry_id: "x" }), entry(A, "2020-06-01", { is_continuation: true }), entry(BOOKS.other, "2020-07-01"), entry(A, "2020-08-01")]),
    c("undated entries: landing date of the page, else counted", [entry(A, null, { page_id: "p-l" }), entry(A, null, { page_id: null })], { page: [{ id: "p-l", logbook_id: A, page_sequence: 3, landing_date: "2021-02-03" }] }),
    c("pages still being read are not drawn", [entry(A, "2020-05-01", { page_id: "p-q" }), entry(A, "2020-05-02", { page_id: "p-w" })], { page: [{ id: "p-q", logbook_id: A, page_sequence: 1, extraction_status: "processing" }, { id: "p-w", logbook_id: A, page_sequence: 2, extraction_status: "waiting_allowance" }] }),
    c("major stops: overhaul words, entry kind, first entry", [entry(A, "2010-01-01"), entry(A, "2011-01-01", { description: "Major repair, left wing spar." }), entry(E, "2012-01-01"), entry(E, "2013-01-01", { entry_kind: "engine_overhaul" })]),
    c("volumes of one book are one line", [entry("lb-air", "2010-01-01"), entry("lb-air-2", "2010-01-01"), entry("lb-air-2", "2015-01-01")], { logbook: [...books, { id: "lb-air-2", type: "airframe", component_ref: null, title: "Vol. 2" }] }),
  ];
}

// --- Rule cases: unconfirmed entries never change rings, visits or eras (13 §7.2, 00 §3 rule 2) ---

function ruleCases(): { name: string; input: MapInput }[] {
  const base = n734dm();
  const withAi: MapInput = {
    ...base,
    log_entry: [...base.log_entry!, entry(BOOKS.engine, "2026-11-01", { entry_kind: "engine_overhaul", trust: "ai_read", tach: 4240 }), entry(BOOKS.avionics, "2026-11-02", { description: "Transponder test", trust: "ai_read" })],
    // The 0070 back-fill's owner completion, then a newer one on an entry read by AI.
    item_completion: [...base.item_completion!, { id: "c-xpdr", maintenance_item_id: "mx-transponder", ad_compliance_id: null, log_entry_id: null, done_date: "2024-12-03", done_hours: null }, { id: "c-xpdr-ai", maintenance_item_id: "mx-transponder", ad_compliance_id: null, log_entry_id: `e-${n}`, done_date: "2026-11-02", done_hours: null }],
  };
  return [{ name: "unconfirmed: an AI-read overhaul and transponder test move no ring, visit or era", input: withAi }];
}

// --- Files --------------------------------------------------------------------------------

type ModelCase = { name: string; today?: string; input: MapInput; opts?: Parameters<typeof buildMapModel>[2] };
const aircraftCases: ModelCase[] = [
  { name: "N734DM", input: n734dm() },
  { name: "N734DM, engine and prop only, 2005 to 2015", input: n734dm(), opts: { only: ["engine", "prop"], from: "2005-01-01", to: "2015-12-31" } },
  { name: "hangar: N4321J", input: n4321j() },
  { name: "nothing scanned", input: nothingScanned() },
  { name: "twin", input: twin() },
];

const SIZES: { tag: string; o: LayoutOptions }[] = [
  { tag: "routemap", o: { size: "routemap" } },
  { tag: "routemap at 1440", o: { size: "routemap", renderedWidth: 1110 } },
  { tag: "spine", o: { size: "spine", window: { from: TODAY, to: "2027-11-18" } } },
  { tag: "lineahead", o: { size: "lineahead" } },
  { tag: "lineahead on the phone", o: { size: "lineahead-phone" } },
  { tag: "phone map at 375", o: { size: "phone", renderedWidth: 375 } },
];

const strip = (m: MapModel) => ({ lines: m.lines, stops: m.stops, interchanges: m.interchanges, undatedEntries: m.undatedEntries });

export function build(): Record<string, string> {
  const file = (rule: string, cases: { name: string; today: string; input: unknown; expected: unknown }[], indent = 1) => {
    const names = new Set<string>();
    for (const c of cases) { if (names.has(c.name)) throw new Error(`duplicate case "${c.name}"`); names.add(c.name); }
    return JSON.stringify({ rule, algoVersion: MAP_ALGO_VERSION, cases }, null, indent) + "\n";
  };
  const model = (c: ModelCase) => buildMapModel(c.input, c.today ?? TODAY, c.opts ?? {});
  const withOpts = (c: ModelCase) => (c.opts ? { ...c.input, _options: c.opts } : c.input);

  const layoutCases = [
    ...aircraftCases.filter((c) => !c.opts).flatMap((c) => {
      const m = model(c);
      return SIZES.map((s) => ({ name: `${c.name}: ${s.tag}`, today: TODAY, input: { model: m, options: s.o }, expected: layoutMap(m, s.o) }));
    }),
    ...[
      { tag: "routemap zoomed to 2005 to 2015", o: { size: "routemap", zoom: { from: "2005-01-01", to: "2015-12-31" } } as LayoutOptions },
      { tag: "lineahead, plan ahead 24 months", o: { size: "lineahead", planAhead: true } as LayoutOptions, to: "2028-11-18" },
      { tag: "routemap, every era", o: { size: "routemap", allEras: true } as LayoutOptions },
    ].map((v) => {
      const m = buildMapModel(n734dm(), TODAY, v.to ? { to: v.to } : {});
      return { name: `N734DM: ${v.tag}`, today: TODAY, input: { model: m, options: v.o }, expected: layoutMap(m, v.o) };
    }),
  ];
  // Layout never reads a stop's entry or page ids; dropping them keeps the committed file near 0.5 MB.
  const full = buildMapModel(stress(), TODAY);
  const stressModel: MapModel = { ...full, stops: full.stops.map((s) => ({ ...s, entryIds: [], pageIds: [] })) };
  // One case, three sizes: the 5,000-stop model is committed once.
  const stressOpts: LayoutOptions[] = [{ size: "routemap" }, { size: "spine" }, { size: "phone" }];
  const stressCases = [{ name: "5,000 entries: routemap, spine, phone", today: TODAY, input: { model: stressModel, options: stressOpts }, expected: stressOpts.map((o) => layoutMap(stressModel, o)) }];

  return {
    "map-grouping.json": file("09 §3.7 stops and interchanges, §3.12 item 7", grouping().map((c) => ({ name: c.name, today: TODAY, input: c.input, expected: strip(buildMapModel(c.input, TODAY)) }))),
    "map-model.json": file("09 §3.7, §4.6 MapModel; 10 §2", ([...aircraftCases, ...ruleCases()] as ModelCase[]).map((c) => ({ name: c.name, today: c.today ?? TODAY, input: withOpts(c), expected: model(c) }))),
    "map-layout.json": file("10 §4–§8 map layout (positions in viewBox units, compared within 0.5)", layoutCases),
    "map-layout-stress.json": file("10 §11 stress case, §12 (expected: one layout per options entry)", stressCases, 0),
  };
}

export function stale(): string[] {
  return Object.entries(build()).filter(([f, text]) => {
    try { return readFileSync(new URL(f, FIXTURES), "utf8") !== text; } catch { return true; }
  }).map(([f]) => f);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const bad = stale();
    if (bad.length) { console.error(`Stale fixtures: ${bad.join(", ")}. Run the generator.`); process.exit(1); }
  } else {
    for (const [f, text] of Object.entries(build())) writeFileSync(new URL(f, FIXTURES), text);
  }
}
