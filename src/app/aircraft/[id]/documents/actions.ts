"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/lib/database.types";

// Uploads live in the sibling route handler (/api/aircraft/[id]/documents) —
// server actions cap the body at ~1 MB, too small for a scan. These small
// metadata mutations stay as actions.

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

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
