import { DocumentScanner, ResponseType } from "@capgo/capacitor-document-scanner";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import { listCaptures, removeCapture } from "./db";

// Offline capture: scan logbook pages → downscale + thumbnail in the webview →
// queue in SQLite → drain to /api/aircraft/[id]/capture (JSON base64, Bearer)
// when online. The server uploads the blob + inserts the page row, then runs
// extraction; the new page flows back on the next sync.
//
// Scanning is Apple's OWN document scanner (VisionKit, via
// @capgo/capacitor-document-scanner) — the one Notes uses. It does the edge
// detection, the perspective correction and the black-and-white document filter
// natively and instantly.
//
// That matters beyond looks. The previous in-browser attempt pulled a 9 MB
// OpenCV build from a CDN and ran edge detection on the main thread, which on an
// iPhone was reported as "very glitchy, it will not capture photos, and if it
// does, it takes too long". None of that work happens in our JavaScript now.

export type Photo = { image: string; thumbnail: string };

// VisionKit's own ceiling is 24 pages per session.
const MAX_PAGES = 24;

/**
 * Open the document scanner and return one downscaled JPEG + thumbnail per page
 * (base64, no data: prefix). Empty when the user backs out.
 *
 * `letUserAdjustCrop` keeps VisionKit's editor in the flow, so the crop it
 * guesses can be corrected by hand before the page is kept — the "give the
 * ability to the end user to crop and adjust" half of the request. Multi-page is
 * the other half: a whole logbook can be shot in one session instead of
 * re-opening the camera per page.
 */
export async function scanPages(): Promise<Photo[]> {
  const res = await DocumentScanner.scanDocument({
    responseType: ResponseType.Base64,
    letUserAdjustCrop: true,
    maxNumDocuments: MAX_PAGES,
  });

  const out: Photo[] = [];
  for (const raw of res.scannedImages ?? []) {
    // Some builds hand back a data: URL rather than bare base64.
    const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
    if (!base64) continue;
    out.push({
      image: await rescale(base64, 2000, 0.85),
      thumbnail: await rescale(base64, 400, 0.7),
    });
  }
  return out;
}

/** Draw to a canvas at a bounded long-edge and re-encode JPEG → base64 (no prefix). */
function rescale(base64: string, maxEdge: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => reject(new Error("bad image"));
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

/** Upload every queued capture; each success clears its row. Returns a tally. */
export async function drainCaptures(
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: number; failed: number }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const queue = await listCaptures();
  if (!token || queue.length === 0) return { uploaded: 0, failed: 0 };

  let uploaded = 0;
  let failed = 0;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    try {
      const res = await CapacitorHttp.post({
        url: `${API_BASE}/api/aircraft/${c.aircraft_id}/capture`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          image: c.image,
          thumbnail: c.thumbnail,
          pageId: c.id,
          logbookId: c.logbook_id,
          pageSequence: c.page_sequence,
          capturedAt: c.captured_at,
          isHandwritten: c.is_handwritten === 1,
        },
      });
      if (res.status >= 200 && res.status < 300) {
        await removeCapture(c.id);
        uploaded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    onProgress?.(i + 1, queue.length);
  }
  return { uploaded, failed };
}
