import { getBlob } from "@/lib/storage";
import { openRoom, roomPage } from "@/lib/recordRoom";

export const runtime = "nodejs";

// A page scan inside a record room. Mirrors /api/page/[pageId]/image, but the
// room (not RLS) authorizes it, and nothing is cached: revoking a link must
// stop the next request.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; pageId: string }> }) {
  const { token, pageId } = await params;
  const room = await openRoom(token);
  const page = room && (await roomPage(room, pageId));
  if (!page) return new Response("Not found", { status: 404 });

  const thumb = new URL(req.url).searchParams.get("thumb") != null;
  const blob = await getBlob(thumb && page.thumbnail_path ? page.thumbnail_path : page.storage_path);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: { "content-type": blob.contentType || "image/jpeg", "cache-control": "private, no-store" },
  });
}
