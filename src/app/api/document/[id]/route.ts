import { createSyncClient } from "@/lib/supabase/sync";
import { getBlob } from "@/lib/storage";

export const runtime = "nodejs";

// Serve a stored document (Records Vault / entry attachment) through the app
// with a stable, cacheable URL — same egress-saving pattern as the page-image
// route. Access is enforced by RLS: the document SELECT only returns a row for
// aircraft the signed-in user can access, so a stranger gets 404. `?download`
// forces a save-as; otherwise it renders inline (PDF/image).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSyncClient(req);
  const { data: doc } = await supabase
    .from("document")
    .select("storage_path, file_name, mime_type")
    .eq("id", id)
    .single();
  if (!doc || !doc.storage_path) return new Response("Not found", { status: 404 });

  const blob = await getBlob(doc.storage_path);
  if (!blob) return new Response("Not found", { status: 404 });

  const mime = doc.mime_type || blob.contentType || "application/octet-stream";
  // Only render PDFs/images inline; anything else is forced to download so a
  // stored file can never execute as active content on our origin.
  const inlineSafe = mime === "application/pdf" || mime.startsWith("image/");
  const forceDownload = new URL(req.url).searchParams.get("download") != null || !inlineSafe;
  const name = (doc.file_name || "document").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "content-type": mime,
      "content-disposition": `${forceDownload ? "attachment" : "inline"}; filename="${name}"`,
      "cache-control": "private, max-age=604800, immutable",
    },
  });
}
