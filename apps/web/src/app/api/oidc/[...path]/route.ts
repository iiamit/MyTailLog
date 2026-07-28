import { toNode, toFetchResponse } from "@/lib/oauth/bridge";
import { getOAuthProvider } from "@/lib/oauth/provider";

// oidc-provider is a Node http (Koa) framework; App Router hands us a Web
// Request. We bridge the two (see @/lib/oauth/bridge) and run the provider's
// callback. Mounted at /api/oidc/* — exactly the issuer pathname (see
// oauthIssuer()), so oidc-provider's own routes (/.well-known/openid-configuration,
// /auth, /token, /jwks, /token/revocation, /token/introspection, …) line up.
export const runtime = "nodejs"; // oidc-provider must not run on the edge
export const dynamic = "force-dynamic";

const MOUNT = "/api/oidc";

async function handle(request: Request): Promise<Response> {
  const { req, res } = toNode(request);
  // oidc-provider defines its routes root-relative, so we strip the mount prefix
  // into req.url (what it routes on) and keep the full path in req.originalUrl —
  // that pair is how oidc-provider derives the mount prefix for the absolute
  // endpoint URLs it advertises (else they'd drop /api/oidc). See P1b mount notes.
  const url = new URL(request.url);
  const stripped = url.pathname.startsWith(MOUNT) ? url.pathname.slice(MOUNT.length) || "/" : url.pathname;
  req.url = stripped + url.search;
  (req as { originalUrl?: string }).originalUrl = url.pathname + url.search;
  try {
    getOAuthProvider().callback()(req, res);
  } catch (err) {
    // OIDC_JWKS not configured yet, etc. — keep the rest of the app healthy.
    res.statusCode = 503;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "oauth_unavailable", detail: (err as Error).message }));
  }
  return toFetchResponse(res);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
  handle as HEAD,
  handle as OPTIONS,
};
