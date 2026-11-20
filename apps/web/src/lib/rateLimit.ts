// Fixed-window request counter (09 §4.14).
// shortcut: in-memory, so each Cloud Run instance (max 2) counts on its own; move to a shared
// store if a hard global cap is ever needed. Same trade as lib/oauth/resource.ts rateLimit.
const windows = new Map<string, { count: number; resetAt: number }>();

/** Count one request for `key`. Returns null when allowed, else the seconds until the window resets. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): number | null {
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    if (windows.size > 10_000) for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k);
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (w.count >= limit) {
    // Once per key and window: how often limits bite says whether the per-instance count needs a shared store.
    if (w.count++ === limit) console.warn("[shortcut-trigger]", { at: "lib/rateLimit.ts:16", limit, windowMs });
    return Math.max(1, Math.ceil((w.resetAt - now) / 1000));
  }
  w.count += 1;
  return null;
}
