import { createClient } from "@/lib/supabase/server";
import { getBlob } from "@/lib/storage";

export const runtime = "nodejs";

// A squawk photo for people with access to the aircraft (?thumb for the thumbnail). RLS on squawk_photo is the
// gate: a stranger's select returns nothing, so 404. Photos never change under an id, so the browser may cache.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("squawk_photo")
    .select("storage_path, thumbnail_path")
    .eq("id", photoId)
    .eq("aircraft_id", id)
    .maybeSingle();
  if (!photo) return new Response("Not found", { status: 404 });
  const thumb = new URL(req.url).searchParams.get("thumb") != null;
  const blob = await getBlob(thumb && photo.thumbnail_path ? photo.thumbnail_path : photo.storage_path);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: { "content-type": blob.contentType || "image/jpeg", "cache-control": "private, max-age=604800, immutable" },
  });
}
