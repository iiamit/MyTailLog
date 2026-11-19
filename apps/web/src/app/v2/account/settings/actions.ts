"use server";

import { createClient } from "@/lib/supabase/server";

/** "Setup tips by email while I add my aircraft": profile.onboarding_opt_out, which is not in preferences. */
export async function setOnboardingEmails(on: boolean): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { error } = await supabase.from("profile").update({ onboarding_opt_out: !on }).eq("id", user.id);
  return error ? { error: "That didn't save. Try again." } : { ok: true };
}
