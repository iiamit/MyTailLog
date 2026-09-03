import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSyncClient } from "@/lib/supabase/sync";
import { putBlob, removeBlobs, type PutBody } from "@/lib/storage";
import type { DocumentType } from "@/lib/database.types";
import { DOCUMENT_TYPES } from "@/lib/documents";
import { entryIsOnAircraft, FOREIGN_ENTRY } from "@/lib/writes/entries";

// Records Vault upload for BOTH clients (same split as the capture route):
//  - web        → multipart/form-data (File part `file`)
//  - native app → application/json with base64 (`file`, `fileName`, `mimeType`)
//                 because Capacitor's native HTTP can't do multipart. Bearer
//                 auth via createSyncClient; cookies still work for the browser.
// A ROUTE (not a server action) because Server Actions cap the request body at
// ~1 MB by default — a normal phone JPEG blows past that.
export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

type Upload = {
  body: PutBody;
  bytes: number;
  name: string;
  mime: string;
  fields: Record<string, string>;
};

async function parseInput(req: Request): Promise<Upload | null> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || typeof b.file !== "string" || !b.file) return null;
    const body = Buffer.from(b.file, "base64");
    const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
    return {
      body,
      bytes: body.length,
      name: s("fileName") || "document",
      mime: s("mimeType"),
      fields: {
        type: s("type"),
        log_entry_id: s("log_entry_id"),
        title: s("title"),
        reference: s("reference"),
        document_date: s("document_date"),
        notes: s("notes"),
      },
    };
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return null;
  const s = (k: string) => String(form!.get(k) || "");
  return {
    body: file,
    bytes: file.size,
    name: file.name,
    mime: file.type,
    fields: {
      type: s("type"),
      log_entry_id: s("log_entry_id"),
      title: s("title"),
      reference: s("reference"),
      document_date: s("document_date"),
      notes: s("notes"),
    },
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Editor-gated (RLS enforces it too on the insert).
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });

  const input = await parseInput(req);
  if (!input || input.bytes === 0) return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  if (!ACCEPTED.includes(input.mime)) {
    return NextResponse.json({ error: "Unsupported file — upload a PDF or an image (JPEG/PNG/WebP)." }, { status: 415 });
  }
  if (input.bytes > MAX_BYTES) return NextResponse.json({ error: "File too large (max 25 MB)." }, { status: 413 });

  const f = input.fields;
  const type = (DOCUMENT_TYPES as string[]).includes(f.type) ? (f.type as DocumentType) : "other";
  const logEntryId = f.log_entry_id.trim() || null;
  // The insert's RLS proves the caller may edit THIS aircraft; it says nothing
  // about which log_entry the FK points at, and document.log_entry_id is not
  // aircraft-scoped. Same guard documents.setEntry applies (lib/writes).
  if (logEntryId && !(await entryIsOnAircraft(supabase, id, logEntryId))) {
    return NextResponse.json({ error: FOREIGN_ENTRY }, { status: 400 });
  }
  const title = f.title.trim() || input.name;
  const reference = f.reference.trim() || null;
  const documentDate = f.document_date.trim() || null;
  const notes = f.notes.trim() || null;

  const ext = (input.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const path = `${id}/docs/${randomUUID()}.${ext}`;
  const { error: upErr } = await putBlob(path, input.body, { contentType: input.mime, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr }, { status: 500 });

  const { data: row, error } = await supabase
    .from("document")
    .insert({
      aircraft_id: id,
      type,
      title,
      reference,
      document_date: documentDate,
      notes,
      storage_path: path,
      file_name: input.name,
      mime_type: input.mime,
      size_bytes: input.bytes,
      log_entry_id: logEntryId,
    })
    .select("*")
    .maybeSingle();
  if (error || !row) {
    // Don't leave an orphaned blob if the row insert failed.
    await removeBlobs([path]);
    return NextResponse.json({ error: error?.message ?? "Couldn't save the document." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, document: row });
}
