import type { HoursReading, MeterResetRow } from "@/lib/database.types";
export type UsageDenominator = {
  hours: number | null;
  meter: "tach" | "hobbs" | null;
  source: string;
  coverage: "unavailable" | "reviewed_meter_interval";
  from: string | null;
  to: string | null;
  readingIds: string[];
};
export function periodUsage(
  readings: HoursReading[],
  resets: MeterResetRow[],
  from: string | null,
  to: string | null,
): UsageDenominator {
  const unavailable: UsageDenominator = {
    hours: null,
    meter: null,
    source:
      "Select a period with reviewed readings on both boundary dates; cost per hour is withheld until those hours are known.",
    coverage: "unavailable",
    from,
    to,
    readingIds: [],
  };
  if (!from || !to || from >= to) return unavailable;
  for (const meter of ["hobbs", "tach"] as const) {
    if (
      resets.some(
        (r) => r.meter === meter && r.reset_date > from && r.reset_date <= to,
      )
    )
      continue;
    const rows: HoursReading[] = readings
      .filter(
        (r) =>
          r.reading_date &&
          r.reading_date >= from &&
          r.reading_date <= to &&
          r.hours_reviewed_at &&
          !String(r.source ?? "").endsWith("_estimate") &&
          typeof r[meter] === "number" &&
          Number.isFinite(r[meter]),
      )
      .sort(
        (a, b) =>
          a.reading_date!.localeCompare(b.reading_date!) ||
          a.created_at.localeCompare(b.created_at),
      );
    if (
      rows.length < 2 ||
      rows[0].reading_date !== from ||
      rows.at(-1)?.reading_date !== to ||
      rows.some(
        (r: HoursReading, i: number) =>
          i > 0 && r[meter]! < rows[i - 1][meter]!,
      )
    )
      continue;
    const first = rows[0],
      last = rows[rows.length - 1],
      hours = Math.round((last[meter]! - first[meter]!) * 10) / 10;
    if (hours <= 0) continue;
    return {
      hours,
      meter,
      source: `Reviewed ${meter} readings between ${from} and ${to}; this is the measured interval, not a flight-count estimate.`,
      coverage: "reviewed_meter_interval",
      from,
      to,
      readingIds: [first.id, last.id],
    };
  }
  return unavailable;
}
