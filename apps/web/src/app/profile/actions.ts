"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/crypto";
import { dayOfMonthFor, nextRunAt } from "@/lib/backup/schedule";

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

  // The ciphertext lives in a private schema (0047); write via the service-role
  // RPC. Only overwrite the secret when a new one is typed (null = keep existing).
  // Encrypted at rest (AES-256-GCM) — see src/lib/crypto.ts. user.id is trusted.
  const { error } = await createServiceClient().rpc("upsert_mfb_credentials", {
    p_user_id: user.id,
    p_client_id: client_id,
    p_mfb_username: mfb_username,
    p_client_secret_cipher: secretInput ? encryptSecret(secretInput) : null,
  });

  if (error) return { error: "Couldn't save your MyFlightBook credentials." };
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

  // The ciphertext lives in a private schema (0039); write it via the
  // service-role RPC. user.id is the authenticated caller, so it's trusted.
  const { error } = await createServiceClient().rpc("upsert_ai_key", {
    p_user_id: user.id,
    p_cipher: encryptSecret(raw),
    p_last4: raw.slice(-4),
  });
  if (error) return { error: "Couldn't save the key." };
  revalidatePath("/profile");
  return {};
}

/** Revoke a connected OAuth app: delete the caller's per-aircraft grants for it.
 *  This is the Resource Server's authz boundary, so access stops immediately.
 *  ponytail: token-layer revocation (killing the oidc refresh token) needs the
 *  stored grantId — add if access tokens outliving this becomes a concern. */
export async function revokeOAuthClient(clientId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  // RLS restricts both deletes to the caller's own rows (account_id = auth.uid()).
  // Revoke the per-aircraft grants AND any account-wide grant (0040) for this client.
  const [perAircraft, account] = await Promise.all([
    supabase.from("oauth_aircraft_grant").delete().eq("client_id", clientId),
    supabase.from("oauth_account_grant").delete().eq("client_id", clientId),
  ]);
  const error = perAircraft.error ?? account.error;
  if (error) return { error: error.message };
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

  const { error } = await createServiceClient().rpc("delete_ai_key", { p_user_id: user.id });
  if (error) return { error: "Couldn't remove the key." };
  revalidatePath("/profile");
  return {};
}

/**
 * Set the cloud-backup cadence (off / monthly / quarterly — monthly is the
 * ceiling). The day of the month is derived from a hash of the user id so the
 * fleet's backups spread across the month; the user doesn't choose it.
 *
 * Written through the service-role RPC because backup_schedule has no write
 * policy: letting the browser set next_run_at itself would let anyone ask us to
 * ship a full archive every night.
 */
export async function setBackupFrequency(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const frequency = String(formData.get("backup_frequency") ?? "");
  if (frequency !== "off" && frequency !== "monthly" && frequency !== "quarterly") {
    return { error: "Pick a backup frequency." };
  }

  const day = dayOfMonthFor(user.id);
  const { error } = await createServiceClient().rpc("set_backup_schedule", {
    p_user_id: user.id,
    p_frequency: frequency,
    p_day_of_month: day,
    p_next_run_at: nextRunAt(frequency, day),
  });
  if (error) return { error: "Couldn't save the backup schedule." };
  revalidatePath("/profile");
  return {};
}

/** Disconnect cloud backups: DELETE the stored tokens (not just flag a row) and
 *  switch the schedule off. The run history is kept. */
export async function disconnectBackup(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await createServiceClient().rpc("delete_backup_destination", {
    p_user_id: user.id,
    p_provider: "dropbox",
  });
  if (error) return { error: "Couldn't disconnect cloud backups." };
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

  // Tokens live in a private schema (0047); clear them via the service-role RPC.
  const { error } = await createServiceClient().rpc("disconnect_mfb", { p_user_id: user.id });

  if (error) return { error: "Couldn't disconnect MyFlightBook." };
  revalidatePath("/profile");
  return {};
}
