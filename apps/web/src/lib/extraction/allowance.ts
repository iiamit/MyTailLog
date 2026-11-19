import { dailyCallCap } from "./aiContext";

// The reading allowance as the queue and the phones show it (09 §4.8, §5.1
// access). Counts the same rolling 24 hours reserve_ai_call_v2 enforces.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * shortcut: a page costs one reading call, two when rotated content needs a
 * second pass; 09 §4.8's example (62 calls ≈ 31 pages) uses 2. Measure it from
 * ai_usage per page if the shown page count drifts from what owners see.
 */
export const CALLS_PER_PAGE = 2;

export type Allowance = {
  usedCalls: number;
  capCalls: number;
  pagesUsedApprox: number;
  pagesCapApprox: number;
  /** When the oldest call in the window ages out and frees a call; null when nothing is used. */
  nextFreeAt: string | null;
  ownKey: boolean;
  globalPaused: boolean;
};

export function allowanceSummary(
  usage: { created_at?: string | null }[],
  ownKey: boolean,
  globalPaused = false,
  now = Date.now(),
): Allowance {
  const inWindow = usage
    .map((r) => (r.created_at ? Date.parse(r.created_at) : NaN))
    .filter((t) => Number.isFinite(t) && t > now - DAY_MS);
  const capCalls = dailyCallCap(ownKey);
  const oldest = inWindow.length ? Math.min(...inWindow) : null;
  return {
    usedCalls: inWindow.length,
    capCalls,
    pagesUsedApprox: Math.ceil(inWindow.length / CALLS_PER_PAGE),
    pagesCapApprox: Math.floor(capCalls / CALLS_PER_PAGE),
    nextFreeAt: oldest == null ? null : new Date(oldest + DAY_MS).toISOString(),
    ownKey,
    globalPaused,
  };
}

/** The shape GET /api/sync/v2/access carries (09 §4.1). */
export function accessAllowance(a: Allowance) {
  return {
    used: a.usedCalls,
    cap: a.capCalls,
    pagesLeftApprox: Math.max(0, a.pagesCapApprox - a.pagesUsedApprox),
    nextFreeAt: a.nextFreeAt,
    ownKey: a.ownKey,
  };
}
