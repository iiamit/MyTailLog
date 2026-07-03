"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { searchADs, type FaaAd } from "@/lib/faa/federalRegister";

export type CandidateAd = FaaAd & { term: string };

/**
 * Find candidate ADs for this aircraft by querying the Federal Register for each
 * relevant manufacturer term (the airframe make plus each installed component's
 * make). Coarse applicability — the owner confirms which actually apply. Already
 * tracked AD numbers are filtered out. Deduped by AD number.
 */
export async function exploreApplicableADs(
  aircraftId: string,
  extraTerms: string[] = [],
): Promise<{ ok: true; candidates: CandidateAd[]; terms: string[] } | { error: string }> {
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("make")
    .eq("id", aircraftId)
    .single();

  // Manufacturer terms: airframe make + installed components' makes + any typed.
  const { data: components } = await supabase
    .from("component")
    .select("make")
    .eq("aircraft_id", aircraftId)
    .eq("is_installed", true);

  const terms = [
    ...new Set(
      [
        aircraft?.make,
        ...(components ?? []).map((c) => c.make),
        ...extraTerms,
      ]
        .map((t) => t?.trim())
        .filter((t): t is string => !!t && t.length >= 3),
    ),
  ];
  if (terms.length === 0) {
    return { error: "No manufacturer terms — set the aircraft make or add equipment with a manufacturer." };
  }

  // Already-tracked AD numbers, to filter them out of the suggestions.
  const { data: tracked } = await supabase
    .from("ad_compliance")
    .select("reference")
    .eq("aircraft_id", aircraftId)
    .eq("kind", "ad");
  const trackedSet = new Set(
    (tracked ?? []).map((r) => r.reference.replace(/\s+/g, "").toLowerCase()),
  );

  const byNumber = new Map<string, CandidateAd>();
  for (const term of terms) {
    let ads: FaaAd[] = [];
    try {
      ({ ads } = await searchADs(term, { perPage: 40 }));
    } catch {
      continue; // one bad term shouldn't sink the whole explore
    }
    for (const ad of ads) {
      if (!ad.adNumber) continue;
      const key = ad.adNumber.replace(/\s+/g, "").toLowerCase();
      if (trackedSet.has(key) || byNumber.has(key)) continue;
      byNumber.set(key, { ...ad, term });
    }
  }

  // Newest first.
  const candidates = [...byNumber.values()].sort((a, b) =>
    (b.effectiveOn ?? "").localeCompare(a.effectiveOn ?? ""),
  );
  return { ok: true, candidates, terms };
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
