"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isEntryClean } from "@/lib/extraction/schema";

type ConfirmResult = { confirmed: number; remaining: number } | { error: string };

/**
 * Bulk-confirm every "clean" extracted entry across the whole aircraft in one
 * shot — the strict definition ({@link isEntryClean}): high overall confidence,
 * no flagged field, not a continuation. Anything the model was unsure about is
 * left for hands-on review. Pages whose entries then all read as confirmed flip
 * to `confirmed` (never touching disputed pages). Runs under the caller's session
 * so RLS scopes it to their aircraft.
 */
export async function confirmClean(aircraftId: string): Promise<ConfirmResult> {
  const supabase = await createClient();

  const { data: entries, error } = await supabase
    .from("log_entry")
    .select("id, confidence, field_confidence, is_continuation")
    .eq("aircraft_id", aircraftId)
    .eq("owner_confirmed", false);
  if (error) return { error: error.message };

  const rows = entries ?? [];
  const cleanIds = rows.filter(isEntryClean).map((e) => e.id);
  const remaining = rows.length - cleanIds.length;
  if (cleanIds.length === 0) return { confirmed: 0, remaining };

  const { error: upErr } = await supabase
    .from("log_entry")
    .update({ owner_confirmed: true })
    .in("id", cleanIds);
  if (upErr) return { error: upErr.message };

  // Flip pages whose entries are now all confirmed. One extra read of (page_id,
  // owner_confirmed) for the whole aircraft; a personal logbook is small enough
  // that this is cheaper than tracking affected pages.
  // ponytail: full re-scan per call; batch by affected pages if libraries get huge.
  const { data: all } = await supabase
    .from("log_entry")
    .select("page_id, owner_confirmed")
    .eq("aircraft_id", aircraftId);
  const byPage = new Map<string, { total: number; confirmed: number }>();
  for (const e of all ?? []) {
    if (!e.page_id) continue;
    const g = byPage.get(e.page_id) ?? { total: 0, confirmed: 0 };
    g.total += 1;
    if (e.owner_confirmed) g.confirmed += 1;
    byPage.set(e.page_id, g);
  }
  const fullPages = [...byPage.entries()]
    .filter(([, g]) => g.total > 0 && g.confirmed === g.total)
    .map(([p]) => p);
  if (fullPages.length > 0) {
    await supabase
      .from("page")
      .update({ review_status: "confirmed" })
      .in("id", fullPages)
      .eq("review_status", "unreviewed");
  }

  revalidatePath(`/aircraft/${aircraftId}/review`);
  // 'layout' so the persistent shell's Review nav badge re-fetches (it lives in
  // aircraft/[id]/layout.tsx, which a default 'page' revalidate never touches).
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
  return { confirmed: cleanIds.length, remaining };
}
