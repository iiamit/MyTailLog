import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MarketingSection, MarketingShell } from "@/components/MarketingShell";
import type { AdCatalog } from "@/lib/database.types";
import { getModelAds } from "@/lib/adCatalogData";
import { displayModel, displayTitle, makeBySlug, normalizeModel } from "@/lib/faa/adCatalog";
import { AdListDisclaimer, TrackCta } from "../../AdCatalogParts";

// The root layout reads the auth cookie. Keep the route dynamic; the catalog
// queries themselves are cached for a day in adCatalogData.ts.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ make: string; model: string }> };

/** Resolve the route to a make + model with ≥1 AD naming it, or null. Deduped per request. */
const load = cache(async (makeSlug: string, modelSlug: string) => {
  const make = makeBySlug(makeSlug);
  const key = normalizeModel(modelSlug);
  if (!make || !key || modelSlug !== key.toLowerCase()) return null;
  const ads = await getModelAds(make.slug, key);
  if (ads.exact.length === 0) return null;
  const first = ads.exact[0];
  return { make, key, model: displayModel(key, first.title, first.abstract), ads };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { make, model } = await params;
  const data = await load(make, model);
  if (!data) return {};
  const name = `${data.make.name} ${data.model}`;
  const n = data.ads.exact.length;
  return {
    title: `Airworthiness directives for the ${name} — MyTailLog`,
    description: `${n} FAA airworthiness directive${n === 1 ? "" : "s"} naming the ${name}, newest first, with links to the official Federal Register text.`,
    alternates: { canonical: `/ads/${data.make.slug}/${data.key.toLowerCase()}` },
  };
}

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "—";

function AdList({ ads }: { ads: AdCatalog[] }) {
  return (
    <ul className="divide-y divide-line">
      {ads.map((ad) => (
        <li key={ad.ad_number} className="py-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono font-semibold text-ink">AD {ad.ad_number}</span>
            <span className="text-sm text-faint">Effective {fmtDate(ad.effective_date)}</span>
          </div>
          <p className="mt-1">{displayTitle(ad.title)}</p>
          <p className="mt-1 text-sm">
            {ad.fr_html_url && (
              <a href={ad.fr_html_url} className="mr-3 underline decoration-line underline-offset-2 hover:text-ink" rel="nofollow">
                Federal Register
              </a>
            )}
            {ad.pdf_url && (
              <a href={ad.pdf_url} className="underline decoration-line underline-offset-2 hover:text-ink" rel="nofollow">
                Official PDF
              </a>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function AdModelPage({ params }: Params) {
  const { make, model } = await params;
  const data = await load(make, model);
  if (!data) notFound();
  const name = `${data.make.name} ${data.model}`;
  const series = [...new Set(data.ads.series.flatMap((ad) => ad.models.filter((m) => data.key.startsWith(m))))];

  return (
    <MarketingShell
      eyebrow={`${data.make.name} airworthiness directives`}
      title={`Airworthiness directives for the ${name}`}
      lede={`FAA ADs whose titles or abstracts name the ${name}, newest first, from the Federal Register (1994 onward).`}
      current={`/ads/${data.make.slug}/${data.key.toLowerCase()}`}
    >
      <AdListDisclaimer />
      <div className="mt-8 space-y-8">
        <MarketingSection id="named" title={`ADs naming the ${data.model} (${data.ads.exact.length})`}>
          <AdList ads={data.ads.exact} />
        </MarketingSection>
        {data.ads.series.length > 0 && (
          <MarketingSection id="series" title={`ADs naming the ${series.join(" / ")} series (${data.ads.series.length})`}>
            <p className="text-sm">
              These name a base model the {data.model} belongs to, and may also cover it.
            </p>
            <AdList ads={data.ads.series} />
          </MarketingSection>
        )}
        <p className="text-sm text-faint">
          Pre-1994 ADs aren&apos;t in the Federal Register archive and aren&apos;t listed here; search
          the{" "}
          <a href="https://drs.faa.gov/" className="underline decoration-line underline-offset-2 hover:text-ink">
            FAA Dynamic Regulatory System
          </a>{" "}
          for those. <Link href="/ads" className="underline decoration-line underline-offset-2 hover:text-ink">All makes and models</Link>
        </p>
      </div>
      <TrackCta />
    </MarketingShell>
  );
}
