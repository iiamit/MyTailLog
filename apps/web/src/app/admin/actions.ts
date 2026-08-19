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
