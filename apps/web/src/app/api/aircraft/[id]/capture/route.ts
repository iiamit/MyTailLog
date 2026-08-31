import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { putBlob, type PutBody } from "@/lib/storage";
import { thumbnailKey } from "@/lib/capture/thumbnail";

// Capture-queue drain target for BOTH clients:
//  - web offline queue → multipart/form-data (File parts)
//  - native app        → application/json with base64 (Capacitor's native HTTP
//                        doesn't reliably do multipart file uploads)
// The browser used to write Storage + the row itself; now the server does both
// (service creds for the blob, RLS for the row) so it works on any backend.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // a processed page JPEG is ~1–3 MB

type CaptureInput = {
  image: PutBody;
  imageBytes: number;
  thumb: PutBody | null;
  pageId: string;
  logbookId: string;
  pageSequence: number | null;
  capturedAt: string | null;
  isHandwritten: boolean;
};

async function parseInput(req: Request): Promise<CaptureInput | null> {
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || typeof b.image !== "string" || !b.image) return null;
    const image = Buffer.from(b.image, "base64");
    const thumb = typeof b.thumbnail === "string" && b.thumbnail ? Buffer.from(b.thumbnail, "base64") : null;
    const seq = b.pageSequence;
    return {
      image,
      imageBytes: image.length,
      thumb,
      pageId: String(b.pageId ?? "").trim(),
      logbookId: String(b.logbookId ?? "").trim(),
      pageSequence: seq == null || seq === "" ? null : Number(seq),
      capturedAt: b.capturedAt ? String(b.capturedAt) : null,
      isHandwritten: b.isHandwritten === true || b.isHandwritten === "true",
    };
  }

  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File)) return null;
  const thumb = form?.get("thumbnail");
  const seqRaw = String(form?.get("pageSequence") || "");
  return {
    image,
    imageBytes: image.size,
    thumb: thumb instanceof File && thumb.size > 0 ? thumb : null,
    pageId: String(form?.get("pageId") || "").trim(),
    logbookId: String(form?.get("logbookId") || "").trim(),
    pageSequence: seqRaw === "" ? null : Number(seqRaw),
    capturedAt: String(form?.get("capturedAt") || "") || null,
    isHandwritten: String(form?.get("isHandwritten") || "") === "true",
  };
}

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

  const input = await parseInput(req);
  if (!input || input.imageBytes === 0) {
    return NextResponse.json({ error: "Missing page image." }, { status: 400 });
  }
  if (!input.pageId || !input.logbookId) {
    return NextResponse.json({ error: "Missing page or logbook id." }, { status: 400 });
  }
  if (input.imageBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Page image too large." }, { status: 413 });
  }

  const path = `${id}/${input.logbookId}/${input.pageId}.jpg`;
  const thumbPath = thumbnailKey(path);

  const { error: upErr } = await putBlob(path, input.image, { contentType: "image/jpeg", upsert: true });
  if (upErr) return NextResponse.json({ error: upErr }, { status: 500 });

  // Thumbnail is best-effort — the page still renders via a fallback to the full scan.
  let thumbOk = false;
  if (input.thumb) {
    const { error } = await putBlob(thumbPath, input.thumb, { contentType: "image/jpeg", upsert: true });
    thumbOk = !error;
  }

  // Page number. The web uploader runs its own counter across a batch and sends
  // one; the phone cannot, because a capture may sit in the offline queue while
  // other pages arrive, so anything it worked out at scan time could be stale by
  // the time it drains. When no sequence is supplied, take the next one for this
  // logbook here, where the current state is known.
  //
  // Before this, an unsupplied sequence was stored as NULL — so every page ever
  // scanned on the phone came out unnumbered, and a logbook filled from both
  // clients ended up numbered in patches.
  const supplied = Number.isFinite(input.pageSequence as number)
    ? (input.pageSequence as number)
    : null;
  const pageSequence = supplied ?? (await nextSequence(supabase, input.logbookId));

  const { error: rowError } = await supabase.from("page").insert({
    id: input.pageId,
    logbook_id: input.logbookId,
    aircraft_id: id,
    storage_path: path,
    thumbnail_path: thumbOk ? thumbPath : null,
    page_sequence: pageSequence,
    captured_at: input.capturedAt,
    is_handwritten: input.isHandwritten,
    // review_status defaults to 'unreviewed'; OCR/extraction fill the rest later.
  });
  // 23505 = unique_violation: the row already exists from a prior partial drain →
  // treat as success so the queue entry clears.
  if (rowError && rowError.code !== "23505") {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pageId: input.pageId });
}

/**
 * The next page number in a logbook: one past the highest already there.
 *
 * page_sequence carries no unique constraint (manual reorder renumbers freely),
 * so two captures draining at the same instant could take the same number. That
 * is the same tie a manual reorder already tolerates and the list still renders,
 * where refusing the insert would lose a scan the owner has already taken.
 *
 * Falls back to null on a read error rather than guessing at 1 and colliding
 * with an existing page 1.
 */
async function nextSequence(
  supabase: Awaited<ReturnType<typeof createSyncClient>>,
  logbookId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("page")
    .select("page_sequence")
    .eq("logbook_id", logbookId)
    .not("page_sequence", "is", null)
    .order("page_sequence", { ascending: false })
    .limit(1);
  if (error) return null;
  const highest = data?.[0]?.page_sequence;
  return typeof highest === "number" ? highest + 1 : 1;
}
