"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DocumentType } from "@/lib/database.types";
import { failMessage } from "@/lib/writes/entries";
import * as documents from "@/lib/writes/documents";
import { writeSession } from "@/lib/v2/session";

// Thin wrappers over lib/writes/documents. Uploads go to /api/aircraft/[id]/documents (server actions cap the body).

export type DocFormState = { error?: string } | null;

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const int = (f: FormData, k: string) => {
  const v = str(f, k);
  return v == null ? null : Number(v);
};

/** Edit details (W-DOCS-01): fields, expiry tracking and the linked entry in one save. */
export async function saveDocument(aircraftId: string, documentId: string, _prev: DocFormState, form: FormData): Promise<DocFormState> {
  const { user, supabase, ctx } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const type = String(form.get("type") ?? "") as DocumentType;
  const base = str(form, "base");
  if (!base) return { error: "Reload this document before saving." };
  const r = await documents.save(supabase, ctx, {
    documentId,
    fields: { type, title: str(form, "title"), reference: str(form, "reference"), document_date: str(form, "document_date"), notes: str(form, "notes") },
    expiry: {
      trackExpiry: form.get("trackExpiry") === "on",
      expiresOn: str(form, "expiresOn"),
      renewsEveryMonths: int(form, "renewsEveryMonths"),
      remindLeadDays: int(form, "remindLeadDays"),
    },
    entryId: str(form, "log_entry_id"),
  }, base);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  revalidatePath(`/aircraft/${aircraftId}/status`);
  redirect(`/aircraft/${aircraftId}/documents?doc=${documentId}&done=saved`);
}

export async function unlinkDocument(aircraftId: string, documentId: string, base: string) {
  if (!base) redirect(`/aircraft/${aircraftId}/documents?done=failed`);
  const { user, supabase, ctx } = await writeSession(aircraftId);
  if (!user) return;
  const r = await documents.setEntry(supabase, ctx, { documentId, entryId: null }, base);
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  redirect(`/aircraft/${aircraftId}/documents?doc=${documentId}&done=${r.status === "ok" ? "unlinked" : "failed"}`);
}

export async function deleteDocument(aircraftId: string, documentId: string, base: string) {
  if (!base) redirect(`/aircraft/${aircraftId}/documents?done=failed`);
  const { user, supabase, ctx } = await writeSession(aircraftId);
  if (!user) return;
  const r = await documents.remove(supabase, ctx, { documentId }, base);
  revalidatePath(`/aircraft/${aircraftId}/documents`);
  revalidatePath(`/aircraft/${aircraftId}/status`);
  redirect(`/aircraft/${aircraftId}/documents?done=${r.status === "ok" ? "deleted" : "failed"}`);
}
