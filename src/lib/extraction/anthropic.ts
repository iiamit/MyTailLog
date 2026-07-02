// ===========================================================================
// Anthropic client — the one paid line item (see README "Costs"). The key is
// server-only (ANTHROPIC_API_KEY, no NEXT_PUBLIC_ prefix) so it never reaches
// the browser. Model is overridable via EXTRACTION_MODEL so an operator can
// trade cost for capability on their own instance without a code change — the
// default is Anthropic's most capable model, which is the right default for
// reading messy handwriting; downgrading is the operator's call.
// ===========================================================================

import Anthropic from "@anthropic-ai/sdk";

export const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || "claude-opus-4-8";

export function extractionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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
