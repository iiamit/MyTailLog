"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ExtractionStatus, ReviewStatus } from "@/lib/database.types";
import { deletePage } from "./actions";
import { ZoomableImage } from "@/components/ZoomableImage";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import { makeThumbnail, thumbnailKey } from "@/lib/capture/thumbnail";

const BUCKET =
  process.env.NEXT_PUBLIC_LOGBOOK_STORAGE_BUCKET || "logbook-pages";

export type PageRow = {
  id: string;
  logbookId: string;
  logbookLabel: string;
  pageSequence: number | null;
  reviewStatus: ReviewStatus;
  extractionStatus: ExtractionStatus;
  detectedPageCount: number | null;
  extractionError: string | null;
  entryCount: number;
  latestDate: string | null;
  tach: number | null;
  hobbs: number | null;
  thumbnailUrl: string | null;
  fullUrl: string | null;
  storagePath: string;
  needsThumbnail: boolean;
};

export type LogbookTile = {
  id: string;
  label: string;
  componentRef: string | null;
  pageCount: number;
};

const STATUS_STYLE: Record<ExtractionStatus, { className: string; style?: CSSProperties }> = {
  pending: { className: "bg-panel2 text-dim" },
  processing: { className: "bg-accent-soft text-accent" },
  extracted: { className: "text-annun-green", style: { background: "var(--grn-bg)" } },
  failed: { className: "text-annun-red", style: { background: "var(--red-bg)" } },
};

