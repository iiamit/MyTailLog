import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// Squawks (0043) full lifecycle through the UI: report → resolve → reopen.
// rls-isolation.spec.ts already proves the POLICY (a viewer may report but not
// resolve); this proves the FEATURE — that the controls are wired to the server
// actions and the status transitions actually land in the DB.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("squawks: report one, resolve it, then reopen it", async ({ page, scratch }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const description = "E2E: #2 radio intermittent on transmit";

  const status = async () => {
    const { data } = await admin
      .from("squawk")
      .select("status, severity, resolved_at")
      .eq("aircraft_id", scratch.id)
      .eq("description", description)
      .maybeSingle();
    return data;
  };

  await page.goto(`${scratch.path}/squawks`);
  await expect(page.getByRole("heading", { level: 1, name: "Squawks" })).toBeVisible();

  // --- Report ---------------------------------------------------------------
  await page.getByPlaceholder("e.g. #2 radio intermittent on transmit").fill(description);
  // The severity select has no accessible name — scope it to the report form.
  await page.locator("form", { hasText: "Report a squawk" }).locator("select").selectOption("high");
  await page.getByRole("button", { name: "Report squawk" }).click();

  await expect.poll(status, { timeout: 15_000 }).toMatchObject({ status: "open", severity: "high" });
  // It renders in the open list with its severity chip.
  await expect(page.getByText(description)).toBeVisible();

  // --- Resolve --------------------------------------------------------------
  await page.getByRole("button", { name: "Resolve" }).first().click();
  await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("resolved");
  expect((await status())?.resolved_at, "resolving stamps resolved_at").toBeTruthy();

  // --- Reopen ---------------------------------------------------------------
  await page.getByRole("button", { name: "Reopen" }).first().click();
  await expect.poll(async () => (await status())?.status, { timeout: 15_000 }).toBe("open");
  expect((await status())?.resolved_at, "reopening clears resolved_at").toBeNull();
});
