"use server";

import { revalidatePath } from "next/cache";
import { writeSession } from "@/lib/v2/session";
import { failMessage } from "@/lib/writes/entries";
import * as compliance from "@/lib/writes/compliance";
// The explorer's search and track live with the v1 screen; W-MAINT-02 reuses them as they are.
import { trackCandidate, type CandidateAd, type TrackOptions } from "@/app/aircraft/[id]/compliance/explore/actions";

const ads = (aircraftId: string) => `/aircraft/${aircraftId}/maintenance/ads`;

async function idOf(aircraftId: string, reference: string) {
  const { supabase } = await writeSession(aircraftId);
  const { data } = await supabase.from("ad_compliance").select("id").eq("aircraft_id", aircraftId).eq("reference", reference)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id;
}

/** "Track this AD": the v1 track (record + official reference), answering with the new record's id for "Open it". */
export async function trackFound(aircraftId: string, ad: CandidateAd, options: TrackOptions): Promise<{ id?: string; error?: string }> {
  const r = await trackCandidate(aircraftId, ad, options);
  if ("error" in r) return { error: r.error };
  revalidatePath(ads(aircraftId));
  return { id: await idOf(aircraftId, (ad.adNumber ?? "").trim()) };
}

/** "Doesn't apply": tracked as Does not apply with the owner's reason, so it stops coming up. */
export async function markNotApplicable(aircraftId: string, ad: { adNumber: string; title: string | null }, reason: string): Promise<{ id?: string; error?: string }> {
  if (!reason.trim()) return { error: "Say why it does not apply." };
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await compliance.upsert(supabase, ctx, {
    record: { kind: "ad", reference: ad.adNumber, title: ad.title, status: "not_applicable", recurring: false, reason: reason.trim() },
  });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(ads(aircraftId));
  return { id: (r.row as { id?: string } | null)?.id };
}
