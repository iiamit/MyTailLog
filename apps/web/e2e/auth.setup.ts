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

  // Race the redirect against the login page's inline error, so a failed login
  // surfaces the real Supabase reason instead of a generic navigation timeout.
  const errorMsg = page.locator("p.text-annun-red");
  await Promise.race([
    page.waitForURL("**/dashboard", { timeout: 15_000 }),
    errorMsg.waitFor({ state: "visible", timeout: 15_000 }),
  ]).catch(() => {});

  if (!page.url().includes("/dashboard")) {
    const reason = (await errorMsg.textContent().catch(() => null))?.trim();
    throw new Error(
      `Login failed for ${email} — never reached /dashboard (at ${page.url()}). ` +
        `Supabase said: ${reason ? `"${reason}"` : "(no inline error — see the trace/screenshot artifact)"}. ` +
        `Check TEST_USER_EMAIL/TEST_USER_PASSWORD match a confirmed account in the TEST project.`,
    );
  }

  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
