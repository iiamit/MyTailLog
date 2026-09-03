import { pageNeedsReview } from "@/lib/pageStatus";
import { CONFIDENCE_THRESHOLD, isEntryClean, type FieldBox } from "@/lib/extraction/schema";

// Review rules — every branch the phone's review screens rely on, kept free of
// Capacitor and React so apps/web/test/mobile-review-rules.test.ts can load it.
//
// Same rules as the web reviewer (pageNeedsReview, isEntryClean, the 0.75
// threshold) — imported, not copied, so the phone and the web never disagree
// about which page still needs a look.

export type ReviewPage = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  page_sequence: number | null;
  ocr_text: string | null;
  review_status: "unreviewed" | "confirmed" | "disputed";
  extraction_status: string;
  updated_at: string;
};

export type ReviewEntry = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  page_id: string | null;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[] | null;
  sb_refs: string[] | null;
  confidence: number | null;
  field_confidence: Record<string, number> | null;
  field_boxes: Record<string, FieldBox | null> | null;
  owner_confirmed: boolean;
  is_continuation: boolean;
  entry_index: number | null;
  updated_at: string;
};

export type ReadingRow = {
  id: string;
  aircraft_id: string;
  reading_date: string | null;
  tach: number | null;
  hobbs: number | null;
  airframe: number | null;
  source: string;
  created_at: string;
  updated_at: string;
};

// --- Which pages still need a look ------------------------------------------

/** Entries on a page, in the order they appear on it. */
export function entriesOn(entries: ReviewEntry[], pageId: string): ReviewEntry[] {
  return entries.filter((e) => e.page_id === pageId).sort((a, b) => (a.entry_index ?? 1e9) - (b.entry_index ?? 1e9));
}

/** The same rule the web pages list uses — extracted AND holding an unconfirmed entry. */
export function pageNeedsLook(page: { id: string; extraction_status: string }, entries: ReviewEntry[]): boolean {
  const on = entries.filter((e) => e.page_id === page.id);
  return pageNeedsReview({
    extractionStatus: page.extraction_status,
    entryCount: on.length,
    unconfirmedCount: on.filter((e) => !e.owner_confirmed).length,
  });
}

/** Ids of the entries "Confirm N clean" will confirm — mirrors entries.confirmClean on the server. */
export function cleanUnconfirmed(entries: ReviewEntry[]): string[] {
  return entries.filter((e) => !e.owner_confirmed && isEntryClean(e)).map((e) => e.id);
}

// --- Per-field chips ----------------------------------------------------------

/**
 * A field's chip. Owner's language: the number is a model score nobody flies
 * against, so it is shown as a word. Fields the model was sure about get no
 * chip at all — the eye should land on the doubtful ones.
 */
export function fieldChip(fc: Record<string, number> | null | undefined, field: string): "check" | null {
  const v = fc?.[field];
  return typeof v === "number" && v < CONFIDENCE_THRESHOLD ? "check" : null;
}

export function entryBadge(e: Pick<ReviewEntry, "owner_confirmed" | "is_continuation" | "confidence" | "field_confidence">): string {
  if (e.owner_confirmed) return "Confirmed";
  if (e.is_continuation) return "Continues from the previous page";
  return isEntryClean(e) ? "Looks right" : "Needs a look";
}

// --- Editing ---------------------------------------------------------------------

export type EntryForm = {
  entry_date: string;
  tach: string;
  hobbs: string;
  airframe: string;
  description: string;
  work_performed: string;
  parts: string;
  signature_name: string;
  mechanic_cert_number: string;
  ad_refs: string;
  sb_refs: string;
};

export type EntryFieldValues = {
  entry_date: string | null;
  tach: number | null;
  hobbs: number | null;
  airframe: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
};

export function toForm(e: Partial<ReviewEntry> | null): EntryForm {
  const n = (v: number | null | undefined) => (v == null ? "" : String(v));
  return {
    entry_date: e?.entry_date ?? "",
    tach: n(e?.tach),
    hobbs: n(e?.hobbs),
    airframe: n(e?.airframe),
    description: e?.description ?? "",
    work_performed: e?.work_performed ?? "",
    parts: e?.parts ?? "",
    signature_name: e?.signature_name ?? "",
    mechanic_cert_number: e?.mechanic_cert_number ?? "",
    ad_refs: (e?.ad_refs ?? []).join(", "),
    sb_refs: (e?.sb_refs ?? []).join(", "),
  };
}

const splitRefs = (s: string) => s.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);

/**
 * Validate the sheet at the trust boundary between the keyboard and the queue.
 * Returns the typed payload for entry.update / entry.create, or the one thing
 * to fix, in the owner's words.
 */
