import { test, expect } from "./fixtures";

test("guided start saves hours and the last annual for an owned aircraft", async ({ page, scratch }) => {
  await page.goto(`${scratch.path}/start`);
  await expect(page.getByRole("heading", { name: "What do the meters read today?" })).toBeVisible();

  await page.getByLabel("Tach", { exact: true }).fill("321.4");
  await page.getByRole("button", { name: "Save hours" }).click();
  await expect(page.getByRole("heading", { name: "When was your last annual?" })).toBeVisible();

  await page.getByRole("button", { name: "Type the date instead" }).click();
  await page.getByLabel("Date of the last annual").fill("2026-01-15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Next: work backward through the airframe logbook.")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Next: work backward through the airframe logbook.")).toBeVisible();
});
