"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/lib/database.types";
import { failMessage, type WriteResult } from "@/lib/writes/entries";
import * as documents from "@/lib/writes/documents";

// Thin wrappers over lib/writes/documents (CONTRACT §4). Uploads live in the
// sibling route handler (/api/aircraft/[id]/documents) — server actions cap the
// body at ~1 MB, too small for a scan.

async function run(
  aircraftId: string,
  fn: (supabase: Awaited<ReturnType<typeof createClient>>, userId: string) => Promise<WriteResult>,
  paths: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const r = await fn(supabase, user.id);
  if (r.status !== "ok") return { error: failMessage(r) };
  for (const p of paths) revalidatePath(`/aircraft/${aircraftId}/${p}`);
  return {};
}

export async function updateDocument(
  aircraftId: string,
  id: string,
  fields: { type?: DocumentType; title?: string | null; reference?: string | null; document_date?: string | null; notes?: string | null },
): Promise<{ error?: string }> {
  return run(
    aircraftId,
    (supabase, userId) => documents.update(supabase, { aircraftId, userId }, { documentId: id, fields }),
    ["documents"],
  );
}

/** Attach a Vault document to a log entry, or detach it (`entryId = null`). */
export async function setDocumentEntry(
  aircraftId: string,
  documentId: string,
  entryId: string | null,
): Promise<{ error?: string }> {
  return run(
    aircraftId,
    (supabase, userId) => documents.setEntry(supabase, { aircraftId, userId }, { documentId, entryId }),
    ["documents", "timeline"],
  );
}

export async function deleteDocument(aircraftId: string, id: string): Promise<{ error?: string }> {
  return run(
    aircraftId,
    (supabase, userId) => documents.remove(supabase, { aircraftId, userId }, { documentId: id }),
    ["documents"],
  );
}
