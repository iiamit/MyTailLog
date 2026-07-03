/**
 * The public origin of a request. Behind App Hosting / Cloud Run the request
 * URL's host is the internal 0.0.0.0:PORT, so derive it from the proxy headers
 * (forwarded host, else the preserved Host header); fall back to the request URL
 * for local dev. Mirrors src/app/auth/callback/route.ts.
 */
export function publicOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}
