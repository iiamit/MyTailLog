import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  moneyMinor,
  expenseInput,
  expenseTotals,
  parseCsv,
  expensesCsv,
  isDate,
} from "../src/lib/owner/validation";
import { observationInput } from "../src/lib/owner/observations";
import { buildEngineHistory } from "../src/lib/owner/engineHistory";
import type { Expense, EngineEvent } from "../src/lib/owner/contracts";
import type { Component } from "../src/lib/database.types";
import type { TrendEntry } from "../src/lib/engineTrends";
import { v2Rewrite, sectionFor } from "../src/lib/uiV2";
const id = "10000000-0000-4000-a000-000000000001";
const input = {
  id,
  date: "2026-03-01",
  currency: "USD",
  amount_minor: 12550,
  category: "maintenance",
  cost_type: "variable",
  basis: "actual",
};
test("money uses exact currency minor units and rejects excess precision, unsafe amounts, unknown currencies", () => {
  assert.equal(moneyMinor("125.50", "USD"), 12550);
  assert.equal(moneyMinor("-12.34", "USD"), -1234);
  assert.equal(moneyMinor("125", "JPY"), 125);
  assert.equal(moneyMinor("1.250", "KWD"), 1250);
  for (const [amount, currency] of [
    ["1.001", "USD"],
    ["1.1", "JPY"],
    ["1", "XXX"],
    ["9000000000001", "JPY"],
    ["0", "USD"],
  ])
    assert.throws(() => moneyMinor(amount, currency));
});
test("expense trust-boundary validation and date validity", () => {
  assert.equal(expenseInput(input).amount_minor, 12550);
  for (const bad of [
    { ...input, amount_minor: 1.5 },
    { ...input, date: "2026-02-30" },
    { ...input, date: "2026-99-01" },
    { ...input, document_id: "../../other" },
    { ...input, currency: "USX" },
    { ...input, basis: "estimate" },
  ])
    assert.throws(() => expenseInput(bad));
  assert.equal(isDate("2026-99-99"), false);
});
test("totals never mix actuals, reserves or currencies", () => {
  assert.deepEqual(
    expenseTotals([
      { currency: "USD", amount_minor: 100, basis: "actual" },
      { currency: "USD", amount_minor: -30, basis: "actual" },
      { currency: "USD", amount_minor: 80, basis: "reserve" },
      { currency: "JPY", amount_minor: 1000, basis: "actual" },
    ]),
    [
      { currency: "JPY", actual_minor: 1000, reserve_minor: 0 },
      { currency: "USD", actual_minor: 70, reserve_minor: 80 },
    ],
  );
});
test("CSV round trips embedded commas, quotes and newlines and neutralizes spreadsheet formulas", () => {
  const row = {
    ...expenseInput(input),
    aircraft_id: id,
    created_at: "",
    updated_at: "",
    inbox_id: null,
    vendor: 'Shop, "West"',
    notes: "Line one\nLine two",
  } as Expense;
  const parsed = parseCsv(expensesCsv([row]));
  assert.equal(parsed[0].vendor, row.vendor);
  assert.equal(parsed[0].notes, row.notes);
  assert.equal(parsed[0].amount_minor, "12550");
  assert.ok(
    expensesCsv([{ ...row, vendor: "=HYPERLINK(1)" }]).includes("'=HYPERLINK"),
  );
  assert.throws(() =>
    parseCsv('date,currency,amount_minor,category,cost_type,basis\n"unclosed'),
  );
  assert.throws(() => parseCsv("date,date\n1,2"));
});
test("observations preserve mixed reference pressures and reject duplicate cylinders and foreign identifiers", () => {
  const row = observationInput({
    id,
    component_id: id,
    event_date: "2026-01-01",
    kind: "compression",
    readings: [
      { cylinder: 1, psi: 76, reference: 80 },
      { cylinder: 2, psi: 69, reference: 70 },
    ],
  });
  assert.equal(row.readings[1].reference, 70);
  assert.throws(() =>
    observationInput({ ...row, readings: [row.readings[0], row.readings[0]] }),
  );
  assert.throws(() => observationInput({ ...row, source_entry_id: "foreign" }));
  assert.throws(() =>
    observationInput({
      ...row,
      readings: [{ cylinder: 1, psi: 81, reference: 80 }],
    }),
  );
});
const engine = (
  engineId: string,
  start: string | null,
  end: string | null = null,
) =>
  ({
    id: engineId,
    aircraft_id: id,
    name: "Engine",
    category: "engine",
    position: "Left",
    install_date: start,
    removal_date: end,
    is_installed: !end,
  }) as Component;
