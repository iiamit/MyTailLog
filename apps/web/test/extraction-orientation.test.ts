import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  hasUnrepresentedText, mapStripBox, mergeRecovered,
  recoverMixedOrientation, unrotateBox,
} from "../src/lib/extraction/orientation";
import { ENTRY_FIELDS, type ExtractedEntry, type ExtractionResult } from "../src/lib/extraction/schema";

function entry(overrides: Partial<ExtractedEntry> = {}): ExtractedEntry {
  const fieldConfidence = Object.fromEntries(ENTRY_FIELDS.map((f) => [f, 0.9])) as ExtractedEntry["field_confidence"];
  const fieldBoxes = Object.fromEntries(ENTRY_FIELDS.map((f) => [f, [0, 0, 0, 0]])) as ExtractedEntry["field_boxes"];
  return {
    entry_date: "1986-08-01", hobbs: null, tach: 395.1,
    description: "Performed 100 hour inspection and checked controls.",
    work_performed: "100 hour inspection", parts: null,
    signature_name: "Mechanic", mechanic_cert_number: "12345",
    ad_refs: [], sb_refs: [], confidence: 0.9,
    field_confidence: fieldConfidence,
    field_boxes: { ...fieldBoxes, description: [0.25, 0.2, 0.45, 0.4] },
    continues_next: false, is_continuation: false,
    ...overrides,
  };
}

const stamp = () => entry({
  tach: null, signature_name: null, mechanic_cert_number: "unclear",
  description: "I certify annual inspection; airworthy. MAVERICK AIRCRAFT, Denton.",
  work_performed: "Annual inspection", confidence: 0.6,
  field_confidence: { ...entry().field_confidence, entry_date: 0.6, mechanic_cert_number: 0.4 },
  field_boxes: { ...entry().field_boxes, description: [0.1, 0.1, 0.7, 0.3], mechanic_cert_number: [0.6, 0.2, 0.2, 0.1] },
});

function result(entries: ExtractedEntry[], raw_text = ""): ExtractionResult {
  return { detected_page_count: 1, raw_text, unread_rotated_content: false, entries };
}

test("a sideways certification in the transcript triggers recovery even when the model flag is false", () => {
  const first = result([entry()],
    "Aug 1 1986 Performed 100 hour inspection and checked controls.\n" +
    "I certify this annual inspection was airworthy.\nMAVERICK AIRCRAFT, Denton Municipal Airport.");
  assert.equal(hasUnrepresentedText(first), true);
  assert.equal(hasUnrepresentedText(result([entry()], "AIRCRAFT LOG\nCARRY FORWARD THE TOTAL FLYING TIME")), false);
});

test("all 90/180/270-degree boxes return to canonical page coordinates", () => {
  const close = (actual: number[], expected: number[]) =>
    actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9));
  close(unrotateBox([0.2, 0.3, 0.1, 0.2], 90), [0.3, 0.7, 0.2, 0.1]);
  close(unrotateBox([0.2, 0.3, 0.1, 0.2], 180), [0.7, 0.5, 0.1, 0.2]);
  close(unrotateBox([0.2, 0.3, 0.1, 0.2], 270), [0.5, 0.2, 0.2, 0.1]);
  const top = mapStripBox([0.2, 0.1, 0.1, 0.1], "right", 0.3);
  const bottom = mapStripBox([0.7, 0.8, 0.1, 0.1], "left", 0.3);
  assert.ok(top && top[0] >= 0.7 && top[0] + top[2] <= 1);
  assert.ok(bottom && bottom[0] >= 0 && bottom[0] + bottom[2] <= 0.3);
  assert.equal(mapStripBox([0.2, 0.45, 0.1, 0.1], "right", 0.3), null);
});

