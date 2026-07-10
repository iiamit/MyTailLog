import { test, expect } from "./fixtures";

// Phase 1: every documented read-only page renders on the demo aircraft (as a
// viewer), with its correct h1 and — via the fixture guard — no CSP violation.
// Catches page crashes, broken routes, RLS/read regressions, and CSP-blocked
// resources across the whole read surface. Deliberately asserts the stable
// heading, not demo data (which would be brittle).
const PAGES: { path: string; heading: string }[] = [
  { path: "/status", heading: "Status" },
  { path: "/timeline", heading: "Logbook timeline" },
  { path: "/ask", heading: "Ask your logbook" },
  { path: "/maintenance", heading: "Maintenance forecast" },
  { path: "/compliance", heading: "AD / SB compliance" },
  { path: "/equipment", heading: "Installed equipment" },
  { path: "/weight-balance", heading: "Weight & balance" },
  { path: "/oil-analysis", heading: "Oil analysis" },
  { path: "/audit", heading: "Records gap audit" },
];

for (const p of PAGES) {
  test(`read-only ${p.path} renders its heading (no CSP violation)`, async ({ page, demoBase }) => {
    await page.goto(`${demoBase}${p.path}`);
    await expect(page.getByRole("heading", { level: 1, name: p.heading })).toBeVisible();
  });
}

test("read-only aircraft overview shows the demo tail", async ({ page, demoBase }) => {
  await page.goto(demoBase);
  await expect(page.getByText("N734DM").first()).toBeVisible();
});

test("read-only: Ask page shows its question input", async ({ page, demoBase }) => {
  await page.goto(`${demoBase}/ask`);
  await expect(page.locator("input, textarea").first()).toBeVisible();
});
