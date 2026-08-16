// Manual page-scan clean-up: crop, rotate, and the black-and-white "document"
// look. Client-side canvas work, run ONCE on an image the user already has —
// none of the per-frame cost that made the old live scanner unusable on a phone.
//
// This exists because the web has no equivalent of Apple's VisionKit, which the
// native app now uses. A photo of a logbook page taken on a desk includes the
// desk; an owner reasonably wants to cut it out and make the page read like a
// scan rather than a snapshot.

/** Crop rectangle in FRACTIONS of the source (0–1), so it survives resizing. */
export type CropRect = { x: number; y: number; w: number; h: number };

export type Edit = {
  crop: CropRect;
  /** Clockwise, in 90° steps. */
  rotate: 0 | 90 | 180 | 270;
  /** Grayscale + contrast + white-point lift — the "scanned document" look. */
  enhance: boolean;
};

export const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };
export const NO_EDIT: Edit = { crop: FULL_CROP, rotate: 0, enhance: false };

/** True when applying this edit would change nothing — don't re-encode for that. */
export function isNoop(e: Edit): boolean {
  return (
    !e.enhance &&
    e.rotate === 0 &&
    Math.abs(e.crop.x) < 1e-6 &&
    Math.abs(e.crop.y) < 1e-6 &&
    Math.abs(e.crop.w - 1) < 1e-6 &&
    Math.abs(e.crop.h - 1) < 1e-6
  );
}

/**
 * Clamp a crop to the image and stop it collapsing.
 *
 * Drag handles produce inverted or out-of-bounds rectangles constantly (drag the
 * left edge past the right one and w goes negative), and a zero-area crop makes
 * a canvas of width 0, which throws on toBlob. Normalising here means the UI can
 * be naive about it.
 */
export function normalizeCrop(c: CropRect): CropRect {
  const x1 = Math.min(c.x, c.x + c.w);
  const y1 = Math.min(c.y, c.y + c.h);
  const x2 = Math.max(c.x, c.x + c.w);
  const y2 = Math.max(c.y, c.y + c.h);
  const MIN = 0.02; // 2% of an edge — below this it's a mis-drag, not a crop
  const left = Math.min(Math.max(x1, 0), 1 - MIN);
  const top = Math.min(Math.max(y1, 0), 1 - MIN);
  return {
    x: left,
    y: top,
    w: Math.min(Math.max(x2 - left, MIN), 1 - left),
    h: Math.min(Math.max(y2 - top, MIN), 1 - top),
  };
}

/** Pixel dimensions the edit produces, given the source size. */
export function outputSize(
  srcW: number,
  srcH: number,
  e: Edit,
): { w: number; h: number } {
  const c = normalizeCrop(e.crop);
  const w = Math.max(1, Math.round(srcW * c.w));
  const h = Math.max(1, Math.round(srcH * c.h));
  return e.rotate === 90 || e.rotate === 270 ? { w: h, h: w } : { w, h };
}

/**
 * Grayscale + contrast, in place on the pixel buffer.
 *
 * Deliberately mild. The point is legibility for a human and for the extractor,
 * so it must not clip pencil into the background — hard thresholding looks more
 * "scanned" but eats faint handwriting, which is most of what a logbook is.
 */
export function enhancePixels(data: Uint8ClampedArray): void {
  const CONTRAST = 1.35;
  const MIDPOINT = 140; // above mid-grey: paper goes white before ink goes black
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma — closer to perceived brightness than a flat average.
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = Math.max(0, Math.min(255, (g - MIDPOINT) * CONTRAST + MIDPOINT));
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

/** Apply crop → rotate → enhance and return a new canvas. */
export function applyEdit(
  source: CanvasImageSource & { width: number; height: number },
  edit: Edit,
): HTMLCanvasElement {
  const c = normalizeCrop(edit.crop);
  const sx = source.width * c.x;
  const sy = source.height * c.y;
  const sw = Math.max(1, Math.round(source.width * c.w));
  const sh = Math.max(1, Math.round(source.height * c.h));

  const out = document.createElement("canvas");
  const size = outputSize(source.width, source.height, edit);
  out.width = size.w;
  out.height = size.h;

  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  // White backing: a rotated or cropped area must never leave transparent
  // pixels, which JPEG renders black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);

  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((edit.rotate * Math.PI) / 180);
  ctx.drawImage(source, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();

  if (edit.enhance) {
    const img = ctx.getImageData(0, 0, out.width, out.height);
    enhancePixels(img.data);
    ctx.putImageData(img, 0, 0);
  }
  return out;
}
