import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything user-specific is auth-gated anyway; keep crawlers out.
        disallow: ["/api/", "/aircraft/", "/dashboard", "/profile", "/admin", "/auth/"],
      },
    ],
    sitemap: "https://mytaillog.com/sitemap.xml",
  };
}
