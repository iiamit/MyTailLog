// ===========================================================================
// Thumbnail generation — browser-side, so the server never processes images
// (keeps hosting at zero marginal cost). A small JPEG is derived from the
// original scanned image at capture/upload time and stored alongside it, so
// list/timeline views load the thumbnail instead of the full-resolution page.
// ===========================================================================

const THUMB_MAX_EDGE = 320;

/** Downscale an image (Blob or already-drawn canvas) to a small JPEG thumbnail. */
export async function makeThumbnail(
  source: Blob | HTMLCanvasElement,
  maxEdge = THUMB_MAX_EDGE,
): Promise<Blob> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : null;
  const w = bitmap ? bitmap.width : (source as HTMLCanvasElement).width;
  const h = bitmap ? bitmap.height : (source as HTMLCanvasElement).height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap ?? (source as HTMLCanvasElement), 0, 0, cw, ch);
  bitmap?.close?.();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("thumbnail toBlob failed"))),
      "image/jpeg",
      0.6,
    ),
  );
}

/** Storage key for a page's thumbnail, derived from its original key so both
 *  share the leading aircraft-id segment (and thus the same RLS policy). */
export function thumbnailKey(storagePath: string): string {
  return storagePath.replace(/\.[^./]+$/, "") + "_thumb.jpg";
}
