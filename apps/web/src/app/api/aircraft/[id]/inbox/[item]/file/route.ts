import { ownerAccess, ownerError } from "@/lib/owner/access";
import { getBlob } from "@/lib/storage";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; item: string }> },
) {
  const { id, item } = await params,
    a = await ownerAccess(req, id);
  if (a.response) return a.response;
  const { data, error } = await a.supabase
    .from("aircraft_inbox")
    .select("storage_path,mime_type,file_name")
    .eq("aircraft_id", id)
    .eq("id", item)
    .maybeSingle();
  if (error) return ownerError(new Error("Could not load source."), 503);
  if (!data) return ownerError(new Error("Source not found."), 404);
  const blob = await getBlob(data.storage_path, id);
  if (!blob)
    return ownerError(
      new Error("Source is temporarily unavailable. Retry shortly."),
      503,
    );
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": data.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(data.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
