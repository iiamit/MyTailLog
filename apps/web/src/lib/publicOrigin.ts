/**
 * The public origin of a request. Behind App Hosting / Cloud Run the request
 * URL's host is the internal 0.0.0.0:PORT, so derive it from the proxy headers
 * (forwarded host, else the preserved Host header); fall back to the request URL
 * for local dev. Mirrors src/app/auth/callback/route.ts.
 */
export function publicOrigin(request: Request): string {
  // Pin to the configured site origin when set: a client-supplied Host /
  // X-Forwarded-Host must not be reflected into redirect targets or the OAuth
  // redirect_uri (link/redirect poisoning). Set NEXT_PUBLIC_SITE_URL in prod.
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  // In production the reflected-Host fallback is a redirect/OAuth-poisoning risk,
  // so refuse to run without the pinned origin rather than trusting a client
  // header. Local dev (no NEXT_PUBLIC_SITE_URL) keeps the header fallback below.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be set in production — refusing to derive the public origin from a client-supplied Host header.",
    );
  }
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
