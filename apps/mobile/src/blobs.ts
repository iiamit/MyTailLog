import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { API_BASE, supabase } from "./supabase";

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

function pathFor(kind: "page" | "document", id: string): string {
  return `${FOLDER}/${kind}_${id}`;
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
export async function localImageSrc(kind: "page" | "document", id: string): Promise<string | null> {
  const path = pathFor(kind, id);

  const hit = await cachedSrc(path);
  if (hit) return hit;

  const token = await accessToken();
  if (!token) return null; // offline / signed out → can't fetch; caller shows a placeholder

  const url = kind === "page" ? `${API_BASE}/api/page/${id}/image` : `${API_BASE}/api/document/${id}`;
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
