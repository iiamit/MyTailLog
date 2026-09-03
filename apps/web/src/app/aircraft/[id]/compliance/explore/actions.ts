"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { type FaaAd } from "@/lib/faa/federalRegister";
import { searchADsInDRS } from "@/lib/faa/drs";
import { extractModels, matchedModels } from "@/lib/faa/applicability";
import { failMessage, type WriteCtx } from "@/lib/writes/entries";
import * as compliance from "@/lib/writes/compliance";

/**
 * How a term got into the search. The MANUFACTURER terms are the broad net
 * (every AD naming the airframe or an installed component's make); the MODEL
 * and KEYWORD terms are the sharp ones (the owner's specific variant, or
 * whatever they typed). Both are useful and both run.
 */
export type TermKind = "manufacturer" | "model" | "keyword";
export type SearchTerm = { term: string; kind: TermKind };

export type CandidateAd = FaaAd & {
  term: string;
  kind: TermKind;
  /** Which FAA source produced this hit. */
  source: "federal_register" | "drs";
  /** Model designations the AD names (parsed from its title/abstract). */
  models: string[];
  /** The subset of those that cover this aircraft's model, if any. */
  matched: string[];
  /** DRS only: 'Current' / historical status. */
  documentStatus: string | null;
};

const MIN_TERM = 2;

/** DRS is queried only for the sharp terms — a manufacturer-wide DRS sweep is
 *  slow and low-signal, and the Federal Register already covers it well. */
const MAX_DRS_TERMS = 3;

function clean(values: (string | null | undefined)[]): string[] {
  return [
    ...new Set(
      values
        .map((v) => v?.trim())
        .filter((v): v is string => !!v && v.length >= MIN_TERM),
    ),
  ];
}

/**
 * The inputs the explorer needs: the terms to search (manufacturers, the
 * aircraft model, any typed keywords), the already-tracked AD numbers to filter
 * out, and the DRS hits for the sharp terms.
 *
 * The Federal Register fetch itself runs in the BROWSER (see ExploreClient) —
 * GPO's origin 403s our datacenter egress IP, and the FR API is CORS-enabled,
 * so the user's residential IP is the reliable path. DRS is the opposite: it
 * needs a server-side cookie/JWT handshake and is not CORS-enabled, so it runs
 * here. That split is why the two searches fan out from different places.
 */
export async function getExploreTargets(
  aircraftId: string,
  input: { model?: string; keywords?: string[] } = {},
): Promise<
  | { ok: true; terms: SearchTerm[]; tracked: string[]; model: string | null; drs: CandidateAd[] }
  | { error: string }
