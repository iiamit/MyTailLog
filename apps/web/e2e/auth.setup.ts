import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";

// Logs in once via the real UI and saves the session (cookies) for reuse by
// every test. Also regression-tests password login itself.
const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  setup.setTimeout(60_000);
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set TEST_USER_EMAIL and TEST_USER_PASSWORD (the harness account).",
    );
  }

  // Record only transport state, never credentials or the token response body.
  let tokenDiagnostic = "No password-token request was observed.";
  const isToken = (url: string) =>
    new URL(url).pathname.endsWith("/auth/v1/token");
  page.on("request", (request) => {
    if (isToken(request.url()))
      tokenDiagnostic =
        "Password-token request started but no response arrived.";
  });
  page.on("response", (response) => {
    if (isToken(response.url()))
      tokenDiagnostic = `Password-token response HTTP ${response.status()}.`;
  });
  page.on("requestfailed", (request) => {
    if (isToken(request.url()))
      tokenDiagnostic = `Password-token transport failed: ${request.failure()?.errorText ?? "unknown network error"}.`;
  });

  await page.goto("/login?next=%2Fprofile");
  // Default mode is magic-link; switch to password.
  await page
    .getByRole("button", { name: /^(?:Password|Use a password)$/ })
    .click();
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Race the redirect against the login page's inline error, so a failed login
  // surfaces the real Supabase reason instead of a generic navigation timeout.
  const errorMsg = page.locator("#signin-error[role=alert]");
  await Promise.race([
    page.waitForURL(/\/(?:profile|account\/settings)(?:\?|$)/, {
      timeout: 45_000,
    }),
    errorMsg.waitFor({ state: "visible", timeout: 45_000 }),
  ]).catch(() => {});

  if (!/\/(?:profile|account\/settings)(?:\?|$)/.test(page.url())) {
    // Missing inline errors must not introduce another locator timeout and hide
    // the useful request diagnostic when the network request is still pending.
    const reason = (await errorMsg.isVisible())
      ? (await errorMsg.textContent({ timeout: 1_000 }))?.trim()
      : null;
    throw new Error(
      `Login failed for ${email} — never reached the protected account settings (at ${page.url()}). ` +
        `Supabase said: ${reason ? `"${reason}"` : "(no inline error — see the trace/screenshot artifact)"}. ` +
        `${tokenDiagnostic} Check account confirmation if authentication was rejected; inspect transport/network traces if the request did not finish.`,
    );
  }

  await expect(
    page.getByRole("heading", { name: /^(?:Your profile|Settings)$/ }),
  ).toBeVisible();
  fs.mkdirSync("e2e/.auth", { recursive: true });
  await page.context().storageState({ path: authFile });
});
