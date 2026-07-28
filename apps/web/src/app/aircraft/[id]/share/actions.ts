"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { removeBlobs } from "@/lib/storage";
import type { ShareRole } from "@/lib/database.types";

async function assertOwner(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Not signed in." };
  const { data: ac } = await supabase
    .from("aircraft")
    .select("owner_id")
    .eq("id", aircraftId)
    .single();
  if (!ac || ac.owner_id !== user.id) return { supabase, error: "Only the owner can manage sharing." };
  return { supabase, user };
}

export async function addShare(
  aircraftId: string,
  email: string,
  role: ShareRole,
): Promise<{ error?: string }> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { error: "Enter an email." };
  const { supabase, user, error } = await assertOwner(aircraftId);
  if (error) return { error };

  const { error: insErr } = await supabase.from("aircraft_share").upsert(
    { aircraft_id: aircraftId, invited_email: clean, role, invited_by: user!.id },
    { onConflict: "aircraft_id,invited_email" },
  );
  if (insErr) return { error: insErr.message };
  revalidatePath(`/aircraft/${aircraftId}/share`);
  return {};
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
