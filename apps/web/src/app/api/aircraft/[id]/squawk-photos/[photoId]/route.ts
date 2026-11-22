import { createSyncClient } from "@/lib/supabase/sync";
import { getBlob } from "@/lib/storage";

export const runtime = "nodejs";

// GET /api/aircraft/{id}/squawk-photos/{photoId}[?thumb] → the photo (or its thumbnail) for anyone who can see the
// aircraft: a Bearer session (the phones) or the web cookie. RLS on squawk_photo is the gate: a stranger's select
// returns nothing, so 404. Never cached outside the caller's own request: access can be removed at any time.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const { id, photoId } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { data: photo } = await supabase
    .from("squawk_photo")
    .select("storage_path, thumbnail_path")
    .eq("id", photoId)
    .eq("aircraft_id", id)
    .maybeSingle();
  if (!photo) return new Response("Not found", { status: 404 });
  const thumb = new URL(req.url).searchParams.get("thumb") != null;
  const blob = await getBlob(thumb && photo.thumbnail_path ? photo.thumbnail_path : photo.storage_path, id);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: { "content-type": blob.contentType || "image/jpeg", "cache-control": "private, no-store" },
  });
}
