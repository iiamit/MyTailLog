import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

test("new design: a PDF is split and queued from Add logbook pages", async ({ page, scratch }) => {
  test.setTimeout(90_000);
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  try {
    await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/logbooks/add`)}`);
    await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/blank.pdf");
    await expect(page.getByText(/blank\.pdf split into 1 page/i)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await admin.from("page").select("id").eq("aircraft_id", scratch.id)).data?.length ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
    await page.goto(`${scratch.path}/logbooks/pages`);
    await expect(page.getByRole("heading", { name: "Airframe logbook" })).toBeVisible();
  } finally {
    const { data } = await admin.from("page").select("storage_path,thumbnail_path").eq("aircraft_id", scratch.id);
    const keys = (data ?? []).flatMap((p) => [p.storage_path, p.thumbnail_path].filter((key): key is string => !!key));
    if (keys.length) await admin.storage.from("logbook-pages").remove(keys);
  }
});
