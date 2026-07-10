import { test as base, expect } from "@playwright/test";

// Cross-cutting guard: EVERY test using this `test` fails if the page fires a
// Content-Security-Policy violation. This generalizes the pdf-worker regression
// (a CDN worker the CSP blocked) to all flows and resources — any CSP-blocked
// script/worker/style/connect anywhere trips it.
//
// Console errors are collected and attached for debugging but not asserted yet
// (the app logs some benign ones); tighten to a hard fail with an allowlist once
// we've seen what real flows produce.
// demoBase: the read-only demo aircraft's path (/aircraft/<id>), read from the
// dashboard so tests don't hardcode a per-project UUID.
export const test = base.extend<{ demoBase: string }>({
  page: async ({ page }, use, testInfo) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __cspViolations?: string[] };
      w.__cspViolations ??= [];
      document.addEventListener("securitypolicyviolation", (e) => {
        w.__cspViolations!.push(`${e.effectiveDirective} blocked ${e.blockedURI || e.sourceFile}`);
      });
    });

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await use(page);

    const violations = await page
      .evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [])
      .catch(() => [] as string[]);

    if (consoleErrors.length) {
      await testInfo.attach("console-errors", { body: consoleErrors.join("\n"), contentType: "text/plain" });
    }
    expect(violations, `CSP violations:\n${violations.join("\n")}`).toEqual([]);
  },

  demoBase: async ({ page }, use) => {
    await page.goto("/dashboard");
    await expect(page.getByText("N734DM").first()).toBeVisible();
    // The sole non-enroll aircraft link on the demo account is the demo aircraft.
    // ponytail: refine to scope-by-tail once write tests add scratch aircraft.
    const href = await page
      .locator('a[href^="/aircraft/"]:not([href="/aircraft/enroll"])')
      .first()
      .getAttribute("href");
    if (!href) throw new Error("Demo aircraft link not found on /dashboard");
    await use(href);
  },
});

export { expect };
