"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DATA_SCOPES } from "@/lib/oauth/scopes";

// Redirect URIs are an EXACT-match allowlist (anti open-redirect). Only https,
// or http on localhost for development. No fragments, no wildcards.
function invalidRedirect(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash) return true;
    if (url.protocol === "https:") return false;
    if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return false;
    return true;
  } catch {
    return true;
  }
}

function parseForm(formData: FormData): { name: string; uris: string[]; scopes: string[]; error?: string } {
  const name = String(formData.get("name") ?? "").trim();
  const uris = String(formData.get("redirect_uris") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const picked = formData.getAll("scopes").map(String).filter((s) => (DATA_SCOPES as readonly string[]).includes(s));
  const scopes = ["openid", ...(formData.get("offline_access") === "on" ? ["offline_access"] : []), ...picked];

  if (!name) return { name, uris, scopes, error: "Give the app a name." };
  if (uris.length === 0) return { name, uris, scopes, error: "Add at least one redirect URI." };
  const bad = uris.find(invalidRedirect);
  if (bad) return { name, uris, scopes, error: `Invalid redirect URI: ${bad} (https, or http://localhost).` };
  if (picked.length === 0) return { name, uris, scopes, error: "Select at least one scope." };
  return { name, uris, scopes };
}

export async function createOAuthApp(formData: FormData): Promise<{ error?: string; clientId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const parsed = parseForm(formData);
  if (parsed.error) return { error: parsed.error };

  // Public + PKCE clients only for now (no secret). RLS check: owner_id = auth.uid().
  const { data, error } = await supabase
    .from("oauth_client")
    .insert({
      owner_id: user.id,
      name: parsed.name,
      redirect_uris: parsed.uris,
      scopes: parsed.scopes,
      is_confidential: false,
    })
    .select("client_id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/developers");
  return { clientId: data.client_id };
}

export async function deleteOAuthApp(clientId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  // RLS-scoped; cascades to grants + access logs via FK.
  const { error } = await supabase.from("oauth_client").delete().eq("client_id", clientId);
  if (error) return { error: error.message };
  revalidatePath("/developers");
  return {};
}
