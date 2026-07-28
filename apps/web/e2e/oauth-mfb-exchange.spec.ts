import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// Reproduces MyFlightBook's exact OAuth handshake end-to-end (the partner-
// onboarding flow from Eric's email): a CONFIDENTIAL client registered with the
// real developer.myflightbook.com redirect URI and the full scope set, PKCE
// (S256) + offline_access → authorize → consent (Allow, share the scratch
// aircraft) → code → token exchange (HTTP Basic + code_verifier) → access_token
// + refresh_token → live /api/v1 calls → refresh grant.
//
// The flow is driven over HTTP (page.request), following the redirect chain by
// hand with maxRedirects:0 so the external MFB redirect never leaves the harness
// — and so the token/consent hops are asserted deterministically (no reliance on
// browser navigation to a third-party host). The consent DECIDE + resume hops
// are the exact chain that was in question during onboarding.

const b64url = (b: Buffer) => b.toString("base64url");
const MFB_REDIRECT = "https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir";
const DATA_SCOPES = ["airworthiness:read", "aircraft:read", "equipment:read", "hours:read", "oil:read", "weightbalance:read"];
const basic = (id: string, sec: string) => "Basic " + Buffer.from(`${id}:${sec}`).toString("base64");

test("MyFlightBook full OAuth exchange: authorize → consent → token → API → refresh", async ({ page, scratch, baseURL }) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const appName = "MFB E2E " + randomUUID().slice(0, 8);
  let clientId: string | null = null;

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
    expect(client!.scopes).toEqual(expect.arrayContaining(["openid", "offline_access", ...DATA_SCOPES]));

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

    const authRes = await page.request.get(authorizeUrl, { maxRedirects: 0 });
    expect([302, 303], `authorize status=${authRes.status()} body=${(await authRes.text()).slice(0, 200)}`).toContain(
      authRes.status(),
    );
    const consentLoc = authRes.headers()["location"]!;
    expect(consentLoc, `authorize must redirect to consent, got: ${consentLoc}`).toContain("/oauth/consent/");
    const uid = consentLoc.split("?")[0].split("/").filter(Boolean).pop()!;

    // 3) Approve consent (share ONLY the scratch aircraft) via the decide handler —
    //    the same chain a real browser click drives (interactionFinished → resume).
    const decideRes = await page.request.post(`/oauth/consent/${uid}/decide`, {
      maxRedirects: 0,
      form: { decision: "approve", aircraft: scratch.id },
    });
    expect([302, 303], `decide status=${decideRes.status()} body=${(await decideRes.text()).slice(0, 200)}`).toContain(
      decideRes.status(),
    );

    // 4) Follow the redirect chain by hand (nothing leaves the harness) until the
    //    MFB redirect URI is reached with a ?code — exactly what MyTailLogRedir sees.
    let loc: string | undefined = decideRes.headers()["location"];
    let code: string | null = null;
    for (let i = 0; i < 6 && loc; i++) {
      const abs: string = loc.startsWith("http") ? loc : new URL(loc, baseURL!).toString();
      if (abs.includes("developer.myflightbook.com")) {
        code = new URL(abs).searchParams.get("code");
        break;
      }
      const hop = await page.request.get(abs, { maxRedirects: 0 });
      loc = hop.headers()["location"];
    }
    expect(code, "consent → resume must redirect to the MFB URI with a code").toBeTruthy();

    // 5) Token exchange — confidential client auth (HTTP Basic) + PKCE verifier.
    const tokenRes = await page.request.post(`/api/oidc/token`, {
      headers: { authorization: basic(clientId!, secret) },
      form: { grant_type: "authorization_code", code: code!, redirect_uri: MFB_REDIRECT, code_verifier: verifier },
    });
    expect(tokenRes.status(), await tokenRes.text()).toBe(200);
    const tok = await tokenRes.json();
    expect(tok.access_token).toBeTruthy();
    expect(tok.token_type).toBe("Bearer");
    expect(tok.refresh_token, "offline_access must yield a refresh token").toBeTruthy();

    // 6) Use the access token against the real Resource Server.
    const list = await page.request.get(`/api/v1/aircraft`, { headers: { authorization: `Bearer ${tok.access_token}` } });
    expect(list.status(), await list.text()).toBe(200);
    const tails = ((await list.json()).aircraft as { tail_number: string }[]).map((a) => a.tail_number);
    expect(tails).toContain(scratch.tail);

    const aw = await page.request.get(`/api/v1/aircraft/${scratch.id}/airworthiness`, {
      headers: { authorization: `Bearer ${tok.access_token}` },
    });
    expect(aw.status(), await aw.text()).toBe(200);
    expect((await aw.json()).aircraft_id).toBe(scratch.id);

    // 7) Refresh grant → a fresh access token that still reaches the API.
    const refreshRes = await page.request.post(`/api/oidc/token`, {
      headers: { authorization: basic(clientId!, secret) },
      form: { grant_type: "refresh_token", refresh_token: tok.refresh_token },
    });
    expect(refreshRes.status(), await refreshRes.text()).toBe(200);
    const refreshed = await refreshRes.json();
    expect(refreshed.access_token).toBeTruthy();

    const list2 = await page.request.get(`/api/v1/aircraft`, {
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

// REGRESSION for the CSP form-action bug: the consent flow is a form navigation
// whose redirect chain ends at the client's registered redirect URI, and browsers
// enforce form-action across the WHOLE chain. page.request (the exchange test
// above) does NOT enforce CSP, so only a real browser click catches this. Cover
// BOTH allowed redirect shapes — an external https client AND an http://localhost
// loopback client (the local dev / test-harness case) — since the CSP must allow
// each exactly as developers/actions.ts validates them.
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const redirectUri of [MFB_REDIRECT, "http://localhost:8788/callback"]) {
  const host = new URL(redirectUri).host; // developer.myflightbook.com | localhost:8788
  const hostRe = new RegExp(escapeRe(host));

  test(`consent form submission is not blocked by CSP (redirect to ${host})`, async ({ page, scratch }) => {
    const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
    const appName = "CSP E2E " + randomUUID().slice(0, 8);
    let clientId: string | null = null;

    const cspViolations: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/content security policy/i.test(t) && /form-action/i.test(t)) cspViolations.push(t);
    });
    // Keep the redirect target off the network — fulfil it with a stub.
    await page.route(hostRe, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<html>stub</html>" }));

    try {
      await page.goto("/developers");
      await page.fill('input[name="name"]', appName);
      await page.fill('textarea[name="redirect_uris"]', redirectUri);
      await page.check('input[name="scopes"][value="airworthiness:read"]');
      await page.check('input[name="offline_access"]');
      await page.check('input[name="confidential"]');
      await page.getByRole("button", { name: /register app/i }).click();
      await page.getByTestId("client-secret").innerText();
      const { data: client } = await admin.from("oauth_client").select("client_id").eq("name", appName).maybeSingle();
      clientId = client!.client_id;

      // Authorize over HTTP to mint the interaction (+ cookies in the shared jar),
      // then render the consent page directly — avoids the flaky authorize nav.
      const verifier = b64url(randomBytes(32));
      const challenge = b64url(createHash("sha256").update(verifier).digest());
      const authRes = await page.request.get(
        "/api/oidc/auth?" +
          new URLSearchParams({
            client_id: clientId!,
            response_type: "code",
            redirect_uri: redirectUri,
            scope: "openid airworthiness:read offline_access",
            code_challenge: challenge,
            code_challenge_method: "S256",
            prompt: "consent",
          }).toString(),
        { maxRedirects: 0 },
      );
      const uid = authRes.headers()["location"]!.split("?")[0].split("/").filter(Boolean).pop()!;

      await page.goto(`/oauth/consent/${uid}`);
      await expect(page.getByRole("heading", { name: /wants to read your aircraft data/i })).toBeVisible();
      await page.getByRole("radio", { name: /only the aircraft i choose/i }).check();
      const boxes = page.locator('input[name="aircraft"]');
      for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).uncheck();
      await page.locator(`label:has-text("${scratch.tail}") input[name="aircraft"]`).check();

      // The REAL browser form submission → /decide → resume → client redirect.
      // CSP form-action is enforced across the whole chain; if it blocks, this never fires.
      const redirect = page.waitForRequest((req) => hostRe.test(req.url()) && req.url().includes("code="), {
        timeout: 15_000,
      });
      await page.getByRole("button", { name: /allow access/i }).click();
      const code = new URL((await redirect).url()).searchParams.get("code");

      expect(cspViolations, `CSP blocked the consent form:\n${cspViolations.join("\n")}`).toHaveLength(0);
      expect(code, `consent form must redirect to ${host} with a code`).toBeTruthy();
    } finally {
      if (clientId) {
        await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
        await admin.from("oauth_client").delete().eq("client_id", clientId);
      } else {
        await admin.from("oauth_client").delete().eq("name", appName);
      }
    }
  });
}
