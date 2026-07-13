"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ZoomableImage } from "@/components/ZoomableImage";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useToast } from "@/components/Toast";
import { deletePage, acceptHoursFix, clearHoursField, dismissHoursFlag } from "../actions";
import { deleteEntry } from "../pages/[pageId]/review/actions";

export type PageRow = {
  id: string;
  keep: boolean;
  label: string;
  sequence: number | null;
  thumb: string | null;
  entryCount: number;
};

export type EntryRow = {
  id: string;
  pageId: string | null;
  keep: boolean;
  confirmed: boolean;
  date: string | null;
  tach: number | null;
  hobbs: number | null;
  text: string;
  pageLabel: string | null;
  pageSequence: number | null;
  thumb: string | null;
};

export type AnomalyRow = {
  readingId: string;
  source: "entry" | "mfb";
  field: "hobbs" | "tach";
  value: number;
  suggested: number | null;
  reason: "non_monotonic" | "magnitude" | "duplicate";
  date: string | null;
  pageId: string | null;
};

function KeepBadge() {
  return (
    <span className="shrink-0 rounded-full border border-annun-green/50 px-2 py-0.5 text-[11px] font-medium text-annun-green">
      suggested keep
    </span>
  );
}

export function DuplicatesClient({
  aircraftId,
  pageClusters: initialPages,
  entryClusters: initialEntries,
  anomalies: initialAnomalies = [],
}: {
  aircraftId: string;
  pageClusters: PageRow[][];
  entryClusters: EntryRow[][];
  anomalies?: AnomalyRow[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pageClusters, setPageClusters] = useState(initialPages);
  const [entryClusters, setEntryClusters] = useState(initialEntries);
  const [anomalies, setAnomalies] = useState(initialAnomalies);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function acceptAnomaly(a: AnomalyRow) {
    const raw = edits[a.readingId] ?? String(a.suggested ?? "");
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a positive number.");
    setBusyId(a.readingId);
    const res = await acceptHoursFix(aircraftId, a.source, a.readingId, a.field, value);
    setBusyId(null);
    if ("error" in res) return toast.error(res.error);
    setAnomalies((xs) => xs.filter((x) => x.readingId !== a.readingId));
    toast.success(`${a.field} set to ${value.toLocaleString()}.`);
    router.refresh();
  }

  async function clearAnomaly(a: AnomalyRow) {
    setBusyId(a.readingId);
    const res = await clearHoursField(aircraftId, a.source, a.readingId, a.field);
    setBusyId(null);
    if ("error" in res) return toast.error(res.error);
    setAnomalies((xs) => xs.filter((x) => x.readingId !== a.readingId));
    toast.success(`Cleared the duplicated ${a.field}.`);
    router.refresh();
  }

  async function dismissAnomaly(a: AnomalyRow) {
    setBusyId(a.readingId);
    const res = await dismissHoursFlag(aircraftId, a.source, a.readingId);
    setBusyId(null);
    if ("error" in res) return toast.error(res.error);
    setAnomalies((xs) => xs.filter((x) => x.readingId !== a.readingId));
    toast.success("Kept as recorded.");
    router.refresh();
  }

  // Drop the removed id from its cluster; a cluster with <2 members is resolved.
  function prune<T extends { id: string }>(clusters: T[][], removedId: string): T[][] {
    return clusters
      .map((c) => c.filter((r) => r.id !== removedId))
      .filter((c) => c.length >= 2);
  }

  async function removePage(row: PageRow) {
    setBusyId(row.id);
    const res = await deletePage(aircraftId, row.id);
    setBusyId(null);
    if ("error" in res) return toast.error(res.error);
    setPageClusters((cs) => prune(cs, row.id));
    toast.success("Duplicate page deleted.");
    router.refresh();
  }

  async function removeEntry(row: EntryRow) {
    setBusyId(row.id);
    const res = await deleteEntry(aircraftId, row.pageId ?? "", row.id);
    setBusyId(null);
    if ("error" in res) return toast.error(res.error);
    setEntryClusters((cs) => prune(cs, row.id));
    toast.success("Duplicate entry deleted.");
    router.refresh();
  }

  const nothing = pageClusters.length === 0 && entryClusters.length === 0 && anomalies.length === 0;
  if (nothing) {
    return (
      <div className="rounded-lg border border-annun-green/40 bg-[var(--grn-bg)] px-5 py-8 text-center text-sm text-annun-green">
        Nothing to review. (Duplicate matching and mis-keyed-reading checks are
        heuristic — they can&apos;t catch everything; give pages a quick scan too.)
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {anomalies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Possible mis-keyed readings{" "}
            <span className="text-sm font-normal text-dim">· {anomalies.length}</span>
          </h2>
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-3 text-xs text-dim">
              These hobbs/tach values look off — a typo (dropped/extra digit, or below an
              earlier reading), or a hobbs that&apos;s just the tach value duplicated into
              both fields. Accept the suggested fix, clear the duplicate, or keep yours.
            </div>
            <ul className="flex flex-col gap-2">
              {anomalies.map((a) => (
                <li
                  key={a.readingId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-annun-amber/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
                      <span className="readout text-ink">{a.date ?? "no date"}</span>
                      <span className="rounded-full bg-panel2 px-2 py-0.5 text-faint">
                        {a.source === "mfb" ? "MyFlightBook" : "log entry"}
                      </span>
                      <span>
                        {a.field} <span className="readout text-annun-amber">{a.value.toLocaleString()}</span>
                        {a.reason === "non_monotonic"
                          ? " · below an earlier reading"
                          : a.reason === "magnitude"
                            ? " · unusually large jump"
                            : " · same value as tach (duplicated into hobbs)"}
                      </span>
                    </div>
                  </div>
                  {a.pageId && (
                    <Link
                      href={`/aircraft/${aircraftId}/pages/${a.pageId}/review`}
                      className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-dim hover:border-line2 hover:text-ink"
                    >
                      Open
                    </Link>
                  )}
                  {a.reason === "duplicate" ? (
                    <button
                      onClick={() => clearAnomaly(a)}
                      disabled={busyId === a.readingId}
                      className="shrink-0 rounded-md border border-annun-green/50 px-3 py-1.5 text-xs text-annun-green hover:border-annun-green disabled:opacity-50"
                    >
                      {busyId === a.readingId ? "Clearing…" : `Clear ${a.field}`}
                    </button>
                  ) : (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-dim">
                        fix to
                        <input
                          type="number"
                          inputMode="decimal"
                          value={edits[a.readingId] ?? (a.suggested != null ? String(a.suggested) : "")}
                          onChange={(e) => setEdits((m) => ({ ...m, [a.readingId]: e.target.value }))}
                          className="w-24 rounded-md border border-line bg-panel2 px-2 py-1 text-right text-ink"
                        />
                      </label>
                      <button
                        onClick={() => acceptAnomaly(a)}
                        disabled={busyId === a.readingId}
                        className="shrink-0 rounded-md border border-annun-green/50 px-3 py-1.5 text-xs text-annun-green hover:border-annun-green disabled:opacity-50"
                      >
                        {busyId === a.readingId ? "Saving…" : "Accept"}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => dismissAnomaly(a)}
                    disabled={busyId === a.readingId}
                    className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
                  >
                    Keep mine
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {pageClusters.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Duplicate scans <span className="text-sm font-normal text-dim">· {pageClusters.length}</span>
          </h2>
          {pageClusters.map((cluster, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-3 text-xs text-dim">
                {cluster.length} pages look like the same scan in {cluster[0].label}.
              </div>
              <ul className="flex flex-col gap-2">
                {cluster.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                    {p.thumb ? (
                      <ZoomableImage src={p.thumb} alt="Page" className="h-12 w-12 shrink-0 rounded border border-line object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded bg-panel2" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {p.label}
                        {p.sequence != null ? ` · page #${p.sequence}` : ""}
                      </div>
                      <div className="text-xs text-dim">{p.entryCount} {p.entryCount === 1 ? "entry" : "entries"}</div>
                    </div>
                    <Link
                      href={`/aircraft/${aircraftId}/pages/${p.id}/review`}
                      className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-dim hover:border-line2 hover:text-ink"
                    >
                      Open
                    </Link>
                    {p.keep && <KeepBadge />}
                    <ConfirmButton
                      onConfirm={() => removePage(p)}
                      confirmLabel={p.entryCount > 0 ? `Delete page + ${p.entryCount} ${p.entryCount === 1 ? "entry" : "entries"}` : "Delete page"}
                      disabled={busyId === p.id}
                      className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
                    >
                      {busyId === p.id ? "Deleting…" : "Delete"}
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {entryClusters.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            Duplicate entries <span className="text-sm font-normal text-dim">· {entryClusters.length}</span>
          </h2>
          {entryClusters.map((cluster, i) => (
            <div key={i} className="rounded-xl border border-line bg-panel p-4">
              <div className="mb-3 text-xs text-dim">
                {cluster.length} entries look like the same logged event.
              </div>
              <ul className="flex flex-col gap-2">
                {cluster.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2">
                    {e.thumb ? (
                      <ZoomableImage src={e.thumb} alt="Source page" className="h-12 w-12 shrink-0 rounded border border-line object-cover" />
                    ) : (
                      <div className="h-12 w-12 shrink-0 rounded bg-panel2" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
                        <span className="readout text-ink">{e.date ?? "no date"}</span>
                        {e.tach != null && <span>{e.tach.toLocaleString()} tach</span>}
                        {e.tach == null && e.hobbs != null && <span>{e.hobbs.toLocaleString()} hobbs</span>}
                        {e.confirmed && <span className="text-annun-green">confirmed</span>}
                        {e.pageLabel && (
                          <span className="text-faint">
                            · {e.pageLabel}
                            {e.pageSequence != null ? ` #${e.pageSequence}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13px] text-ink">{e.text || <span className="text-faint">no text</span>}</div>
                    </div>
                    {e.pageId && (
                      <Link
                        href={`/aircraft/${aircraftId}/pages/${e.pageId}/review`}
                        className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-dim hover:border-line2 hover:text-ink"
                      >
                        Open
                      </Link>
                    )}
                    {e.keep && <KeepBadge />}
                    <ConfirmButton
                      onConfirm={() => removeEntry(e)}
                      confirmLabel="Delete entry"
                      disabled={busyId === e.id}
                      className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
                    >
                      {busyId === e.id ? "Deleting…" : "Delete"}
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
