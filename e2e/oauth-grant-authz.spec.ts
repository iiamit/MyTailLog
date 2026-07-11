import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";

// Object-level authorization on the OAuth grant (security review O1/O2/O3): the
// per-aircraft grant is the Resource Server's whole authz boundary, and the RS
// reads with a service client that bypasses RLS — so the grant MUST be tied to
// aircraft the consenter actually owns, at both write and read time.
const b64url = (b: Buffer) => b.toString("base64url");
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("RLS blocks granting OAuth access to an aircraft you don't own (O1/O3)", async ({ baseURL }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"));
  const email = env("TEST_USER_EMAIL");
  const { data: attacker } = await admin.from("profile").select("id").eq("email", email).single();
  const attackerId = attacker!.id;

  // A victim user + a real aircraft they own (NOT the attacker).
  const { data: vu } = await admin.auth.admin.createUser({
    email: `victim-${randomUUID().slice(0, 8)}@e2e.invalid`,
    password: randomUUID(),
    email_confirm: true,
  });
  const victimId = vu.user!.id;
  const victimAc = randomUUID();
  const ownAc = randomUUID();
  await admin.from("aircraft").insert([
    { id: victimAc, owner_id: victimId, tail_number: "NX" + victimAc.slice(0, 4).toUpperCase(), engine_serials: [], prop_serials: [] },
    { id: ownAc, owner_id: attackerId, tail_number: "NO" + ownAc.slice(0, 4).toUpperCase(), engine_serials: [], prop_serials: [] },
  ]);
  const clientId = "e2e" + randomUUID().replace(/-/g, "");
  await admin.from("oauth_client").insert({
    client_id: clientId, name: "Attacker", redirect_uris: [`${baseURL}/cb`],
    scopes: ["airworthiness:read"], is_confidential: false, owner_id: attackerId,
  });

  try {
    // Attacker acting as THEMSELVES (RLS applies).
    const attackerDb = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_ANON_KEY"));
    const { error: signInErr } = await attackerDb.auth.signInWithPassword({ email, password: env("TEST_USER_PASSWORD") });
    expect(signInErr, "attacker sign-in").toBeFalsy();

    // INSERT a grant for the victim's aircraft → must be rejected.
    const badInsert = await attackerDb.from("oauth_aircraft_grant").insert({
      account_id: attackerId, client_id: clientId, aircraft_id: victimAc, scopes: ["airworthiness:read"],
    });
    expect(badInsert.error, "RLS must block granting a non-owned aircraft").toBeTruthy();

    // A grant on an OWNED aircraft is allowed…
    const okInsert = await attackerDb.from("oauth_aircraft_grant").insert({
      account_id: attackerId, client_id: clientId, aircraft_id: ownAc, scopes: ["airworthiness:read"],
    });
    expect(okInsert.error, "granting an owned aircraft should succeed").toBeFalsy();

    // …but repointing it at the victim's aircraft via UPDATE must be rejected (O3).
    const badUpdate = await attackerDb
      .from("oauth_aircraft_grant")
      .update({ aircraft_id: victimAc })
      .eq("client_id", clientId)
      .eq("aircraft_id", ownAc);
    expect(badUpdate.error, "RLS must block repointing a grant to a non-owned aircraft").toBeTruthy();
  } finally {
    await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_client").delete().eq("client_id", clientId);
    await admin.from("aircraft").delete().in("id", [victimAc, ownAc]);
    await admin.auth.admin.deleteUser(victimId);
  }
});

test("Resource Server drops a grant once the account no longer owns the aircraft (O2)", async ({ page, scratch, baseURL }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"));
  const { data: attacker } = await admin.from("profile").select("id").eq("email", env("TEST_USER_EMAIL")).single();
  const attackerId = attacker!.id;
  const clientId = "e2e" + randomUUID().replace(/-/g, "");
  const redirectUri = `${baseURL}/oauth-e2e-callback`;
  await admin.from("oauth_client").insert({
    client_id: clientId, name: "RS Owner Test", redirect_uris: [redirectUri],
    scopes: ["openid", "airworthiness:read"], is_confidential: false, owner_id: attackerId,
  });
  let newOwnerId: string | null = null;

  try {
    // Grant the owned scratch aircraft, get a token.
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    await page.goto(
      "/api/oidc/auth?" +
        new URLSearchParams({
          client_id: clientId, response_type: "code", redirect_uri: redirectUri,
          scope: "openid airworthiness:read", code_challenge: challenge, code_challenge_method: "S256",
        }).toString(),
    );
    await page.getByRole("button", { name: /allow access/i }).click();
    await page.waitForURL(/\/oauth-e2e-callback\?.*code=/);
    const code = new URL(page.url()).searchParams.get("code")!;
    const tok = await page.request.post(`${baseURL}/api/oidc/token`, {
      form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier },
    });
    expect(tok.status(), await tok.text()).toBe(200);
    const authz = { headers: { authorization: `Bearer ${(await tok.json()).access_token}` } };

    // While the account owns it → 200.
    expect((await page.request.get(`${baseURL}/api/v1/aircraft/${scratch.id}/airworthiness`, authz)).status()).toBe(200);

    // Simulate an ownership transfer AWAY from the token's account.
    const { data: tu } = await admin.auth.admin.createUser({
      email: `newowner-${randomUUID().slice(0, 8)}@e2e.invalid`, password: randomUUID(), email_confirm: true,
    });
    newOwnerId = tu.user!.id;
    await admin.from("aircraft").update({ owner_id: newOwnerId }).eq("id", scratch.id);

    // The grant row still exists, but the RS re-checks live ownership → 404 + dropped from the list.
    expect((await page.request.get(`${baseURL}/api/v1/aircraft/${scratch.id}/airworthiness`, authz)).status()).toBe(404);
    const list = await page.request.get(`${baseURL}/api/v1/aircraft`, authz);
    const ids = ((await list.json()).aircraft as { id: string }[]).map((a) => a.id);
    expect(ids).not.toContain(scratch.id);
  } finally {
    await admin.from("oauth_aircraft_grant").delete().eq("client_id", clientId);
    await admin.from("oauth_client").delete().eq("client_id", clientId);
    await admin.from("aircraft").update({ owner_id: attackerId }).eq("id", scratch.id); // restore for scratch teardown
    if (newOwnerId) await admin.auth.admin.deleteUser(newOwnerId);
  }
});
