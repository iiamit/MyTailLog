import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { putBlob } from "@/lib/storage";

// Generic editor-gated blob upload, confined to one aircraft's key prefix. Used
// by the browser flows that can't write GCS directly — backup restore and the
// thumbnail backfill. The caller supplies the exact storage key (which must live
// under `<aircraftId>/`); the server writes it with service creds.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 30 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) {
    return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const path = String(form?.get("path") || "");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  }
  // Confine writes to this aircraft's prefix — never let a caller escape it.
  if (!path.startsWith(`${id}/`) || path.includes("..")) {
    return NextResponse.json({ error: "Path must be under this aircraft." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 413 });
  }

  const { error } = await putBlob(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });

  return NextResponse.json({ ok: true, path });
}
