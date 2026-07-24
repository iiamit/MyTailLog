import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// The account-wide grant (0040, the default): after a client is authorized for
// "all my aircraft", an aircraft added LATER is visible to it WITHOUT re-consent.
// Fresh user + clean context so the state is deterministic.
const b64url = (b: Buffer) => b.toString("base64url");
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("account-wide grant: an aircraft added after consent appears without re-authorizing", async ({ browser, baseURL }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const email = `allac-${randomUUID().slice(0, 8)}@e2e.invalid`;
  const password = randomUUID();
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const userId = u.user!.id;
  const clientId = "e2e" + randomUUID().replace(/-/g, "");
  const redirectUri = `${baseURL}/oauth-e2e-callback`;
  await admin.from("oauth_client").insert({
    client_id: clientId,
    name: "All-Aircraft Test",
    redirect_uris: [redirectUri],
    scopes: ["openid", "airworthiness:read", "aircraft:read"],
    is_confidential: false,
    owner_id: userId,
  });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const laterAc = randomUUID();
  try {
    // Sign in.
    await page.goto("/login");
    await page.getByRole("button", { name: "Password" }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    // Authorize with the DEFAULT scope of sharing (account-wide) — don't touch
    // the picker, just Allow.
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    await page.goto(
      "/api/oidc/auth?" +
        new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          redirect_uri: redirectUri,
          scope: "openid airworthiness:read aircraft:read",
          code_challenge: challenge,
          code_challenge_method: "S256",
        }).toString(),
    );
    await expect(page.getByText(/All my aircraft/)).toBeVisible();
    await page.getByRole("button", { name: /allow access/i }).click();
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/, { timeout: 15_000 });
    const code = new URL(page.url()).searchParams.get("code")!;

    const tok = await page.request.post(`${baseURL}/api/oidc/token`, {
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
    });
    expect(tok.status(), await tok.text()).toBe(200);
    const authz = { headers: { authorization: `Bearer ${(await tok.json()).access_token}` } };

    // It recorded an ACCOUNT-wide grant, not a per-aircraft one.
    const { data: acctGrant } = await admin
      .from("oauth_account_grant")
      .select("scopes")
      .eq("client_id", clientId)
      .eq("account_id", userId)
      .maybeSingle();
    expect(acctGrant, "oauth_account_grant row").toBeTruthy();

    // No aircraft yet → empty list.
    const empty = await page.request.get(`${baseURL}/api/v1/aircraft`, authz);
    expect((await empty.json()).aircraft).toEqual([]);

    // Add an aircraft AFTER consent.
    await admin.from("aircraft").insert({
      id: laterAc,
      owner_id: userId,
      tail_number: "NL" + laterAc.slice(0, 4).toUpperCase(),
      engine_serials: [],
      prop_serials: [],
    });

    // The SAME token now sees it — no re-authorization.
    const after = await page.request.get(`${baseURL}/api/v1/aircraft`, authz);
    expect(after.status()).toBe(200);
    const ids = ((await after.json()).aircraft as { id: string }[]).map((a) => a.id);
    expect(ids).toContain(laterAc);

    // And a scoped endpoint on the new aircraft is reachable (200, not 404).
    const air = await page.request.get(`${baseURL}/api/v1/aircraft/${laterAc}/airworthiness`, authz);
    expect(air.status()).toBe(200);
  } finally {
    await ctx.close();
    await admin.from("aircraft").delete().eq("id", laterAc);
    await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_account_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_client").delete().eq("client_id", clientId);
    await admin.auth.admin.deleteUser(userId);
  }
});