export function validateEntry(f: EntryForm): { fields: EntryFieldValues } | { error: string } {
  const date = f.entry_date.trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date from the calendar." };
  // Date.parse rolls "2026-02-31" over to March; only a date that survives the round trip exists.
  const parsed = new Date(`${date}T00:00:00Z`);
  if (date && (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)) return { error: "That date doesn't exist." };
  const meters: Partial<Record<"tach" | "hobbs" | "airframe", number | null>> = {};
  for (const k of ["tach", "hobbs", "airframe"] as const) {
    const raw = f[k].trim();
    if (!raw) { meters[k] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: `${k === "airframe" ? "Airframe total" : k[0].toUpperCase() + k.slice(1)} must be a number of hours.` };
    meters[k] = Math.round(n * 10) / 10;
  }
  const t = (s: string) => s.trim() || null;
  const fields: EntryFieldValues = {
    entry_date: date || null,
    tach: meters.tach ?? null,
    hobbs: meters.hobbs ?? null,
    airframe: meters.airframe ?? null,
    description: t(f.description),
    work_performed: t(f.work_performed),
    parts: t(f.parts),
    signature_name: t(f.signature_name),
    mechanic_cert_number: t(f.mechanic_cert_number),
    ad_refs: splitRefs(f.ad_refs),
    sb_refs: splitRefs(f.sb_refs),
  };
  if (!fields.description && !fields.work_performed) return { error: "Write what was done, even a few words." };
  return { fields };
}

export type ReadingForm = { date: string; tach: number | null; hobbs: number | null };

export function validateReading(f: ReadingForm): { error: string } | { payload: { date: string; tach: number | null; hobbs: number | null } } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return { error: "Pick a date from the calendar." };
  if (f.tach == null && f.hobbs == null) return { error: "Record at least one meter." };
  for (const v of [f.tach, f.hobbs]) if (v != null && (!Number.isFinite(v) || v < 0)) return { error: "Hours can't be negative." };
  return { payload: { date: f.date, tach: f.tach, hobbs: f.hobbs } };
}

/** Newest first, the last `limit` readings. */
export function recentReadings(rows: ReadingRow[], limit = 30): ReadingRow[] {
  return [...rows]
    .sort((a, b) => (b.reading_date ?? "").localeCompare(a.reading_date ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, limit);
}

// --- Allowance ("Read this page" shows what it will cost) ---------------------

export type Allowance = { callsToday: number; dailyCap: number };

/** GET /api/sync/access is gaining `{allowance:{callsToday,dailyCap}}` (core sync). Absent → null. */
export function readAllowance(json: unknown): Allowance | null {
  const a = (json as { allowance?: unknown } | null)?.allowance as { callsToday?: unknown; dailyCap?: unknown } | undefined;
  if (!a || typeof a.callsToday !== "number" || typeof a.dailyCap !== "number" || a.dailyCap <= 0) return null;
  return { callsToday: Math.max(0, a.callsToday), dailyCap: a.dailyCap };
}

export function extractLabel(a: Allowance | null): { label: string; exhausted: boolean } {
  if (!a) return { label: "Read this page", exhausted: false };
  const left = Math.max(0, a.dailyCap - a.callsToday);
  if (left === 0) return { label: `Daily limit reached (${a.dailyCap} pages)`, exhausted: true };
  return { label: `Read this page · ${left} of ${a.dailyCap} left today`, exhausted: false };
}

// --- Geometry ---------------------------------------------------------------------

/**
 * The spotlight ring's position as percentages of the rendered image. Boxes are
 * fractions of the full image, so this holds at any zoom and any device width;
 * a tiny padding keeps the ring off the ink. A degenerate box (all-zero =
 * "couldn't locate") returns null, so no ring is drawn at the corner.
 */
export function spotlightStyle(box: FieldBox | null | undefined, pad = 0.4): { left: string; top: string; width: string; height: string } | null {
  if (!box || box.w <= 0 || box.h <= 0 || box.w > 0.999 || box.h > 0.999) return null;
  const x = Math.max(0, box.x - box.w * pad);
  const y = Math.max(0, box.y - box.h * pad);
  const w = Math.min(1 - x, box.w * (1 + 2 * pad));
  const h = Math.min(1 - y, box.h * (1 + 2 * pad));
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return { left: pct(x), top: pct(y), width: pct(w), height: pct(h) };
}

/**
 * Where the drawer should rest after a drag on its handle. A short drag is a
 * tap or a wobble and leaves it where it was; past the threshold it snaps.
 */
export function drawerSnap(open: boolean, dy: number, threshold = 40): boolean {
  if (dy <= -threshold) return true;
  if (dy >= threshold) return false;
  return open;
}

/** Swipe-to-delete: a clear leftward drag with little vertical drift. */
export function swipeReveals(dx: number, dy: number): boolean {
  return dx <= -64 && Math.abs(dy) < 40;
}
