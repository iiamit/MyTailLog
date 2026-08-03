// The log_entry columns a CSV column can be mapped onto, and their labels.
// Kept apart from map.ts so the import UI (a client component) can render the
// picker without pulling the Anthropic SDK into the browser bundle.

export const IMPORT_FIELDS = [
  "entry_date",
  "description",
  "work_performed",
  "parts",
  "hobbs",
  "tach",
  "airframe",
  "signature_name",
  "mechanic_cert_number",
  "ad_refs",
  "sb_refs",
  "ignore",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABEL: Record<ImportField, string> = {
  entry_date: "Date",
  description: "Description",
  work_performed: "Work performed",
  parts: "Parts",
  hobbs: "Hobbs",
  tach: "Tach",
  airframe: "Airframe time",
  signature_name: "Signature / mechanic",
  mechanic_cert_number: "Certificate #",
  ad_refs: "AD references",
  sb_refs: "SB references",
  ignore: "Don't import",
};
