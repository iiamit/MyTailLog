"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage } from "@/lib/writes/entries";
import { updateAircraftDetails } from "@/lib/writes/aircraft";

export async function saveAircraftDetails(id: string, formData: FormData): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to edit this aircraft." };
  const result = await updateAircraftDetails(supabase, { aircraftId: id, userId: user.id }, Object.fromEntries(formData));
  if (result.status !== "ok") return { error: failMessage(result) };
  revalidatePath(`/aircraft/${id}`);
  revalidatePath(`/aircraft/${id}/details`);
  revalidatePath(`/aircraft/${id}/summary`);
  return { ok: true };
}
