import { getBlob } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/service";
import { linkPhoto, openLink } from "@/lib/mechanicLink";

export const runtime = "nodejs";

// A squawk photo inside a mechanic link. The link (not RLS) authorizes it, and nothing is cached:
// revoking a link must stop the next request (as /r/[token]/page/[pageId]).
export async function GET(req: Request, { params }: { params: Promise<{ token: string; photoId: string }> }) {
  const { token, photoId } = await params;
  const svc = createServiceClient();
  const link = await openLink(svc, token);
  const photo = link && (await linkPhoto(svc, link, photoId));
  if (!photo) return new Response("Not found", { status: 404 });
  const thumb = new URL(req.url).searchParams.get("thumb") != null;
  const blob = await getBlob(thumb && photo.thumbnail_path ? photo.thumbnail_path : photo.storage_path, photo.aircraft_id);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: { "content-type": blob.contentType || "image/jpeg", "cache-control": "private, no-store" },
  });
}
