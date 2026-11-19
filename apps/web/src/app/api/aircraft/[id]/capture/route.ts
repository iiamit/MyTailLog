import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { getBlob, putBlob, type PutBody } from "@/lib/storage";
import { thumbnailKey } from "@/lib/capture/thumbnail";
import { describeDuplicate, nextSequence, queueFields } from "@/lib/writes/pages";

// Capture-queue drain target for BOTH clients:
//  - web offline queue → multipart/form-data (File parts)
//  - native app        → application/json with base64 (Capacitor's native HTTP
//                        doesn't reliably do multipart file uploads)
// The browser used to write Storage + the row itself; now the server does both
// (service creds for the blob, RLS for the row) so it works on any backend.
//
// Phase 3 (09 §4.1): with `batchId` (and optionally `phash`) the page joins the
// server reading queue (`queued`; the reader worker reads it, the client does
// not call extract) and the response may carry `duplicateOf`. Without
// `batchId` it behaves exactly as before, for the Capacitor app.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // a processed page JPEG is ~1–3 MB
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CaptureInput = {
  image: PutBody;
  imageBytes: number;
  thumb: PutBody | null;
  pageId: string;
  logbookId: string;
  pageSequence: number | null;
  capturedAt: string | null;
  isHandwritten: boolean;
  batchId: string | null;
  phash: string | null;
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
      batchId: typeof b.batchId === "string" && b.batchId ? b.batchId : null,
      phash: typeof b.phash === "string" && b.phash ? b.phash : null,
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
    batchId: String(form?.get("batchId") || "") || null,
    phash: String(form?.get("phash") || "") || null,
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
  if (!UUID.test(input.pageId) || !UUID.test(input.logbookId)) {
    return NextResponse.json({ error: "Invalid page or logbook id." }, { status: 400 });
  }
  if (input.imageBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Page image too large." }, { status: 413 });
  }

  const [{ data: book, error: bookError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from("logbook").select("id").eq("id", input.logbookId).eq("aircraft_id", id).maybeSingle(),
    supabase.from("page").select("aircraft_id, logbook_id").eq("id", input.pageId).maybeSingle(),
  ]);
  if (bookError || existingError) return NextResponse.json({ error: "Could not check this page." }, { status: 500 });
  if (!book) return NextResponse.json({ error: "Logbook not found on this aircraft." }, { status: 404 });
  if (existing) return existing.aircraft_id === id && existing.logbook_id === input.logbookId
    ? NextResponse.json({ ok: true, pageId: input.pageId })
    : NextResponse.json({ error: "Page id belongs to another logbook." }, { status: 409 });

  const queue = await queueFields(supabase, { aircraftId: id, userId: user.id }, { queue: Boolean(input.batchId), batchId: input.batchId, phash: input.phash });
  if ("error" in queue) return NextResponse.json({ error: queue.error }, { status: queue.httpStatus });

  const path = `${id}/${input.logbookId}/${input.pageId}.jpg`;
  const thumbPath = thumbnailKey(path);

  const { error: upErr } = await putBlob(path, input.image, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    // A prior interrupted upload can leave the blob without its row. Reuse it
    // only when it is byte-for-byte the same capture; never replace it.
    const stored = await getBlob(path);
    if (!stored) return NextResponse.json({ error: upErr }, { status: 500 });
    const incoming = input.image instanceof Blob ? Buffer.from(await input.image.arrayBuffer()) : Buffer.from(input.image);
    if (!stored.data.equals(incoming)) return NextResponse.json({ error: "Page image already exists with different content." }, { status: 409 });
  }

  // Thumbnail is best-effort — the page still renders via a fallback to the full scan.
  let thumbOk = false;
  if (input.thumb) {
    const { error } = await putBlob(thumbPath, input.thumb, { contentType: "image/jpeg", upsert: false });
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
    ...queue.fields,
    // review_status defaults to 'unreviewed'; OCR/extraction fill the rest later.
  });
  // 23505 = unique_violation: the row already exists from a prior partial drain →
  // treat as success so the queue entry clears.
  if (rowError && rowError.code !== "23505") {
    return NextResponse.json({ error: rowError.message }, { status: 500 });
  }

  const duplicateOf = await describeDuplicate(supabase, queue.fields.duplicate_of_page_id);
  return NextResponse.json({ ok: true, pageId: input.pageId, ...(duplicateOf ? { duplicateOf } : {}) });
}
