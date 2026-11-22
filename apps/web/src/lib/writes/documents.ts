import { writeRecord } from "./conditional";
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
  version: string,
  patch: Partial<DocumentRecord>,
): Promise<WriteResult> {
  return writeRecord(supabase, ctx, "document", documentId, version, patch);
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
  return patchDocument(supabase, ctx, input.documentId, loaded.row.updated_at, picked.fields);
}

type Expiry = Pick<DocumentRecord, "track_expiry" | "expires_on" | "renews_every_months" | "remind_lead_days">;
/** 09 §2.7 defaults when the owner turns tracking on. */
const RENEWS_DEFAULT: Partial<Record<string, number>> = { registration: 84, insurance: 12, radio_license: 120 };

/**
 * Validate `{trackExpiry, expiresOn?, renewsEveryMonths?, remindLeadDays?}` (09 §2.7). The expiry date
 * is always the owner's (typed or read off the paper), never computed; tracking without one is "no record".
 */
export function pickExpiry(input: Record<string, unknown>, type: string): { fields: Expiry } | { error: string } {
  if (typeof input.trackExpiry !== "boolean") return { error: "Say whether to track its expiry." };
  const expiresOn = input.expiresOn ?? null;
  if (expiresOn !== null && expiresOn !== "" && !(typeof expiresOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiresOn)))
    return { error: "Expiry must be a full date." };
  const int = (v: unknown, lo: number, hi: number) =>
    v == null || v === "" ? null : Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : NaN;
  const renews = "renewsEveryMonths" in input ? int(input.renewsEveryMonths, 1, 120) : input.trackExpiry ? RENEWS_DEFAULT[type] ?? null : null;
  const lead = int(input.remindLeadDays, 0, 365);
  if (Number.isNaN(renews)) return { error: "Renews every must be 1 to 120 months." };
  if (Number.isNaN(lead)) return { error: "Remind me must be 0 to 365 days ahead." };
  return { fields: { track_expiry: input.trackExpiry, expires_on: (expiresOn as string) || null, renews_every_months: renews, remind_lead_days: lead } };
}

/** `document.setExpiry` (base): a tracked document is a `doc:` due item on Status (09 §3.2). */
export async function setExpiry(
  supabase: Db,
  ctx: WriteCtx,
  input: { documentId: string; trackExpiry: boolean; expiresOn?: string | null; renewsEveryMonths?: number | null; remindLeadDays?: number | null },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadDocument(supabase, ctx, input.documentId, base);
  if ("status" in loaded) return loaded;
  const picked = pickExpiry(input, loaded.row.type);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  return patchDocument(supabase, ctx, input.documentId, loaded.row.updated_at, picked.fields);
}

/** Save the rendered document form as one CAS write; invalid later fields never leave a partial save. */
export async function save(
  supabase: Db, ctx: WriteCtx,
  input: { documentId: string; fields: unknown; expiry: Record<string, unknown>; entryId: string | null },
  base: string,
): Promise<WriteResult> {
  const fields = pickDocumentFields(input.fields);
  if ("error" in fields) return { status: "error", message: fields.error, httpStatus: 400 };
  const loaded = await loadDocument(supabase, ctx, input.documentId, base);
  if ("status" in loaded) return loaded;
  const expiry = pickExpiry(input.expiry, fields.fields.type ?? loaded.row.type);
  if ("error" in expiry) return { status: "error", message: expiry.error, httpStatus: 400 };
  if (input.entryId && !(await entryIsOnAircraft(supabase, ctx.aircraftId, input.entryId)))
    return { status: "error", message: FOREIGN_ENTRY, httpStatus: 400 };
  return patchDocument(supabase, ctx, input.documentId, loaded.row.updated_at,
    { ...fields.fields, ...expiry.fields, log_entry_id: input.entryId });
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
  return patchDocument(supabase, ctx, input.documentId, loaded.row.updated_at, { log_entry_id: input.entryId ?? null });
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
  const result = await writeRecord(supabase, ctx, "document", input.documentId, loaded.row.updated_at, null);
  if (result.status !== "ok") return result;
  if (loaded.row.storage_path) {
    const { removeBlobs } = await import("@/lib/storage");
    await removeBlobs([loaded.row.storage_path], ctx.aircraftId).catch(() => {});
  }
  return { status: "ok", row: null };
}
