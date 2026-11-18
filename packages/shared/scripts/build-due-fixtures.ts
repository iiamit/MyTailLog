// Due engine fixtures (fixtures/README.md): runs the TypeScript engine on each
// case and writes packages/shared/fixtures/<rule>.json. Never edit the JSON by hand.
//   cd apps/web && node --import tsx ../../packages/shared/scripts/build-due-fixtures.ts [--check]
// --check exits 1 when a committed file differs (apps/web/test/due-fixtures.test.ts does the same).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ALGO_VERSION, computeStatus, type DueInput, type DueItem, type StatusBody,
  type MaintenanceItemRow, type HoursReadingRow, type LogEntryRow, type ItemCompletionRow,
  type AdComplianceRow, type DocumentRow,
} from "../../../apps/web/src/lib/due/engine";

const TODAY = "2026-11-18";
const FIXTURES = new URL("../fixtures/", import.meta.url);

// --- Row builders -----------------------------------------------------------------

const aircraft = (o: Partial<DueInput["aircraft"]> = {}): DueInput["aircraft"] => ({
  id: "ac-n734dm", tail_number: "N734DM", enrollment_date: null, enrollment_tach: null, enrollment_hobbs: null,
  enrollment_airframe: null, expected_hours_per_week: null, situation_override: null, ...o,
});
const STD: Record<string, [string, boolean, number | null, number | null]> = {
  annual: ["Annual inspection (91.409)", true, 12, null],
  transponder: ["Transponder test (91.413)", true, 24, null],
  pitot_static: ["Pitot-static / altimeter (91.411)", true, 24, null],
  elt: ["ELT inspection (91.207)", true, 12, null],
  elt_battery: ["ELT battery", true, null, null],
  vor: ["VOR check (91.171) — IFR", true, 1, null],
  hundred_hour: ["100-hour inspection (91.409)", true, null, 100],
  oil_change: ["Oil change", false, null, 50],
  engine_tbo: ["Engine TBO (advisory)", false, null, 2000],
  prop_overhaul: ["Propeller overhaul (advisory)", false, 72, null],
};
const mx = (kind: string, o: Partial<MaintenanceItemRow> = {}): MaintenanceItemRow => {
  const [label, regulatory, months, hours] = STD[kind] ?? [kind, false, null, null];
  return {
    id: `mx-${kind}`, kind, label, regulatory, interval_months: months, interval_hours: hours,
    last_done_date: null, last_done_hours: null, next_due_date: null, next_due_hours: null, meter: null,
    line: null, provider_id: null, ifr_only: kind === "vor" || kind === "pitot_static", expires_on: null, ...o,
  };
};
const ad = (o: Partial<AdComplianceRow> & { id: string }): AdComplianceRow => ({
  kind: "ad", reference: "2011-10-09", recurring: true, status: "complied", interval_months: null, interval_hours: null,
  complied_date: null, complied_hours: null, next_due_date: null, next_due_hours: null, reference_entry_id: null,
  provider_id: null, ...o,
});
const doc = (o: Partial<DocumentRow> & { id: string }): DocumentRow => ({
  type: "registration", title: null, expires_on: null, renews_every_months: null, track_expiry: true,
  remind_lead_days: null, ...o,
});
let seq = 0;
const reading = (date: string, tach: number | null, hobbs: number | null = null, source = "manual"): HoursReadingRow =>
  ({ id: `hr-${date}-${++seq}`, reading_date: date, tach, hobbs, airframe: null, source });
