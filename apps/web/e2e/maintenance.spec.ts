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

test("oil completion records the chosen Hobbs reading instead of comparing it with Tach", async ({ page, scratch }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  await admin.from("aircraft").update({ enrollment_tach: 4000 }).eq("id", scratch.id);
  const { data: item, error } = await admin.from("maintenance_item").insert({
    aircraft_id: scratch.id, kind: "oil_change", label: "Oil change",
    regulatory: false, interval_hours: 50,
  }).select("id").single();
  expect(error).toBeNull();

  await page.goto(`${scratch.path}/maintenance`);
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("combobox", { name: "Meter" }).selectOption("hobbs");
  await page.getByRole("spinbutton", { name: "Hours (hobbs, optional)" }).fill("900");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();

  await expect.poll(async () => {
    const { data } = await admin.from("maintenance_item").select("meter,last_done_hours,next_due_hours").eq("id", item!.id).single();
    return data;
  }).toMatchObject({ meter: "hobbs", last_done_hours: 900, next_due_hours: 950 });
  await expect.poll(async () => {
    const { data } = await admin.from("hours_reading").select("hobbs").eq("aircraft_id", scratch.id).eq("source", "manual").single();
    return data?.hobbs;
  }).toBe(900);
  await expect(page.getByText(/50 hrs left/)).toBeVisible();
});
