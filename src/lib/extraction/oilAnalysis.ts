// ===========================================================================
// Oil analysis report extraction.
//
// Owners mail an oil sample to a lab (Blackstone, AVLab, …) and get back a PDF
// listing wear-metal concentrations (ppm), oil properties, and the lab's
// engine-type "universal averages". We extract it with Claude rather than
// lab-specific regex parsers: the PDF text layer is positioned/scrambled (which
// is exactly what makes deterministic parsers brittle), but Claude reads the
// visual table reliably and generalizes across labs with no per-lab code.
//
// PDFs go to the model as a native `document` block (best for text-dense lab
// reports); a photographed paper report goes as an `image` block. Printed →
// EXTRACTION_MODEL (Opus), mirroring extract.ts / otherDocument.ts. Metered by
// the shared AI context/usage gate (the caller wraps this in runWithAiContext).
// ===========================================================================

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, OilAnalysisSample } from "@/lib/database.types";
import { getAnthropic, EXTRACTION_MODEL } from "./anthropic";
import type { ImageMediaType } from "./extract";

// The standard spectrometric element set (Blackstone + AVLab report the same
// panel). Stored lowercase in elements_ppm / universal_averages.
export const OIL_ELEMENTS = [
  "aluminum", "chromium", "iron", "copper", "lead", "tin", "molybdenum",
  "nickel", "manganese", "silver", "titanium", "potassium", "boron", "silicon",
  "sodium", "calcium", "magnesium", "phosphorus", "zinc", "barium",
] as const;

// Oil physical properties. Values are best-effort numeric (a reported "<0.5"
// becomes 0.5, ">440" becomes 440 — see the prompt); null when not reported.
export const OIL_PROPERTIES = [
  "viscosity_cst_100c", "viscosity_sus_210f", "flashpoint_f", "fuel_pct",
  "antifreeze_pct", "water_pct", "insolubles_pct", "tbn", "tan",
] as const;

export type OilSample = {
  sample_date: string | null;
  oil_hours: number | null;
  engine_hours: number | null;
  oil_added_quarts: number | null;
  sample_number: string | null;
  elements_ppm: Record<string, number>;
  oil_properties: Record<string, number>;
};

export type OilReportPayload = {
  lab: string | null;
  lab_number: string | null;
  tail_number: string | null;
  oil_type: string | null;
  report_date: string | null;
  lab_comments: string | null;
  universal_averages: Record<string, number>;
  confidence: number;
  raw_text: string;
  samples: OilSample[];
};

// --- Schema (structured outputs) -------------------------------------------
// No `enum` anywhere (nullable-field enum → 400, see equipment.ts). Element and
// property maps are ARRAYS of {name, value} pairs, NOT fixed-key nullable
// objects: structured outputs caps union-typed params at 16, and 20 elements ×
// (sample + universal) nullable keys blows past it. Arrays of non-nullable
// objects cost zero unions and stay lab-agnostic (only reported keys appear).

const elemArray = (desc: string) => ({
  type: "array" as const,
  description: desc,
  items: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      element: { type: "string", description: "lowercase element name, e.g. \"iron\", \"lead\"" },
      ppm: { type: "number", description: "concentration in ppm (integer)" },
    },
    required: ["element", "ppm"],
  },
});

const PROPERTY_ARRAY = {
  type: "array" as const,
  description: "Only properties actually reported (skip blank / \"-\").",
  items: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      property: { type: "string", description: `One of: ${OIL_PROPERTIES.join(", ")}.` },
      value: { type: "number", description: "Numeric value; strip any <, >, ~ (so \"<0.5\" → 0.5, \">440\" → 440)." },
    },
    required: ["property", "value"],
  },
};

const SAMPLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sample_date: { type: ["string", "null"], description: "Date this sample was drawn, YYYY-MM-DD (the 'Sample Date' row for this column)." },
    oil_hours: { type: ["number", "null"], description: "Hours on THIS oil since the last change ('Hrs/MI on Oil', or the Oil Use Interval)." },
    engine_hours: { type: ["number", "null"], description: "Total time on the engine/unit at sampling ('Hrs/MI on Unit')." },
    oil_added_quarts: { type: ["number", "null"], description: "Make-up oil added, in quarts (e.g. '3 qts' → 3)." },
    sample_number: { type: ["string", "null"], description: "The lab number for THIS sample if shown per-column, else null." },
    elements_ppm: elemArray("Wear-metal / additive concentrations for this sample."),
    oil_properties: PROPERTY_ARRAY,
  },
  required: ["sample_date", "oil_hours", "engine_hours", "oil_added_quarts", "sample_number", "elements_ppm", "oil_properties"],
} as const;

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    lab: { type: ["string", "null"], description: "Lab name, e.g. \"Blackstone\" or \"AVLab\"." },
    lab_number: { type: ["string", "null"], description: "The report's LAB NUMBER (e.g. \"S378155\")." },
    tail_number: { type: ["string", "null"], description: "Aircraft tail from the UNIT ID field ONLY — never from the comments prose, which may name a different aircraft." },
    oil_type: { type: ["string", "null"], description: "Oil type & grade, e.g. \"Phillips XC (A/C) 20W/50\"." },
    report_date: { type: ["string", "null"], description: "The REPORT DATE (lab's analysis date), YYYY-MM-DD." },
    lab_comments: { type: ["string", "null"], description: "The full text of the lab's COMMENTS / assessment block." },
    universal_averages: elemArray("The engine-type UNIVERSAL AVERAGES column, per element (NOT a sample)."),
    confidence: { type: "number", description: "0 to 1 confidence in the extraction." },
    raw_text: { type: "string", description: "Full plain-text transcription of the report." },
    samples: { type: "array", items: SAMPLE_SCHEMA, description: "One object per dated SAMPLE column. EXCLUDE the 'Universal Averages' and 'Unit/Location Averages' columns — those are not samples." },
  },
  required: ["lab", "lab_number", "tail_number", "oil_type", "report_date", "lab_comments", "universal_averages", "confidence", "raw_text", "samples"],
} as const;

