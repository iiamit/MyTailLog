// Oil consumption from a top-off log. Between two consecutive top-offs the
// engine burned roughly the quarts added at the second one over the hours flown
// between them → "hours per quart" (higher is healthier). Pure + client-safe.

import { tachFromHobbs, type TachBridge } from "./hobbsTach";

export type Meter = "tach" | "hobbs";
export type { TachBridge };

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
  /** Either endpoint's tach was bridged from hobbs rather than read off the meter. */
  estimated: boolean;
};

export type OilConsumption = {
  points: ConsumptionPoint[];
  avgHoursPerQuart: number | null; // simple mean of the intervals
  /** Which meter the whole series was measured on — null when none was usable. */
  meter: Meter | null;
  /** Top-offs left out because they carry no reading on that meter. */
  excluded: number;
  /** Top-offs whose tach was derived from hobbs via the aircraft's ratio. */
  bridged: number;
};

/**
 * Pick ONE meter for the entire series.
 *
 * This used to be decided per row (`a.tach ?? a.hobbs`), which is a trap: a
 * top-off logged with tach only (~4141) and the next logged with hobbs only
 * (~965) were then sorted and subtracted against each other. Observed on a real
 * aircraft — 19 hours of flying on one quart came out as 3176 "hours" and
 * 453 h/qt, attributed to the wrong date because the mixed-scale sort had also
 * reversed the order. Every part of that error points the reassuring way, which
 * is the wrong direction to be wrong about oil consumption.
 *
 * Tach wins when it can: it is the engine-time meter oil burn is actually a
 * function of, and hobbs over-reads it (it runs on the ground). Hobbs is used
 * only when tach can't produce a single interval.
 */
function chooseMeter(additions: OilAdditionInput[]): Meter | null {
  const usable = (m: Meter) => additions.filter((a) => a[m] != null && a.quarts > 0).length;
  if (usable("tach") >= 2) return "tach";
  if (usable("hobbs") >= 2) return "hobbs";
  return null;
}

/**
 * Compute the burn-rate trend: consecutive top-offs on ONE meter, ordered by it.
 * Needs ≥2 top-offs carrying that meter to produce any point. Anything without
 * it is counted in `excluded` rather than silently dropped, so the UI can say
 * why a top-off you entered isn't on the chart.
 */
export function oilConsumption(
  additions: OilAdditionInput[],
  bridge?: TachBridge | null,
): OilConsumption {
  const withQuarts = additions.filter((a) => a.quarts > 0);

  // With a usable bridge every top-off can be expressed in TACH — including the
  // hobbs-only ones — so nothing has to be dropped and the whole series sits on
  // the meter oil burn actually follows. A `default` ratio is refused: that's a
  // generic constant, not this aircraft, and inventing engine hours from it is
  // worse than measuring on hobbs.
  const canBridge = !!bridge && bridge.confidence !== "default";

  if (canBridge) {
    const metered = withQuarts
      .map((a) => ({
        ...a,
        value: a.tach ?? (a.hobbs != null ? tachFromHobbs(bridge, a.hobbs) : null),
        derived: a.tach == null && a.hobbs != null,
      }))
      .filter((a): a is typeof a & { value: number } => a.value != null)
      .sort((x, y) => x.value - y.value);
    return build(metered, "tach", withQuarts.length - metered.length);
  }

  const meter = chooseMeter(additions);
  if (!meter) {
    return {
      points: [],
      avgHoursPerQuart: null,
      meter: null,
      excluded: withQuarts.length,
      bridged: 0,
    };
  }

  const metered = withQuarts
    .map((a) => ({ ...a, value: a[meter], derived: false }))
    .filter((a): a is typeof a & { value: number } => a.value != null)
    .sort((x, y) => x.value - y.value);
  return build(metered, meter, withQuarts.length - metered.length);
}

type Metered = OilAdditionInput & { value: number; derived: boolean };

function build(metered: Metered[], meter: Meter, excluded: number): OilConsumption {

  const points: ConsumptionPoint[] = [];
  for (let i = 1; i < metered.length; i++) {
    const hours = metered[i].value - metered[i - 1].value;
    if (hours <= 0) continue; // same/decreasing meter — can't measure
    points.push({
      date: metered[i].added_date,
      hours,
      quarts: metered[i].quarts,
      hoursPerQuart: hours / metered[i].quarts,
      // An interval is only as solid as its weaker end.
      estimated: metered[i].derived || metered[i - 1].derived,
    });
  }

  const avg = points.length
    ? points.reduce((s, p) => s + p.hoursPerQuart, 0) / points.length
    : null;
  return {
    points,
    avgHoursPerQuart: avg,
    meter,
    excluded,
    bridged: metered.filter((m) => m.derived).length,
  };
}
