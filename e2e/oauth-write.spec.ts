import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Page, APIRequestContext } from "@playwright/test";

// The hours:write endpoint (MyFlightBook → MyTailLog hobbs/tach push): the first
// WRITE scope on the API. Registers a confidential client, runs the full
// authorize→consent→token handshake over HTTP, then exercises the write:
// push lands + is idempotent, a read-only token is rejected, bad input is 400.

const b64url = (b: Buffer) => b.toString("base64url");
const REDIRECT = "https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir";
const basic = (id: string, sec: string) => "Basic " + Buffer.from(`${id}:${sec}`).toString("base64");

// Register a confidential client with `dataScopes`, run the handshake, return a token.
async function connect(
  page: Page,
  scratchId: string,
  dataScopes: string[],
  baseURL: string,
): Promise<{ clientId: string; accessToken: string }> {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const appName = "Write E2E " + randomUUID().slice(0, 8);
  await page.goto("/developers");
  await page.fill('input[name="name"]', appName);
  await page.fill('textarea[name="redirect_uris"]', REDIRECT);
  for (const s of dataScopes) await page.check(`input[name="scopes"][value="${s}"]`);
  await page.check('input[name="offline_access"]');
  await page.check('input[name="confidential"]');
  await page.getByRole("button", { name: /register app/i }).click();
  const secret = (await page.getByTestId("client-secret").innerText()).trim();
  const { data: client } = await admin.from("oauth_client").select("client_id").eq("name", appName).maybeSingle();
  const clientId = (client as unknown as { client_id: string }).client_id;

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const scope = ["openid", ...dataScopes, "offline_access"].join(" ");
  const authRes = await page.request.get(
    "/api/oidc/auth?" +
      new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        redirect_uri: REDIRECT,
        scope,
        code_challenge: challenge,
        code_challenge_method: "S256",
        prompt: "consent",
      }).toString(),
    { maxRedirects: 0 },
  );
  const uid = authRes.headers()["location"]!.split("?")[0].split("/").filter(Boolean).pop()!;
  const decideRes = await page.request.post(`/oauth/consent/${uid}/decide`, {
    maxRedirects: 0,
    form: { decision: "approve", aircraft: scratchId },
  });
  let loc: string | undefined = decideRes.headers()["location"];
  let code: string | null = null;
  for (let i = 0; i < 6 && loc; i++) {
    const abs: string = loc.startsWith("http") ? loc : new URL(loc, baseURL).toString();
    if (abs.includes("developer.myflightbook.com")) {
      code = new URL(abs).searchParams.get("code");
      break;
    }
    loc = (await page.request.get(abs, { maxRedirects: 0 })).headers()["location"];
  }
  const tokenRes = await page.request.post(`/api/oidc/token`, {
    headers: { authorization: basic(clientId, secret) },
    form: { grant_type: "authorization_code", code: code!, redirect_uri: REDIRECT, code_verifier: verifier },
  });
  const tok = await tokenRes.json();
  return { clientId, accessToken: tok.access_token };
}

const push = (req: APIRequestContext, token: string, id: string, body: unknown) =>
  req.post(`/api/v1/aircraft/${id}/hours`, { headers: { authorization: `Bearer ${token}` }, data: body });

