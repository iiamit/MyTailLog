import type { Metadata } from "next";
import Link from "next/link";
import { MarketingSection, MarketingShell } from "@/components/MarketingShell";
import type { AdCatalogModel } from "@/lib/database.types";
import { listCatalogModels } from "@/lib/adCatalogData";
import { CATALOG_MAKES, adModelPath } from "@/lib/faa/adCatalog";
import { AdListDisclaimer, TrackCta } from "./AdCatalogParts";

// Rebuilt at most daily from ad_catalog (refreshed weekly by a GitHub Action).
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Airworthiness directives by aircraft model",
  description:
    "FAA airworthiness directives for Cessna, Piper, Beechcraft, Mooney, Cirrus and other general-aviation aircraft, engines and propellers, listed by model.",
};

export default async function AdsIndexPage() {
  let rows: AdCatalogModel[] = [];
  try {
    rows = await listCatalogModels();
  } catch (e) {
    console.error("ads index: catalog unavailable", e);
  }

  const byMake = new Map<string, AdCatalogModel[]>();
  for (const r of rows) byMake.set(r.make, [...(byMake.get(r.make) ?? []), r]);
  const makes = CATALOG_MAKES.filter((m) => byMake.has(m.slug));

  return (
    <MarketingShell
      group="guides"
      title="ADs by model"
      lede="FAA airworthiness directives from the Federal Register, grouped by the makes and models their titles and abstracts name: airframes, engines and propellers."
      current="/ads"
    >
      <AdListDisclaimer />
      <div className="mt-6">
        {makes.length === 0 && (
          <p>The AD list is being prepared. Check back soon.</p>
        )}
        {makes.map((make, i) => {
          const models = [...(byMake.get(make.slug) ?? [])].sort((a, b) =>
            a.model.localeCompare(b.model, "en", { numeric: true }),
          );
          return (
            <MarketingSection key={make.slug} id={make.slug} title={make.name} first={i === 0}>
              <ul className="!list-none !p-0 flex flex-wrap gap-x-4 gap-y-1">
                {models.map((m) => (
                  <li key={m.model}>
                    <Link href={adModelPath(make.slug, m.model)} className="inline-flex min-h-10 items-center">
                      {m.model}
                    </Link>{" "}
                    <span className="text-ink-3">({m.ad_count})</span>
                  </li>
                ))}
              </ul>
            </MarketingSection>
          );
        })}
      </div>
      <TrackCta />
    </MarketingShell>
  );
}
