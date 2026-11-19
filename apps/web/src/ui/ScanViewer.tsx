"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { buttonClass } from "@/ui/Button";
import type { Box } from "@/lib/v2/books";

export type { Box };

const pct = (b: Box) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` });

/**
 * A scanned page with the ink lit (02 §6.1): fit width by default, Zoom toggles 2×; when focused, + / − / 0 zoom
 * and arrows pan. `lit` is the selected field or entry (highlighter fill), `quiet` the entry around it (dashed).
 * The highlight scrolls into view whenever it moves. `zoomRef` lets a host screen route its own +/−/0 keys here.
 * shortcut: no ctrl-wheel or pinch zoom and no drag-to-pan yet; the scroll container pans instead.
 */
export function ScanViewer({
  src,
  alt,
  lit,
  quiet,
  zoomRef,
}: {
  src: string;
  alt: string;
  lit?: Box | null;
  quiet?: Box | null;
  zoomRef?: React.RefObject<((k: "+" | "-" | "0") => void) | null>;
}) {
  const [scale, setScale] = useState(1);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const hi = useRef<HTMLDivElement>(null);

  const zoom = (k: "+" | "-" | "0") => setScale((s) => (k === "0" ? 1 : Math.min(4, Math.max(1, s + (k === "+" ? 0.5 : -0.5)))));
  useEffect(() => {
    if (zoomRef) zoomRef.current = zoom;
  });

  useEffect(() => {
    const el = hi.current, w = wrap.current;
    if (!el || !w || state !== "ok") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = el.offsetTop - w.clientHeight / 2 + el.offsetHeight / 2;
    const left = el.offsetLeft - w.clientWidth / 2 + el.offsetWidth / 2;
    w.scrollTo({ top, left: scale > 1 ? left : 0, behavior: reduce ? "auto" : "smooth" });
  }, [lit?.x, lit?.y, lit?.w, lit?.h, quiet?.x, quiet?.y, scale, state]);

  const onKey = (e: React.KeyboardEvent) => {
    const w = wrap.current;
    if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "−" || e.key === "0") {
      e.preventDefault();
      e.stopPropagation();
      zoom(e.key === "0" ? "0" : e.key === "-" || e.key === "−" ? "-" : "+");
      return;
    }
    const d = e.shiftKey ? 160 : 40;
    const pan: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
    if (pan[e.key] && w) {
      e.preventDefault();
      e.stopPropagation();
      w.scrollBy(pan[e.key][0], pan[e.key][1]);
    }
  };

  const target = lit ?? quiet;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          className={buttonClass("on-mat", "s")}
          onClick={() => setScale((s) => (s > 1 ? 1 : 2))}
          aria-keyshortcuts="+ - 0"
        >
          {scale > 1 ? <ZoomOut aria-hidden size={16} /> : <ZoomIn aria-hidden size={16} />}
          {scale > 1 ? "Fit page" : "Zoom"}
        </button>
      </div>
      <div
        ref={wrap}
        tabIndex={0}
        role="group"
        aria-label={`${alt}. Use plus and minus to zoom, arrows to move.`}
        onKeyDown={onKey}
        className="relative min-h-[320px] flex-1 overflow-auto rounded-[2px]"
      >
        {state === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[15px] text-on-cover-2">
            This page did not load.
            <button type="button" className={buttonClass("on-mat", "s")} onClick={() => (setState("loading"), setAttempt((n) => n + 1))}>
              Try again
            </button>
          </div>
        ) : (
          <div className="relative mx-auto" style={{ width: `${scale * 100}%` }}>
            {state === "loading" && <div aria-hidden className="aspect-[0.72] w-full rounded-[2px] bg-cover-2" />}
            {/* eslint-disable-next-line @next/next/no-img-element -- a stable authenticated route, not an optimisable asset */}
            <img
              key={attempt}
              src={attempt ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src}
              alt={alt}
              onLoad={() => setState("ok")}
              onError={() => setState("error")}
              className={`block w-full rounded-[2px] ${state === "loading" ? "absolute inset-0 opacity-0" : ""}`}
            />
            {state === "ok" && quiet && lit && (
              <div aria-hidden className="pointer-events-none absolute rounded-[3px] outline-2 outline-dashed outline-highlight-edge" style={pct(quiet)} />
            )}
            {state === "ok" && target && (
              <div
                ref={hi}
                aria-hidden
                className={`pointer-events-none absolute rounded-[3px] ${lit ? "bg-highlight mix-blend-multiply outline-2 outline-highlight-edge" : "outline-2 outline-dashed outline-highlight-edge"}`}
                style={pct(target)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
