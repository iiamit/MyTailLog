import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { blobSize, signedUploadUrl } from "@/lib/storage";
import { thumbnailKey } from "@/lib/capture/thumbnail";
import { MAX_PAGE_BYTES, pageStoragePath } from "@/lib/writes/pages";

// POST /api/aircraft/{id}/uploads  (05 §7.2, 09 §5.6) — phones only; editors.
// { kind: 'page'|'page_thumb', pageId, logbookId, bytes, contentType? }
// { kind: 'meter_photo', readingId, bytes }
// → { uploadUrl, method: 'PUT', headers, storagePath, expiresAt }
// → { alreadyUploaded: true, storagePath } when the object is there (a retry after a lost response)
// Then the phone queues `page.register` (or `reading.create` with photoPath). The object
// key is fixed by the ids, so a retried upload can never land twice; size is checked
// again at register, since a signed PUT cannot be capped on every backend.
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) return NextResponse.json({ error: "You don't have edit access to this aircraft.", code: "viewer_read_only" }, { status: 403 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const bytes = Number(b?.bytes);
  if (!b || !Number.isFinite(bytes) || bytes <= 0) return NextResponse.json({ error: "Say how large the file is.", code: "invalid" }, { status: 400 });

  let path: string;
  let limit: number;
  if (b.kind === "page" || b.kind === "page_thumb") {
    const pageId = String(b.pageId ?? "");
    const logbookId = String(b.logbookId ?? "");
    if (!UUID.test(pageId) || !UUID.test(logbookId)) return NextResponse.json({ error: "Invalid page or logbook id.", code: "invalid" }, { status: 400 });
    const { data: book } = await supabase.from("logbook").select("id").eq("id", logbookId).eq("aircraft_id", id).maybeSingle();
    if (!book) return NextResponse.json({ error: "Logbook not found on this aircraft.", code: "not_found" }, { status: 404 });
    path = pageStoragePath(id, logbookId, pageId);
    if (b.kind === "page_thumb") path = thumbnailKey(path);
    limit = MAX_PAGE_BYTES;
  } else if (b.kind === "meter_photo") {
    const readingId = String(b.readingId ?? "");
    if (!UUID.test(readingId)) return NextResponse.json({ error: "Invalid reading id.", code: "invalid" }, { status: 400 });
    path = `${id}/meters/${readingId}.jpg`;
    limit = MAX_PHOTO_BYTES;
  } else {
    return NextResponse.json({ error: "Unknown upload kind.", code: "invalid" }, { status: 400 });
  }
  if (bytes > limit) {
    return NextResponse.json({ error: "Too large to upload. Retake at a lower size or upload from a computer.", code: "too_large" }, { status: 413 });
  }

  if ((await blobSize(path)) != null) return NextResponse.json({ alreadyUploaded: true, storagePath: path });
  const signed = await signedUploadUrl(path, "image/jpeg");
  if ("error" in signed) return NextResponse.json({ error: signed.error, code: "server_error" }, { status: 500 });
  return NextResponse.json({ uploadUrl: signed.url, method: "PUT", headers: signed.headers, storagePath: path, expiresAt: signed.expiresAt });
}
