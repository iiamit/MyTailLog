import { toReqRes, toFetchResponse } from "fetch-to-node";
import { getOAuthProvider } from "@/lib/oauth/provider";

// oidc-provider is a Node http (Koa) framework; App Router hands us a Web
// Request. fetch-to-node bridges the two: Request → Node req/res, run the
// provider's callback, then serialise the Node response back to a Web Response.
// Mounted at /api/oidc/* — exactly the issuer pathname (see oauthIssuer()), so
// oidc-provider's own routes (/.well-known/openid-configuration, /auth, /token,
// /jwks, /token/revocation, /token/introspection, …) line up with the URLs.
export const runtime = "nodejs"; // oidc-provider must not run on the edge
export const dynamic = "force-dynamic";

const MOUNT = "/api/oidc";

async function handle(request: Request): Promise<Response> {
  const { req, res } = toReqRes(request);
  // oidc-provider defines its routes root-relative (/auth, /token, /jwks,
  // /.well-known/openid-configuration, …); a real Express/Koa mount would strip
  // the prefix before the provider sees the request, so we do the same. The
  // issuer keeps the /api/oidc path, so generated URLs stay correct.
  const url = new URL(request.url);
  const stripped = url.pathname.startsWith(MOUNT) ? url.pathname.slice(MOUNT.length) || "/" : url.pathname;
  // req.url = the root-relative path oidc-provider routes on; req.originalUrl =
  // the full path. oidc-provider derives the mount prefix (for generating
  // absolute endpoint URLs) from originalUrl minus url — so both must be set.
  req.url = stripped + url.search;
  (req as { originalUrl?: string }).originalUrl = url.pathname + url.search;
  // fetch-to-node leaves req.socket null; Koa's request.protocol/ip read
  // socket.encrypted/remoteAddress. TLS terminates upstream (proxy=true), so a
  // non-encrypted stub is correct — the real scheme comes from x-forwarded-proto.
  // (defineProperty, not assignment — fetch-to-node's socket setter throws.)
  Object.defineProperty(req, "socket", {
    configurable: true,
    value: {
      encrypted: false,
      remoteAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    },
  });
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
