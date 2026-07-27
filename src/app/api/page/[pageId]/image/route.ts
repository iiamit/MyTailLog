import { createClient } from "@/lib/supabase/server";
import { getBlob } from "@/lib/storage";

export const runtime = "nodejs";

// Serve a page's scan (or ?thumb=1 for its thumbnail) through the app with a
// long browser cache, instead of a fresh Supabase signed URL per view. Signed
// URLs change every load, so the browser re-downloads the image from Supabase
// each time — the main storage-egress bleed. This route's URL is stable, so the
// browser caches the bytes and repeat views cost zero Supabase egress.
//
// Access is enforced by RLS: the page SELECT only returns a row for aircraft the
// signed-in user can access, so a stranger gets 404. Cache is `private` (never a
// shared/CDN cache) since the images are per-user sensitive data.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;
  const wantThumb = new URL(req.url).searchParams.get("thumb") != null;

  const supabase = await createClient();
  const { data: page } = await supabase
    .from("page")
    .select("storage_path, thumbnail_path")
    .eq("id", pageId)
    .single();
  if (!page) return new Response("Not found", { status: 404 });

  // Thumbnail when requested and present; otherwise the full scan (also the
  // fallback for legacy pages that predate thumbnails).
  const path = wantThumb && page.thumbnail_path ? page.thumbnail_path : page.storage_path;

  const blob = await getBlob(path);
  if (!blob) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(blob.data), {
    headers: {
      "content-type": blob.contentType || "image/jpeg",
      // Scans are immutable (a new scan = a new page id/URL), so cache hard.
      "cache-control": "private, max-age=604800, immutable",
    },
  });
}
