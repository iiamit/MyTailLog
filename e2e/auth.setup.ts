import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";

// Logs in once via the real UI and saves the session (cookies) for reuse by
// every test. Also regression-tests password login itself.
const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error("Set TEST_USER_EMAIL and TEST_USER_PASSWORD (the harness account).");
  }

  await page.goto("/login");
  // Default mode is magic-link; switch to password.
  await page.getByRole("button", { name: "Password" }).click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
