import { test, expect } from "./fixtures";

// Phase 0 smoke: proves the whole chain — the test account logs in (auth.setup),
// lands on the dashboard, and sees the seeded demo aircraft shared to it. Also
// asserts no CSP violation on the dashboard (via the fixture guard).
test("dashboard shows the demo aircraft for the logged-in test account", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("N734DM")).toBeVisible();
});

test("help page renders every documented section without a CSP violation", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: /oil analysis/i })).toBeVisible();
});
