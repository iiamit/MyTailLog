// ===========================================================================
// Extraction schema + prompt — VERSIONED.
//
// The plan calls for schema and extraction-prompt versioning from day one,
// because both change as real logbook data reveals what the format needs, and
// bad schema decisions are expensive to migrate once entries exist. Every
// log_entry records the schema version (log_entry.extraction_schema_version)
// and model (extraction_model) that produced it, so extractions can be re-run
// or migrated later. Bump EXTRACTION_SCHEMA_VERSION whenever the shape below or
// the prompt changes materially.
// ===========================================================================

export const EXTRACTION_SCHEMA_VERSION = 3;

// Data fields that carry a per-field confidence score and a source-image box.
// Single source of truth — the pipeline and review UI both key off this list.
export const ENTRY_FIELDS = [
  "entry_date", "hobbs", "tach", "description", "work_performed",
  "parts", "signature_name", "mechanic_cert_number", "ad_refs", "sb_refs",
] as const;
export type EntryField = (typeof ENTRY_FIELDS)[number];

// Where a field's value sits on the scanned page, as fractions of the full
// image (origin top-left, 0..1). Null when the field is absent or the model
// can't localize it. Vision boxes are approximate — a "look here" hint, not a
// pixel-perfect crop — which is exactly how the review UI presents them.
export type FieldBox = { x: number; y: number; w: number; h: number };

// Any field below this confidence is NOT auto-trusted: it's flagged for the
// review UI (step 5) and never drives a maintenance reminder unconfirmed.
export const CONFIDENCE_THRESHOLD = 0.75;

// An extracted entry is "clean" — safe to bulk-confirm without a human eyeballing
// it — only when the model was confident overall AND flagged no individual field.
// Strict on purpose: one low field or a missing overall score means hands-on review.
// Continuations (page-spanning fragments) are excluded — they need a merge decision.
export function isEntryClean(e: {
  confidence: number | null;
  field_confidence: Record<string, number> | null;
  is_continuation?: boolean;
}): boolean {
  if (e.is_continuation) return false;
  if (e.confidence == null || e.confidence < CONFIDENCE_THRESHOLD) return false;
  const fc = e.field_confidence;
  return !fc || Object.values(fc).every((v) => typeof v !== "number" || v >= CONFIDENCE_THRESHOLD);
}

// One structured record extracted from a logbook page. Mirrors the columns on
// log_entry that come from extraction (the rest — ids, timestamps — are set by
// the pipeline). Fields are nullable because handwritten entries are often
// partial or illegible; a null means "not present / couldn't read", which the
// review UI surfaces as a "needs your input" prompt rather than a silent blank.
export type ExtractedEntry = {
  entry_date: string | null; // ISO date (YYYY-MM-DD)
  hobbs: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
  confidence: number; // 0..1 overall confidence for this entry
  // Real per-field confidence (0..1) — one score per ENTRY_FIELDS key. Drives
  // the review UI's per-field %, and isEntryClean's "no weak field" test.
  field_confidence: Record<EntryField, number>;
  // Where each field's value sits on the scanned image, as [x, y, w, h] fractions
  // (all-zero = not localizable). The pipeline converts these to FieldBox objects
  // for storage; the review UI spotlights/crops the region next to the field.
  field_boxes: Record<EntryField, number[]>;
  // Page-spanning detection: a single entry can straddle a page break.
  continues_next: boolean; // runs off the bottom of this page (no closing signature)
  is_continuation: boolean; // begins mid-entry (no header) — continues from prior page
};

