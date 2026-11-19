import type { OilAnalysisSample } from "@/lib/database.types";

/** Wear metal vs the lab's universal average: "twice" at 2× or more, "above" over it (heuristic; the lab's words count). */
export function metalFlag(ppm: number | null | undefined, avg: number | null | undefined): "twice" | "above" | null {
  if (ppm == null || avg == null || avg <= 0) return null;
  if (ppm >= 2 * avg) return "twice";
  return ppm > avg ? "above" : null;
}

export const ppm = (s: Pick<OilAnalysisSample, "elements_ppm">, el: string): number | null => {
  const v = (s.elements_ppm as Record<string, number> | null)?.[el];
  return typeof v === "number" ? v : null;
};
export const avgOf = (s: Pick<OilAnalysisSample, "universal_averages">, el: string): number | null => {
  const v = (s.universal_averages as Record<string, number> | null)?.[el];
  return typeof v === "number" ? v : null;
};

const fmtHpq = (x: number) => (Math.round(x * 10) / 10).toString();

/**
 * The Oil analysis verdict (W-AIRCRAFT-02). The lab's own comment outranks our ppm heuristics, so the latest
 * sample's assessment is quoted rather than summarised; the burn rate follows when there is one.
 */
export function oilVerdict(
  samples: Pick<OilAnalysisSample, "sample_date" | "lab_comments">[],
  hoursPerQuart: number | null,
  fmt: (d: string) => string,
): string {
  const burn = hoursPerQuart != null ? ` Oil use averages 1 quart every ${fmtHpq(hoursPerQuart)} hours.` : "";
  if (samples.length === 0) return `No lab reports yet.${burn}`;
  const latest = samples[samples.length - 1];
  const count = samples.length === 1 ? "One lab report." : `${samples.length} lab reports.`;
  const says = latest.lab_comments?.trim()
    ? ` The lab said of the ${fmt(latest.sample_date)} sample: “${latest.lab_comments.trim()}”`
    : ` The ${fmt(latest.sample_date)} sample has no written assessment.`;
  return `${count}${says}${burn}`;
}
