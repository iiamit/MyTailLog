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

/**
 * Save the user's OWN MyFlightBook OAuth app credentials (client id + secret)
 * and optional username. Upserts their single mfb_connection row. The secret is
 * write-only from the browser's perspective — it's stored server-side and never
 * read back into the UI. Leaving the secret field blank keeps the existing one.
 */
export async function saveMfbCredentials(
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const client_id = (formData.get("mfb_client_id") as string)?.trim() || null;
  const secretInput = (formData.get("mfb_client_secret") as string)?.trim() || "";
  const mfb_username = (formData.get("mfb_username") as string)?.trim() || null;

  if (!client_id) return { error: "Client ID is required." };

  const update: Record<string, unknown> = {
    user_id: user.id,
    client_id,
    mfb_username,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the secret when a new one is actually typed.
  if (secretInput) update.client_secret = secretInput;

  const { error } = await supabase
    .from("mfb_connection")
    .upsert(update, { onConflict: "user_id" });

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}

/** Disconnect MyFlightBook: clear the OAuth tokens (keeps the app credentials). */
export async function disconnectMfb(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("mfb_connection")
    .update({
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}
