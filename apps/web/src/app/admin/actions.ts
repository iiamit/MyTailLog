"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function saveSharedAiProvider(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profile").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Not authorized.");

  const value = String(formData.get("provider"));
  if (!["anthropic", "openai", "disabled"].includes(value)) throw new Error("Invalid provider.");
  const { error } = await createServiceClient().from("app_setting").upsert({
    key: "shared_ai_provider", value, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Couldn't save the shared AI provider.");
  revalidatePath("/admin");
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { data: profile } = await supabase.from("profile").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Not authorized.");
}

export async function publishAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const link = String(formData.get("link_path") ?? "").trim();
  if (!title || title.length > 120 || !body || body.length > 500) throw new Error("Check the announcement title and message.");
  if (link && (!/^\/(?!\/)[^\s]*$/.test(link) || link.length > 300)) throw new Error("Use a MyTailLog path such as /whats-new.");
  const { error } = await createServiceClient().from("announcement").insert({ title, body, link_path: link || null });
  if (error) throw new Error("Couldn't publish the announcement.");
  revalidatePath("/admin");
}

export async function endAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid announcement.");
  const { error } = await createServiceClient().from("announcement").update({ expires_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("Couldn't end the announcement.");
  revalidatePath("/admin");
}
