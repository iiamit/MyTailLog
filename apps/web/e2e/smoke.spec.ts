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
  await expect(page.getByRole("button", { name: "Share summary" })).toBeVisible();
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
    ["/", /the logbooks are a cardboard box/i],
    ["/faq", /questions before you sign up/i],
    ["/compare", /six ways to keep aircraft maintenance records/i],
    ["/guides/digitize-aircraft-logbooks", /how to digitize aircraft logbooks/i],
    ["/guides/aircraft-maintenance-tracking", /aircraft maintenance tracking for owners/i],
    ["/guides/airworthiness-directive-tracking", /airworthiness directive tracking/i],
    ["/switch/myfbo", /myfbo is going away/i],
  ] as const;

  for (const [path, heading] of PAGES) {
    test(`${path} renders signed out`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }

  // The landing page's job is to make starting obvious and to route to the
  // other public pages — both were previously one small link each, so assert
  // them rather than just that the page rendered.
  test("landing page offers a way in and reaches the other marketing pages", async ({ page }) => {
    await page.goto("/");
    // Signed out: account creation is a primary CTA, not a buried "Sign in".
    await expect(page.getByRole("link", { name: /create your account/i }).first()).toBeVisible();
    for (const href of ["/faq", "/compare", "/switch/myfbo", "/help", "/whats-new", "/developers/docs"]) {
      await expect(page.locator(`footer a[href="${href}"]`)).toBeVisible();
    }
    // The claim the page is built around, and the scope guardrail it must keep.
    await expect(page.getByText("$0.00")).toBeVisible();
    await expect(page.getByText(/14 CFR 91\.417/).first()).toBeVisible();
  });

  // No horizontal overflow at any width — a previous marketing page shipped a
  // table wider than its container and scrolled sideways at every viewport.
  for (const width of [1512, 1280, 1024, 768, 390]) {
    test(`landing page does not scroll sideways at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1); // 1px of sub-pixel rounding slack
    });
  }
});
