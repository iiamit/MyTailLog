import { test, expect } from "./fixtures";

// Phase 2: oil-analysis import end-to-end with stubbed extraction. Uploads a
// file to a scratch aircraft (owned by the harness account); the E2E_STUB_AI hook
// returns a canned oil report (schema has `samples`), which the route parses and
// upserts. Asserts the success message + the imported sample renders.
test("oil analysis: importing a report ingests + shows the sample", async ({ page, scratch }) => {
  await page.goto(`${scratch.path}/oil-analysis`);

  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/blank.pdf");

  await expect(page.getByText(/Imported 1 sample/i)).toBeVisible({ timeout: 20_000 });
  // The imported sample (stub sample_date) shows after the page refreshes.
  await expect(page.getByText("2026-01-01").first()).toBeVisible();
});
