"use client";

import { useEffect, useState } from "react";

/**
 * An image that opens a full-screen, zoomable lightbox on click — so a scanned
 * logbook page can be read at full resolution and cross-referenced against the
 * extracted text. In the lightbox: click the image to toggle fit-to-screen vs.
 * actual size (scroll to pan), Esc or a background/×  click to close.
 */
export function ZoomableImage({
  src,
  fullSrc,
  alt,
  className,
}: {
  src: string;
  /** Full-resolution image for the lightbox; falls back to `src` (the thumbnail). */
  fullSrc?: string | null;
  alt: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const large = fullSrc || src;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onClick={() => {
          setZoomed(false);
          setOpen(true);
        }}
        className={`cursor-zoom-in ${className ?? ""}`}
      />

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 overflow-auto bg-black/90"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="fixed right-4 top-4 z-10 rounded-full bg-ink/10 px-3 py-1 text-sm text-ink hover:bg-ink/20"
            aria-label="Close"
          >
            ✕ Close
          </button>
          {/* `safe` centering: centered when it fits, but falls back to
              start-aligned (fully scrollable) when the zoomed image overflows —
              otherwise the left/top edge is clipped and unreachable. */}
          <div className="flex min-h-full [align-items:safe_center] [justify-content:safe_center] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={large}
              alt={alt}
              onClick={(e) => {
                e.stopPropagation();
                setZoomed((z) => !z);
              }}
              className={
                zoomed
                  ? "max-w-none cursor-zoom-out"
                  : "max-h-[92vh] max-w-[96vw] cursor-zoom-in object-contain"
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
