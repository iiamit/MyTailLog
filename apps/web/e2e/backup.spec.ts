import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// Scheduled cloud backups (migrations 0049 + 0050), end to end against STUBBED
// providers — E2E_STUB_DROPBOX / E2E_STUB_GDRIVE are set only in
// playwright.config.ts's webServer.env, so CI never touches a real cloud
// account. Both stubs are fake SERVERS, not fake clients: the production
// uploaders run against them and they reject everything the live APIs reject
// (see lib/backup/providers/{dropboxStub,gdriveStub}).
//
// Covers: unconfigured→configured cards, the OAuth connect flow with its CSRF
// state, the schedule each connection arms, the nightly sweep, and disconnect
// destroying the tokens — for BOTH providers at once, which is exactly what
// 0050's per-destination schedule index exists to allow.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

const CRON_SECRET = "e2e-cron-secret"; // matches playwright.config.ts
const PROVIDERS = [
  { id: "dropbox", name: "Dropbox" },
  { id: "gdrive", name: "Google Drive" },
] as const;

test("backups: connect both providers, the sweep uploads to each, disconnect clears them", async ({
  page,
  scratch,
  playwright,
}) => {
  test.setTimeout(240_000);

  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const { data: profile } = await admin
    .from("profile")
    .select("id")
    .eq("email", env("TEST_USER_EMAIL"))
    .single();
  const userId = profile!.id;

  // --- Neither connected by default ----------------------------------------
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Automatic cloud backups" })).toBeVisible();
  for (const p of PROVIDERS) {
    await expect(page.getByRole("link", { name: `Connect ${p.name}` })).toBeVisible();
  }

  // --- Connect each (state cookie set on /authorize, verified in /callback) --
  for (const p of PROVIDERS) {
    await page.getByRole("link", { name: `Connect ${p.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/profile\\?backup=connected&provider=${p.id}`));
    await expect(page.getByText(`${p.name} connected`)).toBeVisible();
  }

  // 0050: ONE all-aircraft schedule per DESTINATION, so both exist at once.
  // Under 0049's index (unique on user_id alone) the second connection could
  // not have been scheduled at all — this is the regression that matters.
  const armed = await admin
    .from("backup_schedule")
    .select("id, frequency, day_of_month, next_run_at, destination_id")
    .eq("user_id", userId)
    .is("aircraft_id", null);
  expect(armed.data!.length, "each provider must get its own schedule").toBe(2);
  expect(new Set(armed.data!.map((s) => s.destination_id)).size).toBe(2);
  for (const s of armed.data!) {
    expect(s.frequency).toBe("monthly");
    expect(s.day_of_month).toBeGreaterThanOrEqual(1);
    expect(s.day_of_month).toBeLessThanOrEqual(28);
    expect(new Date(s.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  }

  // --- Make both due, scoped to THIS test's aircraft -------------------------
  // Pinning aircraft_id keeps the sweep off aircraft other parallel specs are
  // creating and deleting underneath it.
  const scheduleIds = armed.data!.map((s) => s.id);
  for (const id of scheduleIds) {
    await admin
      .from("backup_schedule")
      .update({ aircraft_id: scratch.id, next_run_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);
  }

  const anon = await playwright.request.newContext();

  // The cron gate is POST-only + Bearer CRON_SECRET, same as /api/cron/daily.
  const denied = await anon.post("/api/cron/backup", {
    headers: { authorization: "Bearer wrong-secret" },
  });
  expect(denied.status(), "the cron must reject a bad secret").toBe(401);

  const res = await anon.post("/api/cron/backup", {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.ok(), `cron failed: ${res.status()}`).toBeTruthy();

  // --- Both runs landed, with real bytes and a dated path -------------------
  const runs = await admin
    .from("backup_run")
    .select("status, bytes, remote_path, error, schedule_id")
    .eq("aircraft_id", scratch.id)
    .order("started_at", { ascending: false })
    .limit(2);
  expect(runs.data!.length, "one run per destination").toBe(2);
  const dated = `${new Date().toISOString().slice(0, 10)}-${scratch.tail}.zip`.toLowerCase();
  for (const run of runs.data!) {
    expect(run.error, `run errored: ${run.error}`).toBeNull();
    expect(run.status).toBe("ok");
    expect(run.bytes!).toBeGreaterThan(0);
    // <TAIL>/<YYYY-MM-DD>-<TAIL>.zip — each adapter roots the same logical path
    // wherever it is allowed to write.
    expect(run.remote_path!.toLowerCase()).toContain(`${scratch.tail.toLowerCase()}/${dated}`);
  }
  // Two distinct schedules ran — not one destination recorded twice.
  expect(new Set(runs.data!.map((r) => r.schedule_id)).size).toBe(2);

  // Google Drive nests under the MyTailLog folder it created; Dropbox's App
  // folder already roots it, so exactly one of the two is prefixed.
  const prefixed = runs.data!.filter((r) => r.remote_path!.startsWith("/MyTailLog/"));
  expect(prefixed.length, "the Drive upload must nest under MyTailLog/").toBe(1);

  // Both schedules re-armed for next month, both leases released.
  const after = await admin
    .from("backup_schedule")
    .select("next_run_at, claimed_at, consecutive_failures")
    .eq("user_id", userId)
    .eq("aircraft_id", scratch.id);
  for (const s of after.data!) {
    expect(s.claimed_at).toBeNull();
    expect(s.consecutive_failures).toBe(0);
    expect(new Date(s.next_run_at!).getTime()).toBeGreaterThan(Date.now());
  }

  // --- The Profile page reports each destination honestly, and separately ---
  await page.reload();
  await expect(page.getByText("Succeeded")).toHaveCount(2);

  // --- Disconnect destroys the tokens, one destination at a time ------------
  for (const p of PROVIDERS) {
    await page.getByRole("button", { name: `Disconnect ${p.name}` }).click();
    await expect(page.getByText(`${p.name} disconnected`)).toBeVisible();
  }
  const off = await admin
    .from("backup_schedule")
    .select("frequency")
    .eq("user_id", userId)
    .eq("aircraft_id", scratch.id);
  expect(off.data!.every((s) => s.frequency === "off")).toBe(true);
  // Nothing is due for this user any more: 0050's disconnect nulls every token
  // column and stamps revoked_at, and backup_due_runs joins on revoked_at null.
  const due = await admin.rpc("backup_due_runs", { p_now: new Date().toISOString() });
  expect((due.data ?? []).some((d: { user_id: string }) => d.user_id === userId)).toBe(false);

  // Teardown: the scratch aircraft goes away with the fixture; drop the
  // schedules so the next run starts clean.
  for (const id of scheduleIds) await admin.from("backup_schedule").delete().eq("id", id);
});
