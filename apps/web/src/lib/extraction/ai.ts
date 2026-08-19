import type Anthropic from "@anthropic-ai/sdk";
import { currentAiContext } from "./aiContext";
import { EXTRACTION_MODEL, getAnthropic, reasoningParams, TEXT_MODEL } from "./anthropic";
import { openAiResponse, type OpenAiContent } from "./openai";

export type AiContent = OpenAiContent;
export type GenerateAiOptions = {
  modelKind: "text" | "ocr" | "handwriting";
  systemPrompt: string;
  content: AiContent[];
  jsonSchema?: Record<string, unknown>;
  maxOutputTokens: number;
};

export async function generateAi(options: GenerateAiOptions): Promise<{ text: string; stopReason: string | null }> {
  const ctx = currentAiContext();
  if (ctx.provider === "openai") {
    const result = await openAiResponse({ apiKey: ctx.apiKey, ...options });
    await ctx.onUsage?.({ provider: "openai", model: result.model, ...result.usage });
    return { text: result.text, stopReason: null };
  }

  const model = options.modelKind === "text" ? TEXT_MODEL : EXTRACTION_MODEL;
  const { thinking, effort } = reasoningParams(model);
  const response = await getAnthropic().messages.create({
    model,
    max_tokens: options.maxOutputTokens,
    system: options.systemPrompt,
    ...(thinking ? { thinking } : {}),
    ...(options.jsonSchema
      ? { output_config: { ...(effort ? { effort } : {}), format: { type: "json_schema", schema: options.jsonSchema } } }
      : {}),
    messages: [{
      role: "user",
      content: options.content.map((part) => {
        if (part.type === "text") return part;
        if (part.type === "image") {
          return { type: "image", source: { type: "base64", media_type: part.mediaType, data: part.data } };
        }
        return { type: "document", source: { type: "base64", media_type: "application/pdf", data: part.data } };
      }) as Anthropic.ContentBlockParam[],
    }],
  });
  return {
    text: response.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
    stopReason: response.stop_reason,
  };
}
