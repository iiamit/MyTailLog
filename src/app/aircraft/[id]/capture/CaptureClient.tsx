"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  loadScanner,
  scannerReady,
  highlightPage,
  extractPage,
} from "@/lib/capture/scanner";
import { assessQuality, type QualityReport } from "@/lib/capture/imageQuality";
import { enqueuePage, countQueued } from "@/lib/capture/queue";
import { drainQueue, registerBackgroundDrain } from "@/lib/capture/uploader";

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

export function CaptureClient({
  aircraftId,
  logbooks,
}: {
  aircraftId: string;
  logbooks: CaptureLogbook[];
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

    // Detect + deskew + crop (no-op if the scanner is unavailable).
    const processed = extractPage(frame);
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
    "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <div className="flex flex-col gap-5">
      {/* Session settings */}
      <section className="grid gap-4 sm:grid-cols-2">
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
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Next page #{(sequences[selected.id] ?? 0) + 1} · {selected.existingPages}{" "}
              already captured
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
        </div>
      </section>

      {/* Status strip */}
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
        <span className="text-slate-500 dark:text-slate-400">
          {scanner === "loading" && "Loading auto-crop…"}
          {scanner === "ready" && "Auto-crop + deskew on"}
          {scanner === "unavailable" &&
            "Auto-crop unavailable — capturing full frame"}
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

      {/* Camera / preview */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-black dark:border-slate-800">
        <div className="relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full ${cameraOn ? "block" : "hidden"}`}
          />
          <canvas
            ref={overlayRef}
            className={`pointer-events-none absolute inset-0 h-full w-full ${
              cameraOn && scanner === "ready" ? "block" : "hidden"
            }`}
          />
          {!cameraOn && (
            <div className="flex aspect-video items-center justify-center text-sm text-slate-400">
              {cameraError ?? "Camera off"}
            </div>
          )}
        </div>
      </section>

      {/* Controls */}
      {!cameraOn ? (
        <button
          onClick={startCamera}
          disabled={!logbookId}
          className="rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Start camera
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={capture}
            className="flex-1 rounded-md bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Capture page
          </button>
          <button
            onClick={stopCamera}
            className="rounded-md border border-slate-300 px-5 py-3 hover:border-slate-500 dark:border-slate-700"
          >
            Stop
          </button>
        </div>
      )}

      {status && (
        <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p>
      )}

      {/* Review modal for the pending shot */}
      {pending && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-full w-full max-w-lg overflow-auto rounded-lg bg-white p-5 dark:bg-slate-900">
            <h2 className="mb-3 text-lg font-semibold">Review page</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pending.dataUrl}
              alt="Captured logbook page"
              className="mb-3 w-full rounded-md border border-slate-200 dark:border-slate-700"
            />
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {pending.width}×{pending.height} · sharpness{" "}
              {Math.round(pending.report.sharpness)} · glare{" "}
              {(pending.report.glareRatio * 100).toFixed(1)}%
            </p>

            {pending.report.issues.length > 0 && (
              <ul className="mb-3 list-disc space-y-1 rounded-md bg-amber-50 p-3 pl-7 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                {pending.report.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}

            <div className="flex gap-3">
              <button
                onClick={keepPending}
                className={`flex-1 rounded-md px-4 py-2.5 font-medium text-white ${
                  pending.report.ok
                    ? "bg-emerald-600 hover:bg-emerald-500"
                    : "bg-amber-600 hover:bg-amber-500"
                }`}
              >
                {pending.report.ok ? "Add to queue" : "Keep anyway"}
              </button>
              <button
                onClick={discardPending}
                className="flex-1 rounded-md border border-slate-300 px-4 py-2.5 hover:border-slate-500 dark:border-slate-700"
              >
                Retake
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Captured pages are stored on this device until uploaded, then reviewed
        and extracted later. MyTailLog is an index of your logbooks, not the
        legal maintenance record.{" "}
        <Link href={`/aircraft/${aircraftId}`} className="underline">
          Back to aircraft
        </Link>
      </p>
    </div>
  );
}
