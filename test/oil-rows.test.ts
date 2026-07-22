import { test } from "node:test";
import assert from "node:assert/strict";
import { oilReportToRows, type OilReportPayload } from "../src/lib/extraction/oilAnalysis";

// A realistic (post-normalize) payload: maps already folded, two dated samples
// plus one undated sample and one with a garbage date.
const payload = (): OilReportPayload => ({
  lab: "Blackstone",
  lab_number: "S378155",
  tail_number: "N9363V",
  oil_type: "Phillips XC 20W/50",
  report_date: "2026-07-01",
  lab_comments: "All wear metals within universal limits.",
  universal_averages: { iron: 30, aluminum: 5 },
  confidence: 0.92,
  raw_text: "…full transcription…",
  samples: [
    {
      sample_date: "2026-06-01",
      oil_hours: 25,
      engine_hours: 4141,
      oil_added_quarts: 2,
      sample_number: "A1",
      elements_ppm: { iron: 22, lead: 1200 },
      oil_properties: { viscosity: 20 },
    },
    {
      sample_date: "2026-03-01",
      oil_hours: 30,
      engine_hours: 4090,
      oil_added_quarts: null,
      sample_number: null, // falls back to lab_number
      elements_ppm: { iron: 18 },
      oil_properties: {}, // empty → null on the row
    },
    {
      sample_date: null, // undated → dropped
      oil_hours: 10,
      engine_hours: 4050,
      oil_added_quarts: null,
      sample_number: "X",
      elements_ppm: { iron: 5 },
      oil_properties: {},
    },
    {
      sample_date: "not-a-date", // unparseable → dropped
      oil_hours: 12,
      engine_hours: 4060,
      oil_added_quarts: null,
      sample_number: "Y",
      elements_ppm: { iron: 6 },
      oil_properties: {},
    },
  ],
});

test("oilReportToRows: one row per DATED sample; undated and unparseable dropped", () => {
  const rows = oilReportToRows(payload(), "AC-123");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.sample_date), ["2026-06-01", "2026-03-01"]);
});

test("oilReportToRows: aircraft_id is forced to the passed id, not the report's tail", () => {
  const rows = oilReportToRows(payload(), "AC-123");
  assert.ok(rows.every((r) => r.aircraft_id === "AC-123"));
});

test("oilReportToRows: sample_number falls back to the report lab_number when absent", () => {
  const rows = oilReportToRows(payload(), "AC-123");
  assert.equal(rows[0].sample_number, "A1"); // per-sample number kept
  assert.equal(rows[1].sample_number, "S378155"); // null → lab_number
});

test("oilReportToRows: element/property maps map through; empty oil_properties → null", () => {
  const rows = oilReportToRows(payload(), "AC-123");
  assert.deepEqual(rows[0].elements_ppm, { iron: 22, lead: 1200 });
  assert.deepEqual(rows[0].oil_properties, { viscosity: 20 });
  assert.equal(rows[1].oil_properties, null); // empty map → null
});

test("oilReportToRows: report-level fields are denormalized onto every row", () => {
  const rows = oilReportToRows(payload(), "AC-123");
  for (const r of rows) {
    assert.equal(r.lab, "Blackstone");
    assert.equal(r.lab_number, "S378155");
    assert.equal(r.oil_type, "Phillips XC 20W/50");
    assert.equal(r.lab_comments, "All wear metals within universal limits.");
    assert.equal(r.analysis_date, "2026-07-01"); // report_date, safe-ISO coerced
    assert.deepEqual(r.universal_averages, { iron: 30, aluminum: 5 });
  }
});

test("oilReportToRows: full row shape for the first sample", () => {
  const [r] = oilReportToRows(payload(), "AC-123", "page-7");
  assert.deepEqual(r, {
    aircraft_id: "AC-123",
    sample_date: "2026-06-01",
    analysis_date: "2026-07-01",
    lab: "Blackstone",
    lab_number: "S378155",
    sample_number: "A1",
    oil_type: "Phillips XC 20W/50",
    oil_hours: 25,
    engine_hours: 4141,
    oil_added_quarts: 2,
    elements_ppm: { iron: 22, lead: 1200 },
    oil_properties: { viscosity: 20 },
    universal_averages: { iron: 30, aluminum: 5 },
    lab_comments: "All wear metals within universal limits.",
    source_page_id: "page-7", // passed through
  });
});

test("oilReportToRows: source_page_id defaults to null; empty universal_averages → null", () => {
  const p = payload();
  p.universal_averages = {};
  const rows = oilReportToRows(p, "AC-123");
  assert.ok(rows.every((r) => r.source_page_id === null));
  assert.ok(rows.every((r) => r.universal_averages === null));
});
