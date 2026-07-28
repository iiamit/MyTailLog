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

import { getAnthropic, EXTRACTION_MODEL } from "./anthropic";
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
): Promise<ExtractionResult> {
  const client = getAnthropic();

  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    system: EXTRACTION_SYSTEM_PROMPT,
    // Structured outputs constrains the response to the schema. effort "medium"
    // balances careful reading against per-page cost; thinking stays adaptive so
    // the model can reason about ambiguous handwriting when it needs to.
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: EXTRACTION_JSON_SCHEMA,
      },
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
            text: "Extract every maintenance entry from this logbook page image following the schema.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Extraction was declined by the safety system for this image.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Extraction hit the token limit; the page may be unusually dense.");
  }

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

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
    entries: Array.isArray(parsed.entries) ? parsed.entries.filter(isEntry) : [],
  };
}
