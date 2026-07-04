"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ZoomableImage } from "@/components/ZoomableImage";
import { useToast } from "@/components/Toast";
import { isEntryClean } from "@/lib/extraction/schema";
import { EntryCard, type ReviewEntry } from "../pages/[pageId]/review/ReviewClient";
import { mergeContinuation, type EntryFields } from "../pages/[pageId]/review/actions";
import { confirmClean } from "./actions";

export type FlatEntry = ReviewEntry & {
  pageId: string;
  logbookId: string;
  pageLabel: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
};

type Filter = "review" | "all";

export function ReviewAllClient({
  aircraftId,
  entries: initial,
}: {
  aircraftId: string;
  entries: FlatEntry[];
}) {
  const toast = useToast();
  const [entries, setEntries] = useState<FlatEntry[]>(initial);
  const [filter, setFilter] = useState<Filter>("review");
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const needsReview = entries.filter((e) => !e.owner_confirmed);
  const cleanCount = useMemo(
    () => needsReview.filter(isEntryClean).length,
    [needsReview],
  );

  const shown = filter === "review" ? needsReview : entries;

  // Group by source page, preserving the server's ordering.
  const groups = useMemo(() => {
    const map = new Map<string, FlatEntry[]>();
    for (const e of shown) {
      const g = map.get(e.pageId) ?? [];
      g.push(e);
      map.set(e.pageId, g);
    }
    return [...map.entries()];
  }, [shown]);

  function patch(id: string, next: Partial<FlatEntry>) {
    setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...next } : e)));
  }

  function onSaved(id: string, fields: EntryFields) {
    patch(id, { ...fields, owner_confirmed: true });
  }

  async function onMerge(tailId: string) {
    const tail = entries.find((e) => e.id === tailId);
    if (!tail) return;
    setMergingId(tailId);
    const res = await mergeContinuation(aircraftId, tail.pageId, tailId);
    setMergingId(null);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    setEntries((es) => es.filter((e) => e.id !== tailId));
    toast.success("Merged into the previous page.");
  }

  async function handleConfirmClean() {
    setConfirming(true);
    const res = await confirmClean(aircraftId);
    setConfirming(false);
    if ("error" in res) {
      toast.error(res.error);
      return;
    }
    if (res.confirmed === 0) {
      toast.success("Nothing clean to confirm — the rest need your eyes.");
      return;
    }
    // Mirror the server's strict rule locally so confirmed entries drop out of
    // the review filter without a full reload.
    setEntries((es) =>
      es.map((e) => (isEntryClean(e) && !e.owner_confirmed ? { ...e, owner_confirmed: true } : e)),
    );
    toast.success(
      `Confirmed ${res.confirmed} clean ${res.confirmed === 1 ? "entry" : "entries"}` +
        (res.remaining > 0 ? ` · ${res.remaining} still need your review.` : "."),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          {(
            [
              ["review", "Needs review", needsReview.length],
              ["all", "All entries", entries.length],
            ] as const
          ).map(([key, label, n]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900"
                    : "border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={handleConfirmClean}
          disabled={confirming || cleanCount === 0}
          title="Confirm every high-confidence entry the AI flagged nothing on. Anything with a low field is left for you."
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {confirming ? "Confirming…" : `Confirm ${cleanCount} clean`}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {filter === "review"
            ? "Nothing left to review — every entry is confirmed."
            : "No entries yet."}
        </p>
      ) : (
        groups.map(([pageId, pageEntries]) => {
          const head = pageEntries[0];
          return (
            <div key={pageId} className="flex flex-col gap-3">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
                {head.thumbnailUrl ? (
                  <ZoomableImage
                    src={head.thumbnailUrl}
                    fullSrc={head.fullUrl}
                    alt={head.pageLabel}
                    className="h-12 w-12 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-slate-100 dark:bg-slate-800" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{head.pageLabel}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {pageEntries.length} {pageEntries.length === 1 ? "entry" : "entries"} here
                  </div>
                </div>
                <Link
                  href={`/aircraft/${aircraftId}/pages/${pageId}/review`}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:border-slate-500 dark:border-slate-700"
                >
                  Open page ↗
                </Link>
              </div>

              {pageEntries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  isNew={false}
                  aircraftId={aircraftId}
                  pageId={e.pageId}
                  logbookId={e.logbookId}
                  onSaved={onSaved}
                  onCreated={() => {}}
                  onDeleted={(id) => setEntries((es) => es.filter((x) => x.id !== id))}
                  onCancelNew={() => {}}
                  onMerge={onMerge}
                  merging={mergingId === e.id}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