test("hours:write — push a reading; it lands, is idempotent, and drives current hours", async ({
  page,
  scratch,
  baseURL,
}) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const clientIds: string[] = [];
  try {
    const { clientId, accessToken } = await connect(page, scratch.id, ["hours:read", "hours:write"], baseURL!);
    clientIds.push(clientId);

    const reading = { hobbs: 947.7, tach: 4141.6, reading_date: "2026-07-14", external_ref: "mfb-flt-1" };
    const w1 = await push(page.request, accessToken, scratch.id, reading);
    expect(w1.status(), await w1.text()).toBe(201);
    expect((await w1.json()).readings[0].tach).toBe(4141.6);

    // Idempotent: same external_ref → one row, not two.
    expect((await push(page.request, accessToken, scratch.id, reading)).status()).toBe(201);

    // Batch: hobbs and tach from DIFFERENT flights (own date + ref) in one call.
    const batch = await push(page.request, accessToken, scratch.id, {
      readings: [
        { hobbs: 950.0, reading_date: "2026-07-16", external_ref: "mfb-flt-2" },
        { tach: 4145.0, reading_date: "2026-07-13", external_ref: "mfb-flt-3" },
      ],
    });
    expect(batch.status(), await batch.text()).toBe(201);
    expect((await batch.json()).readings.length).toBe(2);

    const body = await (
      await page.request.get(`/api/v1/aircraft/${scratch.id}/hours`, {
        headers: { authorization: `Bearer ${accessToken}` },
      })
    ).json();
    const tachRows = (body.readings as { tach: number | null }[]).filter((r) => r.tach === 4141.6);
    expect(tachRows.length, "re-push must not duplicate").toBe(1);
    // Reconciliation fields exposed; current hobbs = latest by date (950.0 @ 07-16).
    expect(body.current_tach.value).not.toBeNull();
    expect(body.current_hobbs.value).toBe(950.0);
    expect(body.current_hobbs).toHaveProperty("estimated");

    // Same external_ref for both meters (same flight) → merged into ONE row with
    // BOTH values, not last-write-wins that drops the earlier meter (Eric's bug).
    const merged = await push(page.request, accessToken, scratch.id, {
      readings: [
        { hobbs: 955.5, reading_date: "2026-07-17", external_ref: "mfb-flt-merge" },
        { tach: 4150.0, reading_date: "2026-07-17", external_ref: "mfb-flt-merge" },
      ],
    });
    expect(merged.status(), await merged.text()).toBe(201);
    const mergedRows = (await merged.json()).readings as { hobbs: number | null; tach: number | null }[];
    expect(mergedRows.length, "one merged row").toBe(1);
    expect(mergedRows[0].hobbs).toBe(955.5);
    expect(mergedRows[0].tach).toBe(4150.0);

    // A later hobbs-only push on the same ref must NOT null the stored tach.
    const hobbsOnly = await push(page.request, accessToken, scratch.id, {
      hobbs: 956.0,
      reading_date: "2026-07-17",
      external_ref: "mfb-flt-merge",
    });
    expect(hobbsOnly.status(), await hobbsOnly.text()).toBe(201);
    const kept = (await hobbsOnly.json()).readings[0] as { hobbs: number | null; tach: number | null };
    expect(kept.hobbs).toBe(956.0);
    expect(kept.tach, "tach preserved across a hobbs-only update").toBe(4150.0);
  } finally {
    // hours_reading rows cascade when the scratch fixture deletes the aircraft.
    for (const id of clientIds) {
      await admin.from("oauth_aircraft_grant").delete().eq("client_id", id);
      await admin.from("oauth_client").delete().eq("client_id", id);
    }
  }
});

test("hours:write — a read-only token is rejected (403), bad input is 400", async ({ page, scratch, baseURL }) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const clientIds: string[] = [];
  try {
    // Read-only grant → 403 on write.
    const ro = await connect(page, scratch.id, ["hours:read"], baseURL!);
    clientIds.push(ro.clientId);
    const denied = await push(page.request, ro.accessToken, scratch.id, { hobbs: 100 });
    expect(denied.status(), "read-only token must not write").toBe(403);

    // Write grant, but malformed bodies → 400.
    const rw = await connect(page, scratch.id, ["hours:write"], baseURL!);
    clientIds.push(rw.clientId);
    expect((await push(page.request, rw.accessToken, scratch.id, {})).status()).toBe(400); // no meter
    expect((await push(page.request, rw.accessToken, scratch.id, { hobbs: -5 })).status()).toBe(400); // negative
  } finally {
    for (const id of clientIds) {
      await admin.from("oauth_aircraft_grant").delete().eq("client_id", id);
      await admin.from("oauth_client").delete().eq("client_id", id);
    }
  }
});
