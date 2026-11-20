import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// A confirmed entry is required for an answer; the reader cannot cite an
// unconfirmed draft or an empty aircraft.
test("ask: a question returns a cited answer", async ({ page, scratch }) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const { data: book, error: bookError } = await admin.from("logbook").select("id").eq("aircraft_id", scratch.id).eq("type", "airframe").single();
  expect(bookError).toBeNull();
  const { error } = await admin.from("log_entry").insert({
    aircraft_id: scratch.id, logbook_id: book!.id, entry_date: "2026-01-01",
    description: "Annual inspection completed", owner_confirmed: true,
  });
  expect(error).toBeNull();
  await page.goto(`/v2${scratch.path}/ask`);
  await page.getByRole("searchbox", { name: /search the logbooks, or ask a question/i }).fill("When was the last annual?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("E2E stubbed answer.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Source entries" })).toBeVisible();
});
