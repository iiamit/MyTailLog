import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// ADS-B passive hours (WP5, migration 0048), end to end.
//
// There is no stubbed OpenSky client any more. The fetch moved to a GitHub
// Actions runner (OpenSky blackholes Google Cloud egress), so what OUR code
// still owns is the pair of endpoints the runner talks to — and those are what
// this exercises, with the spec standing in for the runner. That's a stronger
// test than the old one: it drives the real production path instead of a stub,
// and still never calls the live API or burns its credit bucket.
//
// Covers: opt-in is off by default → GET hands out legal queries for the
// opted-in aircraft → POST ingests flights (and refuses an opted-OUT one) → the
// reconciliation surfaces a suggestion → accepting it writes ONE adsb_estimate
// reading and silences the banner.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

const CRON_SECRET = "e2e-cron-secret"; // matches playwright.config.ts

test("adsb: opt in, sweep ingests flights, suggestion appears, accepting writes an estimate", async ({
  page,
  scratch,
  playwright,
}) => {
  // The cron sweeps every user in the TEST project (MFB sync + reminders +
  // ADS-B) before it returns, which is well past the 30s default.
  test.setTimeout(240_000);

  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  // --- Off by default -------------------------------------------------------
  await page.goto(`${scratch.path}/meters`);
  await expect(page.getByRole("heading", { name: "ADS-B passive hours" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on ADS-B checks" })).toBeVisible();
  // The limits are stated on the page itself, not buried in /help.
  await expect(page.getByText(/neither tach nor hobbs/i)).toBeVisible();

  // --- Opt in, with the hex entered by hand (the escape hatch — no live
  //     registry/adsbdb lookup in CI) --------------------------------------
  await page.getByLabel("Mode S address (optional)").fill("a12239");
  await page.getByRole("button", { name: "Turn on ADS-B checks" }).click();
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("aircraft")
          .select("adsb_enabled, icao24")
          .eq("id", scratch.id)
          .single();
        return data;
      },
      { timeout: 15_000 },
    )
    .toMatchObject({ adsb_enabled: true, icao24: "a12239" });

  // A recorded reading BEFORE the stubbed flights, so they are genuinely
  // uncovered and the reconciliation has a base tach to count from.
  const old = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
  await admin.from("hours_reading").insert({
    aircraft_id: scratch.id,
    reading_date: old,
    tach: 1234.5,
    source: "manual",
    external_ref: `e2e-${scratch.id}`,
  });

  // --- The sweep ------------------------------------------------------------
  // TRAP: a request context inherits the project's signed-in storageState.
  // Cron auth is a Bearer secret, so force a genuinely anonymous context.
  const anon = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });

  // 90 minutes ending 26h ago, and 66 minutes ending 2h ago — both after the
  // recorded reading above, so both are genuinely uncovered.
  const hoursAgo = (h: number) => Math.floor(Date.now() / 1000) - h * 3600;
  const observed = [
    { firstSeen: hoursAgo(26), lastSeen: hoursAgo(26) + 90 * 60 },
    { firstSeen: hoursAgo(2), lastSeen: hoursAgo(2) + 66 * 60 },
  ].map((f) => ({ ...f, aircraft_id: scratch.id, icao24: "a12239" }));

  try {
    for (const method of ["get", "post"] as const) {
      const denied = await anon[method]("/api/cron/adsb", {
        headers: { authorization: "Bearer wrong-secret" },
      });
      expect(denied.status(), `${method.toUpperCase()} must reject a bad secret`).toBe(401);
    }

    // GET hands out the queries the runner should execute.
    const plan = await anon.get("/api/cron/adsb", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      timeout: 60_000,
    });
    expect(plan.ok(), `GET /api/cron/adsb failed: ${plan.status()}`).toBeTruthy();
    const { queries } = await plan.json();
    const mine = queries.filter((q: { aircraft_id: string }) => q.aircraft_id === scratch.id);
    expect(mine.length, "the opted-in aircraft must be in the sweep").toBeGreaterThan(0);
    expect(mine.every((q: { icao24: string }) => q.icao24 === "a12239")).toBe(true);
    // Every window handed out must be legal: at most 2 UTC calendar days.
    const DAY = 86_400;
    for (const q of mine as { begin: number; end: number }[]) {
      expect(Math.floor(q.end / DAY) - Math.floor(q.begin / DAY) + 1).toBeLessThanOrEqual(2);
    }

    const res = await anon.post("/api/cron/adsb", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      data: { flights: observed },
      timeout: 60_000,
    });
    expect(res.ok(), `POST /api/cron/adsb failed: ${res.status()}`).toBeTruthy();
    expect((await res.json()).ingested).toBe(2);

    // Re-posting the same flights writes nothing: idempotent on
    // (aircraft_id, first_seen). The daily sweep's 3-day lookback re-sends the
    // same flights every run, so `ingested` must count what the DB actually
    // inserted — not what we handed it.
    const again = await anon.post("/api/cron/adsb", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      data: { flights: observed },
      timeout: 60_000,
    });
    const repeat = await again.json();
    expect(repeat.ingested, "re-posting must insert nothing").toBe(0);
    expect(repeat.received, "…but the rows are still accepted and deduped").toBe(2);
  } finally {
    await anon.dispose();
  }

  const flights = async () => {
    const { data } = await admin
      .from("adsb_flight")
      .select("icao24, airborne_minutes, dismissed_at")
      .eq("aircraft_id", scratch.id);
    return data ?? [];
  };
  await expect.poll(flights, { timeout: 30_000 }).toHaveLength(2);
  expect((await flights()).every((f) => f.icao24 === "a12239")).toBe(true);

  // --- The suggestion -------------------------------------------------------
  // 90 + 66 minutes = 2.6 h, so 1234.5 → 1237.1.
  await page.goto(`${scratch.path}/meters`);
  await expect(page.getByText(/ADS-B detected/)).toBeVisible();
  await expect(page.getByText(/Suggested tach: 1234\.5 → 1237\.1/)).toBeVisible();

  // --- Accept: pre-filled, editable, and written as an ESTIMATE -------------
  await page.getByRole("button", { name: "Record a reading" }).click();
  const field = page.getByLabel("Tach today");
  await expect(field).toHaveValue("1237.1");
  await field.fill("1237.4"); // the user confirms against the real meter
  await page.getByRole("button", { name: "Save" }).first().click();

  const estimate = async () => {
    const { data } = await admin
      .from("hours_reading")
      .select("tach, source")
      .eq("aircraft_id", scratch.id)
      .eq("source", "adsb_estimate");
    return data ?? [];
  };
  await expect.poll(estimate, { timeout: 15_000 }).toHaveLength(1);
  expect((await estimate())[0].tach).toBe(1237.4);

  // Accepting clears the observations, so the banner doesn't re-fire.
  await expect.poll(async () => (await flights()).every((f) => f.dismissed_at), { timeout: 15_000 }).toBeTruthy();
  await page.goto(`${scratch.path}/meters`);
  await expect(page.getByText(/ADS-B detected/)).toHaveCount(0);
  await expect(page.getByText(/Nothing unaccounted for/)).toBeVisible();

  // --- Opting out is honoured at WRITE time --------------------------------
  // The runner is a scheduled job on a public repo, so it may well post flights
  // it collected moments before an owner switched ADS-B off. Those must not land.
  await admin.from("aircraft").update({ adsb_enabled: false }).eq("id", scratch.id);

  const optedOut = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const res = await optedOut.post("/api/cron/adsb", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      data: {
        flights: [
          {
            aircraft_id: scratch.id,
            icao24: "a12239",
            firstSeen: hoursAgo(1),
            lastSeen: hoursAgo(1) + 30 * 60,
          },
        ],
      },
      timeout: 60_000,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ingested, "an opted-out aircraft must not get rows").toBe(0);
    expect(body.skipped).toBe(1);
  } finally {
    await optedOut.dispose();
  }
  expect(await flights()).toHaveLength(2); // still just the two from before
});
