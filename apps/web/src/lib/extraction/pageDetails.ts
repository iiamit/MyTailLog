export const CONTENT_KINDS = ["identity", "equipment", "maintenance", "reference", "blank"] as const;
export type ContentKind = typeof CONTENT_KINDS[number];
export const DETAIL_FIELDS = ["make", "model", "serial_number", "part_number", "tail_number"] as const;
export type DetailFields = Partial<Record<typeof DETAIL_FIELDS[number], string>>;
export type IdentitySuggestion = {
  id: string;
  subject: "aircraft" | "engine" | "prop" | "avionics" | "equipment";
  name: string;
  fields: DetailFields;
  quote: string;
  confidence: number;
  status: "pending" | "accepted" | "dismissed";
};

export const PAGE_DETAILS_SCHEMA = {
  content_kinds: { type: "array", items: { type: "string", enum: CONTENT_KINDS } },
  identity_suggestions: {
    type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        subject: { type: "string", enum: ["aircraft", "engine", "prop", "avionics", "equipment"] },
        name: { type: "string" },
        // Empty strings avoid nullable branches that exceed the provider’s compiled grammar limit.
        fields: { type: "object", additionalProperties: false,
          properties: Object.fromEntries(DETAIL_FIELDS.map((k) => [k, { type: "string" }])), required: [...DETAIL_FIELDS] },
        quote: { type: "string" }, confidence: { type: "number" },
      }, required: ["subject", "name", "fields", "quote", "confidence"],
    },
  },
};

export const PAGE_DETAILS_PROMPT = `
- Also classify this page in content_kinds: identity (cover/front matter/identification), equipment (original equipment list or equipment change), maintenance, reference, blank. Mixed pages can have several kinds. A page without maintenance entries is valid, not a failure.
- subject engine means a COMPLETE POWERPLANT, never a vacuum/fuel pump, magneto, alternator, exhaust, cylinder, filter, mount or engine monitor. Use equipment for accessories even when they are in an engine logbook.
- For identity fields that are absent or illegible, return an empty string, never a guessed value.
- Extract identity_suggestions from ALL visible page text, even if entries is empty. Include aircraft, engine, propeller and avionics make, model, serial/part numbers and registration ONLY as printed. Keep each physical component separate; preserve leading zeroes. Supply a verbatim supporting quote and conservative confidence. Never infer missing digits, manufacture dates, or infer that equipment in an old list is installed today. Do not put identity-only information into maintenance entries. Dated installation/removal work still belongs in entries as well.
`;
