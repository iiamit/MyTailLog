import { isEngineComponent } from "../engineComponent";
import { createHash } from "node:crypto";
import { CONTENT_KINDS, DETAIL_FIELDS, type ContentKind, type DetailFields, type IdentitySuggestion } from "./pageDetails";

/** Stable IDs preserve accept/dismiss decisions when a page is read again. Never trust model-supplied IDs or states. */
export function normalizePageDetails(input: unknown): { content_kinds: ContentKind[]; identity_suggestions: IdentitySuggestion[] } {
  const src = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const kinds = Array.isArray(src.content_kinds) ? CONTENT_KINDS.filter((k) => (src.content_kinds as unknown[]).includes(k)) : [];
  const seen = new Set<string>();
  const suggestions: IdentitySuggestion[] = [];
  for (const raw of Array.isArray(src.identity_suggestions) ? src.identity_suggestions.slice(0, 30) : []) {
    if (!raw || typeof raw !== "object" || !["aircraft", "engine", "prop", "avionics", "equipment"].includes(raw.subject)) continue;
    const fields: DetailFields = {};
    const supplied = Array.isArray(raw.fields)
      ? Object.fromEntries(raw.fields.filter((f: unknown) => f && typeof f === "object" && typeof (f as Record<string, unknown>).field === "string").map((f: { field: string; value: unknown }) => [f.field, f.value]))
      : raw.fields;
    for (const k of DETAIL_FIELDS) {
      if (raw.subject === "aircraft" ? k === "part_number" : k === "tail_number") continue;
      if (typeof supplied?.[k] === "string" && supplied[k].trim()) fields[k] = supplied[k].trim().slice(0, 200);
    }
    if (!Object.keys(fields).length || typeof raw.quote !== "string" || !raw.quote.trim()) continue;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 200) : raw.subject;
    const subject = raw.subject === "engine" && !isEngineComponent({ name, category: "engine", model: fields.model }) ? "equipment" : raw.subject;
    const id = createHash("sha256").update(JSON.stringify([subject, name.toLowerCase(), fields])).digest("hex").slice(0, 24);
    if (seen.has(id)) continue;
    seen.add(id);
    suggestions.push({ id, subject, name: name || raw.subject, fields, quote: raw.quote.slice(0, 2000), confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0, status: "pending" });
  }
  return { content_kinds: kinds, identity_suggestions: suggestions };
}
