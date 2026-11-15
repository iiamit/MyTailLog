import "server-only";
import { unstable_cache } from "next/cache";
import type { AdCatalog, AdCatalogModel } from "@/lib/database.types";
import { createPublicClient } from "@/lib/supabase/public";
import { makeBySlug, normalizeModel, seriesKeys } from "@/lib/faa/adCatalog";

// The root layout reads the auth cookie, so every page renders dynamically and a
// route-level `revalidate` alone wouldn't cache anything. Cache the catalog reads
// themselves for a day instead (the table only changes weekly). Errors aren't cached.
const DAY = 86400;

/** Upper bound on (make, model) pairs read for the index and sitemap. */
export const MAX_CATALOG_MODELS = 5000;
const PAGE = 1000; // PostgREST's default max rows per request

/** Every (make, model) pair with at least one AD, known makes only, largest first. */
async function fetchCatalogModels(): Promise<AdCatalogModel[]> {
  const supabase = createPublicClient();
  const out: AdCatalogModel[] = [];
  for (let from = 0; from < MAX_CATALOG_MODELS; from += PAGE) {
    const { data, error } = await supabase
      .from("ad_catalog_model")
      .select("make, model, ad_count, latest_effective_date")
      .order("ad_count", { ascending: false })
      .order("make")
      .order("model")
      .range(from, Math.min(from + PAGE, MAX_CATALOG_MODELS) - 1);
    if (error) throw new Error(`ad_catalog_model: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return out.filter((r) => makeBySlug(r.make));
}

export type ModelAds = { exact: AdCatalog[]; series: AdCatalog[] };

/**
 * ADs filed under `make` that name `model` directly, plus ADs naming a base
 * series it belongs to (an AD on "Model 172" covers a 172N). Newest first.
 */
async function fetchModelAds(make: string, model: string): Promise<ModelAds> {
  const key = normalizeModel(model);
  const { data, error } = await createPublicClient()
    .from("ad_catalog")
    .select("*")
    .contains("makes", [make])
    .overlaps("models", seriesKeys(key))
    .order("effective_date", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (error) throw new Error(`ad_catalog: ${error.message}`);
  const rows = data ?? [];
  return {
    exact: rows.filter((r) => r.models.includes(key)),
    series: rows.filter((r) => !r.models.includes(key)),
  };
}

export const listCatalogModels = unstable_cache(fetchCatalogModels, ["ad-catalog-models"], {
  revalidate: DAY,
});

export const getModelAds = unstable_cache(fetchModelAds, ["ad-catalog-model-ads"], {
  revalidate: DAY,
});
