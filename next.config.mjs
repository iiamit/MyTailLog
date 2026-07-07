/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The capture PWA and service worker are registered client-side (see
  // public/manifest.webmanifest and src/app/capture). Headers below let the
  // manifest and service worker be served with the right scope.
  async headers() {
    // Global security headers. The non-CSP ones can't break the app and are
    // pure hardening. The CSP is intentionally permissive ('unsafe-inline'/
    // 'unsafe-eval' — Next needs inline hydration scripts and styles): it still
    // blocks external script/object/base/form origins and framing.
    // ponytail: permissive CSP; tighten to nonce-based script-src once verified
    // against the live app (needs a prod smoke test).
    const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : "*.supabase.co";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "font-src 'self' data:",
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
      "form-action 'self'",
    ].join("; ");
    const securityHeaders = [
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
      { source: "/:path*", headers: securityHeaders },
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
