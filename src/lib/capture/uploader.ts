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

import { createClient } from "@/lib/supabase/client";
import { listQueued, removeQueued, type QueuedPage } from "./queue";

const BUCKET = "logbook-pages";

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

async function uploadOne(
  supabase: ReturnType<typeof createClient>,
  page: QueuedPage,
): Promise<boolean> {
  const path = `${page.aircraftId}/${page.logbookId}/${page.id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, page.blob, {
      contentType: "image/jpeg",
      upsert: true, // idempotent: a retried drain overwrites the same key
    });
  if (uploadError) return false;

  const { error: rowError } = await supabase.from("page").insert({
    id: page.id,
    logbook_id: page.logbookId,
    aircraft_id: page.aircraftId,
    storage_path: path,
    page_sequence: page.pageSequence,
    captured_at: page.capturedAt,
    is_handwritten: page.isHandwritten,
    // review_status defaults to 'unreviewed'; OCR/extraction fill the rest later.
  });

  // 23505 = unique_violation: the row already exists from a prior partial
  // drain. Treat as success so the queue entry is cleared.
  if (rowError && rowError.code !== "23505") {
    return false;
  }
  return true;
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
    const supabase = createClient();
    const pending = await listQueued();
    for (const page of pending) {
      const ok = await uploadOne(supabase, page);
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
