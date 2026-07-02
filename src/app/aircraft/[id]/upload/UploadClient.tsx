"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { enqueuePage, countQueued } from "@/lib/capture/queue";
import { drainQueue, registerBackgroundDrain } from "@/lib/capture/uploader";
import { rasterizeFile, isSupportedFile } from "@/lib/capture/importFiles";
import type { CaptureLogbook } from "../capture/CaptureClient";

// Per-file outcome shown in the results list after processing.
type FileResult = {
  name: string;
  pages: number;
  warnings: number;
  error?: string;
};

export function UploadClient({
  aircraftId,
  logbooks,
}: {
  aircraftId: string;
  logbooks: CaptureLogbook[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [logbookId, setLogbookId] = useState(logbooks[0]?.id ?? "");
  const [isHandwritten, setIsHandwritten] = useState(true);

  // Session page-sequence counters, seeded from each logbook's existing count.
  const [sequences, setSequences] = useState<Record<string, number>>(() =>
    Object.fromEntries(logbooks.map((lb) => [lb.id, lb.existingPages])),
  );

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<FileResult[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const selected = logbooks.find((lb) => lb.id === logbookId);

  const refreshCount = useCallback(async () => {
    try {
      setQueueCount(await countQueued());
    } catch {
      /* IndexedDB unavailable — count stays as-is. */
    }
  }, []);

  const drain = useCallback(async () => {
    const { uploaded, failed } = await drainQueue();
    if (uploaded > 0) {
      setStatus(
        `Uploaded ${uploaded} page${uploaded === 1 ? "" : "s"}.` +
          (failed > 0 ? ` ${failed} still queued.` : ""),
      );
    }
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshCount();
    drain();

    const onOnline = () => {
      setOnline(true);
      drain();
    };
    const onOffline = () => setOnline(false);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "drain-capture-queue") drain();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [drain, refreshCount]);

  const handleFiles = useCallback(
    async (fileList: FileList) => {
      if (!selected) return;
      const files = Array.from(fileList);
      setProcessing(true);
      setResults([]);
      setStatus(null);

      // One logbook per batch, so a single running counter keeps page order.
      let seq = sequences[selected.id] ?? 0;
      const batchResults: FileResult[] = [];

      for (const file of files) {
        if (!isSupportedFile(file)) {
          batchResults.push({
            name: file.name,
            pages: 0,
            warnings: 0,
            error: "Unsupported type (need PDF, JPEG, or PNG).",
          });
          continue;
        }
        let pages = 0;
        let warnings = 0;
        try {
          await rasterizeFile(file, async (raster, index, total) => {
            setProgress(`${file.name} — page ${index}/${total}`);
            seq += 1;
            await enqueuePage({
              id: crypto.randomUUID(),
              aircraftId,
              logbookId: selected.id,
              logbookLabel: selected.label,
              pageSequence: seq,
              capturedAt: new Date(file.lastModified).toISOString(),
              isHandwritten,
              blob: raster.blob,
              width: raster.width,
              height: raster.height,
              sharpness: raster.report.sharpness,
              glareRatio: raster.report.glareRatio,
              createdAt: new Date().toISOString(),
            });
            pages += 1;
            if (!raster.report.ok) warnings += 1;
            await refreshCount();
            // Drain opportunistically so a big PDF doesn't pile up on-device.
            if (online && pages % 5 === 0) drain();
          });
          batchResults.push({ name: file.name, pages, warnings });
        } catch {
          batchResults.push({
            name: file.name,
            pages,
            warnings,
            error: "Couldn't read this file.",
          });
        }
      }

      setSequences((s) => ({ ...s, [selected.id]: seq }));
      setResults(batchResults);
      setProgress(null);
      setProcessing(false);
      registerBackgroundDrain();
      await drain();
      if (inputRef.current) inputRef.current.value = "";
    },
    [selected, sequences, aircraftId, isHandwritten, online, drain, refreshCount],
  );

  const inputClass =
    "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  const totalPages = results.reduce((n, r) => n + r.pages, 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Logbook</span>
          <select
            value={logbookId}
            onChange={(e) => setLogbookId(e.target.value)}
            disabled={processing}
            className={inputClass}
          >
            {logbooks.map((lb) => (
              <option key={lb.id} value={lb.id}>
                {lb.label}
                {lb.componentRef ? ` (${lb.componentRef})` : ""}
              </option>
            ))}
          </select>
          {selected && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Next page #{(sequences[selected.id] ?? 0) + 1} · {selected.existingPages}{" "}
              already captured
            </span>
          )}
        </label>

        <label className="flex items-center gap-2 text-sm sm:pt-6">
          <input
            type="checkbox"
            checked={isHandwritten}
            disabled={processing}
            onChange={(e) => setIsHandwritten(e.target.checked)}
          />
          Handwritten pages (routes to vision extraction)
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
            online
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
          }`}
        >
          {online ? "Online" : "Offline — pages queued on-device"}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {queueCount > 0
            ? `${queueCount} page${queueCount === 1 ? "" : "s"} waiting to upload`
            : "Queue empty"}
        </span>
        {queueCount > 0 && online && (
          <button
            onClick={drain}
            className="rounded-md border border-slate-300 px-2.5 py-1 hover:border-slate-500 dark:border-slate-700"
          >
            Upload now
          </button>
        )}
      </div>

      <label
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center ${
          processing
            ? "border-slate-200 text-slate-400 dark:border-slate-800"
            : "cursor-pointer border-slate-300 text-slate-600 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          multiple
          disabled={processing || !logbookId}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden"
        />
        <span className="font-medium">
          {processing ? "Processing…" : "Choose PDF, JPEG, or PNG files"}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Multi-page PDFs are split into one page each, in order.
        </span>
        {progress && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{progress}</span>
        )}
      </label>

      {status && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p>
      )}

      {results.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-800">
            Added {totalPages} page{totalPages === 1 ? "" : "s"} from {results.length}{" "}
            file{results.length === 1 ? "" : "s"}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {results.map((r, i) => (
              <li key={`${r.name}-${i}`} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="truncate pr-3">{r.name}</span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {r.error
                    ? r.error
                    : `${r.pages} page${r.pages === 1 ? "" : "s"}` +
                      (r.warnings > 0 ? ` · ${r.warnings} low quality` : "")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Uploaded pages are queued on-device, then reviewed and extracted later.
        MyTailLog is an index of your logbooks, not the legal maintenance record.{" "}
        <Link href={`/aircraft/${aircraftId}`} className="underline">
          Back to aircraft
        </Link>
      </p>
    </div>
  );
}