const entry = (
  key: string,
  date: string,
  hobbs: number,
  text = "Changed oil and filter",
): TrendEntry => ({
  id: key,
  page_id: key,
  entry_date: date,
  hobbs,
  tach: null,
  description: text,
  parts: null,
  work_performed: null,
  owner_confirmed: true,
});
const event = (kind: EngineEvent["kind"], date: string, componentId = id) => ({
  ...observationInput({
    id: "20000000-0000-4000-a000-000000000001",
    component_id: componentId,
    event_date: date,
    kind,
    readings:
      kind === "compression" ? [{ cylinder: 1, psi: 75, reference: 80 }] : [],
  }),
  aircraft_id: id,
  created_at: "",
  updated_at: "",
});
test("engine intervals split at overhaul, replacement and meter reset without bridging readings", () => {
  const entries = [
    entry("1", "2026-01-01", 100),
    entry("2", "2026-02-01", 150),
    entry("3", "2026-04-01", 200),
    entry("4", "2026-05-01", 220),
  ];
  const history = buildEngineHistory(
    [engine(id, "2025-01-01")],
    [event("overhaul", "2026-03-01")],
    entries,
    [],
    [],
    [{ meter: "hobbs", reset_date: "2026-04-15" }],
  );
  assert.equal(history.groups.length, 3);
  assert.deepEqual(
    history.groups.flatMap((g) => g.oilIntervals.map((i) => i.hours)),
    [50],
  );
  assert.equal(history.unassigned.oilChanges.length, 0);
});
test("twins and undated installation histories remain unassigned rather than joining the wrong engine", () => {
  const entries = [entry("1", "2026-01-01", 100, "Compressions 76/80 75/80")];
  const twins = buildEngineHistory(
    [engine(id, "2025-01-01"), engine("right", "2025-01-01")],
    [],
    entries,
    [],
    [],
    [],
  );
  assert.equal(twins.unassigned.compression.length, 1);
  assert.equal(twins.groups.flatMap((g) => g.compression).length, 0);
  const unknown = buildEngineHistory(
    [engine(id, null)],
    [],
    entries,
    [],
    [],
    [],
  );
  assert.equal(unknown.unassigned.compression.length, 1);
});
test("explicit structured observation replaces parsed source without inventing a source link", () => {
  const observation = {
    ...event("compression", "2026-01-01"),
    source_entry_id: "entry",
    meter_basis: "tach" as const,
    meter_reading: 4000,
  };
  const h = buildEngineHistory(
    [engine(id, "2025-01-01")],
    [observation],
    [entry("entry", "2026-01-01", 100, "Compressions 76/80 75/80")],
    [],
    [],
    [],
  );
  assert.equal(h.groups[0].compression.length, 1);
  assert.equal(h.groups[0].compression[0].entryId, "entry");
  assert.equal(h.groups[0].compression[0].meterReading, 4000);
});
test("new workspace routes reach v2 and retain binder sections", () => {
  for (const route of [
    "inbox",
    "costs",
    "engine-history",
    "maintenance/annual/packet",
  ])
    assert.equal(
      v2Rewrite(`/aircraft/${id}/${route}`),
      `/v2/aircraft/${id}/${route}`,
    );
  assert.equal(sectionFor("inbox"), "docs");
  assert.equal(sectionFor("costs"), "aircraft");
});

import { periodUsage } from "../src/lib/owner/usage";
import type { HoursReading, MeterResetRow } from "../src/lib/database.types";
test("cost denominator uses verified readings and refuses resets, insufficient coverage and backwards meters", () => {
  const rows = [
    {
      id: "a",
      reading_date: "2026-01-01",
      hobbs: 100,
      tach: null,
      hours_reviewed_at: "2026-01-01",
      created_at: "2026-01-01",
    },
    {
      id: "b",
      reading_date: "2026-02-01",
      hobbs: 125,
      tach: null,
      hours_reviewed_at: "2026-02-01",
      created_at: "2026-02-01",
    },
  ] as HoursReading[];
  assert.equal(periodUsage(rows, [], "2026-01-01", "2026-02-01").hours, 25);
  assert.equal(periodUsage(rows, [], "2026-01-02", "2026-02-01").hours, null);
  assert.equal(
    periodUsage(
      rows.map((r) => ({ ...r, hours_reviewed_at: null })),
      [],
      "2026-01-01",
      "2026-02-01",
    ).hours,
    null,
  );
  assert.equal(
    periodUsage(
      rows,
      [{ meter: "hobbs", reset_date: "2026-01-15" } as MeterResetRow],
      "2026-01-01",
      "2026-02-01",
    ).hours,
    null,
  );
  assert.equal(
    periodUsage(
      [rows[0], { ...rows[1], hobbs: 90 }],
      [],
      "2026-01-01",
      "2026-02-01",
    ).hours,
    null,
  );
});

