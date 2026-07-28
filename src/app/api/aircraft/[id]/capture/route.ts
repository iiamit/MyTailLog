import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { putBlob } from "@/lib/storage";
import { thumbnailKey } from "@/lib/capture/thumbnail";

// Capture-queue drain target. The browser used to upload the page image +
// thumbnail straight to Supabase Storage and insert the row itself; that can't
// work once blobs live in GCS (no RLS, no browser creds), so the drain POSTs
// here and the server writes the blobs (service creds) + the row (RLS). A ROUTE,
// not a server action, because Server Actions cap the body at ~1 MB.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // a processed page JPEG is ~1–3 MB

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) {
    return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  const thumb = form?.get("thumbnail");
  const pageId = String(form?.get("pageId") || "").trim();
  const logbookId = String(form?.get("logbookId") || "").trim();
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "Missing page image." }, { status: 400 });
  }
  if (!pageId || !logbookId) {
    return NextResponse.json({ error: "Missing page or logbook id." }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ error: "Page image too large." }, { status: 413 });
  }

  const path = `${id}/${logbookId}/${pageId}.jpg`;
  const thumbPath = thumbnailKey(path);

  const { error: upErr } = await putBlob(path, image, { contentType: "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr }, { status: 500 });

  // Thumbnail is best-effort — the page still renders via a fallback to the full scan.
  let thumbOk = false;
  if (thumb instanceof File && thumb.size > 0 && thumb.size <= MAX_BYTES) {
    const { error } = await putBlob(thumbPath, thumb, { contentType: "image/jpeg", upsert: true });
    thumbOk = !error;
  }

  const seqRaw = String(form?.get("pageSequence") || "");
  const pageSequence = seqRaw === "" ? null : Number(seqRaw);

  const { error: rowError } = await supabase.from("page").insert({
    id: pageId,
    logbook_id: logbookId,
    aircraft_id: id,
    storage_path: path,
    thumbnail_path: thumbOk ? thumbPath : null,
    page_sequence: Number.isFinite(pageSequence as number) ? (pageSequence as number) : null,
    captured_at: String(form?.get("capturedAt") || "") || null,
    is_handwritten: String(form?.get("isHandwritten") || "") === "true",
    // review_status defaults to 'unreviewed'; OCR/extraction fill the rest later.
  });
  // 23505 = unique_violation: the row already exists from a prior partial drain →
  // treat as success so the queue entry clears.
  if (rowError && rowError.code !== "23505") {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pageId });
}
