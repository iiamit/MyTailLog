"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rasterizeFile } from "@/lib/capture/importFiles";
import { type QualityReport } from "@/lib/capture/imageQuality";
import { enqueuePage, countQueued } from "@/lib/capture/queue";
import { drainQueue, registerBackgroundDrain } from "@/lib/capture/uploader";
import { makeThumbnail } from "@/lib/capture/thumbnail";

export type CaptureLogbook = {
  id: string;
  label: string;
  componentRef: string | null;
  existingPages: number;
};

// A processed shot awaiting the user's keep/retake decision.
type PendingShot = {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  report: QualityReport;
};

export function CaptureClient({
  aircraftId,
  logbooks,
  initialLogbookId,
  tailNumber,
}: {
  aircraftId: string;
  logbooks: CaptureLogbook[];
  /** Preselected via ?logbook= when arriving from a specific logbook. */
  initialLogbookId?: string;
  tailNumber?: string | null;
}) {
  // The native camera. On iOS `capture` opens the Camera app directly; on
  // desktop it falls back to a normal file picker, which is the sane behaviour
  // there anyway.
  const fileRef = useRef<HTMLInputElement>(null);

  const [logbookId, setLogbookId] = useState(initialLogbookId ?? logbooks[0]?.id ?? "");
  const [isHandwritten, setIsHandwritten] = useState(true);

  // Session page-sequence counters, seeded from each logbook's existing count.
  const [sequences, setSequences] = useState<Record<string, number>>(() =>
    Object.fromEntries(logbooks.map((lb) => [lb.id, lb.existingPages])),
  );

  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingShot | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const selected = logbooks.find((lb) => lb.id === logbookId);

  const refreshCount = useCallback(async () => {
    try {
      setQueueCount(await countQueued());
    } catch {
      /* IndexedDB unavailable (e.g. private mode) — count stays as-is. */
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

  // --- Lifecycle: queue drain, online + SW-message listeners ---
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate SSR-safe init: render `true`, correct to navigator.onLine on mount (avoids a hydration mismatch on the offline-sync path)
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

  /**
   * Turn the photo the OS camera returned into a queued page.
   *
   * All of the heavy lifting is `rasterizeFile` — the SAME path an uploaded
   * scan takes, so a captured page and an uploaded one are identical
   * downstream. It honours EXIF orientation (a phone photo is otherwise
   * sideways) and bounds the long edge before anything is stored.
   */
  const onPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      await rasterizeFile(file, async (page) => {
        setPending({
          dataUrl: URL.createObjectURL(page.blob),
          blob: page.blob,
          width: page.width,
          height: page.height,
          report: page.report,
        });
      });
    } catch {
      setStatus("Couldn't read that photo. Try again, or use Upload scans.");
    } finally {
      setBusy(false);
      // Clear the input so picking the SAME file again still fires onChange.
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  const discardPending = useCallback(() => {
    setPending((p) => {
      if (p) URL.revokeObjectURL(p.dataUrl);
      return null;
    });
  }, []);

  const keepPending = useCallback(async () => {
    if (!pending || !selected) return;
    const nextSeq = (sequences[selected.id] ?? 0) + 1;
    try {
      await enqueuePage({
        id: crypto.randomUUID(),
        aircraftId,
        logbookId: selected.id,
        logbookLabel: selected.label,
        pageSequence: nextSeq,
        capturedAt: new Date().toISOString(),
        isHandwritten,
        blob: pending.blob,
        thumbnailBlob: await makeThumbnail(pending.blob),
        width: pending.width,
        height: pending.height,
        sharpness: pending.report.sharpness,
        glareRatio: pending.report.glareRatio,
        createdAt: new Date().toISOString(),
      });
      setSequences((s) => ({ ...s, [selected.id]: nextSeq }));
      await refreshCount();

      // Nudge an upload now, and register background sync for when signal returns.
      drain();
      registerBackgroundDrain();

      discardPending();
    } catch {
      setStatus("Couldn't save the page to the on-device queue.");
    }
  }, [
    pending,
    selected,
    sequences,
    aircraftId,
    isHandwritten,
    refreshCount,
    drain,
    discardPending,
  ]);

  const inputClass =
    "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-hidden focus:border-accent";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Viewfinder — primary on mobile, fixed-width column on desktop */}
      <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="eyebrow">
              {selected?.label ?? "Logbook"}
              {tailNumber ? ` · ${tailNumber}` : ""}
            </span>
            {selected && (
              <span className="readout text-[11px] text-faint">
                Page #{(sequences[selected.id] ?? 0) + 1}
              </span>
            )}
          </div>

          {/* Last shot / prompt. There is no live preview: the OS camera IS
              the viewfinder, and it focuses and exposes better than a WebRTC
              frame grab ever did. */}
          <div className="relative aspect-3/4 bg-black">
            {pending ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the camera, not a remote asset
              <img src={pending.dataUrl} alt="Captured page" className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <span className="text-3xl">📷</span>
                <span className="text-sm text-faint">
                  {busy ? "Processing…" : "Take a photo of the page"}
                </span>
              </div>
            )}
          </div>

          {/* Queue + sync status */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs">
            <span className="text-faint">
              {queueCount > 0
                ? `${queueCount} page${queueCount === 1 ? "" : "s"} waiting to upload`
                : "Queue empty"}
            </span>
            <span
              className={online ? "text-annun-green" : "text-annun-amber"}
            >
              {online ? "Online" : "Offline — queued on-device"}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!logbookId || busy}
              className="flex-1 rounded-md bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Processing…" : pending ? "Retake" : "Take a photo"}
            </button>
            <button
              onClick={drain}
              disabled={!(queueCount > 0 && online)}
              className="text-[11px] text-accent hover:opacity-80 disabled:opacity-40"
            >
              Sync
            </button>
          </div>
        </section>
        {status && <p className="text-xs text-dim">{status}</p>}
      </div>

      {/* Session settings + real-capability notes */}
      <div className="flex flex-1 flex-col gap-5">
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Logbook</span>
            <select
              value={logbookId}
              onChange={(e) => setLogbookId(e.target.value)}
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
              <span className="text-xs text-faint">
                Next page #{(sequences[selected.id] ?? 0) + 1} · {selected.existingPages}{" "}
                already captured
              </span>
            )}
            {selected?.label === "Other" && (
              <span className="text-xs text-annun-green">
                Scan A&amp;P Weight &amp; Balance sheets and AD compliance reports here —
                they&apos;re auto-classified and applied to your W&amp;B and AD tracking.
              </span>
            )}
          </label>

          <div className="flex flex-col gap-2 sm:pt-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isHandwritten}
                onChange={(e) => setIsHandwritten(e.target.checked)}
              />
              Handwritten page (routes to vision extraction)
            </label>
            {queueCount > 0 && online && (
              <button
                onClick={drain}
                className="mt-1 self-start rounded-md border border-line px-2.5 py-1 text-xs text-dim hover:border-line2 hover:text-ink"
              >
                Upload now
              </button>
            )}
          </div>
        </section>

        <div className="grid gap-4">
          <div className="panel p-[18px]">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-accent bg-accent-soft text-[13px] text-accent">
                ◳
              </span>
              <span className="text-sm font-semibold">Your phone&apos;s own camera</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-dim">
              Capture opens the camera app you already use, so you get its autofocus, HDR and
              stabilisation. Fill the frame with the page and hold steady — cropping isn&apos;t
              needed, the extractor reads the page out of the photo.
            </p>
          </div>

          <div className="panel p-[18px]">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-accent bg-accent-soft text-[13px] text-accent">
                ▦
              </span>
              <span className="text-sm font-semibold">Batch a whole logbook</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-dim">
              Keep a page and the button resets to &ldquo;Take a photo&rdquo; with the page number
              already advanced, so you can work through a whole logbook without leaving this
              screen. Pages queue on-device and upload when you have signal.
            </p>
          </div>

          <div className="panel p-[18px]">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-accent bg-accent-soft text-[13px] text-accent">
                ⇅
              </span>
              <span className="text-sm font-semibold">Works with no signal</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-dim">
              Hangars have bad reception. Captures are stored on-device and upload the
              moment you&apos;re back on Wi-Fi — you&apos;ll never lose a page you already
              shot.
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* Review modal for the pending shot */}
      {pending && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="panel max-h-full w-full max-w-lg overflow-auto p-5">
            <h2 className="mb-3 text-lg font-semibold">Review page</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pending.dataUrl}
              alt="Captured logbook page"
              className="mb-3 w-full rounded-md border border-line"
            />
            <p className="mb-2 text-xs text-faint">
              {pending.width}×{pending.height} · sharpness{" "}
              {Math.round(pending.report.sharpness)} · glare{" "}
              {(pending.report.glareRatio * 100).toFixed(1)}%
            </p>

            {pending.report.issues.length > 0 && (
              <ul
                className="mb-3 list-disc space-y-1 rounded-md p-3 pl-7 text-sm text-annun-amber"
                style={{ background: "var(--amb-bg)" }}
              >
                {pending.report.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}

            <div className="flex gap-3">
              <button
                onClick={keepPending}
                className="flex-1 rounded-md px-4 py-2.5 font-medium text-bg hover:opacity-90"
                style={{ background: pending.report.ok ? "var(--grn)" : "var(--amb)" }}
              >
                {pending.report.ok ? "Add to queue" : "Keep anyway"}
              </button>
              <button
                onClick={discardPending}
                className="flex-1 rounded-md border border-line px-4 py-2.5 text-dim hover:border-line2 hover:text-ink"
              >
                Retake
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-faint">
        Captured pages are stored on this device until uploaded, then reviewed
        and extracted later. MyTailLog is an index of your logbooks, not the
        legal maintenance record.
      </p>
    </div>
  );
}
