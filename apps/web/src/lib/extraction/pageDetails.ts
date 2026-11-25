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
  content_kinds: { type: "array", items: { type: "string", description: "One of identity, equipment, maintenance, reference, blank." } },
  identity_suggestions: {
    type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        subject: { type: "string", description: "One of aircraft, engine, prop, avionics, equipment." },
        name: { type: "string" },
        // A compact list avoids the grammar explosion of another fixed-field object.
        fields: { type: "array", items: { type: "object", additionalProperties: false,
          properties: { field: { type: "string" }, value: { type: "string" } }, required: ["field", "value"] } },
        quote: { type: "string" }, confidence: { type: "number" },
      }, required: ["subject", "name", "fields", "quote", "confidence"],
    },
  },
};

export const PAGE_DETAILS_PROMPT = `
- Also classify this page in content_kinds: identity (cover/front matter/identification), equipment (original equipment list or equipment change), maintenance, reference, blank. Mixed pages can have several kinds. A page without maintenance entries is valid, not a failure.
- subject engine means a COMPLETE POWERPLANT, never a vacuum/fuel pump, magneto, alternator, exhaust, cylinder, filter, mount or engine monitor. Use equipment for accessories even when they are in an engine logbook.
- Return identity fields as a list of {field, value} objects. Allowed field names: make, model, serial_number, part_number, tail_number. Omit absent or illegible fields; never guess a value.
- Extract identity_suggestions from ALL visible page text, even if entries is empty. Include aircraft, engine, propeller and avionics make, model, serial/part numbers and registration ONLY as printed. Keep each physical component separate; preserve leading zeroes. Supply a verbatim supporting quote and conservative confidence. Never infer missing digits, manufacture dates, or infer that equipment in an old list is installed today. Do not put identity-only information into maintenance entries. Dated installation/removal work still belongs in entries as well.
`;
