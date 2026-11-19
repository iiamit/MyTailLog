import { getBlob } from "@/lib/storage";
import { openRoom, roomDocument, logRoomView, roomRateLimited, visitorOf } from "@/lib/recordRoom";

export const runtime = "nodejs";

// A Vault document inside a record room. Mirrors /api/document/[id]: PDFs and
// images inline, anything else downloads so it can't run on our origin.
export async function GET(req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const visitor = visitorOf(req.headers);
  const wait = roomRateLimited(visitor);
  if (wait) return new Response("Too many requests", { status: 429, headers: { "retry-after": String(wait) } });
  const room = await openRoom(token);
  const doc = room && (await roomDocument(room, docId));
  if (!room || !doc?.storage_path) return new Response("Not found", { status: 404 });

  const blob = await getBlob(doc.storage_path);
  if (!blob) return new Response("Not found", { status: 404 });
  await logRoomView(room, `/doc/${docId}`, visitor, `document:${docId}`);

  const mime = doc.mime_type || blob.contentType || "application/octet-stream";
  const inline = mime === "application/pdf" || mime.startsWith("image/");
  const name = (doc.file_name || "document").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "content-type": mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
