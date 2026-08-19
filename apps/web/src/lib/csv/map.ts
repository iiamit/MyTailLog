// ===========================================================================
// CSV import: map the HEADER, not the rows.
//
// One bounded AI call sees the header plus ~5 sample rows and proposes a
// column → field mapping. The user confirms or corrects it ONCE, and then the
// mapping is applied to every row deterministically, in plain code, below.
//
// Feeding all rows to the model would cost tokens proportional to file size, be
// nondeterministic per row, and turn a 400-row file into 400 chances to
// hallucinate a tach reading. A CSV is not a scan: the cell values are exact.
// The only real judgement is what a column MEANS — so that is the only thing the
// model is asked, and nothing here carries a per-cell confidence score.
// ===========================================================================

import { generateAi } from "@/lib/extraction/ai";
import { stripFormulaGuard, type ParsedCsv } from "./parse";
import { detectDateFormat, parseDate, type DateFormat } from "./dates";
import { IMPORT_FIELDS, FIELD_LABEL, type ImportField } from "./fields";

export { IMPORT_FIELDS, FIELD_LABEL, type ImportField };

const NUMERIC_FIELDS = new Set<ImportField>(["hobbs", "tach", "airframe"]);
const LIST_FIELDS = new Set<ImportField>(["ad_refs", "sb_refs"]);

/** One proposed column assignment. `confidence` is the model's, 0..1. */
export type ColumnProposal = { index: number; field: ImportField; confidence: number };

/** The confirmed mapping: one field per column, positionally. */
export type Mapping = ImportField[];

// --- The AI call -----------------------------------------------------------

const MAPPING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    columns: {
      type: "array",
      description: "One entry per column of the header, in order, including the ones you ignore.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer", description: "0-based position of this column in the header." },
          field: {
            type: "string",
            description: `Exactly one of: ${IMPORT_FIELDS.join(", ")}. Use "ignore" for anything that doesn't map.`,
          },
          confidence: { type: "number", description: "0 to 1 confidence that this column means that field." },
        },
        required: ["index", "field", "confidence"],
      },
    },
  },
  required: ["columns"],
};

const SYSTEM_PROMPT = `You map the COLUMNS of an aircraft maintenance spreadsheet onto a fixed set of maintenance-log fields. You are shown the header row and a few sample rows; you never transform the data itself.

Target fields:
- entry_date — the date the work was done / the entry was made.
- description — the narrative of the work or event.
- work_performed — the specific work, when the file keeps it separate from the description.
- parts — parts installed or removed.
- hobbs — Hobbs meter reading.
- tach — tach time reading.
- airframe — total airframe time / total time in service.
- signature_name — the person or shop who signed the entry (A&P, IA, mechanic, technician).
- mechanic_cert_number — their certificate number.
- ad_refs — Airworthiness Directive numbers.
- sb_refs — Service Bulletin numbers.
- ignore — anything else: invoice numbers, prices, internal ids, member names, squawk status, empty columns.

Rules:
- Return exactly one entry per column of the header, in order, covering every index — use "ignore" rather than omitting a column.
- Map each field at most once. If two columns could both be the description, take the fuller one and ignore the other.
- Judge from the header name AND the sample values: a column headed "TT" holding 1204.6 is airframe time; one headed "TT" holding names is not.
- Be honest with confidence. A column you are guessing at scores low so the owner checks it; a wrong mapping silently corrupts maintenance history.
- Never invent a field that isn't in the list, and never map a column just because a field is unfilled.`;

/**
 * Ask the model what each column means. ONE call, regardless of file size: it
 * sees the header and up to `sampleCount` rows and nothing else. Callers wrap
 * this in the shared AI context/usage gate.
 */
export async function proposeMapping(parsed: ParsedCsv, sampleCount = 5): Promise<ColumnProposal[]> {
  // Keep the sample SMALL — this call is about what a column means, and five
  // rows settles that. Tokens scale with it, so it does not grow with the file.
  const samples = parsed.rows.slice(0, sampleCount);
  const preview = [
    `Header: ${JSON.stringify(parsed.header)}`,
    ...samples.map((r, i) => `Row ${i + 1}: ${JSON.stringify(r.slice(0, parsed.header.length))}`),
  ].join("\n");

  const response = await generateAi({
    modelKind: "text",
    maxOutputTokens: 2000,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: MAPPING_SCHEMA,
    content: [{ type: "text", text: `${preview}\n\nMap every column to a field following the schema.` }],
  });

  if (response.stopReason === "refusal") {
    throw new Error("Column mapping was declined by the safety system for this file.");
  }
  const text = response.text;

  let parsedOut: { columns?: unknown };
  try {
    parsedOut = JSON.parse(text) as { columns?: unknown };
  } catch {
    throw new Error("Column mapping returned malformed JSON despite the schema constraint.");
  }
  return normalizeProposals(parsedOut.columns, parsed.header.length);
}

/**
 * Fold whatever the model returned into exactly one proposal per column.
 * Unknown field names become "ignore", out-of-range indexes are dropped, and a
 * field claimed by two columns is kept only on the first (the mapping is
 * applied positionally, so a duplicate would silently overwrite).
 */
