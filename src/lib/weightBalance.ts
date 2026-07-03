// ===========================================================================
// Weight & Balance helpers — pure functions over already-loaded data.
//
// A W&B record ties together empty weight, CG arm, and moment by the identity
// moment = weight × arm. Given any two, the third is derived. The "stale" check
// flags equipment changes recorded after the most recent W&B revision.
// ===========================================================================

export type WBTriple = {
  weight: number | null;
  arm: number | null;
  moment: number | null;
};

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Fill the one missing value of weight/arm/moment from the other two. */
export function completeWB({ weight, arm, moment }: WBTriple): WBTriple {
  if (weight != null && arm != null && moment == null) {
    moment = round(weight * arm, 2);
  } else if (weight != null && moment != null && arm == null && weight !== 0) {
    arm = round(moment / weight, 3);
  } else if (arm != null && moment != null && weight == null && arm !== 0) {
    weight = round(moment / arm, 2);
  }
  return { weight, arm, moment };
}

/** Useful load = max gross − empty weight, when both are known. */
export function usefulLoad(
  emptyWeight: number | null,
  maxGross: number | null,
): number | null {
  if (emptyWeight == null || maxGross == null) return null;
  return round(maxGross - emptyWeight, 2);
}

export type EquipChange = {
  name: string;
  date: string; // YYYY-MM-DD
  kind: "install" | "removal";
};

/**
 * Equipment changes recorded strictly after the most recent W&B revision (or
 * all of them if there's no W&B on file). These are the ones whose weight
 * effect may not be reflected in the current W&B — surfaced as a records gap.
 */
export function staleWBChanges(
  latestWBDate: string | null,
  changes: EquipChange[],
): EquipChange[] {
  const after = latestWBDate
    ? changes.filter((c) => c.date > latestWBDate)
    : [...changes];
  return after.sort((a, b) => b.date.localeCompare(a.date));
}
