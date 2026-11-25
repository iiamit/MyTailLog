import { normalizePageDetails } from "./normalizePageDetails";
import { PAGE_DETAILS_SCHEMA, PAGE_DETAILS_PROMPT, type ContentKind, type IdentitySuggestion } from "./pageDetails";
// ===========================================================================
// "Other" document classification + apply.
//
// A page captured into the 'other' logbook is NOT a running maintenance log —
// it's an A&P-produced document. This module (1) classifies a page image as a
// Weight & Balance sheet, an AD compliance report, or neither, and extracts the
// structured payload, then (2) applies it: a W&B doc adds a weight_balance
// revision (linked to the page); an AD report corroborates matching tracked ADs
// and creates rows for unmatched ones. The page image stays the source of truth.
//
// These docs are PRINTED, so this is a reliable VISION task → EXTRACTION_MODEL
// (Opus), mirroring extract.ts. Everything here is best-effort: a miss records
// the raw classification and never breaks the normal capture/extract flow.
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AdStatus } from "@/lib/database.types";
import { generateAi } from "./ai";
import { safeIsoDate } from "./date";
import type { ImageMediaType } from "./extract";

export type WBPayload = {
  empty_weight: number | null;
  empty_weight_arm: number | null;
  empty_weight_moment: number | null;
  max_gross_weight: number | null;
  method: "weighed" | "computed" | null;
  reference: string | null;
};

export type AdLine = {
  reference: string;
  title: string | null;
  status: string | null; // open | complied | previously_complied | not_applicable | superseded
  method: string | null;
  complied_date: string | null;
  complied_hours: number | null;
  next_due_date: string | null;
  next_due_hours: number | null;
  recurring: boolean;
};

export type OtherDocPayload = {
  content_kinds?: ContentKind[];
  identity_suggestions?: IdentitySuggestion[];
  doc_type: "weight_balance" | "ad_report" | "other";
  document_date: string | null;
  confidence: number;
  raw_text: string;
  weight_balance: WBPayload;
  ads: AdLine[];
};

const AD_STATUSES: AdStatus[] = [
  "open", "complied", "previously_complied", "not_applicable", "superseded",
];

// Nullable-object fields are avoided (weight_balance is always present, ads is
// always an array) so structured outputs stays simple. enum is intentionally
// NOT used on any field — allowed values are conveyed via descriptions, which
// avoids the nullable-field enum 400 (see equipment.ts).
const WB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    empty_weight: { type: ["number", "null"], description: "Current empty weight in lbs." },
    empty_weight_arm: { type: ["number", "null"], description: "Empty-weight CG arm in inches aft of datum." },
    empty_weight_moment: { type: ["number", "null"], description: "Empty-weight moment in lb-in (weight × arm)." },
    max_gross_weight: { type: ["number", "null"], description: "Max gross weight in lbs, if stated." },
    method: { type: ["string", "null"], description: "One of \"weighed\" or \"computed\" (how the empty weight was determined), or null." },
    reference: { type: ["string", "null"], description: "Source-document identifier: Form 337 number, W&B report number, or shop name/date." },
  },
  required: [
    "empty_weight", "empty_weight_arm", "empty_weight_moment",
    "max_gross_weight", "method", "reference",
  ],
} as const;

const AD_LINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reference: { type: "string", description: "AD number exactly as printed, e.g. \"2015-19-07\" or \"AD 79-10-14\"." },
    title: { type: ["string", "null"], description: "Subject/title of the AD, if printed." },
    status: { type: ["string", "null"], description: "Compliance status shown on the report — one of: \"open\", \"complied\", \"previously_complied\", \"not_applicable\", \"superseded\" — or null if not stated." },
    method: { type: ["string", "null"], description: "Compliance method / how complied, as printed." },
    complied_date: { type: ["string", "null"], description: "Date complied, YYYY-MM-DD, if shown." },
    complied_hours: { type: ["number", "null"], description: "Aircraft hours at compliance, if shown." },
    next_due_date: { type: ["string", "null"], description: "Next-due date, YYYY-MM-DD, for a recurring AD, if shown." },
    next_due_hours: { type: ["number", "null"], description: "Next-due hours for a recurring AD, if shown." },
    recurring: { type: "boolean", description: "True if the report marks this AD as recurring." },
  },
  required: [
    "reference", "title", "status", "method", "complied_date",
    "complied_hours", "next_due_date", "next_due_hours", "recurring",
  ],
} as const;

const OTHER_DOC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...PAGE_DETAILS_SCHEMA,
    doc_type: { type: "string", description: "Classify the document — exactly one of: \"weight_balance\" (an empty-weight / CG / moment sheet), \"ad_report\" (an Airworthiness Directive compliance listing), or \"other\" (neither)." },
    document_date: { type: ["string", "null"], description: "The date printed on the document (revision/report date), YYYY-MM-DD, or null." },
    confidence: { type: "number", description: "0 to 1 confidence in the classification and extraction." },
    raw_text: { type: "string", description: "Full plain-text transcription of the document." },
    weight_balance: WB_SCHEMA,
    ads: { type: "array", items: AD_LINE_SCHEMA },
  },
  required: ["doc_type", "document_date", "confidence", "raw_text", "weight_balance", "ads", "content_kinds", "identity_suggestions"],
} as const;

