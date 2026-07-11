import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// End-to-end OAuth 2.1 authorization code + PKCE (P1c): register a public
// client, drive the browser through /auth → the consent screen → back with a
// code, then exchange it for an access token. Also asserts the per-aircraft
// grant (the Resource Server's authz boundary) was recorded.
const b64url = (buf: Buffer) => buf.toString("base64url");

test("authorize → consent → token: full authorization-code + PKCE flow", async ({ page, scratch, baseURL }) => {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SECRET_KEY;
  const email = process.env.TEST_USER_EMAIL;
  if (!url || !key || !email) throw new Error("oauth-flow needs TEST_SUPABASE_URL/_SECRET_KEY + TEST_USER_EMAIL");
  const admin = createClient(url, key);
  const { data: profile } = await admin.from("profile").select("id").eq("email", email).single();
  if (!profile) throw new Error(`no profile for ${email}`);

  const clientId = "e2e" + randomUUID().replace(/-/g, "");
  const redirectUri = `${baseURL}/oauth-e2e-callback`;
  const { error: ce } = await admin.from("oauth_client").insert({
    client_id: clientId,
    name: "E2E Test App",
    redirect_uris: [redirectUri],
    scopes: ["openid", "offline_access", "airworthiness:read", "aircraft:read"],
    is_confidential: false,
    owner_id: profile.id,
  });
  if (ce) throw new Error(`client insert failed: ${ce.message}`);

  try {
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const authUrl =
      "/api/oidc/auth?" +
      new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "openid airworthiness:read aircraft:read",
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();

    // /auth (no oidc session) → our consent screen.
    await page.goto(authUrl);
    await expect(page.getByRole("heading", { name: /wants to read your aircraft data/i })).toBeVisible();
    // The scratch aircraft (owned by the test user) is offered and checked.
    await expect(page.getByText(scratch.tail)).toBeVisible();

    await page.getByRole("button", { name: /allow access/i }).click();

    // Redirected back to the client's redirect_uri with an authorization code.
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/);
    const code = new URL(page.url()).searchParams.get("code");
    expect(code).toBeTruthy();

    // Exchange the code (public client → PKCE, no secret).
    const tok = await page.request.post(`${baseURL}/api/oidc/token`, {
      form: {
        grant_type: "authorization_code",
        code: code!,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
      },
    });
    expect(tok.status(), await tok.text()).toBe(200);
    const body = await tok.json();
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.access_token).toBe("string");

    // The per-aircraft consent row exists with the granted scope.
    const { data: grantRow } = await admin
      .from("oauth_aircraft_grant")
      .select("scopes")
      .eq("client_id", clientId)
      .eq("aircraft_id", scratch.id)
      .maybeSingle();
    expect(grantRow, "oauth_aircraft_grant row for the scratch aircraft").toBeTruthy();
    expect(grantRow!.scopes).toContain("airworthiness:read");
  } finally {
    await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_client").delete().eq("client_id", clientId);
  }
});
