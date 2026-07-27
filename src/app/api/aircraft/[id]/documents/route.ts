import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { putBlob, removeBlobs } from "@/lib/storage";
import type { DocumentType } from "@/lib/database.types";
import { DOCUMENT_TYPES } from "@/lib/documents";

// Records Vault upload. A ROUTE (not a server action) because Server Actions cap
// the request body at ~1 MB by default — a normal phone JPEG blows past that.
// Same shape as the oil-analysis import route.
export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Editor-gated (RLS enforces it too on the insert).
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  }
  if (!ACCEPTED.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file — upload a PDF or an image (JPEG/PNG/WebP)." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 25 MB)." }, { status: 413 });
  }

  const rawType = String(form!.get("type") || "other");
  const type = (DOCUMENT_TYPES as string[]).includes(rawType) ? (rawType as DocumentType) : "other";
  const logEntryId = String(form!.get("log_entry_id") || "").trim() || null;
  const title = String(form!.get("title") || "").trim() || file.name;
  const reference = String(form!.get("reference") || "").trim() || null;
  const documentDate = String(form!.get("document_date") || "").trim() || null;
  const notes = String(form!.get("notes") || "").trim() || null;

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const path = `${id}/docs/${randomUUID()}.${ext}`;
  const { error: upErr } = await putBlob(path, file, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr }, { status: 500 });

  const { error } = await supabase.from("document").insert({
    aircraft_id: id,
    type,
    title,
    reference,
    document_date: documentDate,
    notes,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    log_entry_id: logEntryId,
  });
  if (error) {
    // Don't leave an orphaned blob if the row insert failed.
    await removeBlobs([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
