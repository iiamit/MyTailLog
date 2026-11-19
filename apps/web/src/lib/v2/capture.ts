import { DEFAULT_THRESHOLDS, type QualityReport } from "@/lib/capture/imageQuality";

// Pure rules of the Pages library and the Add pages queue (04 W-BOOKS-05, W-BOOKS-06; 09 §3.9, §4.8; 12).
// No DOM here, so every rule is unit-tested.

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

// --- Page state (W-BOOKS-05 thumbnails) -----------------------------------------------------------------------------

export type PageStateKey = "confirmed" | "ai_read" | "needs_look" | "queued" | "duplicate" | "waiting_allowance" | "processing" | "failed" | "not_read" | "no_entries";
export type PageFilter = "all" | "review" | "confirmed" | "reading" | "failed";

export const STATE_WORD: Record<PageStateKey, string> = {
  confirmed: "Confirmed",
  ai_read: "Read by AI",
  needs_look: "Needs a look",
  queued: "Waiting to be read",
  duplicate: "Looks like one you have",
  waiting_allowance: "Waiting for tomorrow's allowance",
  processing: "Being read",
  failed: "Couldn't be read",
  not_read: "Not read yet",
  no_entries: "Read, no entries",
};

export type PageForState = { extraction_status: string; needs_look: boolean | null; duplicate_of_page_id?: string | null };

/** A page's state in the trust vocabulary. `entries` are the live (not replaced) entries read from it. */
export function pageState(pg: PageForState, entries: { trust: string }[]): PageStateKey {
  switch (pg.extraction_status) {
    case "failed": return "failed";
    case "processing": return "processing";
    case "waiting_allowance": return "waiting_allowance";
    case "queued": return pg.duplicate_of_page_id ? "duplicate" : "queued";
    case "pending": return "not_read";
  }
  const unconfirmed = entries.some((e) => e.trust === "ai_read");
  if (unconfirmed) return pg.needs_look ? "needs_look" : "ai_read";
  return entries.length ? "confirmed" : "no_entries";
}

export function stateFilter(s: PageStateKey): Exclude<PageFilter, "all"> | null {
  if (s === "ai_read" || s === "needs_look") return "review";
  if (s === "confirmed") return "confirmed";
  if (s === "queued" || s === "duplicate" || s === "processing" || s === "waiting_allowance") return "reading";
  if (s === "failed") return "failed";
  return null;
}

export type PageSort = "paper" | "date" | "tach" | "upload";
export const SORTS: { key: PageSort; label: string }[] = [
  { key: "paper", label: "Paper order" },
  { key: "date", label: "Entry date" },
  { key: "tach", label: "Tach" },
  { key: "upload", label: "Upload order" },
];

export type SortablePage = { id: string; page_sequence: number | null; created_at: string; date: string | null; tach: number | null };

/** Sorted copy; pages without the sort value go last whatever the direction, then paper order. */
export function sortPages<T extends SortablePage>(pages: T[], sort: PageSort, desc = false): T[] {
  const key = (p: T): string | number | null =>
    sort === "paper" ? p.page_sequence : sort === "date" ? p.date : sort === "tach" ? p.tach : p.created_at;
  return [...pages].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null || y == null) return x == null && y == null ? (a.page_sequence ?? 0) - (b.page_sequence ?? 0) : x == null ? 1 : -1;
    const c = x < y ? -1 : x > y ? 1 : (a.page_sequence ?? 0) - (b.page_sequence ?? 0);
    return desc ? -c : c;
  });
}

/** "p. 30", "pp. 30 to 32", "pp. 4, 9 and 12" for a selection, in paper order. */
export function pagesPhrase(seqs: (number | null)[]): string {
  const s = [...new Set(seqs.filter((n): n is number => n != null))].sort((a, b) => a - b);
  if (!s.length) return "";
  if (s.length === 1) return `p. ${s[0]}`;
  if (s[s.length - 1] - s[0] === s.length - 1) return `pp. ${s[0]} to ${s[s.length - 1]}`;
  return `pp. ${s.slice(0, -1).join(", ")} and ${s[s.length - 1]}`;
}

/** The book's page order with `newIds` placed after paper position `after` (0 = at the start); W-BOOKS-06 "After page {n}". */
export function insertAfter(ordered: string[], newIds: string[], after: number): string[] {
  const fresh = new Set(newIds);
  const rest = ordered.filter((id) => !fresh.has(id));
  const at = Math.max(0, Math.min(after, rest.length));
  return [...rest.slice(0, at), ...newIds, ...rest.slice(at)];
}

// --- Capture (W-BOOKS-06 camera, 09 §3.9.3) -------------------------------------------------------------------------

