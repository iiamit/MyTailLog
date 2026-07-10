import { test as base, expect } from "@playwright/test";

// Cross-cutting guard: EVERY test using this `test` fails if the page fires a
// Content-Security-Policy violation. This generalizes the pdf-worker regression
// (a CDN worker the CSP blocked) to all flows and resources — any CSP-blocked
// script/worker/style/connect anywhere trips it.
//
// Console errors are collected and attached for debugging but not asserted yet
// (the app logs some benign ones); tighten to a hard fail with an allowlist once
// we've seen what real flows produce.
export const test = base.extend({
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
});

export { expect };
