"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  shareId: string,
): Promise<{ error?: string }> {
  const { supabase, error } = await assertOwner(aircraftId);
  if (error) return { error };
  const { error: delErr } = await supabase.from("aircraft_share").delete().eq("id", shareId);
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
