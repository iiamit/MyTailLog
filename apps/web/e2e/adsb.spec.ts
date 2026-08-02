import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// ADS-B passive hours (WP5, migration 0048), end to end with a STUBBED OpenSky
// client — E2E_STUB_ADSB is set only in playwright.config.ts's webServer.env, so
// CI never calls the live API or burns its credit bucket.
//
// Covers: opt-in is off by default → the daily sweep ingests flights for an
// opted-in aircraft → the reconciliation surfaces a suggestion → accepting it
// writes ONE adsb_estimate reading and silences the banner.
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

  // --- The daily sweep ------------------------------------------------------
  // TRAP: a request context inherits the project's signed-in storageState.
  // Cron auth is a Bearer secret, so force a genuinely anonymous context.
  const anon = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const denied = await anon.post("/api/cron/daily", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(denied.status(), "the cron must reject a bad secret").toBe(401);

    const res = await anon.post("/api/cron/daily", {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
      timeout: 120_000,
    });
    expect(res.ok(), `cron failed: ${res.status()}`).toBeTruthy();
  } finally {
    await anon.dispose();
  }

  // Two stubbed flights land, idempotently keyed on (aircraft_id, first_seen).
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
  // Stub = 90 + 66 minutes = 2.6 h, so 1234.5 → 1237.1.
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
});
