import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// Maintenance write journey: seeding the standard Part 91 items through the UI
// creates the forecast rows (exercises the seedStandardItems server action).
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("maintenance: seeding standard Part 91 items creates the forecast rows", async ({ page, scratch }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  // Fresh scratch aircraft → no items yet.
  const before = await admin.from("maintenance_item").select("id").eq("aircraft_id", scratch.id);
  expect(before.data?.length ?? 0).toBe(0);

  await page.goto(`${scratch.path}/maintenance`);
  await page.getByRole("button", { name: "Add standard Part 91 items" }).click();

  await expect
    .poll(async () => {
      const { data } = await admin.from("maintenance_item").select("id").eq("aircraft_id", scratch.id);
      return data?.length ?? 0;
    }, { timeout: 15000 })
    .toBeGreaterThan(0);
});
