import { test, expect } from "@playwright/test";

// OAuth Authorization Server (P1b): the provider must boot and serve a coherent,
// self-referential OIDC discovery document + JWKS. Pure API checks (no page), so
// this uses the base request fixture rather than the CSP/page fixtures.
const DISCOVERY = "/api/oidc/.well-known/openid-configuration";

test("OIDC discovery advertises endpoints under the mount, code+PKCE only", async ({ request, baseURL }) => {
  const res = await request.get(DISCOVERY);
  expect(res.status()).toBe(200);
  const meta = await res.json();

  const issuer = `${baseURL}/api/oidc`;
  expect(meta.issuer).toBe(issuer);

  // Every endpoint must live under the mount path — otherwise clients would be
  // sent to routes that don't exist (the bug this test locks down).
  for (const key of [
    "authorization_endpoint",
    "token_endpoint",
    "jwks_uri",
    "userinfo_endpoint",
    "revocation_endpoint",
    "introspection_endpoint",
  ]) {
    expect(typeof meta[key] === "string" && meta[key].startsWith(`${issuer}/`), `${key}=${meta[key]}`).toBe(true);
  }

  // OAuth 2.1 posture: authorization code + PKCE(S256), no implicit.
  expect(meta.response_types_supported).toEqual(["code"]);
  expect(meta.grant_types_supported).toContain("authorization_code");
  expect(meta.grant_types_supported).not.toContain("implicit");
  expect(meta.code_challenge_methods_supported).toContain("S256");

  // The per-aircraft read scopes, and NOT log entries.
  expect(meta.scopes_supported).toEqual(
    expect.arrayContaining(["airworthiness:read", "aircraft:read", "oil:read"]),
  );
  expect(meta.scopes_supported).not.toContain("entries:read");
});

test("JWKS serves public signing keys and never leaks private material", async ({ request }) => {
  const res = await request.get("/api/oidc/jwks");
  expect(res.status()).toBe(200);
  const jwks = await res.json();
  expect(Array.isArray(jwks.keys)).toBe(true);
  expect(jwks.keys.length).toBeGreaterThan(0);
  for (const k of jwks.keys) {
    // Public JWK only — the private exponent/primes must never be exposed.
    for (const priv of ["d", "p", "q", "dp", "dq", "qi"]) expect(k[priv], priv).toBeUndefined();
  }
});
