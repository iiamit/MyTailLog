"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Update the signed-in user's profile details + preferences. */
export async function updateProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const full_name = (formData.get("full_name") as string)?.trim() || null;
  const cert_number = (formData.get("cert_number") as string)?.trim() || null;
  const notify_due = formData.get("notify_due") === "on";

  const { error } = await supabase
    .from("profile")
    .update({ full_name, cert_number, preferences: { notify_due } })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}
