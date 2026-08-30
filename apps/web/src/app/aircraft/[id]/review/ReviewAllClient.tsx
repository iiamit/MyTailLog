"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ZoomableImage } from "@/components/ZoomableImage";
import { useToast } from "@/components/Toast";
import { isEntryClean, type FieldBox } from "@/lib/extraction/schema";
import { EntryCard, type ReviewEntry } from "../pages/[pageId]/review/ReviewClient";
import type { EntryAttachment } from "../pages/[pageId]/review/EntryExtras";
import { mergeContinuation, type EntryFields } from "../pages/[pageId]/review/actions";
import { confirmClean } from "./actions";

export type FlatEntry = ReviewEntry & {
  // null = no scan behind this entry (a CSV import). log_entry.page_id is
  // nullable, so these are real entries with no page to open or crop from.
  pageId: string | null;
  logbookId: string;
  pageLabel: string;
  thumbnailUrl: string | null;
  fullUrl: string | null;
};

/** Group key: the source page, or the logbook for scan-less imported entries. */
const groupKey = (e: FlatEntry) => e.pageId ?? `imported:${e.logbookId}`;

type Filter = "review" | "all";

export function ReviewAllClient({
  aircraftId,
  entries: initial,
  attachmentsByEntry,
}: {
  aircraftId: string;
  entries: FlatEntry[];
  attachmentsByEntry: Record<string, EntryAttachment[]>;
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

  // Group by source page (or logbook, for imports), preserving the server's ordering.
  const groups = useMemo(() => {
    const map = new Map<string, FlatEntry[]>();
    for (const e of shown) {
      const key = groupKey(e);
      const g = map.get(key) ?? [];
      g.push(e);
      map.set(key, g);
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
    if (!tail?.pageId) return; // no page → no previous page to merge into
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
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                    ? "border-accent bg-accent text-bg"
                    : "border-line text-dim hover:border-line2"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-bg/20" : "bg-panel2"}`}
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
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {confirming ? "Confirming…" : `Confirm ${cleanCount} clean`}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
          {filter === "review"
            ? "Nothing left to review — every entry is confirmed."
            : "No entries yet."}
        </p>
      ) : (
        groups.map(([key, pageEntries]) => (
          <PageGroup
            key={key}
            aircraftId={aircraftId}
            pageEntries={pageEntries}
            attachmentsByEntry={attachmentsByEntry}
            onSaved={onSaved}
            onDeleted={(id) => setEntries((es) => es.filter((x) => x.id !== id))}
            onMerge={onMerge}
            mergingId={mergingId}
          />
        ))
      )}
    </div>
  );
}

/**
 * One source page: its scan pinned on the left, its entries on the right.
 *
 * This view used to show the scan as a 48px thumbnail in the group header, so
 * checking a transcription against the original meant opening the lightbox,
 * reading, closing it, and repeating for the next entry. Reported from the
 * field: "I find myself having to click the image, it shows up within the whole
 * page, then click off that to go back and keep cross referencing."
 *
 * The single-page reviewer already solved this — scan sticky on the left,
 * entries scrolling on the right — so this lifts that layout rather than
 * inventing a second one. Wiring `onLocate` also activates the spotlight that
 * was already built into EntryCard but unreachable here: tapping a field's ◎
 * rings the exact box it was read from.
 */
function PageGroup({
  aircraftId,
  pageEntries,
  attachmentsByEntry,
  onSaved,
  onDeleted,
  onMerge,
  mergingId,
}: {
  aircraftId: string;
  pageEntries: FlatEntry[];
  attachmentsByEntry: Record<string, EntryAttachment[]>;
  onSaved: (id: string, fields: EntryFields) => void;
  onDeleted: (id: string) => void;
  onMerge: (tailId: string) => void;
  mergingId: string | null;
}) {
  // Which field's box is spotlighted on this group's scan (null = none).
  const [spot, setSpot] = useState<{ box: FieldBox; key: string } | null>(null);
  const head = pageEntries[0];
  // Imported entries (CSV) have no page behind them, so there is nothing to put
  // in the left column — those groups stay full width.
  const scan = head.pageId ? head.fullUrl : null;

  const header = (
    <div className="flex items-center gap-3 border-b border-line pb-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-ink">{head.pageLabel}</div>
        <div className="text-xs text-faint">
          {pageEntries.length} {pageEntries.length === 1 ? "entry" : "entries"} here
          {!head.pageId && " · no scan to check against"}
        </div>
      </div>
      {head.pageId && (
        <Link
          href={`/aircraft/${aircraftId}/pages/${head.pageId}/review`}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs hover:border-line2"
        >
          Open page ↗
        </Link>
      )}
    </div>
  );

  const cards = pageEntries.map((e) => (
    <EntryCard
      key={e.id}
      entry={e}
      isNew={false}
      aircraftId={aircraftId}
      pageId={e.pageId}
      logbookId={e.logbookId}
      imageUrl={e.fullUrl}
      onLocate={scan ? (box, k) => setSpot(box ? { box, key: k } : null) : undefined}
      activeKey={spot?.key ?? null}
      onSaved={onSaved}
      onCreated={() => {}}
      onDeleted={onDeleted}
      onCancelNew={() => {}}
      onMerge={onMerge}
      merging={mergingId === e.id}
      canEdit
      attachments={attachmentsByEntry[e.id] ?? []}
    />
  ));

  if (!scan) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        {cards}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {header}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="relative overflow-hidden rounded-lg border border-line">
            <ZoomableImage
              src={scan}
              alt={head.pageLabel}
              // Capped so a tall page still fits the viewport while pinned —
              // a sticky image taller than the screen hides its own bottom.
              className="max-h-[calc(100vh-9rem)] w-full object-contain"
            />
            {/* Spotlight: dim the page and ring the located field's box. */}
            {spot && (
              <div
                className="pointer-events-none absolute rounded-[3px] transition-all duration-200"
                style={{
                  left: `${spot.box.x * 100}%`,
                  top: `${spot.box.y * 100}%`,
                  width: `${spot.box.w * 100}%`,
                  height: `${spot.box.h * 100}%`,
                  border: "2px solid var(--accent)",
                  boxShadow: "0 0 0 9999px rgba(4,10,20,0.55)",
                }}
              />
            )}
          </div>
          <p className="mt-1 text-center text-xs text-faint">
            Tap a field&apos;s ◎ to spotlight where it was read. Click the image to magnify.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-3">{cards}</div>
      </div>
    </div>
  );
}
