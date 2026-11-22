import { getBlob } from "@/lib/storage";
import { openRoom, roomPage, logRoomView, roomRateLimited, visitorOf } from "@/lib/recordRoom";

export const runtime = "nodejs";

// A page scan inside a record room. Mirrors /api/page/[pageId]/image, but the
// room (not RLS) authorizes it, and nothing is cached: revoking a link must
// stop the next request. Opening the full page counts as a view; thumbnails don't.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; pageId: string }> }) {
  const { token, pageId } = await params;
  const visitor = visitorOf(req.headers);
  const wait = roomRateLimited(visitor);
  if (wait) return new Response("Too many requests", { status: 429, headers: { "retry-after": String(wait) } });
  const room = await openRoom(token);
  const page = room && (await roomPage(room, pageId));
  if (!room || !page) return new Response("Not found", { status: 404 });

  const thumb = new URL(req.url).searchParams.get("thumb") != null;
  const blob = await getBlob(thumb && page.thumbnail_path ? page.thumbnail_path : page.storage_path, page.aircraft_id);
  if (!blob) return new Response("Not found", { status: 404 });
  if (!thumb) await logRoomView(room, `/page/${pageId}`, visitor, `page:${pageId}`);
  return new Response(new Uint8Array(blob.data), {
    headers: { "content-type": blob.contentType || "image/jpeg", "cache-control": "private, no-store" },
  });
}