export function PagesPanel({
  aircraftId,
  logbooks,
  pages,
  extractionConfigured,
  canEdit,
}: {
  aircraftId: string;
  logbooks: LogbookTile[];
  pages: PageRow[];
  extractionConfigured: boolean;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<PageRow[]>(pages);
  // Clicking a logbook tile filters the list to that logbook (null = all).
  // Seed from ?logbook=<id> so returning from a page's review keeps the filter.
  const searchParams = useSearchParams();
  const [selectedLogbookId, setSelectedLogbookId] = useState<string | null>(
    () => searchParams.get("logbook"),
  );
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [queue, setQueue] = useState<"all" | "review" | "processing">("all");

  function patch(id: string, next: Partial<PageRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }

  async function extractOne(id: string): Promise<void> {
    patch(id, { extractionStatus: "processing", extractionError: null });
    try {
      const res = await fetch(`/api/pages/${id}/extract`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        patch(id, { extractionStatus: "failed", extractionError: data.error ?? "Failed." });
        return;
      }
      patch(id, {
        extractionStatus: "extracted",
        extractionError: null,
        entryCount: data.entryCount ?? 0,
        detectedPageCount: data.detectedPageCount ?? null,
      });
    } catch {
      patch(id, { extractionStatus: "failed", extractionError: "Network error." });
    }
  }

  async function deleteRow(row: PageRow): Promise<void> {
    setDeletingId(row.id);
    const res = await deletePage(aircraftId, row.id);
    setDeletingId(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    toast.success("Page deleted.");
  }

  // One-time backfill for pages uploaded before thumbnails existed: resize the
  // original in the browser and upload a thumbnail (no server image processing).
  const [backfilling, setBackfilling] = useState(false);
  async function backfillThumbnails(): Promise<void> {
    const todo = rows.filter((r) => r.needsThumbnail && r.thumbnailUrl);
    if (todo.length === 0) return;
    setBackfilling(true);
    const supabase = createClient();
    let made = 0;
    for (const r of todo) {
      try {
        const orig = await fetch(r.thumbnailUrl!).then((res) => res.blob());
        const thumb = await makeThumbnail(orig);
        const thumbPath = thumbnailKey(r.storagePath);
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: true });
        if (upErr) continue;
        await supabase.from("page").update({ thumbnail_path: thumbPath }).eq("id", r.id);
        patch(r.id, { needsThumbnail: false });
        made += 1;
      } catch {
        // skip this page; others still process
      }
    }
    setBackfilling(false);
    if (made > 0) toast.success(`Generated ${made} thumbnail${made === 1 ? "" : "s"}.`);
  }

  const visibleRows = selectedLogbookId
    ? rows.filter((r) => r.logbookId === selectedLogbookId)
    : rows;
  const selectedLabel = logbooks.find((l) => l.id === selectedLogbookId)?.label;
  const missingThumbs = rows.filter((r) => r.needsThumbnail).length;

  async function extractAllPending(): Promise<void> {
    setBusy(true);
    // Sequential to respect API rate limits/timeouts; scoped to what's shown.
    const pending = visibleRows
      .filter((r) => r.extractionStatus === "pending" || r.extractionStatus === "failed")
      .map((r) => r.id);
    for (const id of pending) {
      await extractOne(id);
    }
    setBusy(false);
  }

  const pendingCount = visibleRows.filter(
    (r) => r.extractionStatus === "pending" || r.extractionStatus === "failed",
  ).length;
  const extractedCount = visibleRows.filter((r) => r.extractionStatus === "extracted").length;
  const needsReviewCount = visibleRows.filter(
    (r) => r.extractionStatus === "extracted" && r.reviewStatus === "unreviewed",
  ).length;
  const reviewedCount = visibleRows.filter((r) => r.reviewStatus === "confirmed").length;
  const processingCount = visibleRows.filter(
    (r) => r.extractionStatus === "pending" || r.extractionStatus === "processing",
  ).length;

  // Queue filter pills (in addition to the logbook filter).
  const isReview = (r: PageRow) =>
    r.extractionStatus === "extracted" && r.reviewStatus === "unreviewed";
  const isProcessing = (r: PageRow) =>
    r.extractionStatus === "pending" || r.extractionStatus === "processing";
  const displayRows = visibleRows.filter((r) =>
    queue === "review" ? isReview(r) : queue === "processing" ? isProcessing(r) : true,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Logbook tiles double as a filter. */}
      <div className="grid gap-3 sm:grid-cols-4">
        {logbooks.map((lb) => {
          const active = selectedLogbookId === lb.id;
          return (
            <button
              key={lb.id}
              onClick={() => setSelectedLogbookId(active ? null : lb.id)}
              className={`panel px-4 py-4 text-center transition ${
                active ? "border-line2 bg-panel2" : "hover:border-line2"
              }`}
            >
              <div className="font-medium">{lb.label}</div>
              {lb.componentRef && (
                <div className="text-xs text-faint">{lb.componentRef}</div>
              )}
              <div className="mt-1 text-xs text-faint">
                {lb.pageCount} page{lb.pageCount === 1 ? "" : "s"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Pages header + summary */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Pages{selectedLabel ? ` · ${selectedLabel}` : ""}
            {selectedLogbookId && (
              <button
                onClick={() => setSelectedLogbookId(null)}
                className="ml-2 text-xs font-normal text-dim underline hover:text-ink"
              >
                show all
              </button>
            )}
          </h3>
          {extractedCount > 0 && (
            <p className="text-xs text-dim">
              {needsReviewCount > 0 ? (
                <span className="font-medium text-annun-amber">
                  {needsReviewCount} need review
                </span>
              ) : (
                <span className="text-annun-green">
                  all extracted pages reviewed
                </span>
              )}
              {reviewedCount > 0 && ` · ${reviewedCount} reviewed`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && extractedCount > 0 && (
            <Link
              href={`/aircraft/${aircraftId}/review`}
              title="Scroll through every extracted entry and confirm them in bulk"
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                needsReviewCount > 0
                  ? "border-annun-amber/60 text-annun-amber hover:border-annun-amber"
                  : "border-line text-dim hover:border-line2 hover:text-ink"
              }`}
            >
              Review all{needsReviewCount > 0 ? ` (${needsReviewCount})` : ""}
            </Link>
          )}
          {missingThumbs > 0 && canEdit && (
            <button
              onClick={backfillThumbnails}
              disabled={backfilling}
              title="Generate small thumbnails from the originals (one-time)"
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
            >
              {backfilling ? "Generating…" : `Thumbnails (${missingThumbs})`}
            </button>
          )}
          {extractionConfigured ? (
            <button
              onClick={extractAllPending}
              disabled={busy || pendingCount === 0}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Extracting…" : `Extract ${pendingCount} pending`}
            </button>
          ) : (
            <span className="text-xs text-dim">
              Set ANTHROPIC_API_KEY to enable extraction
            </span>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All", visibleRows.length],
              ["review", "Needs review", needsReviewCount],
              ["processing", "Processing", processingCount],
            ] as const
          ).map(([key, label, n]) => {
            const active = queue === key;
            return (
              <button
                key={key}
                onClick={() => setQueue(key)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-accent bg-accent text-bg"
                    : "border-line text-dim hover:border-line2"
                }`}
              >
                {label}
                {key !== "all" && n > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-bg/20" : "bg-panel2"}`}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-dim">
          No pages yet. Capture or upload logbook pages to extract entries.
        </p>
      ) : displayRows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-dim">
          {queue === "review"
            ? "Nothing to review here."
            : queue === "processing"
              ? "Nothing processing."
              : `No pages in ${selectedLabel}.`}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {displayRows.map((r) => {
            const needsReview =
              r.extractionStatus === "extracted" && r.reviewStatus === "unreviewed";
            const reviewBadge =
              r.reviewStatus === "confirmed"
                ? { label: "✓ reviewed", className: "text-annun-green", style: { background: "var(--grn-bg)" } as CSSProperties }
                : r.reviewStatus === "disputed"
                  ? { label: "disputed", className: "text-annun-red", style: { background: "var(--red-bg)" } as CSSProperties }
                  : needsReview
                    ? { label: "needs review", className: "text-annun-amber", style: { background: "var(--amb-bg)" } as CSSProperties }
                    : null;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 border-l-4 px-4 py-3 text-sm ${
                  needsReview ? "border-l-annun-amber" : "border-l-transparent"
                }`}
              >
                {r.thumbnailUrl ? (
                  <ZoomableImage
                    src={r.thumbnailUrl}
                    fullSrc={r.fullUrl}
                    alt={`${r.logbookLabel} page ${r.pageSequence ?? ""}`}
                    className="h-12 w-12 shrink-0 rounded border border-line object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-panel2" />
                )}
                <div className="w-10 shrink-0 text-dim">
                  {r.pageSequence != null ? `#${r.pageSequence}` : "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.logbookLabel}</div>
                  <div className="text-xs text-dim">
                    {r.extractionStatus === "extracted"
                      ? `${r.entryCount} ${r.entryCount === 1 ? "entry" : "entries"}`
                      : "not extracted"}
                    {r.detectedPageCount === 2 && (
                      <span className="ml-2 text-annun-amber">
                        · two-page spread — split during review
                      </span>
                    )}
                    {r.extractionStatus === "failed" && r.extractionError && (
                      <span className="ml-2 text-annun-red">
                        · {r.extractionError}
                      </span>
                    )}
                  </div>
                </div>
                {(r.latestDate || r.tach != null || r.hobbs != null) && (
                  <div className="hidden shrink-0 text-right font-mono text-xs leading-tight text-dim sm:block">
                    {r.latestDate && <div>{r.latestDate}</div>}
                    {r.tach != null ? (
                      <div className="text-faint">{r.tach.toLocaleString()} tach</div>
                    ) : r.hobbs != null ? (
                      <div className="text-faint">{r.hobbs.toLocaleString()} hobbs</div>
                    ) : null}
                  </div>
                )}
                {reviewBadge && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${reviewBadge.className}`}
                    style={reviewBadge.style}
                  >
                    {reviewBadge.label}
                  </span>
                )}
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[r.extractionStatus].className}`}
                  style={STATUS_STYLE[r.extractionStatus].style}
                >
                  {r.extractionStatus}
                </span>
                <Link
                  href={`/aircraft/${aircraftId}/pages/${r.id}/review${
                    selectedLogbookId ? `?logbook=${encodeURIComponent(selectedLogbookId)}` : ""
                  }`}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs ${
                    needsReview
                      ? "border-annun-amber/60 font-medium text-annun-amber hover:border-annun-amber"
                      : "border-line text-dim hover:border-line2 hover:text-ink"
                  }`}
                >
                  Review
                </Link>
                {extractionConfigured && (
                  <button
                    onClick={() => extractOne(r.id)}
                    disabled={busy || deletingId === r.id || r.extractionStatus === "processing"}
                    className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
                  >
                    {r.extractionStatus === "extracted" ? "Re-extract" : "Extract"}
                  </button>
                )}
                {canEdit && (
                  <ConfirmButton
                    onConfirm={() => deleteRow(r)}
                    confirmLabel={
                      r.entryCount > 0 ? `Delete + ${r.entryCount} ${r.entryCount === 1 ? "entry" : "entries"}` : "Delete"
                    }
                    disabled={busy || deletingId === r.id}
                    className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
                  >
                    {deletingId === r.id ? "Deleting…" : "Delete"}
                  </ConfirmButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
