// MyTailLog service worker — placeholder.
//
// Phase 1 / step 3 (Capture PWA) will flesh this out: an offline capture queue
// with background sync so pages photographed in a hangar with poor signal are
// stored locally and uploaded when connectivity returns. For now it installs
// cleanly and takes control without caching anything, so the app is a valid
// installable PWA without stale-cache surprises during active development.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
