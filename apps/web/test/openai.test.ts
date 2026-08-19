import { test } from "node:test";
import assert from "node:assert/strict";
import { openAiResponse } from "../src/lib/extraction/openai";

const key = "sk-secret-never-log";

async function withFetch(
  response: Response,
  run: (
    request: () => { url: string; init: RequestInit; body: Record<string, unknown> },
  ) => Promise<void>,
) {
  const original = globalThis.fetch;
  let request: { url: string; init: RequestInit; body: Record<string, unknown> } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    request = {
      url: String(url),
      init: init ?? {},
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
    return response;
  }) as typeof fetch;
  try {
    await run(() => {
      assert.ok(request);
      return request;
    });
  } finally {
    globalThis.fetch = original;
  }
}

function success(output: unknown = [{ content: [{ type: "output_text", text: "done" }] }]) {
  return new Response(
    JSON.stringify({ model: "returned-model", output, usage: { input_tokens: 12, output_tokens: 3 } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("sends text and a strict JSON schema and returns model usage", async () => {
  await withFetch(success(), async (getRequest) => {
    const schema = { type: "object", properties: { answer: { type: "string" } } };
    const result = await openAiResponse({
      apiKey: key,
      content: [{ type: "text", text: "question" }],
      systemPrompt: "system",
      jsonSchema: schema,
      modelKind: "text",
      maxOutputTokens: 200,
    });
    const request = getRequest();
    assert.equal(request.url, "https://api.openai.com/v1/responses");
    assert.equal(request.init.method, "POST");
    assert.equal((request.init.headers as Record<string, string>).Authorization, `Bearer ${key}`);
    assert.equal(request.body.store, false);
    assert.equal(request.body.model, "gpt-5.6-luna");
    assert.equal(request.body.max_output_tokens, 200);
    assert.deepEqual(request.body.text, {
      format: { type: "json_schema", name: "extraction_response", schema, strict: true },
    });
    assert.deepEqual(request.body.input, [
      { role: "system", content: [{ type: "input_text", text: "system" }] },
      { role: "user", content: [{ type: "input_text", text: "question" }] },
    ]);
    assert.deepEqual(result, {
      text: "done",
      model: "returned-model",
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });
});

test("maps image and PDF content to Responses API data URLs", async () => {
  await withFetch(success(), async (getRequest) => {
    await openAiResponse({
      apiKey: key,
      content: [
        { type: "image", data: "aW1hZ2U=", mediaType: "image/jpeg" },
        { type: "pdf", data: "cGRm", filename: "logbook.pdf" },
      ],
      modelKind: "vision",
      maxOutputTokens: 100,
    });
    const request = getRequest();
    assert.equal(request.body.model, "gpt-5.6-terra");
    assert.deepEqual(request.body.input, [
      {
        role: "user",
        content: [
          { type: "input_image", image_url: "data:image/jpeg;base64,aW1hZ2U=" },
          {
            type: "input_file",
            file_data: "data:application/pdf;base64,cGRm",
            filename: "logbook.pdf",
          },
        ],
      },
    ]);
  });
});

test("prefers top-level output_text", async () => {
  await withFetch(
    new Response(JSON.stringify({ output_text: "top level", output: [], usage: {} }), {
      headers: { "Content-Type": "application/json" },
    }),
    async () => {
      const result = await openAiResponse({
        apiKey: key,
        content: [{ type: "text", text: "x" }],
        modelKind: "text",
        maxOutputTokens: 10,
      });
      assert.equal(result.text, "top level");
      assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0 });
    },
  );
});

test("non-OK errors do not include API keys or response bodies", async () => {
  const secretBody = "provider says secret account detail";
  await withFetch(new Response(secretBody, { status: 401 }), async () => {
    await assert.rejects(
      openAiResponse({
        apiKey: key,
        content: [{ type: "text", text: "x" }],
        modelKind: "text",
        maxOutputTokens: 10,
      }),
      (error: Error) => {
        assert.equal(error.message, "OpenAI request failed (401)");
        assert.ok(!error.message.includes(key));
        assert.ok(!error.message.includes(secretBody));
        return true;
      },
    );
  });
});
