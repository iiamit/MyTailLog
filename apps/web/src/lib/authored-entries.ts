// Entry wording is intentionally factual. Appendix A lists eligible work; it
// does not supply a universal logbook sentence or authorize a particular pilot.
export type TemplateId = "oil_filter" | "tire" | "spark_plug" | "battery" | "general";
export type TemplateField = { key: string; label: string; required?: boolean; hint?: string };
export type EntryTemplate = {
  id: TemplateId;
  title: string;
  category: "preventive" | "maintenance";
  source: string;
  fields: TemplateField[];
};

export const TEMPLATES: EntryTemplate[] = [
  {
    id: "oil_filter", title: "Oil and filter service", category: "preventive",
    source: "14 CFR Part 43 Appendix A(c)(23) — oil filter element; confirm the complete work is eligible for this aircraft.",
    fields: [
      { key: "oil", label: "Oil brand and type", required: true },
      { key: "quantity", label: "Oil quantity and unit", required: true },
      { key: "filter", label: "Filter brand, model and part number", required: true },
      { key: "filter_findings", label: "Removed filter inspection findings", required: true, hint: "Describe what you actually found; do not assume it was clean." },
      { key: "instructions", label: "Maintenance instructions / revision", required: true },
      { key: "checks", label: "Checks actually performed", required: true },
    ],
  },
  {
    id: "tire", title: "Tire replacement", category: "preventive",
    source: "14 CFR Part 43 Appendix A(c)(1).",
    fields: [
      { key: "position", label: "Wheel position", required: true },
      { key: "tire", label: "Tire brand, size and part number", required: true },
      { key: "tube", label: "Tube details (if fitted)" },
      { key: "pressure", label: "Inflation pressure and unit", required: true },
      { key: "instructions", label: "Maintenance instructions / revision", required: true },
      { key: "checks", label: "Checks actually performed", required: true },
    ],
  },
  {
    id: "spark_plug", title: "Spark-plug service", category: "preventive",
    source: "14 CFR Part 43 Appendix A(c)(20).",
    fields: [
      { key: "plugs", label: "Plugs cleaned or replaced, and part numbers", required: true },
      { key: "gap", label: "Gap setting and unit", required: true },
      { key: "instructions", label: "Maintenance instructions / revision", required: true },
      { key: "checks", label: "Checks actually performed", required: true },
    ],
  },
  {
    id: "battery", title: "Battery service", category: "preventive",
    source: "14 CFR Part 43 Appendix A(c)(24).",
    fields: [
      { key: "work", label: "Battery work performed", required: true },
      { key: "battery", label: "Battery manufacturer, model and part number", required: true },
      { key: "instructions", label: "Maintenance instructions / revision", required: true },
      { key: "checks", label: "Checks actually performed", required: true },
    ],
  },
  {
    id: "general", title: "General maintenance", category: "maintenance",
    source: "14 CFR 43.9. Only sign work within your certificate privileges.",
    fields: [{ key: "work", label: "Work performed and method / data reference", required: true }],
  },
];

export const TEMPLATE_VERSION = 1;

export function templateWork(id: TemplateId, values: Record<string, string>): string {
  const v = (key: string) => (values[key] ?? "").trim();
  switch (id) {
    case "oil_filter":
      return `Drained engine oil and replaced oil filter element with ${v("filter")}. Added ${v("quantity")} of ${v("oil")}. Removed filter findings: ${v("filter_findings")}. Work performed in accordance with ${v("instructions")}. Checks performed: ${v("checks")}.`;
    case "tire":
      return `Replaced ${v("position")} tire with ${v("tire")}${v("tube") ? ` and tube ${v("tube")}` : ""}. Inflated to ${v("pressure")}. Work performed in accordance with ${v("instructions")}. Checks performed: ${v("checks")}.`;
    case "spark_plug":
      return `Serviced spark plugs: ${v("plugs")}. Set gap to ${v("gap")}. Work performed in accordance with ${v("instructions")}. Checks performed: ${v("checks")}.`;
    case "battery":
      return `${v("work")}. Battery: ${v("battery")}. Work performed in accordance with ${v("instructions")}. Checks performed: ${v("checks")}.`;
    case "general":
      return v("work");
  }
}

export function missingTemplateFields(id: TemplateId, values: Record<string, string>): string[] {
  return (TEMPLATES.find((t) => t.id === id)?.fields ?? [])
    .filter((field) => field.required && !values[field.key]?.trim())
    .map((field) => field.label);
}
