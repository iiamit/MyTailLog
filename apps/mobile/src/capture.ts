import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { CapacitorHttp } from "@capacitor/core";
import { API_BASE, supabase } from "./supabase";
import { listCaptures, removeCapture } from "./db";

// Offline capture: photograph a logbook page → downscale + thumbnail in the
// webview → queue in SQLite → drain to /api/aircraft/[id]/capture (JSON base64,
// Bearer) when online. The server uploads the blob + inserts the page row, then
// runs extraction; the new page flows back on the next sync.

export type Photo = { image: string; thumbnail: string };

/** Open the camera, return a downscaled JPEG + thumbnail (base64, no prefix). */
export async function takePhoto(): Promise<Photo | null> {
  const shot = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    quality: 85,
    correctOrientation: true,
  });
  if (!shot.base64String) return null;
  const image = await rescale(shot.base64String, 2000, 0.85);
  const thumbnail = await rescale(shot.base64String, 400, 0.7);
  return { image, thumbnail };
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
