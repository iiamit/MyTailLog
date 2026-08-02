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

// The marketing pages exist to be read by people who don't have an account —
// so the thing worth asserting is that they render with no session at all.
test.describe("public marketing pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const PAGES = [
    ["/faq", /questions before you sign up/i],
    ["/compare", /six ways to keep aircraft maintenance records/i],
    ["/switch/myfbo", /myfbo is going away/i],
  ] as const;

  for (const [path, heading] of PAGES) {
    test(`${path} renders signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }
});
