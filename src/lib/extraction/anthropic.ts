// ===========================================================================
// Anthropic client — the one paid line item (see README "Costs"). The key is
// server-only (ANTHROPIC_API_KEY, no NEXT_PUBLIC_ prefix) so it never reaches
// the browser. Model is overridable via EXTRACTION_MODEL so an operator can
// trade cost for capability on their own instance without a code change — the
// default is Anthropic's most capable model, which is the right default for
// reading messy handwriting; downgrading is the operator's call.
// ===========================================================================

import Anthropic from "@anthropic-ai/sdk";
import { currentAiContext } from "./aiContext";

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

// Wrap messages.create so every (non-streaming) call reports token usage to the
// request's onUsage logger. Only awaited-object calls are made here; streaming
// isn't used. ponytail: monkey-patch over a subclass — one method, one place.
function withUsageLogging(c: Anthropic): Anthropic {
  const orig = c.messages.create.bind(c.messages);
  c.messages.create = (async (body: Anthropic.MessageCreateParamsNonStreaming, opts?: unknown) => {
    const res = await orig(body, opts as never);
    const { onUsage } = currentAiContext();
    if (onUsage && res && typeof res === "object" && "usage" in res && res.usage) {
      await onUsage({
        model: String(body.model),
        inputTokens: res.usage.input_tokens ?? 0,
        outputTokens: res.usage.output_tokens ?? 0,
      });
    }
    return res;
  }) as typeof c.messages.create;
  return c;
}

let serverClient: Anthropic | null = null;

// E2E test double: when E2E_STUB_AI is set (ONLY in the Playwright test env —
// never in prod/apphosting.yaml), getAnthropic returns this instead of a real
// client, so AI flows are deterministic and free. Returns canned JSON shaped for
// the calling context (keyed on the request's output schema; default = the ask
// {answer,citations} shape). Extend the branches as more AI flows get E2E tests.
function e2eStubClient(): Anthropic {
  const create = async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    const schema = (body as { output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } } })
      .output_config?.format?.schema;
    const props = schema?.properties ?? {};
    let text: string;
    if ("samples" in props) {
      // oil analysis report
      text = JSON.stringify({
        lab: "E2E Lab", lab_number: "E2E-1", tail_number: null, oil_type: "Stub 20W50",
        report_date: "2026-01-01", lab_comments: "Stub report.",
        universal_averages: [{ element: "iron", ppm: 20 }], confidence: 1, raw_text: "stub",
        samples: [{
          sample_date: "2026-01-01", oil_hours: 25, engine_hours: 500, oil_added_quarts: 1,
          sample_number: "E2E-1", elements_ppm: [{ element: "iron", ppm: 30 }], oil_properties: [],
        }],
      });
    } else {
      // ask (no schema) and any not-yet-stubbed flow
      text = JSON.stringify({ answer: "E2E stubbed answer.", citations: [] });
    }
    return {
      id: "e2e-stub", type: "message", role: "assistant", model: String(body.model),
      content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Anthropic.Message;
  };
  return { messages: { create } } as unknown as Anthropic;
}

/**
 * Construct the Anthropic client for the current request. Uses the user's own
 * key from the request context (BYOK) when present; otherwise the shared
 * server key. Throws a clear error if neither is available.
 */
export function getAnthropic(): Anthropic {
  if (process.env.E2E_STUB_AI) return withUsageLogging(e2eStubClient());
  const { apiKey } = currentAiContext();
  if (apiKey) return withUsageLogging(new Anthropic({ apiKey }));
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "No Anthropic key available. Set ANTHROPIC_API_KEY, or add your own key in Settings.",
    );
  }
  if (!serverClient) serverClient = withUsageLogging(new Anthropic());
  return serverClient;
}
