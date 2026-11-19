"use server";

import { revalidatePath } from "next/cache";
import { writeSession } from "@/lib/v2/session";
import { failMessage, type WriteResult } from "@/lib/writes/entries";
import * as squawks from "@/lib/writes/squawks";
import * as visits from "@/lib/writes/visits";
import { createLink } from "@/lib/mechanicLink";

// Thin wrappers over lib/writes/squawks and lib/mechanicLink (CONTRACT §4): auth, call, revalidate.
export type Result = { ok: true; id?: string } | { error: string };

async function run(aircraftId: string, fn: (s: Awaited<ReturnType<typeof writeSession>>) => Promise<WriteResult>): Promise<Result> {
  const s = await writeSession(aircraftId);
  if (!s.user) return { error: "Not signed in." };
  const r = await fn(s);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${aircraftId}/maintenance/squawks`);
  const row = r.row as { id?: string } | null;
  return { ok: true, id: row?.id };
}

/** Report a squawk (any role). Severity has no default on the form; the write still normalises it. */
export async function reportSquawk(aircraftId: string, input: { description: string; severity: string }): Promise<Result> {
  if (!["low", "medium", "high"].includes(input.severity)) return { error: "Pick how serious it is: Low, Watch or Ground." };
  return run(aircraftId, ({ supabase, ctx }) => squawks.create(supabase, ctx, input));
}

export async function updateSquawk(aircraftId: string, squawkId: string, patch: { description?: string; severity?: string }): Promise<Result> {
  return run(aircraftId, ({ supabase, ctx }) => squawks.update(supabase, ctx, { squawkId, ...patch }));
}

/** Resolve with the entry that cleared it, or a written explanation (W-MAINT-03 "Resolve with an entry"). */
export async function resolveSquawk(
  aircraftId: string,
  squawkId: string,
  input: { entryId: string | null; notes: string; date: string },
): Promise<Result> {
  if (!input.entryId && !input.notes.trim()) return { error: "Pick the entry that cleared it, or say what was done." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the date it was resolved." };
  return run(aircraftId, ({ supabase, ctx }) =>
    squawks.resolve(supabase, ctx, {
      squawkId,
      resolvedEntryId: input.entryId,
      resolutionNotes: input.notes,
      resolvedAt: `${input.date}T12:00:00Z`,
    }),
  );
}

export async function reopenSquawk(aircraftId: string, squawkId: string): Promise<Result> {
  return run(aircraftId, ({ supabase, ctx }) => squawks.reopen(supabase, ctx, { squawkId }));
}

export async function deleteSquawk(aircraftId: string, squawkId: string): Promise<Result> {
  return run(aircraftId, ({ supabase, ctx }) => squawks.remove(supabase, ctx, { squawkId }));
}

/** The row for a photo the browser already uploaded through POST …/blob (kind squawk_photo). */
export async function addSquawkPhoto(aircraftId: string, squawkId: string, blobId: string): Promise<Result> {
  return run(aircraftId, ({ supabase, ctx }) => squawks.addPhoto(supabase, ctx, { id: blobId, squawkId, blobId }));
}

export async function deleteSquawkPhoto(aircraftId: string, photoId: string): Promise<Result> {
  return run(aircraftId, ({ supabase, ctx }) => squawks.removePhoto(supabase, ctx, { photoId }));
}

/** "Add to the visit": the open squawks ride along on a planned visit (visit.update addItemKeys). */
export async function addSquawksToVisit(aircraftId: string, visitId: string, squawkIds: string[]): Promise<Result> {
  return run(aircraftId, ({ supabase, ctx }) => visits.update(supabase, ctx, { visitId, addItemKeys: squawkIds.map((id) => `squawk:${id}`) }));
}

/** Send to mechanic: a squawk link (09 §4.12). MyTailLog never sends it; the owner copies or mails it. */
export async function makeMechanicLink(
  aircraftId: string,
  body: { squawkIds: string[]; recipientLabel: string; providerId: string | null; expiresInDays: number; includePhotos: boolean; includeReporter: boolean },
): Promise<{ url: string; mailto: string; expiresAt: string } | { error: string }> {
  const { supabase, user } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await createLink(supabase, { aircraftId, userId: user.id, kind: "squawk", body });
  if ("error" in r) return { error: r.error };
  revalidatePath(`/aircraft/${aircraftId}/maintenance/squawks`);
  return { url: r.url, mailto: r.mailto, expiresAt: r.expiresAt };
}

/** Revoke a link at once (same checks as PATCH …/mechanic-links/{linkId}). */
export async function revokeMechanicLink(aircraftId: string, linkId: string): Promise<Result> {
  const { supabase, user } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId });
  if (canEdit !== true) return { error: "You don't have edit access to this aircraft." };
  const { data, error } = await supabase
    .from("mechanic_link")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("aircraft_id", aircraftId)
    .is("revoked_at", null)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That link has already ended." };
  revalidatePath(`/aircraft/${aircraftId}/maintenance/squawks`);
  return { ok: true };
}
