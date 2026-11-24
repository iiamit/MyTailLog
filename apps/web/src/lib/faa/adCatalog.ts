// ===========================================================================
// AD catalog — pure helpers behind the public /ads pages and the weekly
// backfill (scripts/ad-catalog-backfill.ts). Turns a Federal Register AD into an
// ad_catalog row (makes + normalized model designations) and owns the URL slugs.
//
// Makes come from the AD TITLE only ("Airworthiness Directives; Piper Aircraft,
// Inc. Airplanes"). The abstract often names other manufacturers' products the
// AD merely mentions, and the FR full-text search we backfill from matches the
// whole rule body, so trusting either would file e.g. an Avidyne display AD
// under Cessna. Models normally come from extractModels() over title + abstract.
//
// Like extractModels itself, this is a reading aid: a listing is matched from
// FAA prose, not an applicability determination.
// ===========================================================================

import { extractModels } from "./applicability";
import type { FaaAd } from "./federalRegister";

export type CatalogMake = { slug: string; name: string; pattern: RegExp };

/** Fixed make map: URL slug, display name, and the title pattern that names it. */
export const CATALOG_MAKES: CatalogMake[] = [
  { slug: "cessna", name: "Cessna", pattern: /\bcessna\b/i },
  { slug: "piper", name: "Piper", pattern: /\bpiper\b/i },
  { slug: "beechcraft", name: "Beechcraft", pattern: /\bbeech(?:craft)?\b|\braytheon aircraft\b/i },
  { slug: "mooney", name: "Mooney", pattern: /\bmooney\b/i },
  { slug: "cirrus", name: "Cirrus", pattern: /\bcirrus design\b|\bcirrus aircraft\b/i },
  { slug: "diamond", name: "Diamond", pattern: /\bdiamond aircraft\b/i },
  {
    slug: "grumman",
    name: "Grumman American",
    pattern: /\bgrumman american\b|\bgulfstream american\b|\bamerican general aircraft\b/i,
  },
  { slug: "maule", name: "Maule", pattern: /\bmaule\b/i },
  { slug: "lycoming", name: "Lycoming", pattern: /\blycoming\b/i },
  { slug: "continental", name: "Continental", pattern: /\bcontinental (?:motors|aerospace)\b/i },
  { slug: "hartzell", name: "Hartzell", pattern: /\bhartzell\b/i },
  { slug: "mccauley", name: "McCauley", pattern: /\bmccauley\b/i },
  // Textron Aviation holds both the Cessna and Beechcraft certificates. Used
  // only when neither predecessor is named anywhere in the title or abstract.
  { slug: "textron", name: "Textron Aviation", pattern: /\btextron aviation\b/i },
];

/** Federal Register search terms the backfill walks (one or more per make). */
export const BACKFILL_TERMS = [
  "Cessna",
  "Piper",
  "Beech",
  "Beechcraft",
  "Mooney",
  "Cirrus",
  "Diamond Aircraft",
  "Grumman American",
  "Maule",
  "Lycoming",
  "Continental Motors",
  "Hartzell",
  "McCauley",
];

const MAKE_BY_SLUG = new Map(CATALOG_MAKES.map((m) => [m.slug, m]));

export function makeBySlug(slug: string): CatalogMake | undefined {
  return MAKE_BY_SLUG.get(slug.toLowerCase());
}

