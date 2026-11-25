import { normalizePageDetails } from "./normalizePageDetails";
// ===========================================================================
// Vision extraction — turn a page image into structured entries via Claude.
//
// This is the core of the hybrid pipeline described in the plan. v1 routes
// every page through the vision model, which both reads handwriting and returns
// a plain-text transcription (raw_text) for search. The routing SEAM is here:
// classic OCR (Tesseract) for clearly-printed pages — cheaper, skips image
// tokens — is the documented next optimization; when added, printed/high-OCR-
// confidence pages would take a text-only path and only handwritten/low-
// confidence pages would hit vision. See plan "OCR and extraction".
//
// Uses structured outputs (output_config.format) so the response is guaranteed
// to match EXTRACTION_JSON_SCHEMA — no brittle free-text JSON parsing.
// ===========================================================================

import { generateAi } from "./ai";
import {
  EXTRACTION_JSON_SCHEMA,
  ENTRY_FIELDS,
  EXTRACTION_SYSTEM_PROMPT,
  type ExtractionResult,
  type ExtractedEntry,
} from "./schema";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function isEntry(e: unknown): e is ExtractedEntry {
  return typeof e === "object" && e !== null && "confidence" in e;
}

export function normalizeExtractedEntries(value: unknown): ExtractedEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry).map(entry => {
    const raw: unknown = entry.field_confidence;
    const confidence = Object.fromEntries(ENTRY_FIELDS.map(field => {
      const values: unknown[] = Array.isArray(raw)
        ? raw.filter(score => score?.field === field).map(score => score.confidence)
        : [raw && typeof raw === "object" ? (raw as Record<string, unknown>)[field] : undefined];
      const valid = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      return [field, valid.length ? Math.max(0, Math.min(1, ...valid)) : 0];
    })) as ExtractedEntry["field_confidence"];
    return { ...entry, field_confidence: confidence };
  });
}

/**
 * Extract structured entries from a single page image (base64-encoded).
 * `isHandwritten` is a capture-time hint; it's recorded on the page and, once
 * classic-OCR routing lands, will help decide the vision-vs-text path.
 */
export async function extractFromImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  isHandwritten = true,
): Promise<ExtractionResult> {
  const response = await generateAi({
    modelKind: isHandwritten ? "handwriting" : "ocr",
    maxOutputTokens: 16000,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    jsonSchema: EXTRACTION_JSON_SCHEMA,
    content: [
      { type: "image", mediaType, data: imageBase64 },
      { type: "text", text: "Extract every maintenance entry from this logbook page image following the schema." },
    ],
  });

  if (response.stopReason === "refusal") {
    throw new Error("Extraction was declined by the safety system for this image.");
  }
  if (response.stopReason === "max_tokens") {
    throw new Error("Extraction hit the token limit; the page may be unusually dense.");
  }

  const text = response.text;

  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(text) as ExtractionResult;
  } catch {
    throw new Error("Model returned malformed JSON despite the schema constraint.");
  }

  // Defensive normalization — the schema guarantees shape, but guard anyway so
  // one bad field can't crash the pipeline.
  return {
    detected_page_count:
      Number.isFinite(parsed.detected_page_count) && parsed.detected_page_count > 0
        ? Math.round(parsed.detected_page_count)
        : 1,
    ...normalizePageDetails(parsed),
    raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
    unread_rotated_content: parsed.unread_rotated_content === true,
    entries: normalizeExtractedEntries(parsed.entries),
  };
}

/**
 * Second, targeted pass for a page with suspected rotated content.
 *
 * Called with a physically rotated crop by orientation.ts when the first pass
 * left a material transcript line out of structured entries or explicitly
 * reported unread sideways content. Normal pages incur no second call.
 */
export async function extractRotatedFromImage(
  imageBase64: string,
  mediaType: ImageMediaType,
  isHandwritten: boolean,
  focusPrompt: string,
): Promise<ExtractionResult> {
  const response = await generateAi({
    modelKind: isHandwritten ? "handwriting" : "ocr",
    maxOutputTokens: 16000,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    jsonSchema: EXTRACTION_JSON_SCHEMA,
    content: [
      { type: "image", mediaType, data: imageBase64 },
      { type: "text", text: focusPrompt },
    ],
  });

  if (response.stopReason === "refusal" || response.stopReason === "max_tokens") {
    // Never fatal: the first pass's entries are already good. Report "still
    // unread" so the page keeps its warning.
    return { detected_page_count: 1, raw_text: "", unread_rotated_content: true, entries: [] };
  }

  const text = response.text;

  try {
    const parsed = JSON.parse(text) as ExtractionResult;
    return {
      detected_page_count: 1,
      ...normalizePageDetails(parsed),
    raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
      unread_rotated_content: parsed.unread_rotated_content === true,
      entries: normalizeExtractedEntries(parsed.entries),
    };
  } catch {
    return { detected_page_count: 1, raw_text: "", unread_rotated_content: true, entries: [] };
  }
}
