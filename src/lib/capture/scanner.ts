// ===========================================================================
// Document scanner — edge detection, auto-crop, and deskew.
//
// This is progressive enhancement. Edge detection needs OpenCV.js (~8MB WASM)
// plus jscanify; both are loaded lazily from a CDN the first time the user
// starts a capture session. If they can't load (offline in a hangar, CDN
// blocked), capture still works — we fall back to the full uncropped frame and
// let the review UI crop later. The quality gates (imageQuality.ts) are pure
// JS and always run, so a fallback capture is never an unchecked capture.
//
// Bundling OpenCV via npm was rejected for v1: it bloats the build for a
// solo/zero-cost deployment, and the fallback keeps the feature usable anyway.
// ===========================================================================

const OPENCV_URL = "https://docs.opencv.org/4.10.0/opencv.js";
const JSCANIFY_URL =
  "https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@master/src/jscanify.min.js";

type ScannerGlobals = {
  cv?: { Mat: unknown; imread: unknown };
  jscanify?: new () => {
    extractPaper: (
      canvas: HTMLCanvasElement | HTMLImageElement,
      width: number,
      height: number,
    ) => HTMLCanvasElement;
    highlightPaper: (
      canvas: HTMLCanvasElement | HTMLImageElement,
      options?: { color?: string; thickness?: number },
    ) => HTMLCanvasElement;
  };
};

let loadPromise: Promise<boolean> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Attempt to load OpenCV.js + jscanify once. Resolves true if edge detection
 * is available, false if we should fall back to raw-frame capture. Never
 * rejects — callers treat false as "no auto-crop this session."
 */
export function loadScanner(): Promise<boolean> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      await loadScript(OPENCV_URL);
      // OpenCV signals readiness asynchronously after the script runs.
      await new Promise<void>((resolve, reject) => {
        const g = window as unknown as ScannerGlobals & {
          cv?: { onRuntimeInitialized?: () => void };
        };
        if (g.cv && (g.cv as { Mat?: unknown }).Mat) return resolve();
        const timeout = setTimeout(
          () => reject(new Error("OpenCV init timed out")),
          20000,
        );
        (g.cv as { onRuntimeInitialized?: () => void }).onRuntimeInitialized =
          () => {
            clearTimeout(timeout);
            resolve();
          };
      });
      await loadScript(JSCANIFY_URL);
      const g = window as unknown as ScannerGlobals;
      return Boolean(g.cv && g.jscanify);
    } catch {
      return false;
    }
  })();
  return loadPromise;
}

/** True once loadScanner() has succeeded in this session. */
export function scannerReady(): boolean {
  const g = window as unknown as ScannerGlobals;
  return Boolean(g.cv && g.jscanify);
}

/**
 * Draw an outline of the detected page onto a canvas for the live preview.
 * No-op (returns false) if the scanner isn't loaded.
 */
export function highlightPage(source: HTMLCanvasElement): boolean {
  const g = window as unknown as ScannerGlobals;
  if (!g.jscanify) return false;
  try {
    const scanner = new g.jscanify();
    const overlay = scanner.highlightPaper(source, {
      color: "#22c55e",
      thickness: 6,
    });
    const ctx = source.getContext("2d")!;
    ctx.drawImage(overlay, 0, 0, source.width, source.height);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the page: detect its corners, warp to a flat rectangle (deskew), and
 * auto-crop. Returns the corrected canvas, or the source unchanged if the
 * scanner isn't available or no page could be detected.
 */
export function extractPage(source: HTMLCanvasElement): HTMLCanvasElement {
  const g = window as unknown as ScannerGlobals;
  if (!g.jscanify) return source;
  try {
    const scanner = new g.jscanify();
    // Preserve the source's aspect so the deskewed output isn't stretched.
    const result = scanner.extractPaper(source, source.width, source.height);
    return result && result.width > 0 ? result : source;
  } catch {
    return source;
  }
}
