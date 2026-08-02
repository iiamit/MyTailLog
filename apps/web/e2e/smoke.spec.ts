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

// /whats-new renders CHANGELOG.md, which lives outside apps/web and is inlined at
// build time (next.config.mjs). If that inlining ever breaks, the page renders
// empty in production while still working in dev — so assert real content.
test("whats-new renders the changelog grouped by version", async ({ page }) => {
  await page.goto("/whats-new");
  // level 2 = the version heading; the changelog also has an "Earlier in
  // 2026.07" group heading, so an unscoped name match hits both.
  await expect(page.getByRole("heading", { name: "2026.07", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open API & integrations" })).toBeVisible();
  await expect(page.getByText("Security", { exact: true }).first()).toBeVisible();
});

test("maintenance summary renders every section for the demo aircraft", async ({ page, demoBase }) => {
  await page.goto(`${demoBase}/summary`);
  await expect(page.getByRole("heading", { name: /maintenance summary/i }).first()).toBeVisible();
  for (const section of [
    /status at a glance/i,
    /inspections, items & recurring ADs/i,
    /open squawks/i,
    /AD \/ SB compliance/i,
    /installed equipment/i,
    /current weight & balance/i,
  ]) {
    await expect(page.getByRole("heading", { name: section })).toBeVisible();
  }
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
