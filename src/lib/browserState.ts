"use client";

import { useSyncExternalStore } from "react";

// Browser-only state via useSyncExternalStore. Unlike a useState +
// useEffect(setState) pattern (which the React-Compiler lint rules flag, and
// which flickers), this is SSR-safe: server + first client render use the server
// snapshot, then React switches to the live value on hydration with no mismatch —
// and it stays reactive to changes.

/** True when the user prefers reduced motion (reactive to OS setting changes). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false, // SSR: assume motion allowed (matches the pre-hydration default)
  );
}
