import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// Developer portal (P3): RFC 8414 discovery responds, and a user can self-serve
// register → see → delete an OAuth app.
test("RFC8414 discovery + self-serve register/delete an OAuth app", async ({ page, baseURL, request }) => {
  const meta = await request.get("/.well-known/oauth-authorization-server");
  expect(meta.status()).toBe(200);
  const m = await meta.json();
  expect(m.issuer).toBe(`${baseURL}/api/oidc`);
  expect(m.code_challenge_methods_supported).toContain("S256");
  expect(m.token_endpoint).toBe(`${baseURL}/api/oidc/token`);

  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const appName = "Portal E2E App";
  let clientId: string | null = null;
  try {
    await page.goto("/developers");
    await expect(page.getByRole("heading", { name: "Developer API" })).toBeVisible();

    await page.fill('input[name="name"]', appName);
    await page.fill('textarea[name="redirect_uris"]', `${baseURL}/cb`);
    await page.check('input[name="scopes"][value="airworthiness:read"]');
    await page.getByRole("button", { name: /register app/i }).click();

    // client_id is surfaced, and the app shows in the list.
    await expect(page.getByText(/client_id/i)).toBeVisible();
    await expect(page.getByText(appName)).toBeVisible();

    // It persisted with exactly the requested config (+ implicit openid).
    const { data } = await admin
      .from("oauth_client")
      .select("client_id, redirect_uris, scopes, is_confidential")
      .eq("name", appName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(data).toBeTruthy();
    clientId = data!.client_id;
    expect(data!.redirect_uris).toContain(`${baseURL}/cb`);
    expect(data!.scopes).toEqual(expect.arrayContaining(["openid", "airworthiness:read"]));
    expect(data!.is_confidential).toBe(false);

    // Edit scopes: add hours:write to the existing client (the fix for clients
    // registered before a scope existed — no re-registration needed).
    const row = page.locator("li", { hasText: appName });
    await row.getByRole("button", { name: "Edit scopes" }).click();
    await row.locator('input[name="scopes"][value="hours:write"]').check();
    await row.getByRole("button", { name: "Save scopes" }).click();
    await expect.poll(async () => {
      const { data: after } = await admin.from("oauth_client").select("scopes").eq("client_id", clientId!).single();
      return after?.scopes ?? [];
    }).toEqual(expect.arrayContaining(["airworthiness:read", "hours:write"]));

    // Delete via the UI removes it.
    await page.locator("li", { hasText: appName }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(appName)).toHaveCount(0);
  } finally {
    if (clientId) await admin.from("oauth_client").delete().eq("client_id", clientId);
    else await admin.from("oauth_client").delete().eq("name", appName);
  }
});

// Redirect URIs are an exact allowlist — reject a non-https, non-localhost URI.
test("portal rejects an invalid redirect URI", async ({ page }) => {
  await page.goto("/developers");
  await page.fill('input[name="name"]', "Bad Redirect App");
  await page.fill('textarea[name="redirect_uris"]', "ftp://evil.example/cb");
  await page.check('input[name="scopes"][value="aircraft:read"]');
  await page.getByRole("button", { name: /register app/i }).click();
  await expect(page.getByText(/invalid redirect uri/i)).toBeVisible();
});
