import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// Reproduces MyFlightBook's exact OAuth handshake end-to-end (the partner-
// onboarding flow from Eric's email): a CONFIDENTIAL client registered with the
// real developer.myflightbook.com redirect URI and the full scope set, PKCE
// (S256) + offline_access → authorize → consent → code → token exchange (HTTP
// Basic) → access_token + refresh_token → a live /api/v1 call → refresh grant.
//
// The external redirect never hits the network — page.route fulfils it with a
// stub so the browser "lands" on developer.myflightbook.com and we read ?code,
// exactly as MFB's MyTailLogRedir controller would.

const b64url = (b: Buffer) => b.toString("base64url");
const MFB_REDIRECT = "https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir";
const DATA_SCOPES = ["airworthiness:read", "aircraft:read", "equipment:read", "hours:read", "oil:read", "weightbalance:read"];
const basic = (id: string, sec: string) => "Basic " + Buffer.from(`${id}:${sec}`).toString("base64");

test("MyFlightBook full OAuth exchange: authorize → consent → token → API → refresh", async ({ page, scratch, baseURL }) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const appName = "MFB E2E " + randomUUID().slice(0, 8);
  let clientId: string | null = null;

  // Keep the external redirect OFF the network — fulfil any request to MFB's dev
  // host with a stub so the browser lands there and we can read the ?code.
  await page.route(/developer\.myflightbook\.com/, (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<html>MFB redirect stub</html>" }),
  );

  try {
    // 1) Register the confidential client via the /developers portal, exactly as
    //    Eric would: MFB dev redirect URI, all six data scopes + offline_access.
    await page.goto("/developers");
    await page.fill('input[name="name"]', appName);
    await page.fill('textarea[name="redirect_uris"]', MFB_REDIRECT);
    for (const s of DATA_SCOPES) await page.check(`input[name="scopes"][value="${s}"]`);
    await page.check('input[name="offline_access"]');
    await page.check('input[name="confidential"]');
    await page.getByRole("button", { name: /register app/i }).click();

    const secret = (await page.getByTestId("client-secret").innerText()).trim();
    expect(secret.length).toBeGreaterThan(20);
    const { data: client } = await admin
      .from("oauth_client")
      .select("client_id, is_confidential, scopes")
      .eq("name", appName)
      .maybeSingle();
    clientId = client!.client_id;
    expect(client!.is_confidential).toBe(true);
    expect(client!.scopes).toContain("offline_access");

    // 2) Authorize with PKCE (S256) + the full scope string incl. offline_access.
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const scope = ["openid", ...DATA_SCOPES, "offline_access"].join(" ");
    const authorizeUrl =
      "/api/oidc/auth?" +
      new URLSearchParams({
        client_id: clientId!,
        response_type: "code",
        redirect_uri: MFB_REDIRECT,
        scope,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "consent",
      }).toString();

    // DIAGNOSTIC: what does authorize actually return (status + Location + body)?
    const probe = await page.request.get(authorizeUrl, { maxRedirects: 0 });
    const loc = probe.headers()["location"] ?? "(no location header)";
    const bodyStart = (await probe.text()).replace(/\s+/g, " ").slice(0, 400);
    expect(
      loc,
      `authorize → status=${probe.status()} location=${loc} body="${bodyStart}"`,
    ).toContain("/oauth/consent/");

    await page.goto(authorizeUrl);

    // 3) Consent screen → share ONLY the scratch aircraft → Allow access.
    await expect(page.getByRole("heading", { name: /wants to read your aircraft data/i })).toBeVisible();
    const boxes = page.locator('input[name="aircraft"]');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).uncheck();
    await page.locator(`label:has-text("${scratch.tail}") input[name="aircraft"]`).check();

    const redirectReq = page.waitForRequest(/developer\.myflightbook\.com.*code=/);
    await page.getByRole("button", { name: /allow access/i }).click();
    const code = new URL((await redirectReq).url()).searchParams.get("code");
    expect(code, "authorize must redirect back to the MFB URI with a code").toBeTruthy();

    // 4) Token exchange — confidential client auth (HTTP Basic) + PKCE verifier.
    const tokenRes = await page.request.post(`${baseURL}/api/oidc/token`, {
      headers: { authorization: basic(clientId!, secret) },
      form: { grant_type: "authorization_code", code: code!, redirect_uri: MFB_REDIRECT, code_verifier: verifier },
    });
    expect(tokenRes.status(), await tokenRes.text()).toBe(200);
    const tok = await tokenRes.json();
    expect(tok.access_token).toBeTruthy();
    expect(tok.token_type).toBe("Bearer");
    expect(tok.refresh_token, "offline_access must yield a refresh token").toBeTruthy();

    // 5) Use the access token against the real Resource Server.
    const list = await page.request.get(`${baseURL}/api/v1/aircraft`, {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    expect(list.status(), await list.text()).toBe(200);
    const tails = ((await list.json()).aircraft as { tail_number: string }[]).map((a) => a.tail_number);
    expect(tails).toContain(scratch.tail);

    const aw = await page.request.get(`${baseURL}/api/v1/aircraft/${scratch.id}/airworthiness`, {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    expect(aw.status(), await aw.text()).toBe(200);
    expect((await aw.json()).aircraft_id).toBe(scratch.id);

    // 6) Refresh grant → a fresh access token that still reaches the API.
    const refreshRes = await page.request.post(`${baseURL}/api/oidc/token`, {
      headers: { authorization: basic(clientId!, secret) },
      form: { grant_type: "refresh_token", refresh_token: tok.refresh_token },
    });
    expect(refreshRes.status(), await refreshRes.text()).toBe(200);
    const refreshed = await refreshRes.json();
    expect(refreshed.access_token).toBeTruthy();

    const list2 = await page.request.get(`${baseURL}/api/v1/aircraft`, {
      headers: { authorization: `Bearer ${refreshed.access_token}` },
    });
    expect(list2.status()).toBe(200);
  } finally {
    if (clientId) {
      await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
      await admin.from("oauth_client").delete().eq("client_id", clientId);
    } else {
      await admin.from("oauth_client").delete().eq("name", appName);
    }
  }
});