test("cost denominator excludes reviewed ADS-B estimates", () => {
  const rows = [
    {
      id: "a",
      source: "adsb_estimate",
      reading_date: "2026-01-01",
      hobbs: 100,
      hours_reviewed_at: "x",
      created_at: "2026-01-01",
    },
    {
      id: "b",
      source: "adsb_estimate",
      reading_date: "2026-02-01",
      hobbs: 125,
      hours_reviewed_at: "x",
      created_at: "2026-02-01",
    },
  ] as HoursReading[];
  assert.equal(periodUsage(rows, [], "2026-01-01", "2026-02-01").hours, null);
});

test("legacy oil rows attach only to one documented engine installation", () => {
  const sample = {
    id: "s",
    component_id: null,
    sample_date: "2026-01-01",
  } as import("../src/lib/database.types").OilAnalysisSample;
  const addition = {
    id: "a",
    component_id: null,
    added_date: "2026-01-01",
  } as import("../src/lib/database.types").OilAddition;
  const one = buildEngineHistory(
    [engine(id, "2025-01-01")],
    [],
    [],
    [sample],
    [addition],
    [],
  );
  assert.equal(one.groups[0].samples.length, 1);
  assert.equal(one.groups[0].additions.length, 1);
  const twins = buildEngineHistory(
    [engine(id, "2025-01-01"), engine("right", "2025-01-01")],
    [],
    [],
    [sample],
    [addition],
    [],
  );
  assert.equal(twins.unassigned.samples.length, 1);
  assert.equal(twins.unassigned.additions.length, 1);
});

test("interleaved twin oil services form intervals within their own engine", () => {
  const right = "20000000-0000-4000-a000-000000000002";
  const rows = [
    entry("a1", "2026-01-01", 100),
    entry("b1", "2026-02-01", 125),
    entry("a2", "2026-03-01", 150),
    entry("b2", "2026-04-01", 180),
  ];
  const events = rows.map((r, i) => ({
    ...event("compression", r.entry_date!, i % 2 === 0 ? id : right),
    id: `event-${i}`,
    source_entry_id: r.id,
  }));
  const h = buildEngineHistory(
    [engine(id, "2025-01-01"), engine(right, "2025-01-01")],
    events,
    rows,
    [],
    [],
    [],
  );
  assert.deepEqual(
    h.groups
      .find((g) => g.componentId === id)
      ?.oilIntervals.map((x) => x.hours),
    [50],
  );
  assert.deepEqual(
    h.groups
      .find((g) => g.componentId === right)
      ?.oilIntervals.map((x) => x.hours),
    [55],
  );
});

import { engineConsumption } from "../src/lib/owner/consumption";
import type { OilAddition } from "../src/lib/database.types";
test("engine consumption uses weighted oil volume and complete dated meter coverage", () => {
  const row = (
    date: string,
    tach: number | null,
    quarts: number,
    hobbs: number | null = null,
  ) => ({ added_date: date, tach, hobbs, quarts }) as OilAddition;
  const rows = [
    row("2026-01-01", 100, 1),
    row("2026-02-01", 110, 1),
    row("2026-03-01", 130, 4),
  ];
  assert.equal(engineConsumption(rows)?.hoursPerQuart, 6);
  assert.equal(engineConsumption([...rows].reverse())?.hoursPerQuart, 6);
  assert.equal(engineConsumption([rows[0], row("2026-02-01", null, 1)]), null);
  assert.equal(engineConsumption([rows[0], row("2026-02-01", 90, 1)]), null);
  assert.equal(engineConsumption([rows[0], row("2026-01-01", 110, 1)]), null);
  assert.equal(
    engineConsumption([
      row("2026-01-01", null, 1, 100),
      row("2026-02-01", null, 2, 110),
    ])?.meter,
    "hobbs",
  );
});

