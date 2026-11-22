import type { Page } from "@/lib/database.types";
import { CONFIDENCE_THRESHOLD } from "./schema";

// Pure rules of the server reading queue (09 §2.9, §3.9.1, §3.9.2, §4.8), kept
// apart from the worker (queue.ts, server-only) so they are unit-tested.

/** 09 §3.9.1: failed after 2 attempts. */
export const MAX_READ_ATTEMPTS = 2;

export type EntryForLook = {
  entry_date: string | null;
  tach: number | null;
  hobbs: number | null;
  is_continuation: boolean | null;
  field_confidence: Record<string, unknown> | null;
};

/**
 * `needs_look` and `landing_date` for a page just read (09 §2.9, §3.9.2).
 * shortcut: checks what one page can show (confidence, alternatives, fragments,
 * rotated text, meters going backwards on the page, future dates); the
 * cross-logbook plausibility rules (previous entry in the book, +300 h, the
 * aircraft's year) wait for the review desk port.
 */
export function pageReadSummary(entries: EntryForLook[], unreadRotated: boolean, today = new Date().toISOString().slice(0, 10)) {
  const doubtfulField = (v: unknown) =>
    (typeof v === "number" && v < CONFIDENCE_THRESHOLD) ||
    (!!v && typeof v === "object" && Array.isArray((v as { alt?: unknown }).alt) && (v as { alt: unknown[] }).alt.length > 0);
  const backwards = (k: "tach" | "hobbs") => {
    const dated = entries.filter((e) => e.entry_date && e[k] != null).sort((a, b) => a.entry_date!.localeCompare(b.entry_date!));
    return dated.some((e, i) => i > 0 && (e[k] as number) < (dated[i - 1][k] as number) - 0.1);
  };
  const needsLook =
    unreadRotated ||
    entries.some((e) => e.is_continuation || Object.values(e.field_confidence ?? {}).some(doubtfulField) || (e.entry_date != null && e.entry_date > today)) ||
    backwards("tach") ||
    backwards("hobbs");
  const dates = entries.map((e) => e.entry_date).filter((d): d is string => !!d).sort();
  return { needs_look: needsLook, landing_date: dates[0] ?? null };
}

export type PageForProgress = Pick<Page, "extraction_status" | "needs_look" | "duplicate_of_page_id">;

/** One batch as the queue shows it (09 §4.8). */
export function batchProgress(pages: PageForProgress[], expected: number) {
  const n = (s: string) => pages.filter((p) => p.extraction_status === s).length;
  return {
    expected,
    uploaded: pages.length,
    queued: n("queued") + n("pending"),
    reading: n("processing"),
    waitingAllowance: n("waiting_allowance"),
    read: n("extracted"),
    failed: n("failed"),
    needsLook: pages.filter((p) => p.extraction_status === "extracted" && p.needs_look === true).length,
    // Pages held until the owner answers "Keep both" or "Skip this one" (09 §3.9.3).
    waitingDecision: pages.filter((p) => p.duplicate_of_page_id && (p.extraction_status === "queued" || p.extraction_status === "pending")).length,
  };
}
