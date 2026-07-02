// ===========================================================================
// Image quality gates — pure canvas, no dependencies.
//
// Per the plan, rejecting a bad shot at capture time is "the cheapest place to
// catch a bad image, before you've spent an API call on it." These checks run
// on-device against the captured frame and need no OpenCV — blur, glare, and
// resolution are all computable directly from pixel data.
// ===========================================================================

export type QualityThresholds = {
  /** Laplacian-variance floor; below this the image reads as blurry. */
  minSharpness: number;
  /** Max fraction of blown-out (near-white) pixels before it's "glare". */
  maxGlareRatio: number;
  /** Minimum of the shorter image dimension, in pixels. */
  minShortEdge: number;
};

// Defaults tuned for phone captures of a logbook page under hangar lighting.
// Sharpness in particular is scene-dependent; exposed so the UI can adjust.
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  minSharpness: 80,
  maxGlareRatio: 0.045,
  minShortEdge: 1000,
};

export type QualityReport = {
  width: number;
  height: number;
  sharpness: number;
  glareRatio: number;
  ok: boolean;
  issues: string[];
};

/**
 * Laplacian variance as a focus measure. A sharp image has strong
 * second-derivative energy (edges); a blurry one is smooth, so the variance of
 * the Laplacian collapses. We downscale to a fixed working width first so the
 * score is roughly resolution-independent and cheap to compute.
 */
function laplacianVariance(gray: Float32Array, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      // 4-neighbour Laplacian kernel.
      const lap =
        gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Assess a captured frame. Works from a canvas so it can be called on the live
 * video frame or on the cropped/deskewed result before it's queued.
 */
export function assessQuality(
  source: HTMLCanvasElement,
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS,
): QualityReport {
  const width = source.width;
  const height = source.height;

  // Downscale to a bounded working buffer for the pixel scans.
  const scale = Math.min(1, 640 / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  let blown = 0;
  for (let p = 0, g = 0; p < data.length; p += 4, g++) {
    // Rec. 601 luma.
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    gray[g] = lum;
    if (lum >= 250) blown++;
  }

  const sharpness = laplacianVariance(gray, w, h);
  const glareRatio = blown / (w * h);

  const issues: string[] = [];
  if (Math.min(width, height) < thresholds.minShortEdge) {
    issues.push(
      `Resolution too low (${width}×${height}). Move closer or use a better camera.`,
    );
  }
  if (sharpness < thresholds.minSharpness) {
    issues.push("Image looks blurry. Hold steady and let the camera focus.");
  }
  if (glareRatio > thresholds.maxGlareRatio) {
    issues.push("Glare detected. Tilt the page or move away from the light.");
  }

  return { width, height, sharpness, glareRatio, ok: issues.length === 0, issues };
}