/** 64-bit dHash of a 9 × 8 greyscale image (row-major, 72 values): bit set when a pixel is brighter than its right neighbour. */
export function dHash(gray: ArrayLike<number>): string {
  if (gray.length !== 72) throw new Error("dHash needs 9 × 8 pixels");
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (gray[row * 9 + col] > gray[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** The first reason a shot fails the quality check, in the owner's words (W-BOOKS-06), or null. */
export function shotProblem(r: Pick<QualityReport, "width" | "height" | "sharpness" | "glareRatio">, t = DEFAULT_THRESHOLDS): string | null {
  if (Math.min(r.width, r.height) < t.minShortEdge) return "Too small to read. Move closer.";
  if (r.sharpness < t.minSharpness) return "Looks blurry. Hold steady and let the camera focus.";
  if (r.glareRatio > t.maxGlareRatio) return "Glare on the page. Tilt it or move away from the light.";
  return null;
}

// --- The queue (W-BOOKS-06 right leaf, 09 §4.8) ---------------------------------------------------------------------

export type QueueBatch = {
  id: string; logbook: string | null; logbookId: string; createdAt: string; expected: number; uploaded: number; queued: number;
  reading: number; waitingAllowance: number; read: number; failed: number; needsLook: number; waitingDecision?: number; completedAt: string | null;
};
export type QueueAllowance = { usedCalls: number; capCalls: number; pagesUsedApprox: number; pagesCapApprox: number; nextFreeAt: string | null; ownKey: boolean; globalPaused: boolean };

/** Totals across the batches still in flight, plus failures and the latest read batch. */
export function queueTotals(batches: QueueBatch[]) {
  const open = batches.filter((b) => !b.completedAt);
  const sum = (k: "queued" | "reading" | "waitingAllowance" | "waitingDecision") => open.reduce((n, b) => n + (b[k] ?? 0), 0);
  const decision = sum("waitingDecision");
  const lastRead = batches.find((b) => b.read > 0) ?? null;
  return {
    arriving: open.reduce((n, b) => n + Math.max(0, b.expected - b.uploaded), 0),
    queued: sum("queued") - decision,
    decision,
    reading: sum("reading"),
    waitingAllowance: sum("waitingAllowance"),
    failed: batches.reduce((n, b) => n + b.failed, 0),
    lastRead: lastRead && { createdAt: lastRead.createdAt, clean: lastRead.read - lastRead.needsLook, doubtful: lastRead.needsLook },
  };
}

/** Poll while anything is on its way or being read (W-BOOKS-06 behaviour). */
export const inFlight = (batches: QueueBatch[]) => {
  const t = queueTotals(batches);
  return t.arriving + t.queued + t.reading + t.waitingAllowance > 0;
};

/** Batches that finished since the last poll: one announcement each (09 §3.9.1). */
export function newlyCompleted(before: QueueBatch[], after: QueueBatch[]): QueueBatch[] {
  const open = new Set(before.filter((b) => !b.completedAt).map((b) => b.id));
  return after.filter((b) => b.completedAt && open.has(b.id));
}

/** "{n} pages are read. {d} need a look." (W-BOOKS-06 announce) */
export function readCopy(b: QueueBatch): string {
  const head = `${plural(b.read, "page")} ${b.read === 1 ? "is" : "are"} read.`;
  return b.needsLook ? `${head} ${b.needsLook} ${b.needsLook === 1 ? "needs" : "need"} a look.` : head;
}

/** The allowance lines under "Reading today" (W-BOOKS-06; 12 allowance.*). `left` is pages still to read. */
export function allowanceCopy(a: QueueAllowance, left: number) {
  const free = Math.max(0, a.pagesCapApprox - a.pagesUsedApprox);
  const head = `${a.pagesUsedApprox} of ${a.pagesCapApprox} pages used`;
  const source = a.ownKey ? "your own key" : "shared allowance";
  let note: string;
  if (a.globalPaused) note = "Reading is paused today. Pages upload now and are read when it resumes.";
  else if (left === 0) note = a.ownKey
    ? "Reading with your own AI key: up to 1,000 reading calls in any 24 hours."
    : `${a.pagesUsedApprox} of ${a.pagesCapApprox} pages read in the last 24 hours. Each page frees up 24 hours after it was read.`;
  else if (left <= free) note = `The ${plural(left, "page")} left ${left === 1 ? "fits" : "fit"}.`;
  else note = `${free} of these fit today. The rest wait their turn tomorrow, or add your own key.`;
  return { head, source, note, over: !a.globalPaused && left > free && !a.ownKey };
}
