"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { makeThumbnail, thumbnailKey } from "@/lib/capture/thumbnail";
import {
  applyEdit,
  normalizeCrop,
  isNoop,
  FULL_CROP,
  type CropRect,
  type Edit,
} from "@/lib/capture/imageEdit";
import { useToast } from "@/components/Toast";

// Crop, rotate and "scan" a page that was photographed rather than scanned —
// the desk in the background, the page at an angle. The native app gets Apple's
// VisionKit for this; the web has no equivalent, so this is the manual version.
//
// It runs ONCE, on an image the user is already looking at. That is the whole
// difference from the live OpenCV scanner this replaces, which did the same kind
// of work on every preview frame and made the page unusable on a phone.

type Handle = "nw" | "ne" | "sw" | "se" | "move" | null;

export function PageImageEditor({
  aircraftId,
  pageId,
  imageUrl,
  storagePath,
  onDone,
}: {
  aircraftId: string;
  pageId: string;
  imageUrl: string;
  storagePath: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [rotate, setRotate] = useState<Edit["rotate"]>(0);
  const [enhance, setEnhance] = useState(false);
  const [drag, setDrag] = useState<Handle>(null);
  const [saving, setSaving] = useState(false);

  const edit: Edit = { crop, rotate, enhance };

  // Pointer drag on the crop box, in fractions of the displayed image.
  useEffect(() => {
    if (!drag) return;
    const el = boxRef.current;
    if (!el) return;

    function frac(e: PointerEvent): { x: number; y: number } {
      const r = el!.getBoundingClientRect();
      return {
        x: Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1),
        y: Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1),
      };
    }
    function onMove(e: PointerEvent) {
      const p = frac(e);
      setCrop((c) => {
        if (drag === "move") {
          // Keep the size, clamp the position so it can't leave the image.
          const x = Math.min(Math.max(p.x - c.w / 2, 0), 1 - c.w);
          const y = Math.min(Math.max(p.y - c.h / 2, 0), 1 - c.h);
          return { ...c, x, y };
        }
        const right = c.x + c.w;
        const bottom = c.y + c.h;
        if (drag === "nw") return normalizeCrop({ x: p.x, y: p.y, w: right - p.x, h: bottom - p.y });
        if (drag === "ne") return normalizeCrop({ x: c.x, y: p.y, w: p.x - c.x, h: bottom - p.y });
        if (drag === "sw") return normalizeCrop({ x: p.x, y: c.y, w: right - p.x, h: p.y - c.y });
        return normalizeCrop({ x: c.x, y: c.y, w: p.x - c.x, h: p.y - c.y });
      });
    }
    const stop = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [drag]);

  async function save() {
    const img = imgRef.current;
    if (!img || isNoop(edit)) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      // Re-fetch through the same URL rather than reusing the rendered <img>:
      // a displayed image may be downscaled by the browser, and cropping a
      // preview would quietly throw away resolution the extractor needs.
      const full = await createImageBitmap(await (await fetch(imageUrl)).blob());
      const canvas = applyEdit(full, edit);
      full.close?.();

      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't encode the image."))), "image/jpeg", 0.9),
      );
      const thumb = await makeThumbnail(canvas);

      // Reuse the editor-gated blob route (auth + can_edit + prefix-confined).
      for (const [path, file] of [
        [storagePath, blob],
        [thumbnailKey(storagePath), thumb],
      ] as const) {
        const fd = new FormData();
        fd.set("path", path);
        fd.set("file", new File([file], "page.jpg", { type: "image/jpeg" }));
        const res = await fetch(`/api/aircraft/${aircraftId}/blob`, { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Upload failed.");
      }

      // Bump updated_at so the cache-busted image URLs point at the new bytes —
      // the image route caches for 7 days on a stable URL.
      const supabase = createClient();
      const { error } = await supabase
        .from("page")
        .update({ updated_at: new Date().toISOString(), thumbnail_path: thumbnailKey(storagePath) })
        .eq("id", pageId);
      if (error) throw new Error(error.message);

      toast.success("Page updated. Re-extract if the crop changed what's readable.");
      onDone();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const pct = (n: number) => `${n * 100}%`;
  const handle = (pos: Exclude<Handle, "move" | null>, style: React.CSSProperties) => (
    <span
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(pos);
      }}
      className="absolute h-5 w-5 rounded-full border-2 border-bg bg-accent"
      style={{ ...style, touchAction: "none", cursor: "grab" }}
    />
  );

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Crop &amp; clean up</span>
        <span className="text-xs text-faint">Drag the corners to cut out the background.</span>
      </div>

      <div
        ref={boxRef}
        className="relative select-none overflow-hidden rounded-md border border-line bg-black"
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt="Page being cropped"
          className="block w-full"
          style={{
            transform: `rotate(${rotate}deg)`,
            filter: enhance ? "grayscale(1) contrast(1.35) brightness(1.05)" : undefined,
          }}
        />
        {/* Dim everything outside the crop so the kept area is obvious. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "rgba(0,0,0,.55)",
            clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${pct(crop.x)} ${pct(crop.y)},
              ${pct(crop.x)} ${pct(crop.y + crop.h)},
              ${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)},
              ${pct(crop.x + crop.w)} ${pct(crop.y)},
              ${pct(crop.x)} ${pct(crop.y)})`,
          }}
        />
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            setDrag("move");
          }}
          className="absolute border-2 border-accent"
          style={{
            left: pct(crop.x),
            top: pct(crop.y),
            width: pct(crop.w),
            height: pct(crop.h),
            touchAction: "none",
            cursor: "move",
          }}
        />
        {handle("nw", { left: pct(crop.x), top: pct(crop.y), marginLeft: -10, marginTop: -10 })}
        {handle("ne", { left: pct(crop.x + crop.w), top: pct(crop.y), marginLeft: -10, marginTop: -10 })}
        {handle("sw", { left: pct(crop.x), top: pct(crop.y + crop.h), marginLeft: -10, marginTop: -10 })}
        {handle("se", { left: pct(crop.x + crop.w), top: pct(crop.y + crop.h), marginLeft: -10, marginTop: -10 })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setRotate((r) => (((r + 90) % 360) as Edit["rotate"]))}
          className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-line2"
        >
          ↻ Rotate
        </button>
        <button
          onClick={() => setEnhance((v) => !v)}
          className={`rounded-md border px-3 py-1.5 text-xs ${
            enhance ? "border-accent text-accent" : "border-line hover:border-line2"
          }`}
        >
          {enhance ? "✓ Scan look" : "Scan look"}
        </button>
        <button
          onClick={() => {
            setCrop(FULL_CROP);
            setRotate(0);
            setEnhance(false);
          }}
          className="rounded-md border border-line px-3 py-1.5 text-xs hover:border-line2"
        >
          Reset
        </button>
        <span className="ml-auto flex items-center gap-2">
          <button onClick={onDone} className="text-xs text-faint hover:text-ink">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || isNoop(edit)}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </span>
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        This <strong>replaces the stored scan</strong> — the paper page remains your legal record,
        and you can always re-capture it. Entries already extracted came from the old image, so if
        the crop changed what&apos;s readable, re-extract this page afterwards.
      </p>
    </div>
  );
}
