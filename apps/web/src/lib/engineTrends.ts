// Historical engine observations are derived from the owner's log entries.
// Only unambiguous written values become chart points; the source entry remains
// editable, so correcting its transcription corrects the trend on the next load.

export type TrendEntry = {
  id: string;
  page_id: string | null;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  owner_confirmed: boolean;
  authored_superseded_by?: string | null;
};

export type CompressionReading = { cylinder: number; psi: number; reference: number };
export type CompressionTest = {
  entryId: string;
  pageId: string | null;
  date: string | null;
  confirmed: boolean;
  readings: CompressionReading[];
  source: string;
};
export type OilChange = {
  entryId: string;
  pageId: string | null;
  date: string | null;
  confirmed: boolean;
  tach: number | null;
  hobbs: number | null;
};
export type OilInterval = {
  from: OilChange;
  to: OilChange;
  meter: "tach" | "hobbs";
  hours: number;
};

const validReading = (cylinder: number, psi: number, reference: number) =>
  Number.isInteger(cylinder) && cylinder >= 1 && cylinder <= 12 &&
  Number.isInteger(psi) && psi >= 0 && psi <= 120 &&
  Number.isInteger(reference) && reference >= 70 && reference <= 120 && psi <= reference;

/** A cautious subset of common logbook notations. No cylinder identity → no point. */
export function parseCompression(text: string): CompressionReading[] {
  if (!/\bcompress(?:ion|ions)?\b|\bdifferential pressure\b|\bcyl(?:inder)?\.?\s*#?\s*\d/i.test(text)) return [];
  const readings: CompressionReading[] = [];
  const explicit = /(?:\bcyl(?:inder)?\.?\s*(?:no\.?\s*)?#?|#)\s*([1-9]\d?)\s*(?:[:=\-]\s*|\s+)(\d{1,3})\s*\/\s*(\d{1,3})/gi;
  for (const match of text.matchAll(explicit)) {
    readings.push({ cylinder: Number(match[1]), psi: Number(match[2]), reference: Number(match[3]) });
  }
  if (readings.length === 0) {
    const after = text.match(/\bcompress(?:ion|ions)?\b[\s\S]{0,35}?((?:\d{1,3}\s*\/\s*){2,11}\d{1,3})\s+(?:over|\/|of)\s*(\d{2,3})/i);
    if (after) {
      const values = after[1].split(/\s*\/\s*/).map(Number);
      readings.push(...values.map((psi, i) => ({ cylinder: i + 1, psi, reference: Number(after[2]) })));
    } else {
      const context = text.match(/\bcompress(?:ion|ions)?\b([\s\S]{0,180})/i)?.[1] ?? "";
      const pairs = [...context.matchAll(/\b(\d{1,3})\s*\/\s*(\d{2,3})\b/g)];
      if (pairs.length >= 2 && pairs.length <= 12) {
        readings.push(...pairs.map((m, i) => ({ cylinder: i + 1, psi: Number(m[1]), reference: Number(m[2]) })));
      }
    }
  }
  if (!readings.length || readings.some((r) => !validReading(r.cylinder, r.psi, r.reference))) return [];
  if (new Set(readings.map((r) => r.cylinder)).size !== readings.length) return [];
  return readings.sort((a, b) => a.cylinder - b.cylinder);
}

export function isOilChange(text: string): boolean {
  if (!/\boil\b/i.test(text)) return false;
  return /\boil\s+(?:and\s+filter\s+)?(?:chang(?:e|ed)|servic(?:e|ed))\b/i.test(text) ||
    /\b(?:chang(?:e|ed)|replac(?:e|ed)|servic(?:e|ed))\s+(?:engine\s+)?oil\b(?!\s+filter\b)/i.test(text) ||
    /\bdrain(?:ed)?\b[\s\S]{0,90}\b(?:oil|sump)\b[\s\S]{0,90}\brefill(?:ed)?\b/i.test(text);
}

const dateValue = (date: string | null) => date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
const entryText = (e: TrendEntry) => [e.description, e.work_performed, e.parts].filter(Boolean).join(" ");

export function engineTrends(entries: TrendEntry[], resets: { meter: string; reset_date: string }[] = []) {
  const compression: CompressionTest[] = [];
  const needsReview: { entryId: string; pageId: string | null; date: string | null; reason: string }[] = [];
  const oilChanges: OilChange[] = [];
  for (const e of entries) {
    if (e.authored_superseded_by) continue;
    const text = entryText(e);
    const readings = parseCompression(text);
    if (/\bcompress(?:ion|ions)?\b|\bdifferential pressure\b/i.test(text) && !readings.length) {
      needsReview.push({ entryId: e.id, pageId: e.page_id, date: e.entry_date, reason: "Compression mentioned; cylinder readings need review" });
    }
    if (readings.length) compression.push({
      entryId: e.id, pageId: e.page_id, date: e.entry_date,
      confirmed: e.owner_confirmed, readings,
      source: text.slice(0, 240),
    });
    if (isOilChange(text)) oilChanges.push({
      entryId: e.id, pageId: e.page_id, date: e.entry_date,
      confirmed: e.owner_confirmed, tach: e.tach, hobbs: e.hobbs,
    });
  }
  compression.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  oilChanges.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const confirmedOil = oilChanges.filter((e) => e.confirmed && Number.isFinite(dateValue(e.date)));
  const oilIntervals: OilInterval[] = [];
  for (let i = 1; i < confirmedOil.length; i++) {
    const from = confirmedOil[i - 1];
    const to = confirmedOil[i];
    const meter = from.hobbs != null && to.hobbs != null ? "hobbs" :
      from.tach != null && to.tach != null ? "tach" : null;
    if (!meter || !from.date || !to.date || from.date === to.date) continue;
    if (resets.some((r) => r.meter === meter && r.reset_date > from.date! && r.reset_date <= to.date!)) continue;
    const hours = Number((to[meter]! - from[meter]!).toFixed(1));
    if (hours > 0) oilIntervals.push({ from, to, meter, hours });
  }
  return { compression, needsReview, oilChanges, oilIntervals };
}
