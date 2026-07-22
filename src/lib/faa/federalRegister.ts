// ===========================================================================
// Federal Register API client — the official source for Airworthiness
// Directives (14 CFR part 39 final rules). Public JSON API, no key required.
//
// RUNS CLIENT-SIDE (in the browser). GPO's origin nginx IP-blocks Cloud Run's
// datacenter egress with a bare 403 Forbidden — works from a laptop, fails in
// prod. The API is CORS-enabled (access-control-allow-origin: *) and this module
// is isomorphic (pure fetch/URLSearchParams), so the callers (ExploreClient,
// ComplianceClient) invoke it from the user's residential IP; server actions only
// supply DB inputs and persist results. Keep it dependency-free so it can bundle
// to the client. The user-agent header below is gated to server-side calls
// (browsers forbid setting it, and warn per request).
//
// Each AD final rule gives us: the AD number (parsed from docket_ids, e.g.
// "AD 2026-13-06"), the title (naming the manufacturer/product), the abstract
// (prose applicability), the effective date, and official links — the FR page,
// the signed govinfo PDF, and the full plain-text rule (which carries the
// Applicability section). We filter precisely to FAA / RULE / 14 CFR 39.
//
// Coverage note: the FR digital archive is ~1994-present, so pre-1994 legacy
// ADs won't appear here (those live on DRS, which has no API) — handle via
// manual entry. See the FAA-integration notes in the plan.
// ===========================================================================

import { cleanAdNumber, adNumbersMatch } from "./adNumber";

const BASE = "https://www.federalregister.gov/api/v1/documents.json";

// The FR API is Cloudflare-fronted and 403s User-Agent-less requests from
// datacenter IPs (i.e. our Cloud Run egress) — works from a laptop, fails in
// prod. Send a browser-like UA, same as the DRS client already does.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

const FIELDS = [
  "title",
  "document_number",
  "publication_date",
  "effective_on",
  "html_url",
  "pdf_url",
  "raw_text_url",
  "citation",
  "abstract",
  "regulation_id_numbers",
  "docket_ids",
];

export type FaaAd = {
  adNumber: string | null; // e.g. "2026-13-06"
  documentNumber: string; // FR document number, e.g. "2026-13481"
  title: string;
  abstract: string | null;
  effectiveOn: string | null;
  htmlUrl: string;
  pdfUrl: string | null;
  fullTextUrl: string | null;
  citation: string | null;
  rin: string | null;
};

type RawDoc = {
  title?: string;
  document_number?: string;
  effective_on?: string | null;
  html_url?: string;
  pdf_url?: string | null;
  raw_text_url?: string | null;
  citation?: string | null;
  abstract?: string | null;
  regulation_id_numbers?: string[];
  docket_ids?: string[];
};

/** Pull the AD number out of the docket_ids list (entries like "AD 2026-13-06"). */
function parseAdNumber(docketIds: string[] | undefined): string | null {
  for (const d of docketIds ?? []) {
    const m = /^AD\s+(.+)$/i.exec(d.trim());
    if (m) return m[1].trim();
  }
  return null;
}

function toAd(r: RawDoc): FaaAd {
  return {
    adNumber: parseAdNumber(r.docket_ids),
    documentNumber: r.document_number ?? "",
    title: r.title ?? "",
    abstract: r.abstract ?? null,
    effectiveOn: r.effective_on ?? null,
    htmlUrl: r.html_url ?? "",
    pdfUrl: r.pdf_url ?? null,
    fullTextUrl: r.raw_text_url ?? null,
    citation: r.citation ?? null,
    rin: r.regulation_id_numbers?.[0] ?? null,
  };
}

function buildUrl(term: string, perPage: number, page: number): string {
  const u = new URLSearchParams();
  u.append("conditions[agencies][]", "federal-aviation-administration");
  u.append("conditions[type][]", "RULE");
  u.append("conditions[cfr][title]", "14");
  u.append("conditions[cfr][part]", "39");
  u.append("conditions[term]", term);
  u.append("order", "newest");
  u.append("per_page", String(perPage));
  u.append("page", String(page));
  for (const f of FIELDS) u.append("fields[]", f);
  return `${BASE}?${u.toString()}`;
}

/**
 * Full-text search AD final rules — pass a manufacturer/product term (e.g.
 * "Cessna", "Lycoming", "Garmin") for coarse applicability matching, or an AD
 * number to look one up. Returns the total count and the page of results.
 */
export async function searchADs(
  term: string,
  opts: { perPage?: number; page?: number } = {},
): Promise<{ count: number; ads: FaaAd[] }> {
  const perPage = Math.min(Math.max(opts.perPage ?? 20, 1), 1000);
  // Fetch client-side (the user's browser) when possible: the FR API is
  // Cloudflare/CORS-enabled AND GPO's origin nginx 403s our datacenter egress IP,
  // so a residential IP is the only reliable path from production. The UA header
  // is server-only — browsers forbid setting it (and would warn on every call).
  const res = await fetch(buildUrl(term, perPage, opts.page ?? 1), {
    headers: {
      accept: "application/json",
      ...(typeof window === "undefined" ? { "user-agent": UA } : {}),
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    // Include a snippet of the body — a Cloudflare block reads very differently
    // from an FR API error, which is the first thing to know when debugging.
    const body = await res.text().catch(() => "");
    throw new Error(
      `Federal Register API returned ${res.status}.${body ? ` ${body.slice(0, 200).replace(/\s+/g, " ").trim()}` : ""}`,
    );
  }
  const json = (await res.json()) as { count?: number; results?: RawDoc[] };
  return {
    count: json.count ?? 0,
    ads: (json.results ?? []).map(toAd),
  };
}

/**
 * Look up a specific AD by its number (e.g. "2026-13-06", "AD 2015-19-07"). The
 * FR full-text search finds the rule; we then confirm the parsed AD number
 * matches (case/whitespace/revision-insensitive) so we don't attach the wrong
 * document. Returns null if not in the FR archive — which only goes back to
 * 1994-01-03, so pre-1994 legacy ADs won't be found here (use DRS for those).
 */
export async function getADByNumber(adNumber: string): Promise<FaaAd | null> {
  const clean = cleanAdNumber(adNumber);
  if (!clean) return null;
  const { ads } = await searchADs(clean, { perPage: 50 });
  return ads.find((a) => a.adNumber && adNumbersMatch(a.adNumber, clean)) ?? null;
}
