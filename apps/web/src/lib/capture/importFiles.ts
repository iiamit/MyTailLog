// ===========================================================================
// File import — turn already-scanned logbooks (PDF / JPEG / PNG) into the same
// per-page JPEGs the camera capture flow produces, so uploaded and captured
// pages are identical downstream (same storage layout, same `page` rows, same
// review/extraction pipeline).
//
// A PDF is rasterized one page at a time via pdf.js; an image becomes a single
// page. Everything is normalized to a white-backed JPEG bounded to a long edge
// that keeps OCR/vision legible without ballooning storage. Pages are emitted
// through a callback as they're produced so the caller can queue-and-drain
// incrementally rather than holding a whole logbook in memory.
// ===========================================================================

import { assessQuality, type QualityReport } from "./imageQuality";

// Long-edge cap in pixels. High enough for handwriting OCR, low enough to keep
// a multi-hundred-page logbook's storage reasonable on the free tier.
const MAX_LONG_EDGE = 2400;
const JPEG_QUALITY = 0.9;

export type RasterPage = {
  blob: Blob;
  width: number;
  height: number;
  report: QualityReport;
};

export function isSupportedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    name.endsWith(".pdf") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png")
  );
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

async function finalize(canvas: HTMLCanvasElement): Promise<RasterPage> {
  // Quality is assessed for information only on uploads (a scan the user
  // already committed to isn't rejected), but the metrics travel with the page.
  const report = assessQuality(canvas);
  const blob = await toJpeg(canvas);
  return { blob, width: canvas.width, height: canvas.height, report };
}

function scaledDims(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function rasterizeImage(file: File): Promise<RasterPage> {
  // `from-image` honours EXIF orientation so a phone-scanned page isn't sideways.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  }).catch(() => createImageBitmap(file));

  const { w, h } = scaledDims(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // White backing so PNG transparency doesn't turn into JPEG black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return finalize(canvas);
}

// pdf.js is loaded lazily (only when a PDF is imported) and its worker comes
// from a CDN pinned to the installed version. Unlike camera capture, importing
// existing scans is realistically done online (from the device holding the
// files), so a network-fetched worker is an acceptable tradeoff for avoiding
// bundler-specific worker wiring.
let pdfLib: Promise<typeof import("pdfjs-dist")> | null = null;
function getPdfLib(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfLib) {
    pdfLib = import("pdfjs-dist").then((lib) => {
      // Self-hosted from public/ (same origin) so the app's CSP (`script-src
      // 'self'`) allows the worker — a CDN URL is blocked and breaks PDF upload.
      // public/pdf.worker.min.mjs must match this pdfjs-dist version (6.1.200);
      // re-copy from node_modules/pdfjs-dist/build/ on upgrade.
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfLib;
}

/**
 * Rasterize a file to one or more pages, invoking `onPage` for each in order.
 * Returns the page count. Throws if the file can't be decoded (caller reports
 * it per-file and continues with the rest of the batch).
 */
export async function rasterizeFile(
  file: File,
  onPage: (page: RasterPage, index: number, total: number) => Promise<void>,
): Promise<number> {
  if (!isPdf(file)) {
    const page = await rasterizeImage(file);
    await onPage(page, 1, 1);
    return 1;
  }

  const pdfjs = await getPdfLib();
  const data = await file.arrayBuffer();
  // No isEvalSupported flag needed: pdf.js 6 doesn't use eval at all (checked
  // the built bundle), so it's unaffected by dropping 'unsafe-eval' from the
  // production CSP.
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  try {
    const total = pdf.numPages;
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(4, MAX_LONG_EDGE / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const raster = await finalize(canvas);
      await onPage(raster, i, total);
      page.cleanup();
    }
    return total;
  } finally {
    await loadingTask.destroy();
  }
}
