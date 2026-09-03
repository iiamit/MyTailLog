import { CapacitorHttp } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { API_BASE, supabase } from "./supabase";
import type { DocumentType } from "@/lib/database.types";

// Offline document upload — the same shape as the scan queue in capture.ts, for
// the same reason: the hangar is where you have the paperwork and no signal.
//
// A document is held on disk (not in SQLite) because a 25 MB POH does not
// belong in a row: base64 bytes go to `uploads/<id>.b64` and the metadata to
// `uploads/<id>.json`, so listing what's waiting never reads a single megabyte.
// Draining posts JSON+base64 to /api/aircraft/[id]/documents, which takes that
// shape precisely because Capacitor's native HTTP can't do multipart.
//
// This is deliberately NOT action_queue: that queue drains through
// /api/sync/push, which carries JSON mutations, not blobs.

const DIR = Directory.Data;
const FOLDER = "uploads";

export type PendingUpload = {
  id: string;
  aircraftId: string;
  type: DocumentType;
  title: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  /** Set when the upload is attaching the document to a maintenance entry. */
  logEntryId: string | null;
  documentDate: string | null;
  queuedAt: string;
};

const metaPath = (id: string) => `${FOLDER}/${id}.json`;
const bodyPath = (id: string) => `${FOLDER}/${id}.b64`;

async function ensureFolder(): Promise<void> {
  await Filesystem.mkdir({ path: FOLDER, directory: DIR, recursive: true }).catch(() => {});
}

/** Hold a document on the device. `base64` carries no `data:` prefix. */
export async function queueDocumentUpload(meta: PendingUpload, base64: string): Promise<void> {
  await ensureFolder();
  await Filesystem.writeFile({ path: bodyPath(meta.id), data: base64, directory: DIR });
  await Filesystem.writeFile({
    path: metaPath(meta.id),
    data: JSON.stringify(meta),
    directory: DIR,
    encoding: Encoding.UTF8,
  });
}

/** Oldest first — documents upload in the order they were added. */
export async function listDocumentUploads(aircraftId?: string): Promise<PendingUpload[]> {
  const files = await Filesystem.readdir({ path: FOLDER, directory: DIR }).catch(() => null);
  if (!files) return [];
  const out: PendingUpload[] = [];
  for (const f of files.files) {
    if (!f.name.endsWith(".json")) continue;
    try {
      const { data } = await Filesystem.readFile({
        path: `${FOLDER}/${f.name}`,
        directory: DIR,
        encoding: Encoding.UTF8,
      });
      if (typeof data !== "string") continue;
      const meta = JSON.parse(data) as PendingUpload;
      if (!aircraftId || meta.aircraftId === aircraftId) out.push(meta);
    } catch {
      /* a half-written manifest is skipped rather than crashing the list */
    }
  }
  return out.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeDocumentUpload(id: string): Promise<void> {
  await Filesystem.deleteFile({ path: bodyPath(id), directory: DIR }).catch(() => {});
  await Filesystem.deleteFile({ path: metaPath(id), directory: DIR }).catch(() => {});
}

export async function documentUploadCount(): Promise<number> {
  return (await listDocumentUploads()).length;
}

export type UploadResult = { uploaded: number; failed: number; message: string | null };

/**
 * Push every held document. Each success deletes its two files.
 *
 * A 4xx is the server refusing this document (wrong type, too big, no edit
 * access) — retrying forever would keep a permanently doomed file on the phone,
 * so it is dropped and the reason is returned. Anything else (offline, 5xx) is
 * left alone to try again.
 */
export async function drainDocumentUploads(
  onProgress?: (done: number, total: number) => void,
): Promise<UploadResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const queue = await listDocumentUploads();
  if (!token || queue.length === 0) return { uploaded: 0, failed: queue.length, message: null };

  let uploaded = 0;
  let failed = 0;
  let message: string | null = null;

  for (let i = 0; i < queue.length; i++) {
    const meta = queue[i];
    try {
      const { data: body } = await Filesystem.readFile({ path: bodyPath(meta.id), directory: DIR });
      if (typeof body !== "string") {
        await removeDocumentUpload(meta.id);
        failed++;
        continue;
      }
      const res = await CapacitorHttp.post({
        url: `${API_BASE}/api/aircraft/${meta.aircraftId}/documents`,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        data: {
          file: body,
          fileName: meta.fileName,
          mimeType: meta.mimeType,
          type: meta.type,
          title: meta.title,
          document_date: meta.documentDate ?? "",
          log_entry_id: meta.logEntryId ?? "",
        },
      });
      if (res.status >= 200 && res.status < 300) {
        await removeDocumentUpload(meta.id);
        uploaded++;
      } else if (res.status >= 400 && res.status < 500) {
        message = typeof res.data?.error === "string" ? res.data.error : `${meta.fileName} was refused.`;
        await removeDocumentUpload(meta.id);
        failed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
    onProgress?.(i + 1, queue.length);
  }
  return { uploaded, failed, message };
}

/**
 * Downscale a photograph before it is queued, exactly as a scanned page is:
 * a modern phone camera produces 4–8 MB per shot, and a registration
 * certificate is legible at a fraction of that. PDFs are never touched.
 *
 * capture.ts uses this too — it is the one downscaler in the app.
 */
export function downscaleImage(base64: string, mime: string, maxEdge = 2200, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale === 1 && mime === "image/jpeg") return resolve(base64); // already small enough
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
    img.onerror = () => reject(new Error("That image couldn't be read."));
    img.src = `data:${mime};base64,${base64}`;
  });
}

/** Read a picked/dropped File as base64 with no `data:` prefix. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("That file couldn't be read."));
    reader.readAsDataURL(file);
  });
}
