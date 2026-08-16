import { readFileSync } from "node:fs";
import { buildCsp } from "./csp.config.mjs";

// CHANGELOG.md lives at the repo root, OUTSIDE apps/web, so Next's output file
// tracing never ships it — reading it at request time would work in dev and 500
// in production. Inlining it through `env` substitutes it as a string literal at
// build time instead, which needs no dependency and no tracing config. Parsed by
// src/lib/changelog.ts and rendered at /whats-new.
// Note: editing CHANGELOG.md requires a dev-server restart to take effect.
const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: { CHANGELOG_MD: changelog },
  // oidc-provider resolves token formats via `this.constructor.name`, which Next's
  // server-bundle minification mangles (breaks token issuance with a cryptic
  // "dynamic[...] is not a function"). Keep it external so it's required from
  // node_modules unminified at runtime.
  serverExternalPackages: ["oidc-provider"],
  // The capture PWA and service worker are registered client-side (see
  // public/manifest.webmanifest and src/app/capture). Headers below let the
  // manifest and service worker be served with the right scope.
  async headers() {
    // Global security headers. The non-CSP ones can't break the app and are pure
    // hardening; the CSP itself lives in csp.config.mjs (tested — see test/).
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : "*.supabase.co";
    // CSP lives in csp.config.mjs (single source of truth, covered by tests).
    // form-action stays 'self' everywhere EXCEPT the OAuth consent flow, which
    // must POST out to a client's registered redirect URI (see buildCsp docs).
    // Hot reload compiles through eval(), and these headers apply in dev too.
    const dev = process.env.NODE_ENV !== "production";
    const securityHeaders = (csp) => [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];
    return [
      // Consent flow gets the broad form-action; matched first and excluded from
      // the catch-all below so only ONE CSP header is ever emitted per path
      // (duplicate CSP headers intersect → 'self' would win and break consent).
      { source: "/oauth/consent/:path*", headers: securityHeaders(buildCsp(supabaseHost, { broadFormAction: true, dev })) },
      { source: "/((?!oauth/consent).*)", headers: securityHeaders(buildCsp(supabaseHost, { dev })) },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
