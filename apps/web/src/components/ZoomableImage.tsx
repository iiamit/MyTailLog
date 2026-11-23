"use client";

import { useEffect, useRef, useState } from "react";

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
  const dialog = useRef<HTMLDialogElement>(null);
  const large = fullSrc || src;

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={`Open ${alt}`}
        aria-haspopup="dialog"
        onClick={() => {
          setZoomed(false);
          setOpen(true);
        }}
        className={`block max-w-full shrink-0 cursor-zoom-in p-0 ${className ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" className="block h-full w-full max-h-[inherit] rounded-[inherit] [object-fit:inherit]" />
      </button>

      <dialog
        ref={dialog}
        aria-label={alt}
        onClose={() => setOpen(false)}
        onClick={() => dialog.current?.close()}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-auto border-0 bg-black/90 p-0 text-white backdrop:bg-black/90"
      >
        {open && <>
        <button
          type="button"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            dialog.current?.close();
          }}
          className="fixed right-4 top-4 z-10 min-h-11 min-w-11 rounded-full bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
          aria-label="Close"
        >
          ✕ Close
        </button>
        {/* `safe` centering: centered when it fits, but falls back to
            start-aligned (fully scrollable) when the zoomed image overflows —
            otherwise the left/top edge is clipped and unreachable. */}
        <div className="flex min-h-full items-center-safe justify-center-safe p-4">
          <button
            type="button"
            aria-label={zoomed ? "Fit image to screen" : "Show full-size image"}
            aria-pressed={zoomed}
            onClick={(e) => {
              e.stopPropagation();
              setZoomed((z) => !z);
            }}
            className={`block shrink-0 p-0 ${
              zoomed
                ? "max-w-none cursor-zoom-out"
                : "max-h-[92vh] max-w-[96vw] cursor-zoom-in object-contain"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={large} alt={alt} className={zoomed ? "block max-w-none" : "block max-h-[92vh] max-w-[96vw] object-contain"} />
          </button>
        </div>
        </>}
      </dialog>
    </>
  );
}
