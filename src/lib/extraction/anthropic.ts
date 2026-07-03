// ===========================================================================
// Anthropic client — the one paid line item (see README "Costs"). The key is
// server-only (ANTHROPIC_API_KEY, no NEXT_PUBLIC_ prefix) so it never reaches
// the browser. Model is overridable via EXTRACTION_MODEL so an operator can
// trade cost for capability on their own instance without a code change — the
// default is Anthropic's most capable model, which is the right default for
// reading messy handwriting; downgrading is the operator's call.
// ===========================================================================

import Anthropic from "@anthropic-ai/sdk";

// Vision / handwriting extraction needs a strong model — default to the most
// capable. Overridable so an operator can trade cost for capability.
export const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || "claude-opus-4-8";

// Text-only reasoning over ALREADY-extracted entries (Q&A, and — pending the
// model audit — equipment/maintenance detection) doesn't need a vision-grade
// model. Default to the cheapest capable model; override via TEXT_MODEL.
export const TEXT_MODEL = process.env.TEXT_MODEL || "claude-haiku-4-5";

export function extractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Adaptive thinking + `effort` exist only on 4.6+ / 5-gen models. Haiku 4.5
// rejects both (400), but supports json_schema structured outputs. So the
// request builder must gate these params on the model, letting TEXT_MODEL point
// at Opus, Sonnet 5, OR Haiku 4.5 without breaking.
const ADAPTIVE_MODEL = /opus-4-[5-9]|sonnet-5|sonnet-4-6|fable-5|mythos-5/;

export function reasoningParams(model: string): {
  thinking?: { type: "adaptive" };
  effort?: "medium";
} {
  return ADAPTIVE_MODEL.test(model)
    ? { thinking: { type: "adaptive" }, effort: "medium" }
    : {};
}

let client: Anthropic | null = null;

/** Lazily construct the client. Throws a clear error if the key is missing. */
export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local to run extraction (see README Costs).",
    );
  }
  if (!client) client = new Anthropic();
  return client;
}
