// Recover writing that is upright only when a strip of the original page is
// turned. The first model pass can transcribe a sideways stamp into raw_text
// yet omit it from entries and set unread_rotated_content=false. Compare the
// transcription with structured entries before deciding whether to spend a
// second vision call. Each strip is shown in both 90-degree orientations in a
// single image; every returned source box is mapped back to the original page.

import sharp from "sharp";
import type { ExtractedEntry, ExtractionResult } from "./schema";
import { ENTRY_FIELDS } from "./schema";

export type Rotation = 90 | 180 | 270;
type Side = "left" | "right";
type Box = number[];

const STOP = new Set([
  "about", "after", "aircraft", "along", "been", "carry", "date", "flight",
  "forward", "from", "hours", "into", "log", "nature", "next", "page",
  "pilot", "signature", "that", "their", "there", "these", "this", "time",
  "total", "with", "your", "accumulated", "duration", "tenths",
]);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [])
    .filter((w) => !STOP.has(w));
}

function entryText(e: ExtractedEntry): string {
  return [e.description, e.work_performed, e.parts, e.signature_name,
    e.mechanic_cert_number, ...(e.ad_refs ?? []), ...(e.sb_refs ?? [])]
    .filter(Boolean).join(" ");
}

/** A visible transcript line with substantial content missing from the rows. */
export function hasUnrepresentedText(result: ExtractionResult): boolean {
  const represented = new Set(result.entries.flatMap((e) => words(entryText(e))));
  return result.raw_text.split(/\n+/).some((line) => {
    // Printed form furniture is not a maintenance record.
    if (/aircraft\s+log|carry\s+forward|flight\s+from|accumulated\s+total/i.test(line)) return false;
    const tokens = [...new Set(words(line))];
    if (tokens.length < 4) return false;
    const missing = tokens.filter((w) => !represented.has(w)).length;
    return missing >= 4 && missing / tokens.length >= 0.4;
  });
}

function validBox(box: unknown): box is Box {
  return Array.isArray(box) && box.length >= 4 && box.slice(0, 4)
    .every((v) => typeof v === "number" && Number.isFinite(v)) && box[2] > 0 && box[3] > 0;
}

function bounded(box: Box): Box {
  const x = Math.max(0, Math.min(1, box[0]));
  const y = Math.max(0, Math.min(1, box[1]));
  return [x, y, Math.max(0, Math.min(1 - x, box[2])), Math.max(0, Math.min(1 - y, box[3]))];
}

/** Inverse of a clockwise rotation, for normalized [x,y,w,h] image boxes. */
export function unrotateBox(box: Box, rotation: Rotation): Box {
  const [x, y, w, h] = box;
  if (rotation === 90) return bounded([y, 1 - x - w, h, w]);
  if (rotation === 270) return bounded([1 - y - h, x, h, w]);
  return bounded([1 - x - w, 1 - y - h, w, h]);
}

/** Top half = clockwise 90; bottom half = clockwise 270, same side strip. */
export function mapStripBox(box: Box, side: Side, stripFraction: number): Box | null {
  if (!validBox(box)) return null;
  const [x, y, w, h] = box;
  if (y < 0.5 && y + h > 0.5) return null; // ambiguous across both views
  const top = y + h <= 0.5;
  const local = [x, top ? y * 2 : (y - 0.5) * 2, w, h * 2];
  const [cx, cy, cw, ch] = unrotateBox(local, top ? 90 : 270);
  return bounded([side === "right" ? 1 - stripFraction + cx * stripFraction : cx * stripFraction,
    cy, cw * stripFraction, ch]);
}

export function mapRecoveredEntry(entry: ExtractedEntry, side: Side | "full180", stripFraction: number): ExtractedEntry {
  const boxes = { ...entry.field_boxes };
  for (const field of ENTRY_FIELDS) {
    const box = boxes[field];
    boxes[field] = validBox(box)
      ? (side === "full180" ? unrotateBox(box, 180) : mapStripBox(box, side, stripFraction)) ?? [0, 0, 0, 0]
      : [0, 0, 0, 0];
  }
  return { ...entry, field_boxes: boxes };
}

function unionBox(a: Box | undefined, b: Box | undefined): Box {
  if (!validBox(a)) return validBox(b) ? b : [0, 0, 0, 0];
  if (!validBox(b)) return a;
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return bounded([x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x,
    Math.max(a[1] + a[3], b[1] + b[3]) - y]);
}

function similarity(a: string, b: string): number {
  const aa = new Set(words(a));
  const bb = new Set(words(b));
  if (!aa.size || !bb.size) return 0;
  return [...aa].filter((w) => bb.has(w)).length / Math.min(aa.size, bb.size);
}

