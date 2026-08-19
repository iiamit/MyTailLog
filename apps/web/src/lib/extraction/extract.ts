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
  EXTRACTION_SYSTEM_PROMPT,
  type ExtractionResult,
  type ExtractedEntry,
} from "./schema";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function isEntry(e: unknown): e is ExtractedEntry {
  return typeof e === "object" && e !== null && "confidence" in e;
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
    raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
    unread_rotated_content: parsed.unread_rotated_content === true,
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : [],
  };
}

/**
 * Should the page KEEP its "rotated content unread" warning after the retry?
 *
 * Clear it only on evidence: the retry must have actually returned something AND
 * no longer report anything outstanding. Getting this backwards would suppress
 * the warning on exactly the pages that need it — a silent miss is the failure
 * mode this whole change exists to remove — so it errs toward keeping it.
 */
export function stillUnreadAfterRetry(second: {
  unread_rotated_content: boolean;
  entries: unknown[];
}): boolean {
  return second.unread_rotated_content || second.entries.length === 0;
}

/** Prompt for the follow-up pass. Deliberately narrow: ONLY the rotated content. */
const ROTATED_PASS_PROMPT = `Your previous pass over this page reported rotated or sideways content that was not fully read.

Read it now. Rotate the page mentally as needed — content may run bottom-to-top, top-to-bottom along an edge, upside down, or at an angle.

Return ONLY entries from that rotated content. Do NOT return entries you already read upright — they are captured, and repeating them creates duplicates the owner has to clean up. If, on a second look, there is genuinely nothing rotated that you can read, return an empty entries array and set unread_rotated_content appropriately.`;

/**
 * Second, targeted pass for a page whose first pass flagged rotated content.
 *
 * Runs on the SAME image with a narrower prompt rather than rotating the bytes:
 * a vision model reads rotated text when it is told to look, and re-encoding
 * would mean importing sharp into app code — which `package.json` deliberately
 * avoids (it is pinned for a CVE precisely because user-uploaded images reach
 * it via image optimization, and nothing in the app imports it).
 *
 * Only runs when the model asked for it, so the extra call lands on the few
 * pages that need it rather than on every page — extraction is bounded by a
 * per-user daily cap and a global dollar ceiling.
 */
export async function extractRotatedFromImage(
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
      { type: "text", text: ROTATED_PASS_PROMPT },
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
      raw_text: typeof parsed.raw_text === "string" ? parsed.raw_text : "",
      unread_rotated_content: parsed.unread_rotated_content === true,
      entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : [],
    };
  } catch {
    return { detected_page_count: 1, raw_text: "", unread_rotated_content: true, entries: [] };
  }
}
