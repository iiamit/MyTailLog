// Pure decisions for the sync layer — no Capacitor, no import.meta.env — tested
// from apps/web/test/mobile-sync-policy.test.ts.

export type DeliveryDecision = "synced" | "sync" | "pending";

export function deliveryDecision(online: boolean, queued: number): DeliveryDecision {
  if (queued === 0) return "synced";
  return online ? "sync" : "pending";
}

// --- Retry schedule ---------------------------------------------------------
//
// Online-but-failing drains (a 5xx, a dropped connection with bars showing)
// retry with exponential backoff so a hung server isn't hammered every time
// the app foregrounds. Bounded: the delay stops growing at BACKOFF_CAP_MS and
// the action stays queued forever — work is never dropped by the schedule, only
// by the owner (Discard) or a server refusal (status 'failed').

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 15 * 60_000;

/** Delay before the (attempt+1)th try: 5s, 10s, 20s … capped at 15 min. */
export function backoffMs(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** n);
}

/** ISO timestamp before which an action should not be retried. */
export function nextRetryAt(attempt: number, now = Date.now()): string {
  return new Date(now + backoffMs(attempt)).toISOString();
}

// --- Blob cache ceiling ---------------------------------------------------

export type CachedFile = { name: string; size: number; mtime: number };

/**
 * Which cached files to delete to get under `ceilingBytes`: oldest first,
 * never a pinned one. Returns [] when already under the ceiling. If everything
 * unpinned is gone and the pinned set alone exceeds the ceiling, that's the
 * owner's own paperwork — it stays.
 */
export function purgePlan(files: CachedFile[], ceilingBytes: number, isPinned: (name: string) => boolean): string[] {
  let held = files.reduce((t, f) => t + f.size, 0);
  if (held <= ceilingBytes) return [];
  const victims: string[] = [];
  const unpinned = files.filter((f) => !isPinned(f.name)).sort((a, b) => a.mtime - b.mtime);
  for (const f of unpinned) {
    if (held <= ceilingBytes) break;
    victims.push(f.name);
    held -= f.size;
  }
  return victims;
}
