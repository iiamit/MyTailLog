"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";

/** Update the signed-in user's profile details. Notification preferences are
 *  owned by updateNotifications so this never clobbers the alerts bag. */
export async function updateProfile(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const full_name = (formData.get("full_name") as string)?.trim() || null;
  const cert_number = (formData.get("cert_number") as string)?.trim() || null;

  const { error } = await supabase
    .from("profile")
    .update({ full_name, cert_number })
    .eq("id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}

// Non-negative integer from a form field, or the default when blank/invalid.
function intField(formData: FormData, name: string, fallback: number): number {
  const raw = (formData.get(name) as string)?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

/**
 * Save the notification settings into profile.preferences: the master on/off
 * plus per-category enable + lead times. Written as one object so the whole
 * `preferences` bag stays consistent.
 */
export async function updateNotifications(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const preferences = {
    notify_due: formData.get("notify_due") === "on",
    alerts: {
      annual: {
        enabled: formData.get("annual_enabled") === "on",
        lead_days: intField(formData, "annual_lead_days", 90),
      },
      oil: {
        enabled: formData.get("oil_enabled") === "on",
        lead_hours: intField(formData, "oil_lead_hours", 10),
      },
      ad: {
        enabled: formData.get("ad_enabled") === "on",
        lead_days: intField(formData, "ad_lead_days", 30),
        lead_hours: intField(formData, "ad_lead_hours", 25),
      },
      default: {
        enabled: formData.get("default_enabled") === "on",
        lead_days: intField(formData, "default_lead_days", 30),
        lead_hours: intField(formData, "default_lead_hours", 25),
      },
    },
  };

  const { error } = await supabase.from("profile").update({ preferences }).eq("id", user.id);

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
  // Only overwrite the secret when a new one is actually typed. Encrypted at
  // rest (AES-256-GCM) — see src/lib/crypto.ts.
  if (secretInput) update.client_secret = encryptSecret(secretInput);

  const { error } = await supabase
    .from("mfb_connection")
    .upsert(update, { onConflict: "user_id" });

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return {};
}

/**
 * Save the user's OWN Anthropic API key (BYOK). Encrypted at rest; used instead
 * of the shared key for their AI calls and metered to them (see the usage
 * panel). Only the last 4 chars are kept in the clear, for display.
 */
export async function saveAiKey(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const raw = (formData.get("anthropic_key") as string)?.trim() || "";
  if (!raw) return { error: "Paste your Anthropic API key." };
  if (!raw.startsWith("sk-ant-")) {
    return { error: "That doesn't look like an Anthropic key (expected sk-ant-…)." };
  }

  const { error } = await supabase.from("user_ai_key").upsert(
    {
      user_id: user.id,
      key_cipher: encryptSecret(raw),
      key_last4: raw.slice(-4),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: "Couldn't save the key." };
  revalidatePath("/profile");
  return {};
}

/** Remove the user's own key — their AI calls fall back to the shared key. */
export async function removeAiKey(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("user_ai_key").delete().eq("user_id", user.id);
  if (error) return { error: "Couldn't remove the key." };
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