test("related certification enriches one inspection, retains both source regions, and flags conflicting handwriting", () => {
  const first = result([entry()], "MAVERICK AIRCRAFT, Denton Municipal Airport.");
  const second = result([stamp()], "MAVERICK AIRCRAFT, Denton Municipal Airport.");
  const merged = mergeRecovered(first, second);
  assert.equal(merged.novel, true);
  assert.equal(merged.result.entries.length, 1);
  assert.match(merged.result.entries[0].description ?? "", /100 hour inspection/);
  assert.match(merged.result.entries[0].description ?? "", /annual inspection/);
  assert.equal(merged.result.entries[0].mechanic_cert_number, null);
  assert.equal(merged.result.entries[0].field_confidence.mechanic_cert_number, 0.2);
  assert.ok(merged.result.entries[0].field_boxes.description[2] > 0.45);
  assert.equal(hasUnrepresentedText(merged.result), false);
});

test("a repeated pass creates no duplicate, while a separate dated event stays separate", () => {
  const first = result([entry()]);
  assert.equal(mergeRecovered(first, result([entry()])).result.entries.length, 1);
  const unrelated = stamp();
  unrelated.entry_date = "1986-08-02";
  assert.equal(mergeRecovered(first, result([unrelated])).result.entries.length, 2);
  const differentSigner = stamp();
  differentSigner.signature_name = "Different mechanic";
  differentSigner.field_confidence.signature_name = 0.95;
  assert.equal(mergeRecovered(first, result([differentSigner])).result.entries.length, 2);
});

test("normal pages make one provider call; a mixed page recovers a stamp from a synthetic edge", async () => {
  const width = 1000;
  const height = 500;
  const pixels = Buffer.alloc(width * height * 3, 255);
  for (let y = 50; y < 450; y += 20) {
    for (let yy = y; yy < y + 5; yy++) {
      for (let x = 760; x < 970; x++) pixels.fill(0, (yy * width + x) * 3, (yy * width + x) * 3 + 3);
    }
  }
  const base64 = (await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg().toBuffer()).toString("base64");
  const blank = (await sharp({ create: { width, height, channels: 3, background: "white" } }).jpeg().toBuffer()).toString("base64");
  let calls = 0;
  const read = async (_image: string, prompt: string): Promise<ExtractionResult> => {
    calls++;
    assert.match(prompt, /RIGHT EDGE STRIP/);
    return result([stamp()], "MAVERICK AIRCRAFT, Denton Municipal Airport.");
  };
  const ordinary = result([entry()], "AIRCRAFT LOG\nPerformed 100 hour inspection and checked controls.");
  assert.equal((await recoverMixedOrientation(blank, ordinary, read)).entries.length, 1);
  assert.equal(calls, 0);
  // The stamp may be missing from BOTH raw_text and entries. Dark writing in
  // the otherwise unclaimed right margin still earns a focused second look.
  const visuallyRecovered = await recoverMixedOrientation(base64, ordinary, read);
  assert.equal(calls, 1);
  assert.match(visuallyRecovered.entries[0].description ?? "", /annual inspection/);
  const mixed = result([entry()],
    "Performed 100 hour inspection and checked controls.\n" +
    "I certify this annual inspection was airworthy.\nMAVERICK AIRCRAFT, Denton Municipal Airport.");
  const recovered = await recoverMixedOrientation(base64, mixed, read);
  assert.equal(calls, 2);
  assert.equal(recovered.entries.length, 1);
  assert.match(recovered.entries[0].description ?? "", /annual inspection/);
  assert.equal(recovered.unread_rotated_content, false);
  assert.ok(recovered.entries[0].field_boxes.description[0] < 0.7); // union of handwriting + stamp
  assert.ok(recovered.entries[0].field_boxes.description[0] + recovered.entries[0].field_boxes.description[2] > 0.7);
});

test("unrecovered sideways text remains visibly flagged", async () => {
  const image = (await sharp({ create: { width: 600, height: 450, channels: 3, background: "white" } }).jpeg().toBuffer()).toString("base64");
  const first = result([entry()], "I certify this annual inspection was airworthy.\nMAVERICK AIRCRAFT, Denton Municipal Airport.");
  const recovered = await recoverMixedOrientation(image, first, async () => result([]));
  assert.equal(recovered.entries.length, 1);
  assert.equal(recovered.unread_rotated_content, true);
});
