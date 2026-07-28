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

// OpenCV.js — real, self-contained builds (the wasm is embedded as base64, so a
// plain cross-origin <script> works with no separate .wasm fetch). 4.7.0 is the
// smallest (~9MB, best for mobile) and is jscanify's documented pairing; 4.9.0
// is the fallback. NOTE: a previously pinned "4.10.0" 404s on docs.opencv.org —
// that dead URL is why auto-crop never loaded. Verify any version returns 200.
const OPENCV_URLS = [
  "https://docs.opencv.org/4.7.0/opencv.js",
  "https://docs.opencv.org/4.9.0/opencv.js",
];
const JSCANIFY_URL =
  "https://cdn.jsdelivr.net/gh/puffinsoft/jscanify@master/src/jscanify.min.js";

// Mobile downloads of a ~9MB script + WASM init are slow; be generous so a legit
// slow load isn't cut off before it finishes.
const SCRIPT_TIMEOUT_MS = 45_000;
const INIT_TIMEOUT_MS = 45_000;

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

function loadScript(src: string, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<void> {
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
    // A stalled mobile connection can leave a script pending forever (no load,
    // no error); a timeout lets us reject and try the fallback CDN.
    const timer = setTimeout(() => {
      s.remove();
      reject(new Error(`Timed out loading ${src}`));
    }, timeoutMs);
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

/** Load one OpenCV build and wait for its WASM runtime to initialize. */
async function loadOpenCVFrom(url: string): Promise<boolean> {
  await loadScript(url);
  await new Promise<void>((resolve, reject) => {
    const g = window as unknown as ScannerGlobals & {
      cv?: { Mat?: unknown; onRuntimeInitialized?: () => void };
    };
    if (g.cv && g.cv.Mat) return resolve();
    if (!g.cv) return reject(new Error("OpenCV global missing after load"));
    const timeout = setTimeout(
      () => reject(new Error("OpenCV init timed out")),
      INIT_TIMEOUT_MS,
    );
    g.cv.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      resolve();
    };
  });
  return true;
}

/**
 * Attempt to load OpenCV.js + jscanify once. Resolves true if edge detection
 * is available, false if we should fall back to raw-frame capture. Never
 * rejects — callers treat false as "no auto-crop this session."
 */
export function loadScanner(): Promise<boolean> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    let cvReady = false;
    for (const url of OPENCV_URLS) {
      try {
        cvReady = await loadOpenCVFrom(url);
        if (cvReady) break;
      } catch {
        // Try the next CDN.
      }
    }
    if (!cvReady) return false;
    try {
      await loadScript(JSCANIFY_URL);
    } catch {
      return false;
    }
    const g = window as unknown as ScannerGlobals;
    return Boolean(g.cv && g.jscanify);
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
