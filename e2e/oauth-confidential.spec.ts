import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// Confidential clients (P4): the portal issues a client secret, and the token
// endpoint requires it (HTTP Basic). Registers a confidential app through the
// portal UI, runs the full auth-code + PKCE flow, and exchanges the code with
// the secret — then proves a wrong secret is rejected.
const b64url = (b: Buffer) => b.toString("base64url");

test("confidential client: portal secret authenticates the token endpoint", async ({ page, scratch, baseURL }) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const appName = "Confidential E2E " + randomUUID().slice(0, 8);
  const redirectUri = `${baseURL}/oauth-e2e-callback`;
  let clientId: string | null = null;

  try {
    // Register a CONFIDENTIAL app via the portal and capture its secret.
    await page.goto("/developers");
    await page.fill('input[name="name"]', appName);
    await page.fill('textarea[name="redirect_uris"]', redirectUri);
    await page.check('input[name="scopes"][value="airworthiness:read"]');
    await page.check('input[name="confidential"]');
    await page.getByRole("button", { name: /register app/i }).click();

    const secret = (await page.getByTestId("client-secret").innerText()).trim();
    expect(secret.length).toBeGreaterThan(20);
    const { data } = await admin
      .from("oauth_client")
      .select("client_id, is_confidential")
      .eq("name", appName)
      .maybeSingle();
    expect(data?.is_confidential).toBe(true);
    clientId = data!.client_id;

    // Authorize → consent (grant only A) → code.
    const authorize = async () => {
      const verifier = b64url(randomBytes(32));
      const challenge = b64url(createHash("sha256").update(verifier).digest());
      await page.goto(
        "/api/oidc/auth?" +
          new URLSearchParams({
            client_id: clientId!, response_type: "code", redirect_uri: redirectUri,
            scope: "openid airworthiness:read", code_challenge: challenge, code_challenge_method: "S256",
          }).toString(),
      );
      return verifier;
    };

    const verifier = await authorize();
    await expect(page.getByRole("heading", { name: /wants to read your aircraft data/i })).toBeVisible();
    const boxes = page.locator('input[name="aircraft"]');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).uncheck();
    await page.locator(`label:has-text("${scratch.tail}") input[name="aircraft"]`).check();
    await page.getByRole("button", { name: /allow access/i }).click();
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/);
    const code = new URL(page.url()).searchParams.get("code")!;

    // Exchange with the correct secret (HTTP Basic) + PKCE → 200.
    const basic = (id: string, sec: string) => "Basic " + Buffer.from(`${id}:${sec}`).toString("base64");
    const ok = await page.request.post(`${baseURL}/api/oidc/token`, {
      headers: { authorization: basic(clientId!, secret) },
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier },
    });
    expect(ok.status(), await ok.text()).toBe(200);
    expect((await ok.json()).access_token).toBeTruthy();

    // A second code (consent now skipped — session+grant exist) exchanged with a
    // WRONG secret must be rejected: client authentication is enforced.
    const verifier2 = await authorize();
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/);
    const code2 = new URL(page.url()).searchParams.get("code")!;
    const bad = await page.request.post(`${baseURL}/api/oidc/token`, {
      headers: { authorization: basic(clientId!, "wrong-secret") },
      form: { grant_type: "authorization_code", code: code2, redirect_uri: redirectUri, code_verifier: verifier2 },
    });
    expect(bad.status()).toBe(401);
  } finally {
    if (clientId) {
      await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
      await admin.from("oauth_client").delete().eq("client_id", clientId);
    } else {
      await admin.from("oauth_client").delete().eq("name", appName);
    }
  }
});
