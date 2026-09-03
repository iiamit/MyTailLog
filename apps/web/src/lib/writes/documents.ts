import type { DocumentRecord, DocumentType } from "@/lib/database.types";
import { DOCUMENT_TYPES } from "@/lib/documents";
import { entryIsOnAircraft, FOREIGN_ENTRY, canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every Records Vault metadata write (CONTRACT §3 C3,
// §4). Uploads stay in POST /api/aircraft/[id]/documents (body size). See
// entries.ts for the rules. `@/lib/storage` is imported lazily because it is
// `server-only`, and the unit tests load this file under plain node.

const NO_EDIT = "You don't have edit access to this aircraft.";

export type DocumentFields = Pick<DocumentRecord, "type" | "title" | "reference" | "document_date" | "notes">;

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-c3.test.ts
// ---------------------------------------------------------------------------

const TEXT_KEYS = ["title", "reference", "notes"] as const;

/** Validate an untrusted `fields` patch: only the owner-editable columns pass.
 *  Unknown keys (storage_path, aircraft_id, log_entry_id…) are dropped. */
export function pickDocumentFields(input: unknown): { fields: Partial<DocumentFields> } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Document fields are missing." };
  const src = input as Record<string, unknown>;
  const out: Partial<DocumentFields> = {};
  if ("type" in src) {
    if (!(DOCUMENT_TYPES as string[]).includes(String(src.type))) return { error: "Pick a document type." };
    out.type = src.type as DocumentType;
  }
  for (const k of TEXT_KEYS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (v !== null && typeof v !== "string") return { error: `${k[0].toUpperCase()}${k.slice(1)} must be text.` };
    out[k] = v === null ? null : v.trim() || null;
  }
  if ("document_date" in src) {
    const v = src.document_date;
    if (v !== null && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
      return { error: "Document date must be a full date." };
    }
    out.document_date = v;
  }
  if (!Object.keys(out).length) return { error: "Nothing to change." };
  return { fields: out };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function loadDocument(
  supabase: Db,
  ctx: WriteCtx,
  documentId: string,
  base: string | undefined,
): Promise<{ row: DocumentRecord } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("document")
    .select("*")
    .eq("id", documentId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Document not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

async function patchDocument(
  supabase: Db,
  ctx: WriteCtx,
  documentId: string,
  patch: Partial<DocumentRecord>,
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("document")
    .update(patch)
    .eq("id", documentId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Document not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

export async function update(
  supabase: Db,
  ctx: WriteCtx,
  input: { documentId: string; fields: unknown },
  base?: string,
): Promise<WriteResult> {
  const picked = pickDocumentFields(input.fields);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  const loaded = await loadDocument(supabase, ctx, input.documentId, base);
  if ("status" in loaded) return loaded;
  return patchDocument(supabase, ctx, input.documentId, picked.fields);
}

/**
 * Attach a Vault document to a log entry, or detach it (`entryId = null`) so it
 * drops back to the Vault. Both rows must belong to the aircraft — RLS scopes
 * the write to editors of the DOCUMENT's aircraft but says nothing about which
 * entry the FK points at, so the entry is checked explicitly.
 */
export async function setEntry(
  supabase: Db,
  ctx: WriteCtx,
  input: { documentId: string; entryId: string | null },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadDocument(supabase, ctx, input.documentId, base);
  if ("status" in loaded) return loaded;
  if (input.entryId && !(await entryIsOnAircraft(supabase, ctx.aircraftId, input.entryId))) {
    return { status: "error", message: FOREIGN_ENTRY, httpStatus: 400 };
  }
  return patchDocument(supabase, ctx, input.documentId, { log_entry_id: input.entryId ?? null });
}

/** Nothing references document(id) (checked the migrations). The row goes
 *  first — the record of truth — then the blob, best effort; an orphaned file
 *  is harmless, a row pointing at a missing file is not. */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { documentId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadDocument(supabase, ctx, input.documentId, base);
  if ("status" in loaded) return loaded;
  const { data, error } = await supabase
    .from("document")
    .delete()
    .eq("id", input.documentId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Document not found.", httpStatus: 404 };
  if (loaded.row.storage_path) {
    const { removeBlobs } = await import("@/lib/storage");
    await removeBlobs([loaded.row.storage_path]).catch(() => {});
  }
  return { status: "ok", row: null };
}
