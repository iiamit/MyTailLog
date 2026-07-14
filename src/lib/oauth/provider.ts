import Provider, { type Configuration } from "oidc-provider";
import { SupabaseAdapter } from "./adapter";
import { OAUTH_SCOPES } from "./scopes";

export { OAUTH_SCOPES };

// Where third-party apps discover us. oidc-provider mounts every route under the
// issuer's pathname, so this MUST match the Pages API mount (/api/oidc/*).
export function oauthIssuer(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site) throw new Error("NEXT_PUBLIC_SITE_URL is required for the OAuth issuer");
  return `${site.replace(/\/$/, "")}/api/oidc`;
}

let provider: Provider | null = null;

// Lazily build a singleton. Throws (→ route returns 503) when OIDC_JWKS is unset
// so the rest of the app runs fine without the secret; only /api/oidc/* needs it.
export function getOAuthProvider(): Provider {
  if (provider) return provider;

  const rawJwks = process.env.OIDC_JWKS;
  if (!rawJwks) throw new Error("OIDC_JWKS is not configured");
  let jwks: Configuration["jwks"];
  try {
    jwks = JSON.parse(rawJwks) as Configuration["jwks"];
  } catch {
    throw new Error("OIDC_JWKS is not valid JSON");
  }
  // Reuse an existing server secret for cookie signing unless a dedicated one is set.
  const cookieSecret = process.env.OIDC_COOKIE_SECRET || process.env.ENCRYPTION_KEY;
  if (!cookieSecret) throw new Error("OIDC_COOKIE_SECRET or ENCRYPTION_KEY is required");

  const config: Configuration = {
    adapter: (name) => new SupabaseAdapter(name),
    jwks,
    // No static clients — they're loaded dynamically from oauth_client via the
    // adapter's Client.find (the self-serve portal's table).
    clients: [],
    scopes: [...OAUTH_SCOPES],
    claims: { openid: ["sub"] },
    responseTypes: ["code"], // OAuth 2.1: authorization code only (no implicit)
    pkce: { required: () => true },
    cookies: { keys: [cookieSecret] },
    ttl: {
      AccessToken: 3600, // 1h
      AuthorizationCode: 600, // 10m
      RefreshToken: 14 * 24 * 3600, // 14d
      Grant: 14 * 24 * 3600,
      Session: 14 * 24 * 3600,
      Interaction: 3600,
    },
    features: {
      devInteractions: { enabled: false }, // never the built-in dev login UI
      revocation: { enabled: true },
      introspection: { enabled: true },
      registration: { enabled: false }, // portal owns client creation, not DCR
      rpInitiatedLogout: { enabled: false },
    },
    // Consent/login UI (P1c). ABSOLUTE, anchored to the canonical issuer origin —
    // NOT relative. oidc-provider resolves a relative interaction URL against the
    // request Host, which on a container/preview (bound to 0.0.0.0:8080, with
    // x-forwarded-host not carrying the public name) leaks
    // `https://0.0.0.0:8080/oauth/consent/...` into the redirect and breaks
    // session/cookie continuity → the consent screen loops. The issuer origin is
    // the canonical public URL (from NEXT_PUBLIC_SITE_URL), so use it directly.
    interactions: {
      url(_ctx, interaction) {
        return `${new URL(oauthIssuer()).origin}/oauth/consent/${interaction.uid}`;
      },
    },
    // Access tokens carry the Supabase user id as `sub`; the Resource Server (P2)
    // resolves per-aircraft grants from it. Claims stay minimal (no PII leak).
    async findAccount(_ctx, sub) {
      return {
        accountId: sub,
        async claims() {
          return { sub };
        },
      };
    },
  };

  const p = new Provider(oauthIssuer(), config);
  // In prod, TLS terminates at Firebase App Hosting and we trust x-forwarded-*.
  // Locally (http://localhost) there's no such header, so leave proxy off.
  // The request reaches us through fetch-to-node with no real TLS socket, so
  // trust the proxy headers: prod (App Hosting) sets x-forwarded-proto=https;
  // locally there's none, so the protocol resolves to http (matching the issuer).
  p.proxy = true;
  // Surface internal provider failures (otherwise oidc-provider swallows them as
  // a generic "server_error" to the client).
  p.on("server_error", (_ctx, err) => console.error("[oidc] server_error:", err));
  provider = p;
  return p;
}
