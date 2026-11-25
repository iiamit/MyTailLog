import { ownerJson, ownerBody } from "@/lib/owner/body";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { ownerRows } from "@/lib/owner/load";
import { UUID } from "@/lib/owner/validation";
import {
  digest,
  putIdentical,
  verifyOriginal,
  MAX_ORIGINAL,
} from "@/lib/owner/inbox";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id);
  if (a.response) return a.response;
  let items, books;
  try {
    [items, books] = await Promise.all([
      ownerRows(a.supabase, "aircraft_inbox", id),
      a.supabase.from("logbook").select("id,type").eq("aircraft_id", id),
    ]);
    if (books.error) throw new Error(books.error.message);
  } catch (e) {
    return ownerError(e, 503);
  }

  return NextResponse.json(
    {
      items: items.sort(
        (a, b) =>
          b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
      ),
      logbooks: books.data ?? [],
      canEdit: a.canEdit,
      canManageFinances: a.aircraft.owner_id === a.user.id,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_ORIGINAL * 1.4)
      throw new Error("File too large (max 25 MB).");
    let restoreSource: string | null = null;
    let bytes: Buffer,
      name: string,
      mime: string,
      operation = req.headers.get("idempotency-key");
    if (req.headers.get("content-type")?.includes("application/json")) {
      const b = await ownerJson(req, MAX_ORIGINAL * 1.4);
      if (typeof b.file !== "string" || b.file.length > MAX_ORIGINAL * 1.4)
        throw new Error("Attach a file of at most 25 MB.");
      bytes = Buffer.from(b.file, "base64");
      name = String(b.fileName ?? "document");
      mime = String(b.mimeType ?? "");
      if (b.id != null && typeof b.id !== "string")
        throw new Error("Invalid upload identifier.");
      restoreSource =
        typeof b.restoreSourceId === "string" ? b.restoreSourceId : null;
      operation = operation ?? (typeof b.id === "string" ? b.id : null);
    } else {
      const bounded = await ownerBody(req, MAX_ORIGINAL * 1.4);
      const parsed = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: bounded as BodyInit,
      });
      const form = await parsed.formData(),
        file = form.get("file");
      if (!(file instanceof File)) throw new Error("Attach a file.");
      bytes = Buffer.from(await file.arrayBuffer());
      name = file.name;
      mime = file.type;
      operation = operation ?? String(form.get("id") || "");
      restoreSource = form.get("restoreSourceId")?.toString() ?? null;
    }
    if (
      restoreSource &&
      (!UUID.test(restoreSource) || a.aircraft.owner_id !== a.user.id)
    )
      throw new Error("Only the aircraft owner can restore inbox archives.");
    const itemId = operation || randomUUID();
    if (!UUID.test(itemId)) throw new Error("Invalid upload identifier.");
    if (name.length > 255 || !name.trim())
      throw new Error("Choose a file name of at most 255 characters.");
    await verifyOriginal(bytes, mime);
    const sha = digest(bytes);
    const { data: existing, error: readError } = await a.supabase
      .from("aircraft_inbox")
      .select("*")
      .eq("aircraft_id", id)
      .or(
        restoreSource
          ? `id.eq.${itemId},restore_source_id.eq.${restoreSource}`
          : `id.eq.${itemId},and(sha256.eq.${sha},restore_source_id.is.null)`,
      )
      .limit(1)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing) {
      if (existing.sha256 !== sha)
        return ownerError(
          new Error("Upload identifier belongs to a different file."),
          409,
        );
      return NextResponse.json({ item: existing, duplicate: true });
    }
    const path = `${id}/inbox/${itemId}/original`;
    await putIdentical(path, bytes, mime, id);
    const { data, error } = await a.supabase
      .from("aircraft_inbox")
      .insert({
        id: itemId,
        aircraft_id: id,
        created_by: a.user.id,
        file_name: name,
        mime_type: mime,
        size_bytes: bytes.length,
        storage_path: path,
        sha256: sha,
        restore_source_id: restoreSource,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: replay } = await a.supabase
          .from("aircraft_inbox")
          .select("*")
          .eq("aircraft_id", id)
          .eq("created_by", a.user.id)
          .eq(
            restoreSource ? "restore_source_id" : "sha256",
            restoreSource ?? sha,
          )
          .maybeSingle();
        if (replay) return NextResponse.json({ item: replay, duplicate: true });
      }
      throw new Error(error.message);
    }
    return NextResponse.json({ item: data });
  } catch (e) {
    return ownerError(e);
  }
}
