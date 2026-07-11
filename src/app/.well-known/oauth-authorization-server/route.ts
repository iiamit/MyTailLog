import { oauthIssuer, OAUTH_SCOPES } from "@/lib/oauth/provider";

// RFC 8414 authorization-server metadata at the conventional root location, so
// clients that probe `${origin}/.well-known/oauth-authorization-server` discover
// us. (oidc-provider also serves OIDC discovery at
// `${issuer}/.well-known/openid-configuration`.) Endpoint paths mirror
// oidc-provider's defaults under the issuer path — see src/app/api/oidc.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  const issuer = oauthIssuer(); // ${SITE}/api/oidc
  return Response.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/jwks`,
      userinfo_endpoint: `${issuer}/me`,
      revocation_endpoint: `${issuer}/token/revocation`,
      introspection_endpoint: `${issuer}/token/introspection`,
      scopes_supported: [...OAUTH_SCOPES],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
      service_documentation: `${issuer.replace(/\/api\/oidc$/, "")}/developers/docs`,
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
