import { test, expect } from "./fixtures";

// Phase 2 flagship — the direct guard for the incident that started the harness:
// uploading a PDF drives the REAL pdf.js worker in the browser. A working worker
// rasterizes it → "Added 1 page from 1 file"; a CSP-blocked worker (the original
// regression) shows "Couldn't read this file" instead. The fixture's CSP guard
// also fails on any securitypolicyviolation during the flow.
test("upload: a PDF rasterizes into a page via the real pdf.js worker", async ({ page, scratch }) => {
  await page.goto(`${scratch.path}/upload`);

  await page.locator('input[type="file"]').setInputFiles("e2e/fixtures/blank.pdf");

  await expect(page.getByText(/Added \d+ page.*from 1 file/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Couldn't read this file")).toHaveCount(0);
});