const SYSTEM_PROMPT = `You read a single OIL ANALYSIS lab report (Blackstone Laboratories, Aviation Laboratories/AVLab, or similar) for a piston aircraft engine and extract its structured data.

Layout: a header (lab number, UNIT ID = tail number, report date, oil type), a comments/assessment block, a table of ELEMENTS IN PARTS PER MILLION (one row per element), and an oil PROPERTIES block. Element/property values are laid out in COLUMNS: one column per sample (dated), plus separate "Unit/Location Averages" and "Universal Averages" columns.

Rules:
- One entry in \`samples\` per DATED SAMPLE column. Do NOT treat the "Universal Averages" or "Unit/Location Averages" columns as samples — put the universal averages in the top-level \`universal_averages\` field.
- Reports may contain several historical samples (columns). Extract every sample column.
- \`tail_number\` comes ONLY from the UNIT ID header field. The comments may mention a different tail (a lab template quirk) — ignore that.
- Transcribe only what is printed. Use null when a value is blank, "-", or illegible. Element ppm are integers.
- For properties, strip comparison qualifiers: "<0.5" → 0.5, ">440" → 440, "0.0" → 0. Null for blanks/"-".
- Dates as YYYY-MM-DD. Always fill raw_text with the full transcription.`;

/** Extract an oil analysis report. `data` is base64; PDF → document block, image → image block. */
export async function extractOilAnalysis(
  data: string,
  mediaType: "application/pdf" | ImageMediaType,
): Promise<OilReportPayload> {
  const client = getAnthropic();

  const sourceBlock =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: REPORT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          sourceBlock,
          { type: "text", text: "Extract this oil analysis report following the schema." },
        ] as unknown as Anthropic.ContentBlockParam[],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Oil report read was declined by the safety system for this file.");
  }
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: Partial<OilReportPayload>;
  try {
    parsed = JSON.parse(text) as Partial<OilReportPayload>;
  } catch {
    throw new Error("Oil report read returned malformed JSON despite the schema constraint.");
  }
  return normalize(parsed);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The model returns arrays of {element/property, value} pairs; fold to a map,
// dropping malformed/duplicate entries (last wins). Keys are lowercased.
const pairsToMap = (arr: unknown, keyField: string, valField: string): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!Array.isArray(arr)) return out;
  for (const item of arr) {
    const o = (item ?? {}) as Record<string, unknown>;
    const k = str(o[keyField]);
    const v = num(o[valField]);
    if (k && v != null) out[k.toLowerCase()] = v;
  }
  return out;
};

function normalize(p: Partial<OilReportPayload>): OilReportPayload {
  const samples = Array.isArray(p.samples) ? p.samples : [];
  return {
    lab: str(p.lab),
    lab_number: str(p.lab_number),
    tail_number: str(p.tail_number),
    oil_type: str(p.oil_type),
    report_date: str(p.report_date),
    lab_comments: str(p.lab_comments),
    universal_averages: pairsToMap(p.universal_averages, "element", "ppm"),
    confidence: num(p.confidence) ?? 0,
    raw_text: typeof p.raw_text === "string" ? p.raw_text : "",
    samples: samples.map((s) => ({
      sample_date: str(s?.sample_date),
      oil_hours: num(s?.oil_hours),
      engine_hours: num(s?.engine_hours),
      oil_added_quarts: num(s?.oil_added_quarts),
      sample_number: str(s?.sample_number),
      elements_ppm: pairsToMap(s?.elements_ppm, "element", "ppm"),
      oil_properties: pairsToMap(s?.oil_properties, "property", "value"),
    })),
  };
}

/**
 * Map an extracted report to oil_analysis_sample insert rows (one per sample).
 * Report-level fields (lab, universal averages, comments) are denormalized onto
 * each row so a single sample is self-contained for the trend view.
 */
export function oilReportToRows(
  payload: OilReportPayload,
  aircraftId: string,
  sourcePageId: string | null = null,
): Partial<OilAnalysisSample>[] {
  const universal = Object.keys(payload.universal_averages).length ? payload.universal_averages : null;
  return payload.samples
    .filter((s) => s.sample_date) // a sample without a date can't be placed on a trend
    .map((s) => ({
      aircraft_id: aircraftId,
      sample_date: s.sample_date!,
      analysis_date: payload.report_date,
      lab: payload.lab,
      lab_number: payload.lab_number,
      sample_number: s.sample_number ?? payload.lab_number,
      oil_type: payload.oil_type,
      oil_hours: s.oil_hours,
      engine_hours: s.engine_hours,
      oil_added_quarts: s.oil_added_quarts,
      elements_ppm: s.elements_ppm,
      oil_properties: Object.keys(s.oil_properties).length ? s.oil_properties : null,
      universal_averages: universal,
      lab_comments: payload.lab_comments,
      source_page_id: sourcePageId,
    }));
}
