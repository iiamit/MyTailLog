import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

const admin = () => createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);

test("new design: a reading and oil added through their panes are saved", async ({ page, scratch }) => {
  test.setTimeout(60_000);
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/hours?panel=reading`)}`);
  await page.getByLabel("Tach", { exact: true }).fill("4172.9");
  await page.getByLabel("Hobbs", { exact: true }).fill("984.9");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect.poll(async () => (await admin().from("hours_reading").select("tach,hobbs").eq("aircraft_id", scratch.id).eq("source", "manual")).data).toContainEqual(expect.objectContaining({ tach: 4172.9, hobbs: 984.9 }));

  await page.goto(`${scratch.path}/oil?panel=oil`);
  await page.getByLabel("Quarts added").fill("1.25");
  await page.getByRole("button", { name: "Add oil", exact: true }).click();
  await expect.poll(async () => (await admin().from("oil_addition").select("quarts").eq("aircraft_id", scratch.id)).data).toContainEqual(expect.objectContaining({ quarts: 1.25 }));
});

test("new design: a squawk and document added through their panes are saved", async ({ page, scratch }) => {
  test.setTimeout(90_000);
  const description = `E2E right brake ${scratch.tail}`;
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/maintenance/squawks?panel=new`)}`);
  await page.getByLabel("What's wrong?").fill(description);
  await page.getByText("Watch", { exact: true }).click();
  await page.getByRole("button", { name: "Report squawk" }).click();
  await expect.poll(async () => (await admin().from("squawk").select("status").eq("aircraft_id", scratch.id).eq("description", description).maybeSingle()).data).toMatchObject({ status: "open" });

  const title = `E2E registration ${scratch.tail}`;
  await page.goto(`${scratch.path}/documents?panel=new`);
  await page.getByLabel("File", { exact: true }).setInputFiles("e2e/fixtures/blank.pdf");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Add document" }).click();
  await expect.poll(async () => (await admin().from("document").select("id").eq("aircraft_id", scratch.id).eq("title", title).maybeSingle()).data).not.toBeNull();
});
