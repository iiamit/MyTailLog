import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

test("new design: a read page is confirmed from the review desk", async ({ page, scratch }) => {
  test.setTimeout(60_000);
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const { data: book } = await admin.from("logbook").select("id").eq("aircraft_id", scratch.id).eq("type", "airframe").single();
  const pageId = randomUUID();
  const { error: pageError } = await admin.from("page").insert({
    id: pageId, aircraft_id: scratch.id, logbook_id: book!.id,
    storage_path: `${scratch.id}/e2e-review.jpg`, page_sequence: 1,
    review_status: "unreviewed", extraction_status: "extracted",
  });
  expect(pageError).toBeNull();
  const { data: entry, error: entryError } = await admin.from("log_entry").insert({
    aircraft_id: scratch.id, logbook_id: book!.id, page_id: pageId,
    entry_date: "2026-03-14", description: "Inspected landing gear",
  }).select("id").single();
  expect(entryError).toBeNull();

  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/logbooks/review`)}`);
  await page.getByRole("link", { name: "Open in the desk" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/logbooks/review/${pageId}`));
  await page.getByRole("button", { name: /Confirm page and next/ }).click();
  await expect.poll(async () => (await admin.from("log_entry").select("owner_confirmed").eq("id", entry!.id).single()).data?.owner_confirmed).toBe(true);
  await expect.poll(async () => (await admin.from("page").select("review_status").eq("id", pageId).single()).data?.review_status).toBe("confirmed");
  await page.goto(`${scratch.path}/logbooks/entries/${entry!.id}`);
  await expect(page.getByText("Inspected landing gear").first()).toBeVisible();
});
