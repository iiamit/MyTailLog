import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// Reported by MFB: a brand-new account (no aircraft yet) could not authorize a
// client — clicking "Allow access" redirected with error=access_denied. Consent
// should complete, and the API should just return empty results until an
// aircraft is added. Uses a FRESH user (owns nothing) in a clean browser context
// so the "no aircraft" state is deterministic regardless of other specs.
const b64url = (b: Buffer) => b.toString("base64url");
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("OAuth consent completes for an account with no aircraft (empty API results)", async ({ browser, baseURL }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const email = `noac-${randomUUID().slice(0, 8)}@e2e.invalid`;
  const password = randomUUID();
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = u.user!.id;
  const clientId = "e2e" + randomUUID().replace(/-/g, "");
  const redirectUri = `${baseURL}/oauth-e2e-callback`;
  await admin.from("oauth_client").insert({
    client_id: clientId,
    name: "No-Aircraft Test",
    redirect_uris: [redirectUri],
    scopes: ["openid", "airworthiness:read"],
    is_confidential: false,
    owner_id: userId,
  });

  const ctx = await browser.newContext(); // clean, unauthenticated
  const page = await ctx.newPage();
  try {
    // Sign in as the fresh (aircraft-less) user.
    await page.goto("/login");
    await page.getByRole("button", { name: "Password" }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    // Authorize (code + PKCE).
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    await page.goto(
      "/api/oidc/auth?" +
        new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          redirect_uri: redirectUri,
          scope: "openid airworthiness:read",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }).toString(),
    );

    // The consent screen loads with the (default account-wide) picker — allow.
    await expect(page.getByText(/All my aircraft/)).toBeVisible();
    await page.getByRole("button", { name: "Allow access" }).click();

    // It COMPLETES with an auth code (previously: error=access_denied).
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/, { timeout: 15_000 });
    const code = new URL(page.url()).searchParams.get("code")!;

    // Exchange for a token and call the API → an empty aircraft list, not an error.
    const tok = await page.request.post(`${baseURL}/api/oidc/token`, {
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
    });
    expect(tok.status(), await tok.text()).toBe(200);
    const accessToken = (await tok.json()).access_token as string;
    const list = await page.request.get(`${baseURL}/api/v1/aircraft`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(list.status()).toBe(200);
    expect((await list.json()).aircraft).toEqual([]);
  } finally {
    await ctx.close();
    await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_client").delete().eq("client_id", clientId);
    await admin.auth.admin.deleteUser(userId);
  }
});
