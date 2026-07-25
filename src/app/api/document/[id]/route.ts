import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

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

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("document")
    .select("storage_path, file_name, mime_type")
    .eq("id", id)
    .single();
  if (!doc || !doc.storage_path) return new Response("Not found", { status: 404 });

  const { data: blob, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
  if (error || !blob) return new Response("Not found", { status: 404 });

  const buf = await blob.arrayBuffer();
  const mime = doc.mime_type || blob.type || "application/octet-stream";
  // Only render PDFs/images inline; anything else is forced to download so a
  // stored file can never execute as active content on our origin.
  const inlineSafe = mime === "application/pdf" || mime.startsWith("image/");
  const forceDownload = new URL(req.url).searchParams.get("download") != null || !inlineSafe;
  const name = (doc.file_name || "document").replace(/["\r\n]/g, "");
  return new Response(buf, {
    headers: {
      "content-type": mime,
      "content-disposition": `${forceDownload ? "attachment" : "inline"}; filename="${name}"`,
      "cache-control": "private, max-age=604800, immutable",
    },
  });
}