/** Normalized model key stored in ad_catalog.models: '172N', 'O320', 'TAE1250299'. */
export function normalizeModel(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** URL slug for a model: lowercase alphanumerics ('172n', 'o320'). */
export function modelSlug(model: string): string {
  return normalizeModel(model).toLowerCase();
}

export function adModelPath(make: string, model: string): string {
  return `/ads/${make}/${modelSlug(model)}`;
}

/**
 * Normalized model keys whose ADs cover `model` — the model itself plus each
 * base series it extends with a letter (172N ← 172; O320D2J ← O320, O320D2),
 * mirroring modelMatches() in applicability.ts.
 */
export function seriesKeys(model: string): string[] {
  const key = normalizeModel(model);
  const out = [key];
  for (let i = 2; i < key.length; i++) {
    if (/\d/.test(key[i - 1]) && /[A-Z]/.test(key[i])) out.push(key.slice(0, i));
  }
  return out;
}

/** Beechcraft designations (normalized): Bonanza/Baron/Duke 33–60, King Air 90–350, 1900. */
const BEECH_MODEL = /^(?:[A-H]?\d{2}[A-Z]{0,3}|[A-F]?(?:90|100|200|300|350)[A-Z]{0,3}|1900[A-Z]?|400A)$/;
/** Cessna designations (normalized): 150, 172N, T206H, P210R, F406, 525B, 560XL. */
const CESSNA_MODEL = /^[A-Z]{0,2}\d{3}[A-Z0-9]*$/;

/**
 * Make slugs named in an AD's title (see the header for why not the abstract).
 * A bare "Textron Aviation" title is resolved to Cessna or Beechcraft from the
 * abstract, or failing that from the shape of the model designations.
 */
export function detectMakes(title: string, abstract?: string | null, models: string[] = []): string[] {
  const makes = CATALOG_MAKES.filter((m) => m.slug !== "textron" && m.pattern.test(title)).map(
    (m) => m.slug,
  );
  if (makes.length === 0 && /\btextron aviation\b/i.test(title)) {
    const text = `${title} ${abstract ?? ""}`;
    if (/\bcessna\b/i.test(text)) makes.push("cessna");
    if (/\bbeech(?:craft)?\b/i.test(text)) makes.push("beechcraft");
    if (makes.length === 0 && models.length > 0) {
      if (models.every((m) => BEECH_MODEL.test(m))) makes.push("beechcraft");
      else if (models.every((m) => CESSNA_MODEL.test(m) && !BEECH_MODEL.test(m))) makes.push("cessna");
    }
    if (makes.length === 0) makes.push("textron");
  }
  return makes;
}

export type AdCatalogRow = {
  ad_number: string;
  title: string;
  abstract: string | null;
  effective_date: string | null;
  makes: string[];
  models: string[];
  fr_html_url: string | null;
  pdf_url: string | null;
  citation: string | null;
  source: string;
};

/** The runner and the protected ingest route agree on the rows they can store. */
export function validCatalogRow(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return typeof r.ad_number === "string" && /^[0-9A-Z][0-9A-Z -]{5,31}$/i.test(r.ad_number)
    && typeof r.title === "string" && r.title.length > 0 && r.title.length <= 1000
    && (r.abstract === null || (typeof r.abstract === "string" && r.abstract.length <= 10000))
    && (r.effective_date === null || (typeof r.effective_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.effective_date)))
    && Array.isArray(r.makes) && r.makes.length === 1 && makeBySlug(r.makes[0]) != null
    && Array.isArray(r.models) && r.models.length > 0 && r.models.length <= 40
    && r.models.every((m: unknown) => typeof m === "string" && /^[A-Z0-9]{2,24}$/.test(m))
    && (r.fr_html_url === null || (typeof r.fr_html_url === "string" && r.fr_html_url.startsWith("https://www.federalregister.gov/")))
    && (r.pdf_url === null || (typeof r.pdf_url === "string" && /^https:\/\/(?:www\.)?(?:federalregister\.gov|govinfo\.gov)\//.test(r.pdf_url)))
    && (r.citation === null || typeof r.citation === "string")
    && r.source === "federal_register";
}

/** "Airworthiness Directives; Cessna …" → "Cessna …" for display. */
export function displayTitle(title: string): string {
  return title.replace(/^airworthiness directives?;\s*/i, "").trim() || title;
}

/** A correction notice shares its AD number with the rule it corrects. */
export function isCorrection(ad: Pick<FaaAd, "title" | "abstract">): boolean {
  return /\bis correcting\b|^\s*correction/i.test(`${ad.abstract ?? ""} ${ad.title}`.trim()) ||
    /;\s*correction\s*$/i.test(ad.title);
}

// Catalog-only corrections for source documents whose component identifiers
// are parsed as models. Keep the rule and its equipment-specific abstract.
const CESSNA_MODEL_CORRECTIONS = new Map<string, readonly string[]>([
  ["98-24-14", ["340A", "414A"]], // FAA doc 98-32045: WYE-tube part numbers
  ["98-23-02", ["180", "185", "180K"]], // FAA doc 98-29363: Airglas wheel-ski models
]);

/**
 * A Federal Register AD → an ad_catalog row, or null when it can't be listed
 * (no AD number, no recognized make, or no parsed model designation).
 */
export function buildCatalogRow(ad: FaaAd): AdCatalogRow | null {
  if (!ad.adNumber || !ad.title) return null;
  const models = [
    ...new Set(extractModels(ad.title, ad.abstract).map(normalizeModel).filter((m) => m.length >= 2)),
  ];
  const makes = detectMakes(ad.title, ad.abstract, models);
  // This table stores makes and models separately. A multi-make rule would
  // invent every cross-pair (for example Cessna B300), so omit it until the
  // catalog can store explicit make/model pairs.
  if (makes.length !== 1) return null;
  const catalogModels = makes[0] === "cessna" ? CESSNA_MODEL_CORRECTIONS.get(ad.adNumber) ?? models : models;
  if (catalogModels.length === 0) return null;
  return {
    ad_number: ad.adNumber,
    title: ad.title,
    abstract: ad.abstract,
    effective_date: ad.effectiveOn,
    makes,
    models: [...catalogModels],
    fr_html_url: ad.htmlUrl || null,
    pdf_url: ad.pdfUrl,
    citation: ad.citation,
    source: "federal_register",
  };
}

/**
 * Collapse documents sharing an AD number to one: the original rule beats a
 * correction notice; otherwise the first seen (the search is newest-first) wins.
 */
export function preferAd(current: FaaAd | undefined, candidate: FaaAd): FaaAd {
  if (!current) return candidate;
  if (isCorrection(current) && !isCorrection(candidate)) return candidate;
  return current;
}

/** The model as an AD wrote it ("O-320-D2J"), falling back to the normalized key. */
export function displayModel(key: string, ...texts: (string | null | undefined)[]): string {
  return extractModels(...texts).find((m) => normalizeModel(m) === key) ?? key;
}