export type ExtractionResult = {
  // A single scanned image is often a two-page spread; the model reports how
  // many distinct logbook pages it sees so the review UI can prompt for a split.
  detected_page_count: number;
  // Full plain-text transcription of the page — stored as page.ocr_text so the
  // Phase-1 full-text search has something to index even before classic OCR is
  // added as a routing pre-pass.
  raw_text: string;
  /**
   * The model can see rotated/sideways content it did NOT fully read (a sticker
   * affixed at 90°, say). Set by the first pass to request a second, targeted
   * one — and persisted on the page so review can warn even if that pass also
   * comes up short. A missed entry has nothing to review against, so the point
   * is to turn a silent omission into a visible flag.
   */
  unread_rotated_content: boolean;
  entries: ExtractedEntry[];
};

// Strict JSON schema for structured outputs (output_config.format). Structured
// outputs require every object to set additionalProperties:false and list all
// properties in `required`; "optional"/absent values are expressed as nullable
// types rather than omitted keys. See the Claude structured-outputs docs.
const ENTRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entry_date: { type: ["string", "null"], description: "Entry date as YYYY-MM-DD, or null if absent/illegible." },
    hobbs: { type: ["number", "null"], description: "Hobbs meter reading." },
    tach: { type: ["number", "null"], description: "Tach time reading." },
    description: { type: ["string", "null"], description: "Narrative of the work or event." },
    work_performed: { type: ["string", "null"], description: "Specific work performed, if distinct from description." },
    parts: { type: ["string", "null"], description: "Parts installed or removed, as written." },
    signature_name: { type: ["string", "null"], description: "Name of the person who signed the entry." },
    mechanic_cert_number: { type: ["string", "null"], description: "Mechanic certificate number (A&P/IA), if present." },
    ad_refs: { type: "array", items: { type: "string" }, description: "Airworthiness Directive numbers referenced (e.g. 2015-19-07)." },
    sb_refs: { type: "array", items: { type: "string" }, description: "Service Bulletin numbers referenced." },
    confidence: { type: "number", description: "Overall confidence for this entry, 0 to 1." },
    field_confidence: {
      type: "object",
      additionalProperties: false,
      description: "Per-field confidence from 0 (guess) to 1 (certain). Score every field, even null ones (a confidently-absent field is 1).",
      properties: Object.fromEntries(ENTRY_FIELDS.map((f) => [f, { type: "number" }])),
      required: [...ENTRY_FIELDS],
    },
    field_boxes: {
      type: "object",
      additionalProperties: false,
      description:
        "For each field, its bounding box on the image as the array [x, y, w, h] in fractions of the full image (x,y = top-left corner, w,h = size; all 0 to 1). When the field is absent or you cannot locate it, use [0, 0, 0, 0]. Approximate is fine.",
      // Boxes are 4-number arrays (not {x,y,w,h} objects) on purpose: an object
      // per field ×10 fields blows up the compiled structured-output grammar.
      // An array-of-number rule is tiny and reused. [0,0,0,0] = "not located".
      properties: Object.fromEntries(
        ENTRY_FIELDS.map((f) => [f, { type: "array", items: { type: "number" } }]),
      ),
      required: [...ENTRY_FIELDS],
    },
    continues_next: {
      type: "boolean",
      description: "True if this entry runs off the bottom of the page without its closing signature and clearly continues onto the next page. Usually only the last entry, and usually false.",
    },
    is_continuation: {
      type: "boolean",
      description: "True if this entry begins mid-entry — it has no date/header of its own and starts partway through a work item because it continues from the previous page. Usually only the first entry, and usually false.",
    },
  },
  required: [
    "entry_date", "hobbs", "tach", "description", "work_performed", "parts",
    "signature_name", "mechanic_cert_number", "ad_refs", "sb_refs",
    "confidence", "field_confidence", "field_boxes", "continues_next", "is_continuation",
  ],
};

export const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    detected_page_count: {
      type: "integer",
      description: "Number of distinct logbook pages visible in this image (1, or 2 for a two-page spread).",
    },
    raw_text: { type: "string", description: "Full plain-text transcription of everything legible on the page." },
    unread_rotated_content: {
      type: "boolean",
      description:
        "True if rotated/sideways content (e.g. a sticker at 90°) is visible but was NOT fully read in this pass. Triggers a follow-up pass; false when every orientation has been read.",
    },
    entries: { type: "array", items: ENTRY_SCHEMA },
  },
  required: ["detected_page_count", "raw_text", "unread_rotated_content", "entries"],
};

