import { useEffect, useRef, useState } from "react";
import type * as Pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { localFileBytes } from "./blobs";
import { TopBar, faint, ink, line, panel } from "./ui";

// ===========================================================================
// PDF viewing, offline.
//
// The Documents screen used to say "PDF — open on the web app", which is the
// wrong answer in the one situation that screen exists for: a ramp check, no
// signal, and an inspector asking for the registration — which is very often a
// PDF. The bytes were already on the device (prefetchAll caches every document
// regardless of type); only the rendering was missing.
//
// Rendered with pdf.js to a canvas rather than handed to an <iframe>. WKWebView
// does have a native PDF viewer, but its behaviour inside an iframe is famously
// inconsistent, and "blank page on the taxiway" is exactly the failure this is
// meant to remove. Canvas rendering is more code and entirely predictable.
//
// The worker is bundled by Vite (?url) rather than fetched from a CDN, so it
// works with the network off — the whole point.
// ===========================================================================

// pdf.js is ~1 MB of JS and only the Documents screen ever needs it, so it's
// loaded on demand rather than parsed at every app launch. Same pattern the web
// app uses in lib/capture/importFiles.ts. The worker itself is a Vite-emitted
// local asset, so no network is involved either way.
let pdfLib: Promise<typeof Pdfjs> | null = null;
function getPdfLib(): Promise<typeof Pdfjs> {
  if (!pdfLib) {
    pdfLib = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = workerUrl;
      return lib;
    });
  }
  return pdfLib;
}

// A page is rendered at up to 2x for legibility on a Retina screen, but capped:
// a large-format W&B sheet at devicePixelRatio 3 can blow past the canvas area
// limit and render blank.
const MAX_SCALE = 2;

export function PdfViewer({
  documentId,
  title,
  onBack,
  onZoom,
}: {
  documentId: string;
  title: string;
  onBack: () => void;
  onZoom: (src: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<Pdfjs.PDFDocumentProxy | null>(null);
  // Teardown goes through the LOADING TASK, not the document: task.destroy()
  // aborts requests and tears down the worker, which is what actually leaks if
  // you navigate away from a big PDF. PDFDocumentProxy has no destroy().
  const taskRef = useRef<Pdfjs.PDFDocumentLoadingTask | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "broken">("loading");

  // Load the document once.
  useEffect(() => {
    let live = true;
    (async () => {
      const bytes = await localFileBytes("document", documentId);
      if (!live) return;
      if (!bytes) {
        setState("missing");
        return;
      }
      try {
        const pdfjs = await getPdfLib();
        if (!live) return;
        const task = pdfjs.getDocument({ data: bytes });
        taskRef.current = task;
        const doc = await task.promise;
        if (!live) return; // the cleanup below already destroyed the task
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPage(1);
        setState("ready");
      } catch {
        if (live) setState("broken");
      }
    })();
    return () => {
      live = false;
      docRef.current = null;
      taskRef.current?.destroy();
      taskRef.current = null;
    };
  }, [documentId]);

  // Render the current page whenever it changes.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (state !== "ready" || !doc || !canvas) return;

    let cancelled = false;
    let render: Pdfjs.RenderTask | null = null;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const unscaled = p.getViewport({ scale: 1 });
        // Fit the page to the canvas's CSS width, then oversample for sharpness.
        const cssWidth = canvas.parentElement?.clientWidth ?? unscaled.width;
        const scale = (cssWidth / unscaled.width) * Math.min(window.devicePixelRatio || 1, MAX_SCALE);
        const viewport = p.getViewport({ scale });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = "100%";
        canvas.style.height = "auto";

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        render = p.render({ canvas, canvasContext: ctx, viewport });
        await render.promise;
      } catch {
        // A cancelled render throws; only a genuine failure should surface.
        if (!cancelled) setState("broken");
      }
    })();
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [page, state]);

  // Hand the rendered page to the existing pinch-zoom lightbox as an image.
  function zoom() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      onZoom(canvas.toDataURL("image/png"));
    } catch {
      /* toDataURL can throw on a very large canvas — not worth failing the screen */
    }
  }

  return (
    <>
      <TopBar
        title={title}
        onBack={onBack}
        right={
          pageCount > 0 ? (
            <span style={{ color: faint, fontSize: 12 }}>
              {page} / {pageCount}
            </span>
          ) : undefined
        }
      />

      <div
        style={{ marginTop: 12, borderRadius: 10, border: `1px solid ${line}`, overflow: "hidden", background: panel, minHeight: 200 }}
        onClick={zoom}
      >
        {state === "loading" && <Msg>Opening…</Msg>}
        {state === "missing" && <Msg>Not on device — connect once, or use “Download all”.</Msg>}
        {state === "broken" && <Msg>This PDF couldn&apos;t be opened. It may be damaged or password-protected.</Msg>}
        <canvas ref={canvasRef} style={{ display: state === "ready" ? "block" : "none", width: "100%" }} />
      </div>

      {state === "ready" && pageCount > 1 && (
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <NavBtn disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
            ‹ Prev
          </NavBtn>
          <NavBtn disabled={page >= pageCount} onClick={() => setPage((n) => Math.min(pageCount, n + 1))}>
            Next ›
          </NavBtn>
        </div>
      )}
      {state === "ready" && (
        <p style={{ color: faint, fontSize: 11, marginTop: 10 }}>Tap the page to zoom.</p>
      )}
    </>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 30, textAlign: "center", color: faint, fontSize: 13, lineHeight: 1.5 }}>{children}</div>;
}

function NavBtn({
  children, disabled, onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: disabled ? "transparent" : panel,
        color: disabled ? faint : ink,
        border: `1px solid ${line}`,
        borderRadius: 10,
        padding: "12px",
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
