// MyTailLog service worker — capture queue background sync.
//
// The offline capture queue (images + metadata) lives in IndexedDB, written by
// the page. Uploading needs the signed-in Supabase session, which only the page
// has — so this worker does NOT upload. Its job is to WAKE an open client and
// tell it to drain the queue when connectivity returns, via the Background Sync
// API. On browsers without Background Sync (notably iOS Safari) the page falls
// back to draining on its own `online` event, so nothing is lost either way.
//
// No app-shell caching yet: during active development a stale cache causes more
// confusion than the marginal offline benefit is worth. Add it once the capture
// UI stabilizes.

const SYNC_TAG = "drain-capture-queue";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Ask every open client (or, if none is visible, any client) to drain the
// IndexedDB queue. Returning the promise keeps the SW alive until clients ack.
async function requestDrain() {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type: "drain-capture-queue" });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(requestDrain());
  }
});

// Manual trigger path (e.g. the page posts this after enqueue when Background
// Sync is unavailable, or to nudge an immediate attempt).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "drain-capture-queue") {
    event.waitUntil(requestDrain());
  }
});
