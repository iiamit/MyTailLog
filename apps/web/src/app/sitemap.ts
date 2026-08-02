import type { MetadataRoute } from "next";

// Public pages only — everything else is behind auth and disallowed in robots.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://mytaillog.com";
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/help`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/whats-new`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
