import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { putBlob } from "@/lib/storage";
import { squawkPhotoPath } from "@/lib/writes/squawks";

// Blob upload confined to one aircraft's key prefix. Two shapes (multipart, cookie or Bearer):
//  - `path` (editors): the caller supplies the exact key under `<aircraftId>/`; used by backup restore
//    and the thumbnail backfill.
//  - `kind` (09 §4.1, §5.6): the server builds the key, so the client never names a path.
//      squawk_photo + squawkId + id → <aircraft>/squawks/<squawkId>/<id>.jpg  (the squawk's reporter or an editor)
//      meter_photo  + readingId     → <aircraft>/meters/<readingId>.jpg        (editors)
//    The matching row is written by push `squawkPhoto.create {blobId: id}` / `reading.create {photoBlobId}`.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 30 * 1024 * 1024;
const PHOTO_MAX_BYTES = 6 * 1024 * 1024; // 14-decisions.md D9
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"];
const ID = /^[0-9A-Za-z-]{8,64}$/;
const NO_EDIT = "You don't have edit access to this aircraft.";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  }
  const field = (k: string) => String(form?.get(k) || "");
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });

  let path: string;
  const kind = field("kind");
  if (kind === "squawk_photo" || kind === "meter_photo") {
    if (file.size > PHOTO_MAX_BYTES) return NextResponse.json({ error: "This file is larger than 6 MB.", code: "too_large" }, { status: 413 });
    if (!PHOTO_TYPES.includes(file.type)) return NextResponse.json({ error: "Upload a photo (JPEG, PNG, HEIC or WebP)." }, { status: 415 });
    if (kind === "squawk_photo") {
      const squawkId = field("squawkId");
      const blobId = field("id");
      if (!ID.test(blobId)) return NextResponse.json({ error: "The photo is missing its id." }, { status: 400 });
      // RLS read proves access to the aircraft; the reporter or an editor may add (squawk_photo_add, 0076).
      const { data: squawk } = await supabase.from("squawk").select("id, reported_by").eq("id", squawkId).eq("aircraft_id", id).maybeSingle();
      if (!squawk) return NextResponse.json({ error: "Squawk not found." }, { status: 404 });
      if (!canEdit && squawk.reported_by !== user.id)
        return NextResponse.json({ error: "You can add photos only to squawks you reported.", code: "viewer_read_only" }, { status: 403 });
      path = squawkPhotoPath(id, squawkId, blobId);
    } else {
      if (!canEdit) return NextResponse.json({ error: NO_EDIT, code: "viewer_read_only" }, { status: 403 });
      const readingId = field("readingId");
      if (!ID.test(readingId)) return NextResponse.json({ error: "The reading is missing its id." }, { status: 400 });
      path = `${id}/meters/${readingId}.jpg`;
    }
  } else {
    if (!canEdit) return NextResponse.json({ error: NO_EDIT }, { status: 403 });
    path = field("path");
    // Confine writes to this aircraft's prefix — never let a caller escape it.
    if (!path.startsWith(`${id}/`) || path.includes("..")) {
      return NextResponse.json({ error: "Path must be under this aircraft." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large." }, { status: 413 });
    }
  }

  const { error } = await putBlob(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: true, path });
}
