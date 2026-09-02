"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import * as entries from "@/lib/writes/entries";

type ConfirmResult = { confirmed: number; remaining: number } | { error: string };

/**
 * Bulk-confirm every "clean" extracted entry across the whole aircraft — thin
 * wrapper over {@link entries.confirmClean} (CONTRACT §4).
 */
export async function confirmClean(aircraftId: string): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const r = await entries.confirmClean(supabase, { aircraftId, userId: user.id });
  if (r.status !== "ok") return { error: entries.failMessage(r) };

  revalidatePath(`/aircraft/${aircraftId}/review`);
  // 'layout' so the persistent shell's Review nav badge re-fetches (it lives in
  // aircraft/[id]/layout.tsx, which a default 'page' revalidate never touches).
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
  return { confirmed: Number(r.row?.confirmed ?? 0), remaining: Number(r.row?.remaining ?? 0) };
}
