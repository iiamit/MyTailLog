"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so MyTailLog is an installable PWA and the
 * capture queue can be drained via background sync. Mounted once in the root
 * layout. The SW itself (public/sw.js) only wakes clients to drain the queue —
 * the authenticated upload happens in the page context (see uploader.ts).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failure is non-fatal: capture still works, it just loses
      // the background-sync wake-up (foreground drain on `online` still runs).
    });
  }, []);

  return null;
}
