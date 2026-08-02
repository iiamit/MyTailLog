import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// Scheduled cloud backups (migration 0049), end to end against a STUBBED
// Dropbox — E2E_STUB_DROPBOX is set only in playwright.config.ts's
// webServer.env, so CI never touches a real Dropbox account. The stub is a fake
// server, not a fake client: the production uploader runs against it and it
// rejects everything the live API rejects (see lib/backup/providers/dropboxStub).
//
// Covers: unconfigured→configured card, the OAuth connect flow with its CSRF
// state, the schedule it arms, the nightly sweep, and disconnect deleting the
// tokens.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

const CRON_SECRET = "e2e-cron-secret"; // matches playwright.config.ts

test("backups: connect Dropbox, the sweep uploads a dated archive, disconnect clears it", async ({
  page,
  scratch,
  playwright,
}) => {
  test.setTimeout(180_000);

  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const { data: profile } = await admin
    .from("profile")
    .select("id")
    .eq("email", env("TEST_USER_EMAIL"))
    .single();
  const userId = profile!.id;

  // --- Not connected by default --------------------------------------------
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Automatic cloud backups" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Dropbox" })).toBeVisible();

  // --- Connect (state cookie set on /authorize, verified in /callback) ------
  await page.getByRole("link", { name: "Connect Dropbox" }).click();
  await expect(page).toHaveURL(/\/profile\?backup=connected/);
  await expect(page.getByText("Dropbox connected")).toBeVisible();

  // Connecting arms a monthly schedule on the user's hashed day (1..28).
  const schedule = await admin
    .from("backup_schedule")
    .select("id, frequency, day_of_month, next_run_at")
    .eq("user_id", userId)
    .is("aircraft_id", null)
    .single();
  expect(schedule.data!.frequency).toBe("monthly");
  expect(schedule.data!.day_of_month).toBeGreaterThanOrEqual(1);
  expect(schedule.data!.day_of_month).toBeLessThanOrEqual(28);
  expect(new Date(schedule.data!.next_run_at!).getTime()).toBeGreaterThan(Date.now());

  // --- Make it due, scoped to THIS test's aircraft --------------------------
  // Pinning aircraft_id keeps the sweep off aircraft other parallel specs are
  // creating and deleting underneath it.
  await admin
    .from("backup_schedule")
    .update({ aircraft_id: scratch.id, next_run_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", schedule.data!.id);

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

  // --- The run landed, with real bytes and a dated path ---------------------
  const run = await admin
    .from("backup_run")
    .select("status, bytes, remote_path, error")
    .eq("aircraft_id", scratch.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  expect(run.data, "the sweep should have recorded a run").toBeTruthy();
  expect(run.data!.error, `run errored: ${run.data!.error}`).toBeNull();
  expect(run.data!.status).toBe("ok");
  expect(run.data!.bytes!).toBeGreaterThan(0);
  // MyTailLog/<TAIL>/<YYYY-MM-DD>-<TAIL>.zip, inside the Dropbox app folder.
  expect(run.data!.remote_path!.toLowerCase()).toBe(
    `/${scratch.tail}/${new Date().toISOString().slice(0, 10)}-${scratch.tail}.zip`.toLowerCase(),
  );

  // The schedule is re-armed for next month, the lease released.
  const after = await admin
    .from("backup_schedule")
    .select("next_run_at, claimed_at, consecutive_failures")
    .eq("id", schedule.data!.id)
    .single();
  expect(after.data!.claimed_at).toBeNull();
  expect(after.data!.consecutive_failures).toBe(0);
  expect(new Date(after.data!.next_run_at!).getTime()).toBeGreaterThan(Date.now());

  // --- The Profile page reports it honestly ---------------------------------
  await page.reload();
  await expect(page.getByText("Succeeded")).toBeVisible();

  // --- Disconnect deletes the tokens, not just a flag -----------------------
  await page.getByRole("button", { name: "Disconnect" }).last().click();
  await expect(page.getByText("Dropbox disconnected")).toBeVisible();
  const gone = await admin
    .from("backup_schedule")
    .select("frequency, destination_id")
    .eq("id", schedule.data!.id)
    .single();
  expect(gone.data!.frequency).toBe("off");
  expect(gone.data!.destination_id).toBeNull();
  // The destination row itself is deleted, so nothing is due for this user.
  const due = await admin.rpc("backup_due_runs", { p_now: new Date().toISOString() });
  expect((due.data ?? []).some((d: { user_id: string }) => d.user_id === userId)).toBe(false);

  // Teardown: the scratch aircraft goes away with the fixture; drop the schedule
  // so the next run starts clean.
  await admin.from("backup_schedule").delete().eq("id", schedule.data!.id);
});
