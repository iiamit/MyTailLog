// ===========================================================================
// Content-Security-Policy — single source of truth.
//
// Extracted from next.config so it's testable (test/csp.test.mjs) and so the
// CSP can't silently drift from the external resources the client actually
// loads. That drift is exactly what broke PDF upload (PR #5): the CSP blocked
// the pdf.js worker's CDN URL. The pdf.js worker is now self-hosted
// (public/pdf.worker.min.mjs → worker-src 'self'); the only remaining external
// scripts are the camera-scanner libs below.
//
// RULE: if you add a client-side <script>/Worker/fetch to a new external origin,
// add it here AND the test will hold you to it. If you TIGHTEN this (drop
// 'unsafe-inline'/'unsafe-eval', etc.), run the CSP test + a real upload/scan
// smoke test first.
// ===========================================================================

/** External origins loaded via <script> by the camera scanner (src/lib/capture/scanner.ts). */
export const SCRIPT_CDN_ORIGINS = [
  "https://docs.opencv.org", // OpenCV.js (~9MB wasm, embedded) — too big to bundle
  "https://cdn.jsdelivr.net", // jscanify
];

/** Build the CSP header value for the given Supabase host. */
export function buildCsp(supabaseHost) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    // ponytail: permissive ('unsafe-inline'/'unsafe-eval' — Next hydration +
    // OpenCV's eval). Tighten to nonce-based once verified against a live smoke test.
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${SCRIPT_CDN_ORIGINS.join(" ")}`,
    // pdf.js worker is self-hosted (same origin); blob: covers pdf.js fallbacks.
    "worker-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
    // The OAuth consent form (/oauth/consent/*) POSTs to /decide, which redirects
    // through /api/oidc/auth/* and finally to the OAuth *client's* registered
    // redirect URI. Browsers enforce form-action across the WHOLE redirect chain,
    // so 'self' alone blocks every client at consent. Allow the exact redirect-URI
    // shapes the AS permits (developers/actions.ts): https anywhere, plus http on
    // localhost / 127.0.0.1 for local dev clients (loopback OAuth). The real
    // authorization boundary is oidc-provider validating redirect_uri against the
    // client's allowlist server-side — this only unblocks the browser navigation.
    "form-action 'self' https: http://localhost:* http://127.0.0.1:*",
  ].join("; ");
}
