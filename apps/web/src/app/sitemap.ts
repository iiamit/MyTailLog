import type { MetadataRoute } from "next";
import { listCatalogModels } from "@/lib/adCatalogData";
import { adModelPath } from "@/lib/faa/adCatalog";

export const revalidate = 86400;

// Public pages only — everything else is behind auth and disallowed in robots.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://mytaillog.com";
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/demo`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/help`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/compare`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/guides/digitize-aircraft-logbooks`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/guides/aircraft-maintenance-tracking`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/guides/airworthiness-directive-tracking`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/switch/myfbo`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/whats-new`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/ads`, changeFrequency: "weekly", priority: 0.6 },
  ];

  // One page per make/model with at least one AD (listCatalogModels caps the
  // count). A database failure must never take the static sitemap down with it.
  try {
    for (const m of await listCatalogModels()) {
      pages.push({
        url: `${base}${adModelPath(m.make, m.model)}`,
        lastModified: m.latest_effective_date ?? undefined,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch (e) {
    console.error("sitemap: AD catalog unavailable", e);
  }
  return pages;
}
