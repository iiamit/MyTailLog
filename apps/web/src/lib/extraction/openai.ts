export const OPENAI_EXTRACTION_MODEL =
  process.env.OPENAI_EXTRACTION_MODEL || "gpt-5.6-terra";
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna";

export type OpenAiContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mediaType: string }
  | { type: "pdf"; data: string; filename?: string };

export interface OpenAiResponseOptions {
  apiKey: string;
  content: OpenAiContent[];
  systemPrompt?: string;
  jsonSchema?: Record<string, unknown>;
  modelKind: "text" | "vision";
  maxOutputTokens: number;
}

export interface OpenAiResponseResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

type ResponsePayload = {
  model?: unknown;
  output_text?: unknown;
  output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
};

function outputText(payload: ResponsePayload): string {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("");
}

/** Minimal Responses API transport shared by OpenAI BYOK and platform-key calls. */
export async function openAiResponse({
  apiKey,
  content,
  systemPrompt,
  jsonSchema,
  modelKind,
  maxOutputTokens,
}: OpenAiResponseOptions): Promise<OpenAiResponseResult> {
  const model = modelKind === "vision" ? OPENAI_EXTRACTION_MODEL : OPENAI_TEXT_MODEL;
  const input = [
    ...(systemPrompt
      ? [{ role: "system", content: [{ type: "input_text", text: systemPrompt }] }]
      : []),
    {
      role: "user",
      content: content.map((item) => {
        if (item.type === "text") return { type: "input_text", text: item.text };
        const dataUrl = `data:${item.type === "pdf" ? "application/pdf" : item.mediaType};base64,${item.data}`;
        return item.type === "pdf"
          ? { type: "input_file", file_data: dataUrl, filename: item.filename || "document.pdf" }
          : { type: "input_image", image_url: dataUrl };
      }),
    },
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      input,
      max_output_tokens: maxOutputTokens,
      ...(jsonSchema && {
        text: {
          format: {
            type: "json_schema",
            name: "extraction_response",
            schema: jsonSchema,
            strict: true,
          },
        },
      }),
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
  const payload = (await response.json()) as ResponsePayload;
  const text = outputText(payload);
  if (!text) throw new Error("OpenAI response contained no text output");

  return {
    text,
    model: typeof payload.model === "string" ? payload.model : model,
    usage: {
      inputTokens:
        typeof payload.usage?.input_tokens === "number" ? payload.usage.input_tokens : 0,
      outputTokens:
        typeof payload.usage?.output_tokens === "number" ? payload.usage.output_tokens : 0,
    },
  };
}
