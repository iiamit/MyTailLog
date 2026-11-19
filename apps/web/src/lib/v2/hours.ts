import type { MeterSource } from "@/lib/due/engine";

/** Where a meter value came from, in words (W-AIRCRAFT-01 "Now"). */
export const SOURCE_WORD: Record<MeterSource, string> = {
  manual: "entered by hand",
  tach_photo: "photo of the tach",
  myflightbook: "MyFlightBook",
  entry: "a logbook entry",
  starting: "the starting reading",
  adsb_estimate: "an ADS-B estimate you accepted",
};

/** hours_reading.source (stored) → the words above; unknown sources read as typed by hand. */
export function storedSourceWord(source: string | null): string {
  if (source === "myflightbook" || source === "mfb") return SOURCE_WORD.myflightbook;
  if (source === "tach_photo") return SOURCE_WORD.tach_photo;
  if (source === "adsb_estimate" || source === "adsb") return SOURCE_WORD.adsb_estimate;
  return SOURCE_WORD.manual;
}

const h1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The Hours and engine verdict (W-AIRCRAFT-01). Null overhaul → the no-overhaul sentence. */
export function engineVerdict(v: {
  sinceOverhaul: number | null;
  overhaulYear: string | null;
  tbo: number | null;
  hoursPerWeek: number | null;
  tboYear: string | null;
}): string {
  if (v.sinceOverhaul == null || !v.overhaulYear) return "No overhaul found in the confirmed entries. Time since overhaul can't be counted yet.";
  const first = `The engine has run ${h1(v.sinceOverhaul)} hours since its ${v.overhaulYear} overhaul.`;
  if (!v.tbo || !v.tboYear || !v.hoursPerWeek) return first;
  return `${first} At about ${h1(v.hoursPerWeek)} hours a week, the ${Math.round(v.tbo).toLocaleString("en-US")}-hour TBO comes about ${v.tboYear}.`;
}

/** "every {min} to {max} h" over measured oil-change intervals, or null with fewer than two. */
export function oilSpread(intervals: number[]): string | null {
  if (intervals.length < 2) return null;
  return `every ${Math.round(Math.min(...intervals))} to ${Math.round(Math.max(...intervals))} h`;
}

/** Linear date → x in [x0, x1] between two ISO dates (the engine line's axis). */
export function dateX(date: string, from: string, to: string, x0: number, x1: number): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!(b > a)) return x0;
  return x0 + Math.min(1, Math.max(0, (t - a) / (b - a))) * (x1 - x0);
}

/** Parse a form number: blank → null, junk → NaN (the write rejects it with its own message). */
export function formNumber(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
}
