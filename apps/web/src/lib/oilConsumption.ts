// Oil consumption from a top-off log. Between two consecutive top-offs the
// engine burned roughly the quarts added at the second one over the hours flown
// between them → "hours per quart" (higher is healthier). Pure + client-safe.

export type OilAdditionInput = {
  added_date: string | null;
  quarts: number;
  tach: number | null;
  hobbs: number | null;
};

export type ConsumptionPoint = {
  date: string | null;
  hours: number; // engine hours since the previous top-off
  quarts: number; // quarts added at this top-off
  hoursPerQuart: number;
};

export type OilConsumption = {
  points: ConsumptionPoint[];
  avgHoursPerQuart: number | null; // simple mean of the intervals
};

/**
 * Compute the burn-rate trend. Uses tach as the engine-hour meter (falls back to
 * hobbs), orders by that meter, and measures each interval between consecutive
 * top-offs. Needs ≥2 metered top-offs to produce any point.
 */
export function oilConsumption(additions: OilAdditionInput[]): OilConsumption {
  const metered = additions
    .map((a) => ({ ...a, meter: a.tach ?? a.hobbs }))
    .filter((a): a is typeof a & { meter: number } => a.meter != null && a.quarts > 0)
    .sort((x, y) => x.meter - y.meter);

  const points: ConsumptionPoint[] = [];
  for (let i = 1; i < metered.length; i++) {
    const hours = metered[i].meter - metered[i - 1].meter;
    if (hours <= 0) continue; // same/decreasing meter — can't measure
    points.push({
      date: metered[i].added_date,
      hours,
      quarts: metered[i].quarts,
      hoursPerQuart: hours / metered[i].quarts,
    });
  }

  const avg = points.length
    ? points.reduce((s, p) => s + p.hoursPerQuart, 0) / points.length
    : null;
  return { points, avgHoursPerQuart: avg };
}
