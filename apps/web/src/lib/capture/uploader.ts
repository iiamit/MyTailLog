// ===========================================================================
// Queue uploader — drains the IndexedDB capture queue to Supabase.
//
// Runs in the page (client) context because it needs the signed-in Supabase
// session; the service worker can't authenticate on its own. The SW's job is
// to WAKE a client (via background sync / postMessage) so this drain runs; on
// browsers without Background Sync (notably iOS Safari) the client also drains
// on the `online` event and on mount. Either way, images persist in IndexedDB
// until a drain succeeds, so nothing is lost when a hangar has no signal.
//
// Storage key layout matches supabase/migrations/0002_storage.sql:
//   <aircraft_id>/<logbook_id>/<page_id>.jpg
// The page row id equals <page_id>, so the image and its record always agree.
// ===========================================================================

import { listQueued, removeQueued, type QueuedPage } from "./queue";

export type DrainResult = { uploaded: number; failed: number };

let draining = false;

/**
 * Register a background-sync request so the queue drains when connectivity
 * returns, even if this tab is backgrounded. No-op where Background Sync is
 * unsupported (e.g. iOS Safari) — the page's `online`-event drain covers it.
 */
export async function registerBackgroundDrain(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sync = (reg as unknown as { sync?: { register(tag: string): Promise<void> } })
      ?.sync;
    await sync?.register("drain-capture-queue");
  } catch {
    /* Background Sync unavailable; foreground drain handles it. */
  }
}

async function uploadOne(page: QueuedPage): Promise<boolean> {
  // The server route writes the blobs (service creds) and inserts the row (RLS),
  // so this works whatever the storage backend is. The drain runs in the page
  // context, so the request carries the signed-in session cookie.
  const fd = new FormData();
  fd.set("image", page.blob, `${page.id}.jpg`);
  fd.set("thumbnail", page.thumbnailBlob, `${page.id}_thumb.jpg`);
  fd.set("pageId", page.id);
  fd.set("logbookId", page.logbookId);
  if (page.pageSequence != null) fd.set("pageSequence", String(page.pageSequence));
  fd.set("capturedAt", page.capturedAt);
  fd.set("isHandwritten", String(page.isHandwritten));

  try {
    const res = await fetch(`/api/aircraft/${page.aircraftId}/capture`, {
      method: "POST",
      body: fd,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Upload every queued page. Safe to call repeatedly and concurrently — a guard
 * prevents overlapping drains. Successfully uploaded pages are removed from the
 * queue; failures stay for the next attempt.
 */
export async function drainQueue(): Promise<DrainResult> {
  if (draining) return { uploaded: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { uploaded: 0, failed: 0 };
  }
  draining = true;
  const result: DrainResult = { uploaded: 0, failed: 0 };
  try {
    const pending = await listQueued();
    for (const page of pending) {
      const ok = await uploadOne(page);
      if (ok) {
        await removeQueued(page.id);
        result.uploaded++;
      } else {
        result.failed++;
      }
    }
  } finally {
    draining = false;
  }
  return result;
}
