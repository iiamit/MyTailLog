import { test, expect } from "./fixtures";

// Every new-design screen that can render for an empty, owned aircraft. Detail
// screens needing an entry, page or tracked-item ID have separate journey tests.
const aircraftRoutes = [
  "", "status", "status/plan", "logbooks", "logbooks/map", "logbooks/list", "logbooks/pages",
  "logbooks/add", "logbooks/review", "logbooks/entries/new", "maintenance",
  "maintenance/items", "maintenance/ads", "maintenance/ads/find", "maintenance/squawks",
  "maintenance/annual", "maintenance/records-check", "hours", "oil", "equipment",
  "weight-balance", "details", "documents", "share", "share/summary", "share/dossier", "ask", "setup",
];

test("new design: every aircraft screen renders for an owner", async ({ page, scratch }) => {
  test.setTimeout(240_000);
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/status`)}`);
  for (const route of aircraftRoutes) {
    await test.step(route, async () => {
      const response = await page.goto(`${scratch.path}/${route}`);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.locator("aside.rail"), route).toBeVisible();
      await expect(page.getByText("Application error")).toHaveCount(0);
    });
  }
});

test("new design: account and hangar screens render", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/api/ui?design=v2&next=%2Fhangar");
  for (const route of ["hangar", "account", "account/settings", "account/data", "aircraft/new"]) {
    await test.step(route, async () => {
      const response = await page.goto(`/${route}`);
      expect(response?.status(), route).toBeLessThan(400);
      await expect(page.getByText("Application error")).toHaveCount(0);
      await expect(page.locator("main")).toBeVisible();
    });
  }
});
