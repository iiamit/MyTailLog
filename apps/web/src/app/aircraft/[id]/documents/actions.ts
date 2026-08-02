"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { removeBlobs } from "@/lib/storage";
import type { DocumentType } from "@/lib/database.types";

// Uploads live in the sibling route handler (/api/aircraft/[id]/documents) —
// server actions cap the body at ~1 MB, too small for a scan. These small
// metadata mutations stay as actions.

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

/**
 * Attach a Vault document to a log entry, or detach it (`entryId = null`) so it
 * drops back to the Vault. Both rows must belong to `aircraftId` — RLS scopes
 * the write to editors of the DOCUMENT's aircraft but says nothing about which
 * entry the FK points at, so the entry is checked explicitly.
 */
export async function setDocumentEntry(
  aircraftId: string,
  documentId: string,
  entryId: string | null,
): Promise<{ error?: string }> {
  const { supabase, error } = await assertEditor(aircraftId);
  if (error) return { error };
  if (entryId) {
    const { data: entry } = await supabase
      .from("log_entry")
      .select("id")
      .eq("id", entryId)
      .eq("aircraft_id", aircraftId)
      .maybeSingle();
    if (!entry) return { error: "That entry isn't on this aircraft." };
  }
  const { error: upErr } = await supabase
    .from("document")
    .update({ log_entry_id: entryId })
    .eq("id", documentId)
    .eq("aircraft_id", aircraftId);
  if (upErr) return { error: upErr.message };
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  revalidatePath(`/aircraft/${aircraftId}/timeline`);
  return {};
}

export async function deleteDocument(aircraftId: string, id: string): Promise<{ error?: string }> {
  const { supabase, error } = await assertEditor(aircraftId);
  if (error) return { error };
  const { data: doc } = await supabase.from("document").select("storage_path").eq("id", id).single();
  if (doc?.storage_path) await removeBlobs([doc.storage_path]);
  const { error: delErr } = await supabase.from("document").delete().eq("id", id);
  if (delErr) return { error: delErr.message };
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  return {};
}
