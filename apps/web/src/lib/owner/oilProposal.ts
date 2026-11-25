import { isDate } from "./validation";
export function checkOilProposal(proposal: Record<string, unknown>) {
  if (
    !Array.isArray(proposal.samples) ||
    !proposal.samples.length ||
    proposal.samples.length > 100
  )
    throw new Error("Review 1 to 100 dated oil samples first.");
  const seen = new Set<string>();
  for (const sample of proposal.samples) {
    if (!sample || typeof sample !== "object" || !isDate(sample.sample_date))
      throw new Error("Each oil sample needs a valid date.");
    if (seen.has(sample.sample_date))
      throw new Error(
        "A report cannot contain two samples with the same date for one engine.",
      );
    seen.add(sample.sample_date);
    for (const key of ["oil_hours", "engine_hours", "oil_added_quarts"]) {
      const value = sample[key];
      if (
        value != null &&
        (!Number.isFinite(value) || value < 0 || value > 999999)
      )
        throw new Error(`Check ${key.replaceAll("_", " ")}.`);
    }
    for (const key of ["elements_ppm", "oil_properties"]) {
      const map = sample[key];
      if (map == null) continue;
      if (
        typeof map !== "object" ||
        Array.isArray(map) ||
        Object.keys(map).length > 100 ||
        Object.values(map).some(
          (v) =>
            typeof v !== "number" ||
            !Number.isFinite(v) ||
            v < 0 ||
            v > 1_000_000,
        )
      )
        throw new Error("Check the oil report's measured values.");
    }
  }
  if (proposal.report_date != null && !isDate(proposal.report_date))
    throw new Error("Check the report date.");
}