const SYSTEM_PROMPT = PAGE_DETAILS_PROMPT + `You read a single scanned aircraft-maintenance DOCUMENT (not a running logbook page) and classify it, then extract its structured data.

These documents are produced by A&P shops and are usually PRINTED. They are one of:
- A WEIGHT & BALANCE document: shows the aircraft's current empty weight, empty-weight CG arm, empty-weight moment, and often max gross weight and a revision date. Set doc_type = "weight_balance" and fill the weight_balance object. Leave ads = [].
- An AD COMPLIANCE REPORT (AD status list / AD compliance record, typical at annual): a table of Airworthiness Directives with their compliance status, method, dates/hours, and next-due for recurring ones. Set doc_type = "ad_report" and fill the ads array (one object per AD line). Leave weight_balance fields null.
- NEITHER: set doc_type = "other", ads = [], weight_balance fields null.

Rules:
- Transcribe only what is printed. Never invent or infer values; use null / empty array when something is absent or illegible.
- For W&B, capture the CURRENT figures (the latest revision on the sheet). If only two of weight/arm/moment are printed, extract those two and leave the third null (it will be derived).
- For AD lines, capture the AD number exactly as printed and the status word if shown. Only list Airworthiness Directives; skip Service Bulletins and general notes.
- document_date is the revision date (W&B) or the report date (AD report).
- Always fill raw_text with the full transcription.`;

const isDocType = (v: unknown): v is OtherDocPayload["doc_type"] =>
  v === "weight_balance" || v === "ad_report" || v === "other";

/** Classify + extract a printed "Other" document from a page image (base64). */
export async function classifyOtherDocument(
  imageBase64: string,
  mediaType: ImageMediaType,
): Promise<OtherDocPayload> {
  const response = await generateAi({
    modelKind: "ocr",
    maxOutputTokens: 8000,
    systemPrompt: SYSTEM_PROMPT,
    jsonSchema: OTHER_DOC_SCHEMA,
    content: [
      { type: "image", mediaType, data: imageBase64 },
      { type: "text", text: "Classify this document and extract its data following the schema." },
    ],
  });

  if (response.stopReason === "refusal") {
    throw new Error("Document read was declined by the safety system for this image.");
  }
  const text = response.text;

  let parsed: Partial<OtherDocPayload>;
  try {
    parsed = JSON.parse(text) as Partial<OtherDocPayload>;
  } catch {
    throw new Error("Document read returned malformed JSON despite the schema constraint.");
  }

  return {
    ...normalizePageDetails(parsed),
    doc_type: isDocType(parsed.doc_type) ? parsed.doc_type : "other",
    // Sanitize every date at the parse boundary — the model can emit impossible
    // dates ("1987-11-31") that throw on insert into a `date` column downstream.
    document_date: safeIsoDate(typeof parsed.document_date === "string" ? parsed.document_date : null),
    confidence: Number.isFinite(parsed.confidence) ? (parsed.confidence as number) : 0,
    raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
    weight_balance: normalizeWB(parsed.weight_balance),
    ads: Array.isArray(parsed.ads)
      ? parsed.ads.filter(isAdLine).map(normalizeAdLine)
      : [],
  };
}

function normalizeWB(wb: unknown): WBPayload {
  const o = (wb ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const method = o.method === "weighed" || o.method === "computed" ? o.method : null;
  return {
    empty_weight: num(o.empty_weight),
    empty_weight_arm: num(o.empty_weight_arm),
    empty_weight_moment: num(o.empty_weight_moment),
    max_gross_weight: num(o.max_gross_weight),
    method,
    reference: typeof o.reference === "string" ? o.reference : null,
  };
}

function isAdLine(v: unknown): v is AdLine {
  return typeof v === "object" && v !== null &&
    typeof (v as AdLine).reference === "string" &&
    (v as AdLine).reference.trim().length > 0;
}

const coerceStatus = (s: string | null): AdStatus | null =>
  s != null && (AD_STATUSES as string[]).includes(s) ? (s as AdStatus) : null;

/** Model enums are descriptive, so unknown statuses remain unasserted instead of breaking approval. */
export function normalizeAdLine(a: AdLine): AdLine {
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    ...a, status: coerceStatus(a.status), recurring: a.recurring === true,
    complied_hours: num(a.complied_hours), next_due_hours: num(a.next_due_hours),
    complied_date: safeIsoDate(a.complied_date), next_due_date: safeIsoDate(a.next_due_date),
  };
}

export type ApplyResult = {
  docType: OtherDocPayload["doc_type"];
  wbApplied: boolean;
  adsCorrelated: number;
  adsCreated: number;
  summary: string;
};

/** Save machine output for human review; only confirm_scanned_document changes authoritative records. */
export async function applyScannedDocument(
  supabase: SupabaseClient<Database>,
  page: { id: string; aircraft_id: string },
  payload: OtherDocPayload,
): Promise<ApplyResult> {
  const summary = payload.doc_type === "other" ? "Reference document" : "Awaiting review — no maintenance values have been changed";
  const { error } = await supabase.from("scanned_document").upsert({
    aircraft_id: page.aircraft_id, page_id: page.id, doc_type: payload.doc_type,
    document_date: payload.document_date, extracted: payload as unknown as Record<string, unknown>,
    summary, applied: false, confidence: payload.confidence,
  }, { onConflict: "page_id" });
  if (error) throw new Error(`Could not save document reading: ${error.message}`);
  return { docType: payload.doc_type, wbApplied: false, adsCorrelated: 0, adsCreated: 0, summary };
}