function sameInspection(a: ExtractedEntry, b: ExtractedEntry): boolean {
  const first = `${a.description ?? ""} ${a.work_performed ?? ""}`.toLowerCase();
  const second = `${b.description ?? ""} ${b.work_performed ?? ""}`.toLowerCase();
  const differentSigner = a.signature_name && b.signature_name &&
    a.signature_name.toLowerCase() !== b.signature_name.toLowerCase() &&
    (a.field_confidence?.signature_name ?? 0) >= 0.75 &&
    (b.field_confidence?.signature_name ?? 0) >= 0.75;
  return Boolean(a.entry_date && a.entry_date === b.entry_date &&
    !differentSigner && /inspect/.test(first) && /inspect/.test(second) &&
    (a.tach == null || b.tach == null || Math.abs(a.tach - b.tach) < 0.11));
}

function mergeInspection(a: ExtractedEntry, b: ExtractedEntry): ExtractedEntry {
  const boxes = { ...a.field_boxes };
  const confidence = { ...a.field_confidence };
  const details = b.description?.trim();
  const novel = details && similarity(a.description ?? "", details) < 0.85;
  const description = novel
    ? `${a.description?.trim() ?? ""}\nCertification stamp (rotated): ${details}`.trim()
    : a.description;
  boxes.description = unionBox(boxes.description, b.field_boxes?.description);
  confidence.description = Math.min(confidence.description ?? 1, b.field_confidence?.description ?? 1, 0.7);

  // Conflicting handwritten values are review questions, not a choice for a
  // model to make. Preserve their locations and clear the structured value.
  const merged: ExtractedEntry = {
    ...a, description, field_boxes: boxes, field_confidence: confidence,
    confidence: Math.min(a.confidence, b.confidence, 0.7),
  };
  for (const field of ["entry_date", "hobbs", "tach", "signature_name", "mechanic_cert_number"] as const) {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv != null) {
      // A weak reading stays in the transcript for human review, rather than
      // becoming an authoritative date, time, or certificate number.
      if ((b.field_confidence?.[field] ?? 0) >= 0.75) {
        (merged as unknown as Record<string, unknown>)[field] = bv;
        boxes[field] = b.field_boxes?.[field] ?? [0, 0, 0, 0];
        confidence[field] = b.field_confidence[field];
      }
    } else if (av != null && bv != null && String(av).toLowerCase() !== String(bv).toLowerCase()) {
      (merged as unknown as Record<string, unknown>)[field] = null;
      boxes[field] = unionBox(a.field_boxes?.[field], b.field_boxes?.[field]);
      confidence[field] = 0.2;
    } else if (av != null && bv != null) {
      boxes[field] = unionBox(a.field_boxes?.[field], b.field_boxes?.[field]);
      confidence[field] = Math.min(confidence[field] ?? 1, b.field_confidence?.[field] ?? 1);
    }
  }
  return merged;
}

/** Add only new evidence; a stamp for the same inspection enriches its row. */
export function mergeRecovered(result: ExtractionResult, recovered: ExtractionResult): { result: ExtractionResult; novel: boolean } {
  const entries = [...result.entries];
  let novel = false;
  for (const entry of recovered.entries) {
    const description = entryText(entry);
    if (!description.trim()) continue;
    if (entries.some((old) => similarity(entryText(old), description) >= 0.85)) continue;
    const match = entries.findIndex((old) => sameInspection(old, entry));
    if (match >= 0) entries[match] = mergeInspection(entries[match], entry);
    else entries.push(entry);
    novel = true;
  }
  const raw = novel ? recovered.raw_text.trim() : "";
  return {
    novel,
    result: {
      ...result, entries,
      raw_text: raw && !result.raw_text.includes(raw) ? `${result.raw_text}\n${raw}`.trim() : result.raw_text,
    },
  };
}

async function darkness(image: Buffer): Promise<number> {
  const data = await sharp(image).greyscale().resize({ width: 128 }).raw().toBuffer();
  let dark = 0;
  for (const pixel of data) if (pixel < 180) dark++;
  return dark / data.length;
}

/**
 * Catch the harder silent miss: the sideways region was omitted from raw_text
 * too. A dense page edge outside every reported field box merits one focused
 * look. Ruled lines alone are usually much lighter than handwritten/stamped
 * content; the threshold is deliberately conservative to limit extra calls.
 */
