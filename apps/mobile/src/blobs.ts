import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { API_BASE, supabase } from "./supabase";
import { getRows } from "./db";

// On-device blob cache. Scanned pages/documents are immutable once captured, so
// each is downloaded ONCE (via the Bearer-gated serving route) and kept in the
// app's Data dir — after the first view it renders with the network off. Returns
// a webview-loadable src (via Capacitor.convertFileSrc), or null when it's not
// cached and we're offline / unauthorized.

const DIR = Directory.Data;
const FOLDER = "blobs";

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function pathFor(kind: "page" | "document", id: string, thumb: boolean): string {
  return `${FOLDER}/${kind}_${id}${thumb ? "_thumb" : ""}`;
}

async function cachedSrc(path: string): Promise<string | null> {
  try {
    await Filesystem.stat({ path, directory: DIR });
    const { uri } = await Filesystem.getUri({ path, directory: DIR });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null; // not on disk
  }
}

/** Displayable src for a page/document blob; downloads + caches on first call. */
export async function localImageSrc(
  kind: "page" | "document",
  id: string,
  opts?: { thumb?: boolean },
): Promise<string | null> {
  const thumb = kind === "page" && !!opts?.thumb; // only pages have thumbnails
  const path = pathFor(kind, id, thumb);

  const hit = await cachedSrc(path);
  if (hit) return hit;

  const token = await accessToken();
  if (!token) return null; // offline / signed out → can't fetch; caller shows a placeholder

  const url =
    kind === "page" ? `${API_BASE}/api/page/${id}/image${thumb ? "?thumb=1" : ""}` : `${API_BASE}/api/document/${id}`;
  try {
    // CapacitorHttp returns binary as base64 on native — exactly what Filesystem wants.
    const res = await CapacitorHttp.get({ url, headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
    if (res.status !== 200 || typeof res.data !== "string" || !res.data) return null;
    await Filesystem.mkdir({ path: FOLDER, directory: DIR, recursive: true }).catch(() => {});
    await Filesystem.writeFile({ path, data: res.data, directory: DIR });
    return await cachedSrc(path);
  } catch {
    return null;
  }
}

/**
 * Download every page (thumb + full) and document to the device, so the whole
 * record browses offline. Skips anything already cached (localImageSrc checks
 * disk first), so it's cheap to re-run and resumes after an interruption. Bounded
 * concurrency keeps it moving without hammering the connection.
 */
export async function prefetchAll(onProgress: (done: number, total: number) => void): Promise<void> {
  const [pages, docs] = await Promise.all([
    getRows<{ id: string }>("page"),
    getRows<{ id: string; storage_path: string | null }>("document"),
  ]);
  const tasks: Array<() => Promise<unknown>> = [];
  for (const p of pages) {
    tasks.push(() => localImageSrc("page", p.id, { thumb: true }));
    tasks.push(() => localImageSrc("page", p.id));
  }
  for (const d of docs) if (d.storage_path) tasks.push(() => localImageSrc("document", d.id));

  const total = tasks.length;
  let done = 0;
  let next = 0;
  onProgress(0, total);
  const CONCURRENCY = 4;
  async function worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task().catch(() => {});
      onProgress(++done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
}
