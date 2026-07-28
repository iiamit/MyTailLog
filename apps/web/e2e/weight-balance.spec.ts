import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// Weight & balance write journey: the owner adds a revision through the UI and
// it persists (exercises the upsertWeightBalance server action end to end).
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("weight & balance: add a revision through the UI and it persists", async ({ page, scratch }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  await page.goto(`${scratch.path}/weight-balance`);
  await page.getByRole("button", { name: "+ Add revision" }).click();
  await page.getByLabel("Empty weight (lb)").fill("1500");
  await page.getByLabel("CG arm (in)").fill("39");
  await page.getByLabel("Max gross weight (lb)").fill("2400");
  await page.getByRole("button", { name: "Save" }).click();

  // The revision landed with the entered values (moment is derived, useful load
  // = max_gross - empty = 900).
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("weight_balance")
        .select("empty_weight, empty_weight_arm, max_gross_weight")
        .eq("aircraft_id", scratch.id);
      return data?.[0] ?? null;
    }, { timeout: 15000 })
    .toMatchObject({ empty_weight: 1500, empty_weight_arm: 39, max_gross_weight: 2400 });

  // And the current-W&B panel reflects the derived useful load.
  await expect(page.getByText("900", { exact: false }).first()).toBeVisible();
});
