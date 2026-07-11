import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// Resource Server (P2) — the security-critical invariant: a token granted
// aircraft A must NEVER return aircraft B, even though B exists (with data).
// Also checks missing-token → 401 and the aircraft list is grant-scoped.
const b64url = (b: Buffer) => b.toString("base64url");

test("resource server enforces token + per-aircraft grant boundary", async ({ page, scratch, baseURL }) => {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_SECRET_KEY;
  const email = process.env.TEST_USER_EMAIL;
  if (!url || !key || !email) throw new Error("needs TEST_SUPABASE_URL/_SECRET_KEY + TEST_USER_EMAIL");
  const admin = createClient(url, key);
  const { data: profile } = await admin.from("profile").select("id").eq("email", email).single();
  if (!profile) throw new Error(`no profile for ${email}`);

  // Aircraft B: a REAL aircraft (with an AD) the token will NOT be granted.
  const bId = randomUUID();
  const bTail = "NB" + bId.slice(0, 4).toUpperCase();
  await admin.from("aircraft").insert({
    id: bId, owner_id: profile.id, tail_number: bTail, make: "Piper", model: "PA28",
    engine_serials: [], prop_serials: [],
  });
  await admin.from("ad_compliance").insert({
    aircraft_id: bId, kind: "ad", reference: "AD-B-SECRET", title: "Should never leak",
    recurring: false, status: "open",
  });

  const clientId = "e2e" + randomUUID().replace(/-/g, "");
  const redirectUri = `${baseURL}/oauth-e2e-callback`;
  await admin.from("oauth_client").insert({
    client_id: clientId, name: "RS Test App", redirect_uris: [redirectUri],
    scopes: ["openid", "airworthiness:read", "aircraft:read"], is_confidential: false, owner_id: profile.id,
  });

  try {
    // --- authorize → consent (grant ONLY aircraft A) → token ---
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const authUrl =
      "/api/oidc/auth?" +
      new URLSearchParams({
        client_id: clientId, response_type: "code", redirect_uri: redirectUri,
        scope: "openid airworthiness:read aircraft:read",
        code_challenge: challenge, code_challenge_method: "S256",
      }).toString();

    await page.goto(authUrl);
    await expect(page.getByRole("heading", { name: /wants to read your aircraft data/i })).toBeVisible();
    // Grant only A: uncheck everything, then check the scratch aircraft's row.
    const boxes = page.locator('input[name="aircraft"]');
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).uncheck();
    await page.locator(`label:has-text("${scratch.tail}") input[name="aircraft"]`).check();
    await page.getByRole("button", { name: /allow access/i }).click();
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/);

    const code = new URL(page.url()).searchParams.get("code")!;
    const tokRes = await page.request.post(`${baseURL}/api/oidc/token`, {
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
    });
    expect(tokRes.status(), await tokRes.text()).toBe(200);
    const token = (await tokRes.json()).access_token as string;
    const authz = { headers: { authorization: `Bearer ${token}` } };

    // list is grant-scoped: A present, B absent
    const list = await page.request.get(`${baseURL}/api/v1/aircraft`, authz);
    expect(list.status()).toBe(200);
    const ids = ((await list.json()).aircraft as { id: string }[]).map((a) => a.id);
    expect(ids).toContain(scratch.id);
    expect(ids).not.toContain(bId);

    // A → 200 with a summary
    const aRes = await page.request.get(`${baseURL}/api/v1/aircraft/${scratch.id}/airworthiness`, authz);
    expect(aRes.status()).toBe(200);
    expect((await aRes.json()).summary).toBeTruthy();

    // B → 404, and its data must never appear in the body
    const bRes = await page.request.get(`${baseURL}/api/v1/aircraft/${bId}/airworthiness`, authz);
    expect(bRes.status()).toBe(404);
    expect(await bRes.text()).not.toContain("AD-B-SECRET");

    // no token → 401
    const noTok = await page.request.get(`${baseURL}/api/v1/aircraft/${scratch.id}/airworthiness`);
    expect(noTok.status()).toBe(401);
  } finally {
    await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_client").delete().eq("client_id", clientId);
    await admin.from("aircraft").delete().eq("id", bId);
  }
});