export function normalizeProposals(raw: unknown, columnCount: number): ColumnProposal[] {
  const valid = new Set<string>(IMPORT_FIELDS);
  const out: ColumnProposal[] = Array.from({ length: columnCount }, (_, index) => ({
    index,
    field: "ignore" as ImportField,
    confidence: 0,
  }));
  const claimed = new Set<ImportField>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const o = (item ?? {}) as Record<string, unknown>;
    const index = Number(o.index);
    if (!Number.isInteger(index) || index < 0 || index >= columnCount) continue;
    const field = (valid.has(String(o.field)) ? String(o.field) : "ignore") as ImportField;
    if (field !== "ignore" && claimed.has(field)) continue;
    if (field !== "ignore") claimed.add(field);
    const c = Number(o.confidence);
    out[index] = { index, field, confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0 };
  }
  return out;
}

/** Coerce a user-supplied mapping (JSON from the browser) into a safe Mapping. */
export function sanitizeMapping(raw: unknown, columnCount: number): Mapping {
  const valid = new Set<string>(IMPORT_FIELDS);
  const arr = Array.isArray(raw) ? raw : [];
  const claimed = new Set<string>();
  return Array.from({ length: columnCount }, (_, i) => {
    const f = String(arr[i] ?? "ignore");
    if (!valid.has(f) || f === "ignore" || claimed.has(f)) return "ignore" as ImportField;
    claimed.add(f);
    return f as ImportField;
  });
}

// --- Deterministic row transform -------------------------------------------

export type EntryDraft = {
  entry_date: string | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
};

export type RowError = { row: number; message: string };

export type CoercionResult = {
  entries: EntryDraft[];
  errors: RowError[];
};

const MAX_TEXT = 10_000;
// An airframe with 100,000 hours does not exist, and neither does a tach that
// reads one. Anything past this is a mis-mapped column (a price, an invoice
// number, a phone number) — reject the row rather than import a wrong reading.
const MAX_READING = 100_000;

const text = (raw: string): string | null => {
  const s = stripFormulaGuard(raw.trim()).trim();
  return s ? s.slice(0, MAX_TEXT) : null;
};

/**
 * A numeric reading, or an error explaining why not. Handles thousands
 * separators and the European decimal comma, but refuses anything it can't read
 * exactly — importing an unparseable tach as 0 is the failure mode this exists
 * to prevent.
 */
export function parseReading(raw: string): { value: number | null } | { error: string } {
  let s = raw.trim().replace(/\s/g, "");
  if (!s) return { value: null };
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, ""); // 1,234.5
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", "."); // 1234,5 (European)
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `"${raw.trim().slice(0, 40)}" is not a number` };
  if (n < 0) return { error: `"${raw.trim().slice(0, 40)}" is negative` };
  if (n > MAX_READING) return { error: `"${raw.trim().slice(0, 40)}" is not a plausible reading` };
  return { value: n };
}

const refs = (raw: string): string[] =>
  raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

/**
 * Apply a confirmed mapping to every row. Pure, deterministic, and total: every
 * row either produces an entry or produces an error naming the row and the
 * reason. Nothing is silently dropped or coerced to a placeholder.
 *
 * Row numbers are 1-based over the DATA rows (row 1 = the first row under the
 * header), which is what the user sees in the preview.
 */
export function coerceRows(parsed: ParsedCsv, mapping: Mapping, format: DateFormat): CoercionResult {
  const entries: EntryDraft[] = [];
  const errors: RowError[] = [];
  const dateCol = mapping.indexOf("entry_date");

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNo = i + 1;
    const draft: EntryDraft = {
      entry_date: null, description: null, work_performed: null, parts: null,
      hobbs: null, tach: null, airframe: null,
      signature_name: null, mechanic_cert_number: null, ad_refs: [], sb_refs: [],
    };
    const set = draft as unknown as Record<string, unknown>;
    let failed: string | null = null;

    for (let col = 0; col < mapping.length && !failed; col++) {
      const field = mapping[col];
      if (field === "ignore") continue;
      const raw = row[col] ?? "";
      if (field === "entry_date") {
        const s = raw.trim();
        if (!s) {
          failed = "no date";
        } else {
          const d = parseDate(s, format);
          if (!d) failed = `couldn't read the date "${s.slice(0, 40)}"`;
          else draft.entry_date = d;
        }
      } else if (NUMERIC_FIELDS.has(field)) {
        const r = parseReading(raw);
        if ("error" in r) failed = `${FIELD_LABEL[field]}: ${r.error}`;
        else set[field] = r.value;
      } else if (LIST_FIELDS.has(field)) {
        set[field] = refs(raw);
      } else {
        set[field] = text(raw);
      }
    }

    if (failed) {
      errors.push({ row: rowNo, message: failed });
      continue;
    }
    if (dateCol < 0 && !draft.description && !draft.work_performed) {
      errors.push({ row: rowNo, message: "nothing to import from this row" });
      continue;
    }
    entries.push(draft);
  }

  return { entries, errors };
}

/**
 * Detect the date format from the WHOLE mapped date column. Returns null when no
 * date column is mapped — the caller treats that as a mapping the user must fix.
 */
export function detectForMapping(parsed: ParsedCsv, mapping: Mapping) {
  const col = mapping.indexOf("entry_date");
  if (col < 0) return null;
  const values: string[] = [];
  const rowNumbers: number[] = [];
  parsed.rows.forEach((row, i) => {
    const v = (row[col] ?? "").trim();
    if (v) {
      values.push(v);
      rowNumbers.push(i + 1);
    }
  });
  return detectDateFormat(values, rowNumbers);
}
