import { test } from "node:test";
import assert from "node:assert/strict";
import { generateAi } from "../src/lib/extraction/ai";
import { runWithAiContext, type AiUsage } from "../src/lib/extraction/aiContext";

test("generateAi routes OpenAI context and records provider usage", async () => {
  const original = globalThis.fetch;
  let usage: AiUsage | undefined;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    model: "gpt-test",
    output_text: "answer",
    usage: { input_tokens: 4, output_tokens: 2 },
  }), { headers: { "Content-Type": "application/json" } })) as typeof fetch;
  try {
    const result = await runWithAiContext(
      { provider: "openai", apiKey: "sk-test", onUsage: (value) => { usage = value; } },
      () => generateAi({
        modelKind: "text",
        systemPrompt: "system",
        content: [{ type: "text", text: "question" }],
        maxOutputTokens: 10,
      }),
    );
    assert.equal(result.text, "answer");
    assert.deepEqual(usage, {
      provider: "openai", model: "gpt-test", inputTokens: 4, outputTokens: 2,
    });
  } finally {
    globalThis.fetch = original;
  }
});
