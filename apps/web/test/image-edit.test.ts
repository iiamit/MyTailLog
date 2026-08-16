import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCrop,
  outputSize,
  enhancePixels,
  isNoop,
  FULL_CROP,
  NO_EDIT,
  type Edit,
} from "../src/lib/capture/imageEdit";

// applyEdit() needs a DOM canvas, so the browser-bound part isn't unit-tested;
// the geometry and pixel maths below are where the bugs actually live.

const edit = (o: Partial<Edit> = {}): Edit => ({ ...NO_EDIT, ...o });

test("normalizeCrop: an inverted drag becomes a valid rectangle", () => {
  const c = normalizeCrop({ x: 0.8, y: 0.7, w: -0.5, h: -0.4 });
  assert.ok(c.w > 0 && c.h > 0);
  assert.ok(Math.abs(c.x - 0.3) < 1e-9 && Math.abs(c.y - 0.3) < 1e-9);
});

test("normalizeCrop: never escapes the image", () => {
  const c = normalizeCrop({ x: -0.3, y: -0.5, w: 2, h: 2 });
  assert.ok(c.x >= 0 && c.y >= 0);
  assert.ok(c.x + c.w <= 1 + 1e-9, `right edge ${c.x + c.w}`);
  assert.ok(c.y + c.h <= 1 + 1e-9, `bottom edge ${c.y + c.h}`);
});

test("normalizeCrop: a collapsed crop keeps a minimum area", () => {
  const c = normalizeCrop({ x: 0.5, y: 0.5, w: 0, h: 0 });
  assert.ok(c.w > 0 && c.h > 0);
});

test("outputSize: rotating 90° swaps the axes", () => {
  assert.deepEqual(outputSize(1000, 500, edit()), { w: 1000, h: 500 });
  assert.deepEqual(outputSize(1000, 500, edit({ rotate: 90 })), { w: 500, h: 1000 });
  assert.deepEqual(outputSize(1000, 500, edit({ rotate: 180 })), { w: 1000, h: 500 });
  assert.deepEqual(outputSize(1000, 500, edit({ rotate: 270 })), { w: 500, h: 1000 });
});

test("outputSize: a crop scales the output", () => {
  const half = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  assert.deepEqual(outputSize(1000, 800, edit({ crop: half })), { w: 500, h: 400 });
});

test("isNoop: only a genuinely untouched edit is a no-op", () => {
  assert.equal(isNoop(NO_EDIT), true);
  assert.equal(isNoop(edit({ enhance: true })), false);
  assert.equal(isNoop(edit({ rotate: 90 })), false);
  assert.equal(isNoop(edit({ crop: { ...FULL_CROP, w: 0.9 } })), false);
});

test("enhancePixels: greys out, raises contrast, and keeps faint ink visible", () => {
  const px = new Uint8ClampedArray([
    230, 232, 228, 255, // paper
    150, 150, 150, 255, // faint pencil
    40, 40, 40, 255,    // ink
  ]);
  enhancePixels(px);
  const paper = px[0], pencil = px[4], ink = px[8];
  assert.equal(px[0], px[1], "must be greyscale");
  assert.ok(paper > 230, `paper should brighten toward white, got ${paper}`);
  assert.ok(ink < 40, `ink should deepen, got ${ink}`);
  // The one that matters: faint pencil must NOT be crushed into the paper.
  assert.ok(pencil < paper - 40, `pencil ${pencil} too close to paper ${paper}`);
  assert.ok(pencil > ink + 40, `pencil ${pencil} crushed toward ink ${ink}`);
});

test("enhancePixels: stays inside 0–255", () => {
  const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  enhancePixels(px);
  for (const v of px) assert.ok(v >= 0 && v <= 255);
});
