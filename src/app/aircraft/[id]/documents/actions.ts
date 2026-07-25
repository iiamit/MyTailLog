"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/lib/database.types";
import { DOCUMENT_TYPES } from "@/lib/documents";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";
// Scanned records are PDFs or photos. (Broaden later if office formats are asked
// for — those add a served-content type-safety burden, so keep it tight now.)
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 25 * 1024 * 1024;

async function assertEditor(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Not signed in." };
  // RLS also enforces this on write; the explicit check gives a clean message.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId });
  if (!canEdit) return { supabase, error: "You don't have edit access to this aircraft." };
  return { supabase };
}

/**
 * Upload a document to an aircraft's Records Vault. Pass `log_entry_id` in the
 * form to also attach it to a maintenance entry (it still shows in the Vault).
 */
export async function uploadDocument(
  aircraftId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const { supabase, error: authErr } = await assertEditor(aircraftId);
  if (authErr) return { error: authErr };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Attach a file." };
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Unsupported file — upload a PDF or an image (JPEG/PNG/WebP)." };
  }
  if (file.size > MAX_BYTES) return { error: "File too large (max 25 MB)." };

  const rawType = String(formData.get("type") || "other");
  const type = (DOCUMENT_TYPES as string[]).includes(rawType) ? (rawType as DocumentType) : "other";
  const logEntryId = String(formData.get("log_entry_id") || "").trim() || null;
  const title = String(formData.get("title") || "").trim() || file.name;
  const reference = String(formData.get("reference") || "").trim() || null;
  const documentDate = String(formData.get("document_date") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const path = `${aircraftId}/docs/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase.from("document").insert({
    aircraft_id: aircraftId,
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
    // Best-effort: don't leave an orphaned blob if the row insert failed.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return { error: error.message };
  }

  revalidatePath(`/aircraft/${aircraftId}/documents`);
  return {};
}

export async function updateDocument(
  aircraftId: string,
  id: string,
  fields: { type?: DocumentType; title?: string | null; reference?: string | null; document_date?: string | null; notes?: string | null },
): Promise<{ error?: string }> {
  const { supabase, error } = await assertEditor(aircraftId);
  if (error) return { error };
  const { error: upErr } = await supabase.from("document").update(fields).eq("id", id);
  if (upErr) return { error: upErr.message };
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  return {};
}

export async function deleteDocument(aircraftId: string, id: string): Promise<{ error?: string }> {
  const { supabase, error } = await assertEditor(aircraftId);
  if (error) return { error };
  const { data: doc } = await supabase.from("document").select("storage_path").eq("id", id).single();
  if (doc?.storage_path) await supabase.storage.from(BUCKET).remove([doc.storage_path]).catch(() => {});
  const { error: delErr } = await supabase.from("document").delete().eq("id", id);
  if (delErr) return { error: delErr.message };
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  return {};
}