/** Readings every `step` days from `from` to `to`, accruing `perDay` hours. */
function flying(from: string, to: string, step: number, start: number, perDay: number, meter: "tach" | "hobbs" = "tach") {
  const out: HoursReadingRow[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`), i = 0; t <= Date.parse(`${to}T00:00:00Z`); t += step * 864e5, i++) {
    const v = Math.round((start + i * step * perDay) * 10) / 10;
    const d = new Date(t).toISOString().slice(0, 10);
    out.push(meter === "tach" ? reading(d, v) : reading(d, null, v));
  }
  return out;
}
const entry = (id: string, o: Partial<LogEntryRow> = {}): LogEntryRow => ({
  id, logbook_id: "lb-airframe", page_id: null, entry_date: null, tach: null, hobbs: null, airframe: null,
  trust: "confirmed", replaced_by_entry_id: null, signature_name: null, ...o,
});
const done = (id: string, itemId: string, date: string, hours: number | null = null, entryId: string | null = null): ItemCompletionRow =>
  ({ id, maintenance_item_id: itemId, ad_compliance_id: null, log_entry_id: entryId, done_date: date, done_hours: hours });
const books = [
  { id: "lb-airframe", type: "airframe" }, { id: "lb-engine", type: "engine" },
  { id: "lb-prop", type: "prop" }, { id: "lb-avionics", type: "avionics" },
];
/** A ready aircraft: an annual on record and a current tach, so the situation is not `setup`. */
const ready = (rows: Partial<DueInput> = {}, annualDone = "2026-06-10"): DueInput => ({
  aircraft: aircraft(),
  logbook: books,
  ...rows,
  maintenance_item: [mx("annual", { last_done_date: annualDone, last_done_hours: 2100 }), ...(rows.maintenance_item ?? [])],
  hours_reading: rows.hours_reading ?? [reading("2026-11-10", 2165.3, 2410.8)],
});

// --- Views: what each file asserts (API shapes, 09 §4.3) ----------------------------

const pick = <K extends keyof DueItem>(keys: K[]) => (i: DueItem) =>
  Object.fromEntries(keys.map((k) => [k, i[k]])) as Pick<DueItem, K>;
type View = (b: StatusBody) => unknown;
const views: Record<string, { rule: string; view: View }> = {
  "due-calendar": {
    rule: "09 §3.2 calendar limit, §3.1 unconfirmed gate",
    view: (b) => ({ items: b.items.map(pick(["key", "label", "rule", "status", "calendar", "first", "firstDate", "lastDone", "waitingEntryId"])) }),
  },
  "due-hours": {
    rule: "09 §3.2 hours limit, §3.1 meters",
    view: (b) => ({ meters: b.meters, items: b.items.map(pick(["key", "status", "hours", "first", "firstDate"])) }),
  },
  "status-thresholds": {
    rule: "09 §3.2 status",
    view: (b) => ({ items: b.items.map(pick(["key", "status", "advisory"])), counts: b.counts }),
  },
  projection: {
    rule: "09 §3.3 projection and first",
    view: (b) => ({ rate: b.rate, items: b.items.map(pick(["key", "status", "calendar", "hours", "first", "firstDate"])) }),
  },
  verdict: {
    rule: "09 §3.6 situation, §3.4 line ahead, 12 §4 verdict",
    view: (b) => ({ situation: b.situation, verdict: b.verdict, lineAhead: b.lineAhead }),
  },
};

type Case = { name: string; today?: string; input: DueInput };
const cases: Record<string, Case[]> = {
  "due-calendar": [
    { name: "annual: calendar month, due end of the 12th month", input: ready({}, "2025-12-03") },
    { name: "annual: lapsed at the end of March", input: ready({}, "2025-03-15") },
    { name: "annual: done on the last day of a month", input: ready({}, "2025-11-30") },
    { name: "annual: done Jan 31 stays Jan 31", input: ready({}, "2026-01-31") },
    { name: "transponder: 24 calendar months", input: ready({ maintenance_item: [mx("transponder", { last_done_date: "2024-12-03" })] }) },
    { name: "pitot-static: leap day rolls to the end of February", input: ready({ maintenance_item: [mx("pitot_static", { last_done_date: "2024-02-29" })] }) },
    { name: "ELT: calendar months, current", input: ready({ maintenance_item: [mx("elt", { last_done_date: "2026-02-10" })] }) },
    { name: "VOR: exactly 30 days, lapsed 7 days ago", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-12" })] }) },
    { name: "VOR: 4 days left is due soon", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-23" })] }) },
    { name: "VOR: 6 days left is current", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-25" })] }) },
    { name: "VOR: due today is due soon, not overdue", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-19" })] }) },
    { name: "custom 6 months: same day, clamped to month end", input: ready({ maintenance_item: [mx("custom", { id: "mx-belts", label: "Seat belts", interval_months: 6, last_done_date: "2026-08-31" })] }) },
    { name: "custom 1 month from Oct 31 is Nov 30", input: ready({ maintenance_item: [mx("custom", { id: "mx-cust", label: "Battery check", interval_months: 1, last_done_date: "2026-10-31" })] }) },
    { name: "prop overhaul: exact months, advisory", input: ready({ maintenance_item: [mx("prop_overhaul", { last_done_date: "2021-05-20" })] }) },
    { name: "ELT battery: expiry date, current", input: ready({ maintenance_item: [mx("elt_battery", { expires_on: "2027-02-28" })] }) },
    { name: "ELT battery: expiry inside 90 days", input: ready({ maintenance_item: [mx("elt_battery", { expires_on: "2026-12-15" })] }) },
    { name: "AD: recurring 12 months from compliance", input: ready({ ad_compliance: [ad({ id: "ad-1", interval_months: 12, complied_date: "2025-11-10" })] }) },
    { name: "AD: open, owner-entered due date", input: ready({ ad_compliance: [ad({ id: "ad-2", recurring: false, status: "open", next_due_date: "2027-01-05" })] }) },
    { name: "AD: complied once is not a due item", input: ready({ ad_compliance: [ad({ id: "ad-3", recurring: false, status: "complied", complied_date: "2020-01-01" })] }) },
    { name: "AD: open with no date is no record", input: ready({ ad_compliance: [ad({ id: "ad-4", recurring: false, status: "open" })] }) },
    { name: "document: registration inside the 60-day lead", input: ready({ document: [doc({ id: "doc-reg", expires_on: "2027-01-10" })] }) },
    { name: "document: per-document lead of 30 days", input: ready({ document: [doc({ id: "doc-ins", type: "insurance", title: "Hull and liability", expires_on: "2027-01-10", remind_lead_days: 30 })] }) },
    { name: "document: tracked without an expiry is no record", input: ready({ document: [doc({ id: "doc-radio", type: "radio_license" })] }) },
    { name: "document: not tracked is not a due item", input: ready({ document: [doc({ id: "doc-poh", type: "poh_afm", track_expiry: false, expires_on: "2026-01-01" })] }) },
    { name: "no record: annual never done", input: { aircraft: aircraft(), maintenance_item: [mx("annual")], hours_reading: [reading("2026-11-10", 2165.3)] } },
    { name: "custom: owner-typed next due with nothing done", input: ready({ maintenance_item: [mx("custom", { id: "mx-wheel", label: "Wheel bearings", interval_months: 24, next_due_date: "2027-04-01" })] }) },
    {
      name: "signed completion: page label and signer",
      input: ready({
        page: [{ id: "pg-58", logbook_id: "lb-avionics", page_sequence: 58 }],
        log_entry: [entry("e-xpdr", { logbook_id: "lb-avionics", page_id: "pg-58", entry_date: "2024-12-03", trust: "signed", signature_name: "AeroCheck Instruments" })],
        item_completion: [done("c-1", "mx-transponder", "2024-12-03", null, "e-xpdr")],
        maintenance_item: [mx("transponder", { last_done_date: "2024-12-03" })],
      }),
    },
    {
      name: "unconfirmed: a newer AI-read completion does not move the annual",
      input: {
        aircraft: aircraft(), logbook: books, hours_reading: [reading("2026-11-10", 2165.3)],
        log_entry: [entry("e-old", { entry_date: "2025-03-15" }), entry("e-new", { entry_date: "2026-06-01", trust: "ai_read" })],
        item_completion: [done("c-old", "mx-annual", "2025-03-15", 2050, "e-old"), done("c-new", "mx-annual", "2026-06-01", 2120, "e-new")],
        maintenance_item: [mx("annual", { last_done_date: "2026-06-01", last_done_hours: 2120 })],
      },
    },
    {
      name: "unconfirmed: a replaced entry's completion does not count",
      input: ready({
        log_entry: [entry("e-a", { entry_date: "2024-12-03" }), entry("e-b", { entry_date: "2025-12-03", replaced_by_entry_id: "e-c" })],
        item_completion: [done("c-a", "mx-transponder", "2024-12-03", null, "e-a"), done("c-b", "mx-transponder", "2025-12-03", null, "e-b")],
        maintenance_item: [mx("transponder", { last_done_date: "2025-12-03" })],
      }),
    },
    {
      name: "unconfirmed: only AI-read completions is no record",
      input: ready({
        log_entry: [entry("e-ai", { entry_date: "2025-12-03", trust: "ai_read" })],
        item_completion: [done("c-ai", "mx-elt", "2025-12-03", null, "e-ai")],
        maintenance_item: [mx("elt", { last_done_date: "2025-12-03" })],
      }),
    },
    {
      name: "unconfirmed: owner Mark done without a page counts",
      input: ready({ item_completion: [done("c-own", "mx-elt", "2026-01-20")], maintenance_item: [mx("elt", { last_done_date: "2026-01-20" })] }),
    },
    {
      name: "unconfirmed: AD whose reference entry is AI-read is no record",
      input: ready({
        log_entry: [entry("e-ad", { entry_date: "2026-01-02", trust: "ai_read" })],
        ad_compliance: [ad({ id: "ad-5", interval_months: 12, complied_date: "2026-01-02", reference_entry_id: "e-ad" })],
      }),
    },
  ],

  "due-hours": [
    { name: "oil: hobbs countdown, due soon by hours", input: ready({ maintenance_item: [mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 2370.5 })] }) },
    { name: "oil: no hobbs meter falls back to tach", input: ready({ hours_reading: [reading("2026-11-10", 2165.3)], maintenance_item: [mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 2140 })] }) },
    { name: "oil: owner chose hobbs and there is none, no record", input: ready({ hours_reading: [reading("2026-11-10", 2165.3)], maintenance_item: [mx("oil_change", { meter: "hobbs", last_done_date: "2026-09-01", last_done_hours: 2140 })] }) },
    { name: "oil: owner chose tach", input: ready({ maintenance_item: [mx("oil_change", { meter: "tach", last_done_date: "2026-09-01", last_done_hours: 2140 })] }) },
    { name: "100-hour: resets off a later annual", input: ready({ maintenance_item: [mx("hundred_hour", { last_done_date: "2026-01-10", last_done_hours: 2060 })] }) },
    { name: "100-hour: its own later completion wins", input: ready({ maintenance_item: [mx("hundred_hour", { last_done_date: "2026-09-10", last_done_hours: 2140 })] }) },
    { name: "hours overdue", input: ready({ maintenance_item: [mx("custom", { id: "mx-mags", label: "Magneto inspection", interval_hours: 500, last_done_hours: 1660, last_done_date: "2019-01-01" })] }) },
    { name: "hours reached exactly is overdue", input: ready({ maintenance_item: [mx("custom", { id: "mx-x", label: "Vacuum pump", interval_hours: 65.3, last_done_hours: 2100, last_done_date: "2025-01-01" })] }) },
    { name: "10.0 h left is due soon", input: ready({ maintenance_item: [mx("custom", { id: "mx-x", label: "Spark plugs", interval_hours: 75.3, last_done_hours: 2100, last_done_date: "2025-01-01" })] }) },
    { name: "10.1 h left is current", input: ready({ maintenance_item: [mx("custom", { id: "mx-x", label: "Spark plugs", interval_hours: 75.4, last_done_hours: 2100, last_done_date: "2025-01-01" })] }) },
    { name: "engine TBO: advisory, current", input: ready({ maintenance_item: [mx("engine_tbo", { last_done_date: "2012-04-02", last_done_hours: 755.9 })] }) },
    { name: "hours limit with no meter reading is no record", input: { aircraft: aircraft(), maintenance_item: [mx("oil_change", { last_done_hours: 2140, last_done_date: "2026-09-01" })] } },
    {
      name: "meter reset: stitched across a tach replacement",
      input: ready({
        hours_reading: [reading("2025-05-20", 2300), reading("2025-06-01", 0), reading("2026-11-10", 150)],
        meter_reset: [{ meter: "tach", reset_date: "2025-06-01", prior_value: 2300, new_value: 0 }],
        maintenance_item: [mx("hundred_hour", { last_done_date: "2025-09-01", last_done_hours: 100 })],
      }, "2025-04-01"),
    },
    {
      name: "meter reset: missing prior inferred from the retired meter",
      input: ready({
        hours_reading: [reading("2025-01-10", 2280), reading("2025-05-20", 2310.4), reading("2026-11-10", 150)],
        meter_reset: [{ meter: "tach", reset_date: "2025-06-01", prior_value: null, new_value: 0 }],
        maintenance_item: [mx("oil_change", { meter: "tach", last_done_date: "2026-10-01", last_done_hours: 120 })],
      }, "2025-04-01"),
    },
    { name: "ADS-B estimates never set the meter", input: ready({ hours_reading: [reading("2026-11-10", 2165.3, 2410.8), reading("2026-11-16", 2170.1, 2416, "adsb_estimate")], maintenance_item: [mx("oil_change", { last_done_hours: 2370, last_done_date: "2026-09-01" })] }) },
    {
      name: "unconfirmed: an AI-read entry's tach does not move the meter",
      input: ready({
        log_entry: [entry("e-ai", { entry_date: "2026-11-15", tach: 2190.2, hobbs: 2440, trust: "ai_read", page_id: "pg-9" })],
        maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })],
      }),
    },
    {
      name: "confirmed entry sets the meter",
      input: ready({
        log_entry: [entry("e-ok", { entry_date: "2026-11-15", tach: 2190.2, hobbs: 2440 })],
        maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })],
      }),
    },
    { name: "hobbs equal to tach is dropped as a duplicate", input: ready({ hours_reading: [reading("2026-10-01", 2160, 2405), reading("2026-11-10", 2165.3, 2165.3)], maintenance_item: [mx("oil_change", { last_done_hours: 2370, last_done_date: "2026-09-01" })] }) },
    { name: "AD: recurring hours from compliance, on tach", input: ready({ ad_compliance: [ad({ id: "ad-h", interval_hours: 100, complied_date: "2026-03-01", complied_hours: 2080 })] }) },
    { name: "starting values are the meter when nothing else exists", input: ready({ aircraft: aircraft({ enrollment_date: "2026-01-05", enrollment_tach: 2040.5, enrollment_hobbs: 2280 }), hours_reading: [], maintenance_item: [mx("oil_change", { last_done_hours: 2260, last_done_date: "2025-12-01" })] }) },
    { name: "same-day readings: the highest is current", input: ready({ hours_reading: [reading("2026-11-10", 2163.1), reading("2026-11-10", 2165.3), reading("2026-10-01", 2150)] }) },
    { name: "an owner-typed due hours with nothing done", input: ready({ maintenance_item: [mx("custom", { id: "mx-gov", label: "Governor overhaul", interval_hours: null, next_due_hours: 2400 })] }) },
  ],

  "status-thresholds": [
    { name: "90 days left is due soon", input: ready({ maintenance_item: [mx("custom", { id: "mx-c", label: "Fire extinguisher", interval_months: 12, last_done_date: "2026-02-16" })] }) },
    { name: "91 days left is current", input: ready({ maintenance_item: [mx("custom", { id: "mx-c", label: "Fire extinguisher", interval_months: 12, last_done_date: "2026-02-17" })] }) },
    { name: "1 day past is overdue", input: ready({ maintenance_item: [mx("custom", { id: "mx-c", label: "Fire extinguisher", interval_months: 12, last_done_date: "2025-11-17" })] }) },
    { name: "document: 60 days is due soon, 61 current", input: ready({ document: [doc({ id: "doc-a", expires_on: "2027-01-17" }), doc({ id: "doc-b", type: "insurance", expires_on: "2027-01-18" })] }) },
    { name: "calendar current, hours due soon: due soon", input: ready({ maintenance_item: [mx("oil_change", { interval_months: 4, last_done_date: "2026-09-20", last_done_hours: 2365 })] }) },
    { name: "calendar due soon, hours current: due soon", input: ready({ maintenance_item: [mx("oil_change", { interval_months: 4, last_done_date: "2026-08-01", last_done_hours: 2400 })] }) },
    { name: "calendar overdue, no meter: overdue", input: { aircraft: aircraft(), maintenance_item: [mx("annual", { last_done_date: "2025-01-10" }), mx("oil_change", { interval_months: 4, last_done_date: "2026-01-01", last_done_hours: 2000 })] } },
    { name: "calendar current, hours unassessable: no record", input: ready({ hours_reading: [reading("2026-11-10", 2165.3)], maintenance_item: [mx("oil_change", { meter: "hobbs", interval_months: 4, last_done_date: "2026-11-01", last_done_hours: 2400 })] }) },
    { name: "advisory overdue is still overdue", input: ready({ maintenance_item: [mx("engine_tbo", { last_done_hours: 100, last_done_date: "1990-01-01" })] }) },
    { name: "custom item with no interval is no record", input: ready({ maintenance_item: [mx("custom", { id: "mx-n", label: "Paint touch-up" })] }) },
    {
      name: "counts over a mixed list",
      input: ready({
        maintenance_item: [
          mx("vor", { last_done_date: "2026-10-12" }), mx("transponder", { last_done_date: "2024-12-03" }),
          mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 2400.5 }), mx("elt", { last_done_date: "2026-02-10" }),
          mx("custom", { id: "mx-n", label: "Paint touch-up" }),
        ],
        squawk: [{ id: "sq-1", description: "Left nav light out", severity: "low", status: "open" }, { id: "sq-2", description: "Old", severity: "low", status: "resolved" }],
        page: [{ id: "pg-1", logbook_id: "lb-airframe", page_sequence: 1, extraction_status: "processing" }, { id: "pg-2", logbook_id: "lb-airframe", page_sequence: 2, extraction_status: "extracted" }],
        log_entry: [entry("e-1", { page_id: "pg-2", trust: "ai_read" }), entry("e-2", { page_id: "pg-2", trust: "ai_read" })],
      }),
    },
    { name: "hours 0.1 past is overdue", input: ready({ maintenance_item: [mx("custom", { id: "mx-x", label: "Vacuum pump", interval_hours: 65.2, last_done_hours: 2100, last_done_date: "2025-01-01" })] }) },
  ],

  projection: [
    { name: "trailing 90 days of tach", input: ready({ hours_reading: flying("2026-08-26", "2026-11-11", 7, 2130, 0.43), maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "trailing 90 days: medium at most", input: ready({ hours_reading: flying("2026-08-20", "2026-11-18", 10, 2120, 0.5), maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "trailing 90 days: under 21 days falls to the year", input: ready({ hours_reading: [...flying("2026-02-01", "2026-06-01", 30, 2050, 0.3), ...flying("2026-11-01", "2026-11-15", 7, 2150, 0.5)], maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "trailing 90 days of hobbs when tach is sparse", input: ready({ hours_reading: [reading("2026-03-01", 2080), ...flying("2026-09-01", "2026-11-10", 7, 2380, 0.5, "hobbs")], maintenance_item: [mx("oil_change", { last_done_hours: 2400, last_done_date: "2026-10-01" })] }) },
    { name: "trailing year when flying has stopped lately", input: ready({ hours_reading: flying("2025-12-01", "2026-07-01", 30, 2040, 0.3), maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "owner's estimate", input: ready({ aircraft: aircraft({ expected_hours_per_week: 3 }), maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "no basis: hours left cannot be dated", input: ready({ maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "a meter replacement inside the window is dropped", input: ready({
      hours_reading: [reading("2026-09-01", 2300), reading("2026-09-20", 2309), reading("2026-10-01", 0), reading("2026-10-20", 9.5), reading("2026-11-10", 19)],
      meter_reset: [{ meter: "tach", reset_date: "2026-10-01", prior_value: 2312, new_value: 0 }],
      maintenance_item: [mx("hundred_hour", { last_done_date: "2026-10-05", last_done_hours: 2.0 })],
    }, "2026-05-01") },
    { name: "both limits: calendar first", input: ready({ hours_reading: flying("2026-08-26", "2026-11-11", 7, 2130, 0.43), maintenance_item: [mx("oil_change", { meter: "tach", interval_months: 4, last_done_date: "2026-08-10", last_done_hours: 2150 })] }) },
    { name: "both limits: hours first", input: ready({ hours_reading: flying("2026-08-26", "2026-11-11", 7, 2130, 0.43), maintenance_item: [mx("oil_change", { meter: "tach", interval_months: 4, last_done_date: "2026-10-20", last_done_hours: 2130 })] }) },
    { name: "both limits, no basis, under 10 h: hours first", input: ready({ maintenance_item: [mx("oil_change", { meter: "tach", interval_months: 4, last_done_date: "2026-10-20", last_done_hours: 2120 })] }) },
    { name: "both limits, no basis, over 10 h: calendar first", input: ready({ maintenance_item: [mx("oil_change", { meter: "tach", interval_months: 4, last_done_date: "2026-10-20", last_done_hours: 2150 })] }) },
    { name: "hours reached: first date is today, no projection", input: ready({ aircraft: aircraft({ expected_hours_per_week: 3 }), maintenance_item: [mx("oil_change", { meter: "tach", interval_months: 4, last_done_date: "2026-10-20", last_done_hours: 2110 })] }) },
    { name: "projected days round up", input: ready({ aircraft: aircraft({ expected_hours_per_week: 7 }), maintenance_item: [mx("custom", { id: "mx-x", label: "Spark plugs", interval_hours: 100.5, last_done_hours: 2100, last_done_date: "2026-01-01" })] }) },
    {
      name: "unconfirmed: AI-read entries do not change the rate",
      input: ready({
        hours_reading: flying("2026-08-26", "2026-11-11", 7, 2130, 0.43),
        log_entry: [entry("e-ai1", { entry_date: "2026-11-14", tach: 2200, trust: "ai_read" }), entry("e-ai2", { entry_date: "2026-11-16", tach: 2230, trust: "ai_read" })],
        maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })],
      }),
    },
    { name: "ADS-B estimates never feed the rate", input: ready({ hours_reading: [reading("2026-11-10", 2165.3), reading("2026-10-01", 2160, null, "adsb_estimate"), reading("2026-09-01", 2150, null, "adsb_estimate")], maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
  ],

  verdict: [
    { name: "setup: no annual on record", input: { aircraft: aircraft(), maintenance_item: [mx("annual")], hours_reading: [reading("2026-11-10", 2165.3)] } },
    { name: "setup: no meter reading", input: { aircraft: aircraft(), maintenance_item: [mx("annual", { last_done_date: "2026-06-10" })] } },
    { name: "one overdue item", input: ready({ maintenance_item: [mx("transponder", { last_done_date: "2024-10-03", ifr_only: false }), mx("elt", { last_done_date: "2026-02-10" })] }) },
    { name: "one overdue item with a scope (IFR only)", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-12" })] }) },
    { name: "one overdue item by hours", input: ready({ maintenance_item: [mx("custom", { id: "mx-x", label: "Vacuum pump", interval_hours: 63, last_done_hours: 2100, last_done_date: "2025-01-01" })] }) },
    { name: "one overdue, lapsed 1 day ago", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-18", ifr_only: false })] }) },
    { name: "three overdue items", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-10-12" }), mx("transponder", { last_done_date: "2024-10-03" }), mx("elt", { last_done_date: "2025-09-03" })] }) },
    { name: "due soon by hours", input: ready({ maintenance_item: [mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 2370.5 })] }) },
    { name: "due soon by date", input: ready({ maintenance_item: [mx("transponder", { last_done_date: "2024-12-03" })] }, "2026-05-02") },
    { name: "due soon: a regulatory item leads over an advisory one", input: ready({ maintenance_item: [mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 2405 }), mx("transponder", { last_done_date: "2024-12-03" })] }, "2026-05-02") },
    { name: "all clear, but a VOR check is within 90 days", input: ready({ maintenance_item: [mx("vor", { last_done_date: "2026-11-08" })] }) },
    { name: "all clear beyond 90 days", input: ready({ maintenance_item: [mx("elt", { last_done_date: "2026-05-02" })] }, "2026-05-02") },
    { name: "all clear, next by projected hours", input: ready({ aircraft: aircraft({ expected_hours_per_week: 3 }), maintenance_item: [mx("hundred_hour", { last_done_date: "2026-11-01", last_done_hours: 2160 })] }, "2026-07-02") },
    { name: "annual month: items ride along", input: ready({ maintenance_item: [mx("transponder", { last_done_date: "2024-12-03" }), mx("pitot_static", { last_done_date: "2024-12-03" }), mx("elt", { last_done_date: "2026-04-01" })] }, "2025-12-03") },
    { name: "annual month alone", input: ready({}, "2025-12-03") },
    {
      name: "in the shop: a visit with its provider",
      input: ready({
        maintenance_item: [mx("transponder", { last_done_date: "2024-12-03" }), mx("pitot_static", { last_done_date: "2024-12-03" })],
        planned_visit: [{ id: "v-1", status: "in_shop", week_of: "2026-11-16", visit_date: "2026-11-17", provider_id: "sp-1" }],
        planned_visit_item: [{ visit_id: "v-1", item_key: "mx:mx-transponder" }, { visit_id: "v-1", item_key: "mx:mx-pitot_static" }],
        service_provider: [{ id: "sp-1", name: "AeroCheck Instruments" }],
      }),
    },
    { name: "in the shop by the owner, no visit: the plain verdict", input: ready({ aircraft: aircraft({ situation_override: "in_shop" }), maintenance_item: [mx("vor", { last_done_date: "2026-10-12" })] }) },
    {
      name: "preparing a sale: a live buyer room",
      input: ready({
        maintenance_item: [mx("transponder", { last_done_date: "2024-12-03" }), mx("elt", { last_done_date: "2026-02-10" })],
        record_room: [{ audience: "buyer", expires_at: "2027-01-15T00:00:00Z", revoked_at: null }, { audience: "buyer", expires_at: "2027-03-01T00:00:00Z", revoked_at: "2026-11-01T00:00:00Z" }],
      }),
    },
    { name: "an expired buyer room does not set the situation", input: ready({ maintenance_item: [mx("elt", { last_done_date: "2026-02-10" })], record_room: [{ audience: "buyer", expires_at: "2026-11-01T00:00:00Z", revoked_at: null }] }) },
    {
      name: "unconfirmed entries waiting: a second line, verdict unchanged",
      input: ready({
        maintenance_item: [mx("vor", { last_done_date: "2026-10-12" })],
        log_entry: Array.from({ length: 18 }, (_, i) => entry(`e-ai-${i}`, { trust: "ai_read", entry_date: "2026-11-12" })),
        item_completion: [done("c-vor", "mx-vor", "2026-10-12"), done("c-vor-ai", "mx-vor", "2026-11-12", null, "e-ai-0")],
      }),
    },
    { name: "one unconfirmed entry waiting", input: ready({ maintenance_item: [mx("elt", { last_done_date: "2026-02-10" })], log_entry: [entry("e-ai", { trust: "ai_read" })] }) },
    { name: "stale tach reading", input: ready({ hours_reading: [reading("2026-09-02", 2160.1)], maintenance_item: [mx("hundred_hour", { last_done_date: "2026-06-10", last_done_hours: 2100 })] }) },
    { name: "stale reading only matters for meters items count on", input: ready({ hours_reading: [reading("2026-09-02", 2160.1)] }) },
    { name: "a squawk marked Ground", input: ready({ squawk: [{ id: "sq-g", description: "Nose strut flat.", severity: "high", status: "open" }] }) },
    { name: "a line-ahead ring for each dated item, undated listed", input: ready({ aircraft: aircraft({ expected_hours_per_week: 3 }), maintenance_item: [mx("oil_change", { last_done_date: "2026-09-01", last_done_hours: 2370.5 }), mx("transponder", { last_done_date: "2024-12-03" }), mx("custom", { id: "mx-n", label: "Paint touch-up" }), mx("prop_overhaul", { last_done_date: "2021-05-20" })] }) },
  ],
};

export function build(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [file, list] of Object.entries(cases)) {
    const { rule, view } = views[file];
    const names = new Set<string>();
    const body = {
      rule,
      algoVersion: ALGO_VERSION,
      cases: list.map((c) => {
        if (names.has(c.name)) throw new Error(`${file}: duplicate case "${c.name}"`);
        names.add(c.name);
        const today = c.today ?? TODAY;
        return { name: c.name, today, input: c.input, expected: view(computeStatus(c.input, today)) };
      }),
    };
    out[`${file}.json`] = JSON.stringify(body, null, 2) + "\n";
  }
  return out;
}

export function stale(): string[] {
  return Object.entries(build()).filter(([file, text]) => {
    try { return readFileSync(new URL(file, FIXTURES), "utf8") !== text; } catch { return true; }
  }).map(([file]) => file);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--check")) {
    const bad = stale();
    if (bad.length) { console.error(`Stale fixtures: ${bad.join(", ")}. Run the generator.`); process.exit(1); }
  } else {
    for (const [file, text] of Object.entries(build())) writeFileSync(new URL(file, FIXTURES), text);
  }
}
