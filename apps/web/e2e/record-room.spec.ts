import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";

test("record room: owner creates a link, a visitor opens it, revocation closes it", async ({ page, scratch, baseURL }) => {
  await page.goto(`${scratch.path}/share`);
  await expect(page.getByRole("checkbox", { name: /Page scans from selected logbooks/ })).not.toBeChecked();
  await page.getByPlaceholder("Buyer · J. Smith").fill("Test buyer");
  await page.getByRole("button", { name: "Create link" }).click();

  const preview = page.getByRole("link", { name: "Preview" });
  await expect(preview).toBeVisible();
  const url = await preview.getAttribute("href");
  expect(url).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);

  const visitor = await playwrightRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const opened = await visitor.get(url!);
    expect(opened.status()).toBe(200);
    expect(await opened.text()).toContain(scratch.tail);

    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText(/^revoked ·/)).toBeVisible();

    const closed = await visitor.get(url!);
    expect(closed.status()).toBe(200);
    expect(await closed.text()).toContain("This link is no longer active");
  } finally {
    await visitor.dispose();
  }
});
