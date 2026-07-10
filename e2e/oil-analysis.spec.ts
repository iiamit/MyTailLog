import { test, expect } from "./fixtures";

// Phase 2: oil-analysis import end-to-end with stubbed extraction. Uploads a
// file to a scratch aircraft (owned by the harness account); the E2E_STUB_AI hook
// returns a canned oil report (schema has `samples`), which the route parses and
// upserts. Asserts the success message + the imported sample renders.
test("oil analysis: importing a report ingests + shows the sample", async ({ page, scratch }) => {
  await page.goto(`${scratch.path}/oil-analysis`);

  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/blank.pdf");

  // Surface the import result (success or error) so a failure shows the real
  // message rather than a generic timeout.
  const msg = page.locator("span.text-annun-green, span.text-annun-red").first();
  await expect(msg).toBeVisible({ timeout: 20_000 });
  await expect(msg).toContainText(/Imported 1 sample/i);
  // The imported sample (stub sample_date) shows after the page refreshes.
  await expect(page.getByText("2026-01-01").first()).toBeVisible();
});
