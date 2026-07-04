"use client";

import { useState } from "react";
import Link from "next/link";
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

const STATUS_STYLE: Record<ExtractionStatus, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  extracted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
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
  const [selectedLogbookId, setSelectedLogbookId] = useState<string | null>(null);
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
              className={`rounded-lg border bg-white px-4 py-4 text-center transition dark:bg-slate-900 ${
                active
                  ? "border-slate-900 ring-2 ring-slate-900 dark:border-white dark:ring-white"
                  : "border-slate-200 hover:border-slate-400 dark:border-slate-800 dark:hover:border-slate-600"
              }`}
            >
              <div className="font-medium">{lb.label}</div>
              {lb.componentRef && (
                <div className="text-xs text-slate-500">{lb.componentRef}</div>
              )}
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                className="ml-2 text-xs font-normal text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
              >
                show all
              </button>
            )}
          </h3>
          {extractedCount > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {needsReviewCount > 0 ? (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {needsReviewCount} need review
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">
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
                  ? "border-amber-400 text-amber-700 hover:border-amber-500 dark:border-amber-500 dark:text-amber-300"
                  : "border-slate-300 hover:border-slate-500 dark:border-slate-700"
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
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
            >
              {backfilling ? "Generating…" : `Thumbnails (${missingThumbs})`}
            </button>
          )}
          {extractionConfigured ? (
            <button
              onClick={extractAllPending}
              disabled={busy || pendingCount === 0}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {busy ? "Extracting…" : `Extract ${pendingCount} pending`}
            </button>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
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
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {label}
                {key !== "all" && n > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No pages yet. Capture or upload logbook pages to extract entries.
        </p>
      ) : displayRows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {queue === "review"
            ? "Nothing to review here."
            : queue === "processing"
              ? "Nothing processing."
              : `No pages in ${selectedLabel}.`}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {displayRows.map((r) => {
            const needsReview =
              r.extractionStatus === "extracted" && r.reviewStatus === "unreviewed";
            const reviewBadge =
              r.reviewStatus === "confirmed"
                ? { label: "✓ reviewed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
                : r.reviewStatus === "disputed"
                  ? { label: "disputed", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" }
                  : needsReview
                    ? { label: "needs review", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
                    : null;
            return (
              <li
                key={r.id}
                className={`flex items-center gap-3 border-l-4 px-4 py-3 text-sm ${
                  needsReview
                    ? "border-l-amber-400 dark:border-l-amber-500"
                    : "border-l-transparent"
                }`}
              >
                {r.thumbnailUrl ? (
                  <ZoomableImage
                    src={r.thumbnailUrl}
                    fullSrc={r.fullUrl}
                    alt={`${r.logbookLabel} page ${r.pageSequence ?? ""}`}
                    className="h-12 w-12 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-slate-100 dark:bg-slate-800" />
                )}
                <div className="w-10 shrink-0 text-slate-500 dark:text-slate-400">
                  {r.pageSequence != null ? `#${r.pageSequence}` : "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{r.logbookLabel}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {r.extractionStatus === "extracted"
                      ? `${r.entryCount} ${r.entryCount === 1 ? "entry" : "entries"}`
                      : "not extracted"}
                    {r.detectedPageCount === 2 && (
                      <span className="ml-2 text-amber-600 dark:text-amber-400">
                        · two-page spread — split during review
                      </span>
                    )}
                    {r.extractionStatus === "failed" && r.extractionError && (
                      <span className="ml-2 text-red-600 dark:text-red-400">
                        · {r.extractionError}
                      </span>
                    )}
                  </div>
                </div>
                {reviewBadge && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${reviewBadge.className}`}
                  >
                    {reviewBadge.label}
                  </span>
                )}
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[r.extractionStatus]}`}
                >
                  {r.extractionStatus}
                </span>
                <Link
                  href={`/aircraft/${aircraftId}/pages/${r.id}/review`}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs ${
                    needsReview
                      ? "border-amber-400 font-medium text-amber-700 hover:border-amber-500 dark:border-amber-500 dark:text-amber-300"
                      : "border-slate-300 hover:border-slate-500 dark:border-slate-700"
                  }`}
                >
                  Review
                </Link>
                {extractionConfigured && (
                  <button
                    onClick={() => extractOne(r.id)}
                    disabled={busy || deletingId === r.id || r.extractionStatus === "processing"}
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
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
                    className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-slate-700 dark:text-red-400"
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