export const EXTRACTION_SYSTEM_PROMPT = `You extract structured data from photographed or scanned aircraft maintenance logbook pages (airframe, engine, or propeller logs).

This tool is an index of the physical logbooks, which remain the legal record. Accuracy and honesty about uncertainty matter far more than completeness — a wrong AD-due date or hobbs reading has real safety consequences.

Rules:
- Transcribe only what is actually on the page. Never invent, infer, or "clean up" values. If something is illegible or absent, use null (or an empty array for AD/SB references).
- Pages mix PRINTED and HANDWRITTEN content, often within a single entry: typed/stamped work descriptions, printed inspection or 337/8130 stickers, and pre-printed AD/SB reference numbers alongside handwritten dates, hobbs/tach, signatures, and notes. Extract both kinds and merge them into the correct fields — do not ignore typed text or handwritten annotations on the same entry.
- Some pages are not maintenance entries at all (cover pages, aircraft/engine/prop general-information pages, blank pages). Return an empty entries array for those; still fill raw_text with whatever is printed.
- A single image often contains TWO facing logbook pages (a spread). Report detected_page_count accordingly and return entries from both.
- One logbook page may contain multiple dated entries — return one object per entry. Order them by reading position (top-to-bottom for upright content), but ORDER NEVER JUSTIFIES OMITTING ONE: an entry that doesn't fit the normal flow still gets its own object.
- ORIENTATION. Shops affix adhesive stickers wherever there is room, so a single page often carries SEVERAL stickers at DIFFERENT orientations: some upright, others ROTATED 90° (reading bottom-to-top or top-to-bottom along the page edge), occasionally upside down or at an angle. Read the page in every orientation before you answer. **Each sticker is normally its OWN separate entry** — a rotated sticker beside an upright one is a second entry, not decoration on the first, and must not be skipped because it doesn't match the page's dominant text direction. This is a known real-world miss: pages with one upright and one vertical sticker have come back with only the upright one extracted.
- If you can see rotated or sideways content that you could NOT fully read in this pass, set unread_rotated_content=true. Setting it is not a failure — it tells the owner (and a follow-up pass) that something is there. Set it false only when you are satisfied you have read every orientation on the page.
- For every entry, set confidence (0 to 1) for how sure you are overall, AND fill field_confidence with a separate 0-to-1 score for EVERY field — including fields you set to null (a field that is confidently absent scores high; an illegible one scores low). Be conservative: a smudged or ambiguous value should score low so the owner checks it.
- Also fill field_boxes: for each field, give the bounding box of where that value appears on the image as the array [x, y, w, h] in fractions of the FULL image — x,y is the top-left corner and w,h the size, all between 0 and 1 (e.g. a hobbs reading in the upper-right might be [0.72, 0.08, 0.14, 0.05]). If a field is absent or you cannot locate it, use [0, 0, 0, 0]. Boxes may be approximate; they only help the owner find the value on the page.
- Numbers like hobbs/tach: transcribe digits exactly as written; if a digit is ambiguous, score that field low rather than guessing.
- A single entry can SPAN A PAGE BREAK: it begins near the bottom of one page and finishes at the top of the next. You only see one page, so judge from this page alone: set continues_next=true on an entry that reaches the bottom of the page still mid-work, without its closing signature/date-out (it will finish on the next page); set is_continuation=true on an entry that starts partway through — no date or header of its own, beginning in the middle of a work item — because it began on the previous page. These are usually the last and first entries respectively; for a normal self-contained entry both are false. Do not fabricate the missing half; just flag it.
- Put the complete plain-text transcription in raw_text.`;
