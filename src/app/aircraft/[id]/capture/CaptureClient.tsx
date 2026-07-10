"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadScanner,
  scannerReady,
  highlightPage,
  extractPage,
} from "@/lib/capture/scanner";
import { assessQuality, type QualityReport } from "@/lib/capture/imageQuality";
import { enqueuePage, countQueued } from "@/lib/capture/queue";
import { drainQueue, registerBackgroundDrain } from "@/lib/capture/uploader";
import { makeThumbnail } from "@/lib/capture/thumbnail";

export type CaptureLogbook = {
  id: string;
  label: string;
  componentRef: string | null;
  existingPages: number;
};

type ScannerStatus = "loading" | "ready" | "unavailable";

// A processed shot awaiting the user's keep/retake decision.
type PendingShot = {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  report: QualityReport;
};

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

// Cap the stored image's long edge. A phone frame can be 3–4000px / several MB;
// a logbook page needs ~2000px for review/OCR, which cuts storage + egress
// several-fold with no legibility loss. (The upload path already caps at 2400.)
const MAX_STORED_EDGE = 2000;
function downscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const long = Math.max(canvas.width, canvas.height);
  if (long <= MAX_STORED_EDGE) return canvas;
  const scale = MAX_STORED_EDGE / long;
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export function CaptureClient({
  aircraftId,
  logbooks,
  tailNumber,
}: {
  aircraftId: string;
  logbooks: CaptureLogbook[];
  tailNumber?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [logbookId, setLogbookId] = useState(logbooks[0]?.id ?? "");
  const [isHandwritten, setIsHandwritten] = useState(true);
  const [batchMode, setBatchMode] = useState(true);

  // Session page-sequence counters, seeded from each logbook's existing count.
  const [sequences, setSequences] = useState<Record<string, number>>(() =>
    Object.fromEntries(logbooks.map((lb) => [lb.id, lb.existingPages])),
  );

  const [scanner, setScanner] = useState<ScannerStatus>("loading");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
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

  // --- Lifecycle: scanner load, queue drain, online + SW-message listeners ---
  useEffect(() => {
    setOnline(navigator.onLine);
    refreshCount();
    drain();

    loadScanner().then((ok) => setScanner(ok ? "ready" : "unavailable"));

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

  const stopCamera = useCallback(() => {
    if (highlightTimer.current) {
      clearInterval(highlightTimer.current);
      highlightTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  // Stop the camera when the component unmounts.
  useEffect(() => stopCamera, [stopCamera]);

  // Throttled live outline of the detected page over the video preview.
  const startHighlightLoop = useCallback(() => {
    if (highlightTimer.current) clearInterval(highlightTimer.current);
    highlightTimer.current = setInterval(() => {
      const video = videoRef.current;
      const overlay = overlayRef.current;
      if (!video || !overlay || !video.videoWidth || !scannerReady()) return;
      // Work on a downscaled snapshot to keep detection cheap.
      const scale = Math.min(1, 640 / video.videoWidth);
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      tmp.getContext("2d")!.drawImage(video, 0, 0, w, h);
      if (highlightPage(tmp)) {
        overlay.width = w;
        overlay.height = h;
        overlay.getContext("2d")!.drawImage(tmp, 0, 0);
      }
    }, 500);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      if (scannerReady()) startHighlightLoop();
    } catch {
      setCameraError(
        "Couldn't access the camera. Grant camera permission and use HTTPS (or localhost).",
      );
    }
  }, [startHighlightLoop]);

  // If the scanner finishes loading after the camera started, begin the overlay.
  useEffect(() => {
    if (scanner === "ready" && cameraOn) startHighlightLoop();
  }, [scanner, cameraOn, startHighlightLoop]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Grab the frame at the camera's full intrinsic resolution.
    const frame = document.createElement("canvas");
    frame.width = video.videoWidth;
    frame.height = video.videoHeight;
    frame.getContext("2d")!.drawImage(video, 0, 0);

    // Detect + deskew + crop (no-op if the scanner is unavailable), then cap
    // resolution before storing so egress/storage stay bounded.
    const processed = downscale(extractPage(frame));
    const report = assessQuality(processed);
    const blob = await toBlob(processed);

    setPending({
      dataUrl: URL.createObjectURL(blob),
      blob,
      width: processed.width,
      height: processed.height,
      report,
    });
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
      if (!batchMode) stopCamera();
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
    batchMode,
    stopCamera,
  ]);

  const inputClass =
    "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-none focus:border-accent";

  const scannerLine =
    scanner === "loading"
      ? "Loading auto-crop…"
      : scanner === "ready"
        ? "Auto-crop + deskew on"
        : "Auto-crop unavailable — capturing full frame";

  const viewfinderBadge =
    scanner === "loading"
      ? "LOADING AUTO-CROP…"
      : scanner === "ready"
        ? "AUTO-CROP · HOLD STEADY"
        : "FULL FRAME CAPTURE";

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

          {/* Camera / preview */}
          <div className="relative aspect-[3/4] bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-cover ${cameraOn ? "block" : "hidden"}`}
            />
            <canvas
              ref={overlayRef}
              className={`pointer-events-none absolute inset-0 h-full w-full ${
                cameraOn && scanner === "ready" ? "block" : "hidden"
              }`}
            />
            {cameraOn && (
              <>
                <div className="pointer-events-none absolute left-4 top-4 h-6 w-6 border-l-2 border-t-2 border-accent" />
                <div className="pointer-events-none absolute right-4 top-4 h-6 w-6 border-r-2 border-t-2 border-accent" />
                <div className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 border-b-2 border-l-2 border-accent" />
                <div className="pointer-events-none absolute bottom-4 right-4 h-6 w-6 border-b-2 border-r-2 border-accent" />
                <span
                  className="readout pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[9.5px] tracking-[0.1em] text-accent"
                  style={{ background: "rgba(4,18,31,.7)" }}
                >
                  {viewfinderBadge}
                </span>
              </>
            )}
            {!cameraOn && (
              <div className="flex h-full items-center justify-center text-sm text-faint">
                {cameraError ?? "Camera off"}
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
          <div className="flex items-center justify-between border-t border-line px-6 py-4">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                disabled={!logbookId}
                className="w-full rounded-md bg-accent px-5 py-2.5 font-medium text-bg hover:opacity-90 disabled:opacity-60"
              >
                Start camera
              </button>
            ) : (
              <>
                <button
                  onClick={stopCamera}
                  className="w-12 text-left text-[11px] text-faint hover:text-ink"
                >
                  Stop
                </button>
                <button
                  onClick={capture}
                  aria-label="Capture page"
                  className="h-[62px] w-[62px] shrink-0 rounded-full bg-accent shadow-[0_0_0_2px_var(--accent)]"
                  style={{ border: "4px solid var(--panel)" }}
                />
                <button
                  onClick={drain}
                  disabled={!(queueCount > 0 && online)}
                  className="w-12 text-right text-[11px] text-accent hover:opacity-80 disabled:opacity-40"
                >
                  Sync
                </button>
              </>
            )}
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={batchMode}
                onChange={(e) => setBatchMode(e.target.checked)}
              />
              Batch mode (keep camera on after each page)
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
              <span className="text-sm font-semibold">Auto edge-detect &amp; deskew</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-dim">{scannerLine}</p>
          </div>

          <div className="panel p-[18px]">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-accent bg-accent-soft text-[13px] text-accent">
                ▦
              </span>
              <span className="text-sm font-semibold">Batch a whole logbook</span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-dim">
              {batchMode
                ? "Batch mode is on — the camera stays live after each page so you can shoot the whole logbook in one pass."
                : "Batch mode is off — the camera stops after each page. Turn it on to shoot page after page without restarting."}
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
