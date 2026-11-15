"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { removeBlobs } from "@/lib/storage";
import { sendEmail } from "@/lib/email";
import type { ShareRole } from "@/lib/database.types";
import { encryptSecret } from "@/lib/crypto";
import { hashRoomToken, newRoomToken, roomUrl, ROOM_MAX_DAYS } from "@/lib/recordRoom";

const NONE = "00000000-0000-0000-0000-000000000000"; // stands in for an empty .in() list

async function assertOwner(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Not signed in." };
  const { data: ac } = await supabase
    .from("aircraft")
    .select("owner_id, tail_number")
    .eq("id", aircraftId)
    .single();
  if (!ac || ac.owner_id !== user.id) return { supabase, error: "Only the owner can manage sharing." };
  return { supabase, user, aircraft: ac };
}

export async function addShare(
  aircraftId: string,
  email: string,
  role: ShareRole,
): Promise<{ error?: string; emailSent?: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { error: "Enter a valid email." };
  if (role !== "viewer" && role !== "editor") return { error: "Choose view only or can contribute." };
  const { supabase, user, aircraft, error } = await assertOwner(aircraftId);
  if (error) return { error };

  const { error: insErr } = await supabase.from("aircraft_share").upsert(
    { aircraft_id: aircraftId, invited_email: clean, role, invited_by: user!.id },
    { onConflict: "aircraft_id,invited_email" },
  );
  if (insErr) return { error: insErr.message };
  revalidatePath(`/aircraft/${aircraftId}/share`);

  // Access is already saved. A mail failure must not hide or undo the grant.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://mytaillog.com").replace(/\/$/, "");
  const url = `${origin}/aircraft/${encodeURIComponent(aircraftId)}`;
  const emailSent = await sendEmail({
    to: clean,
    subject: `Invitation to ${aircraft!.tail_number} on MyTailLog`,
    html: `<p>${esc(user!.email || "The aircraft owner")} invited you to ${esc(aircraft!.tail_number)} on MyTailLog.</p>
      <p>Your access: <strong>${role === "editor" ? "Can contribute — review and edit records" : "View only"}</strong>.</p>
      <p><a href="${esc(url)}">Open the aircraft</a></p>
      <p>Sign in or create an account with <strong>${esc(clean)}</strong>. Your access is already available; no invitation code is needed.</p>`,
  });
  return { emailSent };
}

export async function removeShare(
  aircraftId: string,
  email: string,
): Promise<{ error?: string }> {
  // Key on (aircraft_id, invited_email), the natural unique — NOT a row id. A
  // just-added share is shown with a client-fabricated id before the real row
  // loads, so deleting by id would silently no-op and leave the grantee with
  // access the owner believes they revoked.
  const clean = email.trim().toLowerCase();
  const { supabase, error } = await assertOwner(aircraftId);
  if (error) return { error };
  const { error: delErr } = await supabase
    .from("aircraft_share")
    .delete()
    .eq("aircraft_id", aircraftId)
    .eq("invited_email", clean);
  if (delErr) return { error: delErr.message };
  revalidatePath(`/aircraft/${aircraftId}/share`);
  return {};
}

export async function transferAircraft(
  aircraftId: string,
  email: string,
): Promise<{ error?: string }> {
  const { supabase, error } = await assertOwner(aircraftId);
  if (error) return { error };
  const { error: rpcErr } = await supabase.rpc("transfer_aircraft", {
    target_aircraft: aircraftId,
    new_owner_email: email.trim().toLowerCase(),
  });
  if (rpcErr) return { error: rpcErr.message };
  revalidatePath("/dashboard");
  return {};
}

/**
 * Permanently delete an aircraft and everything under it. Requires the caller
 * to be the owner and to type DELETE. Stored scans are removed FIRST (while the
 * owner still has storage access), then the aircraft row — its cascades drop
 * every child record (logbooks, pages, entries, compliance, maintenance,
 * shares, …).
 */
