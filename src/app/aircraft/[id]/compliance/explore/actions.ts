"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { type FaaAd } from "@/lib/faa/federalRegister";

export type CandidateAd = FaaAd & { term: string };

/**
 * The inputs the explorer needs to query the Federal Register: the manufacturer
 * terms to search (airframe make + installed components' makes + any typed) and
 * the already-tracked AD numbers to filter out. The FR fetch itself runs in the
 * BROWSER (see ExploreClient) — GPO's origin 403s our datacenter egress IP, and
 * the FR API is CORS-enabled, so the user's residential IP is the reliable path.
 */
export async function getExploreTargets(
  aircraftId: string,
  extraTerms: string[] = [],
): Promise<{ ok: true; terms: string[]; tracked: string[] } | { error: string }> {
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("make")
    .eq("id", aircraftId)
    .single();

  const { data: components } = await supabase
    .from("component")
    .select("make")
    .eq("aircraft_id", aircraftId)
    .eq("is_installed", true);

  const terms = [
    ...new Set(
      [aircraft?.make, ...(components ?? []).map((c) => c.make), ...extraTerms]
        .map((t) => t?.trim())
        .filter((t): t is string => !!t && t.length >= 3),
    ),
  ];
  if (terms.length === 0) {
    return { error: "No manufacturer terms — set the aircraft make or add equipment with a manufacturer." };
  }

  const { data: tracked } = await supabase
    .from("ad_compliance")
    .select("reference")
    .eq("aircraft_id", aircraftId)
    .eq("kind", "ad");
  return {
    ok: true,
    terms,
    tracked: (tracked ?? []).map((r) => r.reference.replace(/\s+/g, "").toLowerCase()),
  };
}

/**
 * Track a candidate AD found by the explorer — creates an open ad_compliance
 * record (the owner then sets compliance details / applicability).
 */
export async function trackCandidate(
  aircraftId: string,
  reference: string,
): Promise<{ ok: true } | { error: string }> {
  if (!reference.trim()) return { error: "AD number required." };
  const supabase = await createClient();
  const { error } = await supabase.from("ad_compliance").insert({
    aircraft_id: aircraftId,
    kind: "ad",
    reference: reference.trim(),
    status: "open",
  });
  if (error) return { error: error.message };
  revalidatePath(`/aircraft/${aircraftId}/compliance/explore`);
  revalidatePath(`/aircraft/${aircraftId}/compliance`);
  return { ok: true };
}