> {
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("make, model")
    .eq("id", aircraftId)
    .single();

  const { data: components } = await supabase
    .from("component")
    .select("make")
    .eq("aircraft_id", aircraftId)
    .eq("is_installed", true);

  const model = input.model?.trim() || null;
  const terms: SearchTerm[] = [
    ...clean([aircraft?.make, ...(components ?? []).map((c) => c.make)]).map(
      (term): SearchTerm => ({ term, kind: "manufacturer" }),
    ),
    // The model search is the sharp one: "172N" hits the ADs that name the
    // variant, where the make alone returns every Cessna AD ever issued.
    ...clean(model ? [model, [aircraft?.make, model].filter(Boolean).join(" ")] : []).map(
      (term): SearchTerm => ({ term, kind: "model" }),
    ),
    ...clean(input.keywords ?? []).map((term): SearchTerm => ({ term, kind: "keyword" })),
  ];
  if (terms.length === 0) {
    return {
      error:
        "Nothing to search — set the aircraft make or model, add equipment with a manufacturer, or type a keyword.",
    };
  }

  const { data: tracked } = await supabase
    .from("ad_compliance")
    .select("reference")
    .eq("aircraft_id", aircraftId)
    .eq("kind", "ad");
  const trackedKeys = new Set(
    (tracked ?? []).map((r) => r.reference.replace(/\s+/g, "").toLowerCase()),
  );

  // DRS, best-effort and in parallel: its whole value here is the pre-1994
  // legacy ADs the Federal Register archive doesn't carry. If DRS is down every
  // call returns [] and the FR path below is unaffected.
  const sharp = terms.filter((t) => t.kind !== "manufacturer").slice(0, MAX_DRS_TERMS);
  const drsResults = await Promise.all(
    sharp.map(async ({ term, kind }) => {
      const hits = await searchADsInDRS(term);
      return hits.map((d): CandidateAd => {
        const models = extractModels(d.title);
        return {
          adNumber: d.adNumber,
          documentNumber: d.docUniqueId,
          title: d.title ?? "",
          abstract: null,
          effectiveOn: d.effectiveOn ?? d.publishedOn,
          htmlUrl: d.viewUrl,
          pdfUrl: null,
          fullTextUrl: null,
          citation: null,
          rin: null,
          term,
          kind,
          source: "drs",
          models,
          matched: matchedModels(models, model),
          documentStatus: d.status,
        };
      });
    }),
  );

  const drs: CandidateAd[] = [];
  const seen = new Set<string>();
  for (const ad of drsResults.flat()) {
    const key = (ad.adNumber ?? "").replace(/\s+/g, "").toLowerCase();
    if (!key || trackedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    drs.push(ad);
  }

  return { ok: true, terms, tracked: [...trackedKeys], model: aircraft?.model ?? null, drs };
}

/**
 * How the owner wants this AD tracked. `ad_compliance` already carries both
 * interval axes (0007: recurring / interval_hours / interval_months) plus the
 * stored next-due pair the forecast sorts by, so nothing new is needed in the
 * schema — an AD found here can be one-time or recurring on hours, calendar, or
 * both, exactly like one entered by hand.
 */
export type TrackOptions = {
  recurring: boolean;
  intervalHours: number | null;
  intervalMonths: number | null;
  nextDueDate: string | null;
  nextDueHours: number | null;
};

const ONE_TIME: TrackOptions = {
  recurring: false,
  intervalHours: null,
  intervalMonths: null,
  nextDueDate: null,
  nextDueHours: null,
};

/**
 * Track a candidate AD found by the explorer — creates the ad_compliance record
 * (status `open`: found, not yet dispositioned) with the recurrence the owner
 * chose, then links the official FAA reference so the record carries its source.
 */
export async function trackCandidate(
  aircraftId: string,
  ad: CandidateAd,
  options: TrackOptions = ONE_TIME,
): Promise<{ ok: true } | { error: string }> {
  // Re-parse the model list from the AD text server-side rather than trusting
  // the browser's copy, and label it as parsed — the AD's own Applicability
  // paragraph (serial numbers and all) remains the authority.
  const models = extractModels(ad.title, ad.abstract).slice(0, 20);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const ctx: WriteCtx = { aircraftId, userId: user?.id ?? "" };

  const created = await compliance.track(supabase, ctx, {
    kind: "ad",
    reference: ad.adNumber ?? "",
    title: ad.title,
    applicability: models.length
      ? `Models named: ${models.join(", ")} (parsed from the AD text — confirm against the AD)`
      : null,
    recurring: options.recurring,
    intervalHours: options.intervalHours,
    intervalMonths: options.intervalMonths,
    nextDueDate: options.nextDueDate,
    nextDueHours: options.nextDueHours,
  });
  if (created.status !== "ok") return { error: failMessage(created) };
  const complianceId = String(created.row?.id ?? "");

  // Cache the official reference against the new record. Best-effort: a failed
  // enrichment must not undo a successful track — the owner can retry the
  // lookup from the compliance page.
  if (ad.source === "drs") {
    // Re-resolved server-side by number rather than trusting the browser's copy.
    await compliance.enrichViaDRS(supabase, ctx, { complianceId }).catch(() => undefined);
  } else {
    await compliance
      .saveAdReference(supabase, ctx, {
        complianceId,
        ad: {
          adNumber: ad.adNumber,
          documentNumber: ad.documentNumber,
          title: ad.title,
          abstract: ad.abstract,
          effectiveOn: ad.effectiveOn,
          htmlUrl: ad.htmlUrl,
          pdfUrl: ad.pdfUrl,
          fullTextUrl: ad.fullTextUrl,
          citation: ad.citation,
          rin: ad.rin,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath(`/aircraft/${aircraftId}/compliance/explore`);
  revalidatePath(`/aircraft/${aircraftId}/compliance`);
  return { ok: true };
}