export async function deleteAircraft(
  aircraftId: string,
  confirmation: string,
): Promise<{ error?: string }> {
  if (confirmation !== "DELETE") return { error: "Type DELETE to confirm." };
  const { supabase, error } = await assertOwner(aircraftId);
  if (error) return { error };

  // Collect every stored object for this aircraft (exact paths from the rows).
  const [{ data: pages }, { data: docs }] = await Promise.all([
    supabase.from("page").select("storage_path, thumbnail_path").eq("aircraft_id", aircraftId),
    supabase.from("document").select("storage_path").eq("aircraft_id", aircraftId),
  ]);
  const paths: string[] = [];
  for (const p of pages ?? []) {
    if (p.storage_path) paths.push(p.storage_path);
    if (p.thumbnail_path) paths.push(p.thumbnail_path);
  }
  for (const d of docs ?? []) if (d.storage_path) paths.push(d.storage_path);

  // Best-effort storage cleanup before the DB rows (which gate storage access) go.
  await removeBlobs(paths);

  const { error: delErr } = await supabase.from("aircraft").delete().eq("id", aircraftId);
  if (delErr) return { error: delErr.message };

  revalidatePath("/dashboard");
  return {};
}

// --- Record room links (owner only, like everything on this page) -----------

export type RoomInput = {
  label: string;
  includeSummary: boolean;
  logbookIds: string[];
  includeScans: boolean;
  documentIds: string[];
  days: number;
};

/** Create a link. Returns its URL once; the owner can copy it again from the list. */
export async function createRoom(aircraftId: string, input: RoomInput): Promise<{ error?: string; url?: string }> {
  const label = input.label.trim();
  if (!label || label.length > 80) return { error: "Name who the link is for (up to 80 characters)." };
  const days = Math.round(input.days);
  if (!(days >= 1 && days <= ROOM_MAX_DAYS)) return { error: `Pick an expiry between 1 and ${ROOM_MAX_DAYS} days.` };
  const { supabase, user, error } = await assertOwner(aircraftId);
  if (error) return { error };

  // Keep only ids that really belong to this aircraft; /r re-checks, but the row should be honest too.
  const [{ data: books }, { data: docs }] = await Promise.all([
    supabase.from("logbook").select("id").eq("aircraft_id", aircraftId).in("id", input.logbookIds.length ? input.logbookIds : [NONE]),
    supabase.from("document").select("id").eq("aircraft_id", aircraftId).in("id", input.documentIds.length ? input.documentIds : [NONE]),
  ]);
  const logbookIds = (books ?? []).map((b) => b.id);
  const documentIds = (docs ?? []).map((d) => d.id);
  if (!input.includeSummary && !logbookIds.length && !documentIds.length) return { error: "Include at least one thing to share." };

  const token = newRoomToken();
  const { error: insErr } = await supabase.from("record_room").insert({
    aircraft_id: aircraftId,
    created_by: user!.id,
    label,
    token_hash: hashRoomToken(token),
    token_enc: encryptSecret(token),
    include_summary: input.includeSummary,
    logbook_ids: logbookIds,
    include_scans: input.includeScans,
    document_ids: documentIds,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
  });
  if (insErr) return { error: insErr.message };
  revalidatePath(`/aircraft/${aircraftId}/share`);
  return { url: roomUrl(token) };
}

export async function revokeRoom(aircraftId: string, roomId: string): Promise<{ error?: string }> {
  const { supabase, error } = await assertOwner(aircraftId);
  if (error) return { error };
  const { error: upErr } = await supabase
    .from("record_room")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("aircraft_id", aircraftId)
    .is("revoked_at", null);
  if (upErr) return { error: upErr.message };
  revalidatePath(`/aircraft/${aircraftId}/share`);
  return {};
}

export async function deleteRoom(aircraftId: string, roomId: string): Promise<{ error?: string }> {
  const { supabase, error } = await assertOwner(aircraftId);
  if (error) return { error };
  const { error: delErr } = await supabase.from("record_room").delete().eq("id", roomId).eq("aircraft_id", aircraftId);
  if (delErr) return { error: delErr.message };
  revalidatePath(`/aircraft/${aircraftId}/share`);
  return {};
}
