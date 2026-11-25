import type { HoursReading, MeterResetRow, LogEntry } from "@/lib/database.types";
export type UsageDenominator = {
  hours: number | null;
  meter: "tach" | "hobbs" | null;
  source: string;
  coverage: "unavailable" | "reviewed_meter_interval";
  from: string | null;
  to: string | null;
  readingIds: string[];
};
type EntryReading = Pick<LogEntry, "id" | "entry_date" | "hobbs" | "tach" | "owner_confirmed" | "authored_superseded_by" | "created_at">;

export function periodUsage(
  readings: HoursReading[],
  resets: MeterResetRow[],
  from: string | null,
  to: string | null,
  entries: EntryReading[] = [],
): UsageDenominator {
  const unavailable: UsageDenominator = {
    hours: null,
    meter: null,
    source:
      "Choose a period containing at least two dated, verified readings on the same meter, with increasing hours and no meter replacement between them.",
    coverage: "unavailable",
    from,
    to,
    readingIds: [],
  };
  if (!from || !to || from >= to) return unavailable;
  const combined = [...readings, ...entries
    .filter(e => e.owner_confirmed && !e.authored_superseded_by)
    .map(e => ({ id: e.id, reading_date: e.entry_date, hobbs: e.hobbs, tach: e.tach, source: "entry", hours_reviewed_at: e.created_at, created_at: e.created_at }))];
  let best: UsageDenominator = unavailable;
  let widest = 0;
  for (const meter of ["hobbs", "tach"] as const) {
    const rows = combined
      .filter(
        (r) =>
          r.reading_date &&
          r.reading_date >= from &&
          r.reading_date <= to &&
          (r.hours_reviewed_at || r.source === "manual") &&
          !String(r.source ?? "").endsWith("_estimate") &&
          typeof r[meter] === "number" &&
          Number.isFinite(r[meter]) && r[meter]! >= 0,
      )
      .sort(
        (a, b) =>
          a.reading_date!.localeCompare(b.reading_date!) ||
          a.created_at.localeCompare(b.created_at),
      );
    if (
      rows.length < 2 ||
      rows[0].reading_date === rows.at(-1)?.reading_date ||
      rows.some(
        (r, i: number) =>
          i > 0 && r[meter]! < rows[i - 1][meter]!,
      )
    )
      continue;
    const first = rows[0],
      last = rows[rows.length - 1],
      hours = Math.round((last[meter]! - first[meter]!) * 10) / 10;
    const start = first.reading_date!, end = last.reading_date!;
    const span = Date.parse(end) - Date.parse(start);
    if (hours <= 0 || span <= widest || resets.some(r => r.meter === meter && r.reset_date > start && r.reset_date <= end)) continue;
    widest = span;
    best = {
      hours,
      meter,
      source: `Cost per hour uses recorded spending and ${hours} ${meter} hours from ${start} through ${end}. Dates outside this measured interval are excluded from the rate; the full selected-period totals stay unchanged.`,
      coverage: "reviewed_meter_interval",
      from: start,
      to: end,
      readingIds: [first.id, last.id],
    };
  }
  return best;
}
