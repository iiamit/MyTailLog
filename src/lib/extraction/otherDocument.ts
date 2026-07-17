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
import type { Database, AdStatus, AdCompliance } from "@/lib/database.types";
import { getAnthropic, EXTRACTION_MODEL } from "./anthropic";
import { safeIsoDate } from "./date";
import type { ImageMediaType } from "./extract";
import { completeWB } from "@/lib/weightBalance";
import { cleanAdNumber, adNumbersMatch } from "@/lib/faa/adNumber";

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
    doc_type: { type: "string", description: "Classify the document — exactly one of: \"weight_balance\" (an empty-weight / CG / moment sheet), \"ad_report\" (an Airworthiness Directive compliance listing), or \"other\" (neither)." },
    document_date: { type: ["string", "null"], description: "The date printed on the document (revision/report date), YYYY-MM-DD, or null." },
    confidence: { type: "number", description: "0 to 1 confidence in the classification and extraction." },
    raw_text: { type: "string", description: "Full plain-text transcription of the document." },
    weight_balance: WB_SCHEMA,
    ads: { type: "array", items: AD_LINE_SCHEMA },
  },
  required: ["doc_type", "document_date", "confidence", "raw_text", "weight_balance", "ads"],
} as const;

const SYSTEM_PROMPT = `You read a single scanned aircraft-maintenance DOCUMENT (not a running logbook page) and classify it, then extract its structured data.

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
  const client = getAnthropic();

  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: OTHER_DOC_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Classify this document and extract its data following the schema.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Document read was declined by the safety system for this image.");
  }
  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: Partial<OtherDocPayload>;
  try {
    parsed = JSON.parse(text) as Partial<OtherDocPayload>;
  } catch {
    throw new Error("Document read returned malformed JSON despite the schema constraint.");
  }

  return {
    doc_type: isDocType(parsed.doc_type) ? parsed.doc_type : "other",
    // Sanitize every date at the parse boundary — the model can emit impossible
    // dates ("1987-11-31") that throw on insert into a `date` column downstream.
    document_date: safeIsoDate(typeof parsed.document_date === "string" ? parsed.document_date : null),
    confidence: Number.isFinite(parsed.confidence) ? (parsed.confidence as number) : 0,
    raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
    weight_balance: normalizeWB(parsed.weight_balance),
    ads: Array.isArray(parsed.ads)
      ? parsed.ads.filter(isAdLine).map((a) => ({
          ...a,
          complied_date: safeIsoDate(a.complied_date),
          next_due_date: safeIsoDate(a.next_due_date),
        }))
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

export type ApplyResult = {
  docType: OtherDocPayload["doc_type"];
  wbApplied: boolean;
  adsCorrelated: number;
  adsCreated: number;
  summary: string;
};

/**
 * Apply a classified document. Writes a scanned_document row (upsert per page)
 * and, per type, a weight_balance revision or ad_compliance corroborations.
 * Ground-truth rule for ADs: the report is the baseline, but a compliance record
 * whose complied_date is NEWER than the report date is a later log override and
 * is NOT clobbered — only its verified marker is set.
 */
export async function applyScannedDocument(
  supabase: SupabaseClient<Database>,
  page: { id: string; aircraft_id: string },
  payload: OtherDocPayload,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    docType: payload.doc_type,
    wbApplied: false,
    adsCorrelated: 0,
    adsCreated: 0,
    summary: "",
  };

  if (payload.doc_type === "weight_balance") {
    result.wbApplied = await applyWeightBalance(supabase, page, payload);
  } else if (payload.doc_type === "ad_report") {
    const r = await applyAdReport(supabase, page, payload);
    result.adsCorrelated = r.correlated;
    result.adsCreated = r.created;
  }

  result.summary = summarize(result);

  // Upsert the scanned_document record (one per page).
  await supabase
    .from("scanned_document")
    .upsert(
      {
        aircraft_id: page.aircraft_id,
        page_id: page.id,
        doc_type: payload.doc_type,
        document_date: payload.document_date,
        extracted: payload as unknown as Record<string, unknown>,
        summary: result.summary,
        applied: result.wbApplied || result.adsCorrelated > 0 || result.adsCreated > 0,
        confidence: payload.confidence,
      },
      { onConflict: "page_id" },
    );

  return result;
}

function summarize(r: ApplyResult): string {
  if (r.docType === "weight_balance") {
    return r.wbApplied ? "Applied a W&B revision" : "Weight & Balance — no usable figures";
  }
  if (r.docType === "ad_report") {
    const parts: string[] = [];
    if (r.adsCorrelated) parts.push(`${r.adsCorrelated} AD${r.adsCorrelated === 1 ? "" : "s"} correlated`);
    if (r.adsCreated) parts.push(`${r.adsCreated} AD${r.adsCreated === 1 ? "" : "s"} added`);
    return parts.length ? parts.join(" · ") : "AD report — no AD lines read";
  }
  return "Not a W&B or AD document";
}

async function applyWeightBalance(
  supabase: SupabaseClient<Database>,
  page: { id: string; aircraft_id: string },
  payload: OtherDocPayload,
): Promise<boolean> {
  const wb = payload.weight_balance;
  const revisionDate = payload.document_date;
  // A W&B revision is keyed by its date; without one we can't place it in the
  // history, so record only the scanned_document (no revision).
  if (!revisionDate) return false;
  if (wb.empty_weight == null && wb.empty_weight_arm == null && wb.empty_weight_moment == null) {
    return false;
  }

  const filled = completeWB({
    weight: wb.empty_weight,
    arm: wb.empty_weight_arm,
    moment: wb.empty_weight_moment,
  });

  const row = {
    aircraft_id: page.aircraft_id,
    revision_date: revisionDate,
    empty_weight: filled.weight,
    empty_weight_arm: filled.arm,
    empty_weight_moment: filled.moment,
    max_gross_weight: wb.max_gross_weight,
    method: wb.method,
    reference: wb.reference,
    reason: "From scanned A&P document",
    source_page_id: page.id,
  };

  // Dedupe by date: update an existing same-date revision, else insert.
  const { data: existing } = await supabase
    .from("weight_balance")
    .select("id")
    .eq("aircraft_id", page.aircraft_id)
    .eq("revision_date", revisionDate)
    .maybeSingle();

  if (existing) {
    await supabase.from("weight_balance").update(row).eq("id", existing.id);
  } else {
    await supabase.from("weight_balance").insert(row);
  }
  return true;
}

async function applyAdReport(
  supabase: SupabaseClient<Database>,
  page: { id: string; aircraft_id: string },
  payload: OtherDocPayload,
): Promise<{ correlated: number; created: number }> {
  const reportDate = payload.document_date; // ground-truth date
  const nowIso = new Date().toISOString();
  let correlated = 0;
  let created = 0;

  // Existing tracked ADs on this aircraft (for correlation).
  const { data: records } = await supabase
    .from("ad_compliance")
    .select("id, reference, complied_date, status, method, complied_hours, next_due_date, next_due_hours, recurring")
    .eq("aircraft_id", page.aircraft_id)
    .eq("kind", "ad");

  for (const line of payload.ads) {
    const ref = cleanAdNumber(line.reference);
    if (!ref) continue;
    const status = coerceStatus(line.status);
    const match = (records ?? []).find((r) => adNumbersMatch(r.reference, ref));

    if (match) {
      // Always mark it corroborated. Then decide whether the report is the
      // authoritative BASELINE for the compliance values: it is, unless a later
      // log entry already recorded a compliance date NEWER than the report (that
      // log override wins), or the report has no date to establish recency.
      const baseline =
        reportDate != null &&
        (match.complied_date == null || match.complied_date <= reportDate);

      const update: Partial<AdCompliance> = {
        verified_report_page_id: page.id,
        verified_at: nowIso,
      };
      // Apply a report field when it's the baseline, or when the existing value
      // is empty (fill a gap) — never overwrite a populated value we can't prove
      // is stale. Status defaults to 'open', so treat 'open' as "empty".
      const put = <K extends keyof AdCompliance>(
        key: K,
        incoming: AdCompliance[K] | null,
        existingEmpty: boolean,
      ) => {
        if (incoming != null && (baseline || existingEmpty)) update[key] = incoming;
      };
      put("status", status, match.status === "open");
      put("method", line.method, match.method == null);
      put("complied_date", line.complied_date, match.complied_date == null);
      put("complied_hours", line.complied_hours, match.complied_hours == null);
      put("next_due_date", line.next_due_date, match.next_due_date == null);
      put("next_due_hours", line.next_due_hours, match.next_due_hours == null);
      if (line.recurring && !match.recurring && baseline) update.recurring = true;

      await supabase.from("ad_compliance").update(update).eq("id", match.id);
      correlated++;
    } else {
      // Unmatched: create a tracked record from the report line.
      await supabase.from("ad_compliance").insert({
        aircraft_id: page.aircraft_id,
        kind: "ad",
        reference: ref,
        title: line.title,
        status: status ?? "open",
        method: line.method,
        complied_date: line.complied_date,
        complied_hours: line.complied_hours,
        next_due_date: line.next_due_date,
        next_due_hours: line.next_due_hours,
        recurring: line.recurring,
        notes: "From scanned A&P AD compliance report",
        verified_report_page_id: page.id,
        verified_at: nowIso,
      });
      created++;
    }
  }
  return { correlated, created };
}