async function hasUnrepresentedEdge(original: Buffer, first: ExtractionResult): Promise<boolean> {
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height || meta.width < 500 || meta.height < 400) return false;
  const boxes = first.entries.flatMap((e) => ENTRY_FIELDS.map((f) => e.field_boxes?.[f]).filter(validBox));
  if (!boxes.length) return false;
  const rightmost = Math.max(...boxes.map((b) => b[0] + b[2]));
  const leftmost = Math.min(...boxes.map((b) => b[0]));
  for (const side of ["right", "left"] as const) {
    const free = side === "right" ? 1 - rightmost : leftmost;
    if (free < 0.17) continue;
    const width = Math.round(meta.width * Math.min(0.30, free - 0.02));
    if (width < 100) continue;
    const edge = await sharp(original).extract({
      left: side === "right" ? meta.width - width : 0,
      top: 0, width, height: meta.height,
    }).toBuffer();
    if (await darkness(edge) > 0.12) return true;
  }
  return false;
}

/** Two opposing views of one edge strip; no repeated full-page image. */
async function stripViews(original: Buffer, side: Side, fraction: number): Promise<Buffer> {
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height) throw new Error("Page image has no dimensions.");
  const width = Math.round(meta.width * fraction);
  const crop = await sharp(original).extract({
    left: side === "right" ? meta.width - width : 0,
    top: 0, width, height: meta.height,
  }).toBuffer();
  const [clockwise, counterclockwise] = await Promise.all([
    sharp(crop).rotate(90).jpeg({ quality: 88 }).toBuffer(),
    sharp(crop).rotate(270).jpeg({ quality: 88 }).toBuffer(),
  ]);
  return sharp({ create: { width: meta.height, height: width * 2, channels: 3, background: "white" } })
    .composite([{ input: clockwise, left: 0, top: 0 },
      { input: counterclockwise, left: 0, top: width }])
    .jpeg({ quality: 88 }).toBuffer();
}

export type OrientationReader = (base64: string, prompt: string) => Promise<ExtractionResult>;

/** At most two side-strip calls, then one upside-down pass on suspect pages. */
export async function recoverMixedOrientation(
  originalBase64: string,
  first: ExtractionResult,
  read: OrientationReader,
): Promise<ExtractionResult> {
  const original = Buffer.from(originalBase64, "base64");
  const meta = await sharp(original).metadata();
  if (!meta.width || !meta.height || meta.width * meta.height > 25_000_000) {
    return first.unread_rotated_content || hasUnrepresentedText(first)
      ? { ...first, unread_rotated_content: true }
      : first;
  }
  if (!first.unread_rotated_content && !hasUnrepresentedText(first) &&
    !(await hasUnrepresentedEdge(original, first))) return first;
  const stripWidth = Math.round(meta.width * 0.30);
  const fraction = stripWidth / meta.width;
  const right = await sharp(original).extract({ left: meta.width - stripWidth, top: 0, width: stripWidth, height: meta.height }).toBuffer();
  const left = await sharp(original).extract({ left: 0, top: 0, width: stripWidth, height: meta.height }).toBuffer();
  const sides: Side[] = await darkness(right) >= await darkness(left) ? ["right", "left"] : ["left", "right"];
  let result = first;
  let found = false;
  for (const side of sides) {
    try {
      const composite = await stripViews(original, side, fraction);
      const second = await read(composite.toString("base64"),
        `This image has TWO VIEWS OF THE SAME ${side.toUpperCase()} EDGE STRIP from one logbook page: the top half is rotated 90° clockwise and the bottom half 270° clockwise. Read only the maintenance writing that is UPRIGHT in either view. The two halves are duplicates of the same source; return each physical certification once. Include its printed organization and handwritten fields, leaving uncertain values null or low-confidence. Boxes are relative to THIS COMPOSITE image. Do not return the sideways portions of the main entry.`);
      const mapped = { ...second, entries: second.entries.map((e) => mapRecoveredEntry(e, side, fraction)) };
      const merged = mergeRecovered(result, mapped);
      result = merged.result;
      found ||= merged.novel;
      if (found && !hasUnrepresentedText(result) && !second.unread_rotated_content) break;
    } catch {
      // Preserve the first pass and the visible warning on a failed recovery.
    }
  }
  if (!found) {
    try {
      const upsideDown = await sharp(original).rotate(180).jpeg({ quality: 88 }).toBuffer();
      const second = await read(upsideDown.toString("base64"),
        "This is the SAME page rotated 180° to reveal upside-down writing. Return only distinct upright maintenance text that was missed on the original. Boxes are relative to this rotated image. Do not repeat sideways or already-read entries.");
      const mapped = { ...second, entries: second.entries.map((e) => mapRecoveredEntry(e, "full180", 1)) };
      const merged = mergeRecovered(result, mapped);
      result = merged.result;
      found ||= merged.novel;
    } catch {
      // The unrepresented-content warning remains visible below.
    }
  }
  return { ...result, unread_rotated_content: !found || hasUnrepresentedText(result) };
}
