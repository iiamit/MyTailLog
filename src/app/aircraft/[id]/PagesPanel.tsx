"use client";

import { useState } from "react";
import Link from "next/link";
import type { ExtractionStatus, ReviewStatus } from "@/lib/database.types";

export type PageRow = {
  id: string;
  logbookLabel: string;
  pageSequence: number | null;
  reviewStatus: ReviewStatus;
  extractionStatus: ExtractionStatus;
  detectedPageCount: number | null;
  extractionError: string | null;
  entryCount: number;
};

const STATUS_STYLE: Record<ExtractionStatus, string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  extracted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function PagesPanel({
  aircraftId,
  pages,
  extractionConfigured,
}: {
  aircraftId: string;
  pages: PageRow[];
  extractionConfigured: boolean;
}) {
  const [rows, setRows] = useState<PageRow[]>(pages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function extractAllPending(): Promise<void> {
    setBusy(true);
    setError(null);
    // Snapshot ids to process; sequential to respect API rate limits and timeouts.
    const pending = rows
      .filter((r) => r.extractionStatus === "pending" || r.extractionStatus === "failed")
      .map((r) => r.id);
    for (const id of pending) {
      await extractOne(id);
    }
    setBusy(false);
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        No pages yet. Capture or upload logbook pages to extract entries.
      </p>
    );
  }

  const pendingCount = rows.filter(
    (r) => r.extractionStatus === "pending" || r.extractionStatus === "failed",
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pages</h2>
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

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="w-14 shrink-0 text-slate-500 dark:text-slate-400">
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
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[r.extractionStatus]}`}
            >
              {r.extractionStatus}
            </span>
            <Link
              href={`/aircraft/${aircraftId}/pages/${r.id}/review`}
              className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:border-slate-500 dark:border-slate-700"
            >
              Review
            </Link>
            {extractionConfigured && (
              <button
                onClick={() => extractOne(r.id)}
                disabled={busy || r.extractionStatus === "processing"}
                className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
              >
                {r.extractionStatus === "extracted" ? "Re-extract" : "Extract"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