import { ownerJson } from "../src/lib/owner/body";
test("owner requests bound actual streamed bytes even with a missing or misleading Content-Length", async () => {
  const req = new Request("https://example.test/inbox", {
    method: "POST",
    body: '{"name":"too long"}',
    headers: { "content-length": "1" },
  });
  await assert.rejects(ownerJson(req, 8), RangeError);
  await assert.rejects(
    ownerJson(
      new Request("https://example.test/inbox", { method: "POST", body: "[]" }),
    ),
    /record details/,
  );
  assert.deepEqual(
    await ownerJson(
      new Request("https://example.test/inbox", {
        method: "POST",
        body: '{"ok":true}',
      }),
    ),
    { ok: true },
  );
});

test("expense CSV rejects malformed quotes instead of changing a numeric amount", () => {
  const header = "date,currency,amount_minor,category,cost_type,basis\n";
  assert.throws(() =>
    parseCsv(header + '2026-01-01,USD,12"3,fuel,variable,actual'),
  );
  assert.throws(() =>
    parseCsv(header + '2026-01-01,USD,"123"4,fuel,variable,actual'),
  );
});

test("downloadable expense template has no sample records and accepts a completed row", () => {
  const template = readFileSync(new URL("../public/templates/expenses.csv", import.meta.url), "utf8");
  assert.deepEqual(parseCsv(template), []);
  const [row] = parseCsv(template + "2026-11-25,USD,18575,fuel,variable,actual,Airport FBO,Owner,Fuel purchase\r\n");
  const expense = expenseInput({ ...row, id, amount_minor: Number(row.amount_minor) });
  assert.equal(expense.amount_minor, 18575);
  assert.equal(expense.category, "fuel");
  assert.equal(expense.cost_type, "variable");
  assert.equal(expense.basis, "actual");
});

test("cost interval uses actual in-period dates and the widest verified meter coverage", () => {
  const readings = [
    { id: "tach-start", reading_date: "2026-01-13", tach: 4100, hobbs: null, source: "manual", hours_reviewed_at: null, created_at: "2026-01-13" },
    { id: "tach-end", reading_date: "2026-12-08", tach: 4200, hobbs: null, source: "manual", hours_reviewed_at: null, created_at: "2026-12-08" },
    { id: "hobbs-start", reading_date: "2026-03-01", hobbs: 100, tach: null, source: "manual", created_at: "2026-03-01" },
    { id: "hobbs-end", reading_date: "2026-11-01", hobbs: 110, tach: null, source: "manual", created_at: "2026-11-01" },
  ] as HoursReading[];
  const result = periodUsage(readings, [], "2026-01-01", "2026-12-31");
  assert.equal(result.hours, 100);
  assert.equal(result.meter, "tach");
  assert.equal(result.from, "2026-01-13");
  assert.equal(result.to, "2026-12-08");
  assert.deepEqual(result.readingIds, ["tach-start", "tach-end"]);
  assert.equal(periodUsage(readings.slice(0, 2), [{ meter: "tach", reset_date: "2026-01-05" } as MeterResetRow], "2026-01-01", "2026-12-31").hours, 100);
  assert.equal(periodUsage(readings.slice(0, 2), [{ meter: "tach", reset_date: "2026-06-01" } as MeterResetRow], "2026-01-01", "2026-12-31").hours, null);
  assert.equal(periodUsage(readings.map(r => ({ ...r, reading_date: "2026-01-13" })), [], "2026-01-01", "2026-12-31").hours, null);
});

test("confirmed logbook readings count but superseded and unconfirmed entries do not", () => {
  const entries = [
    { id: "a", entry_date: "2026-01-13", tach: 4100, hobbs: null, owner_confirmed: true, authored_superseded_by: null, created_at: "2026-01-13" },
    { id: "b", entry_date: "2026-12-08", tach: 4200, hobbs: null, owner_confirmed: true, authored_superseded_by: null, created_at: "2026-12-08" },
    { id: "c", entry_date: "2026-07-01", tach: 100, hobbs: null, owner_confirmed: false, authored_superseded_by: null, created_at: "2026-07-01" },
    { id: "d", entry_date: "2026-07-02", tach: 100, hobbs: null, owner_confirmed: true, authored_superseded_by: "a", created_at: "2026-07-02" },
  ];
  assert.equal(periodUsage([], [], "2026-01-01", "2026-12-31", entries).hours, 100);
  assert.equal(periodUsage([], [], "2026-01-01", "2026-12-31", entries.slice(1)).hours, null);
});
