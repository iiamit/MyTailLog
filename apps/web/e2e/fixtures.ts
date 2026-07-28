import { test as base, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type ScratchAircraft = { path: string; id: string; tail: string };

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
export const test = base.extend<{ demoBase: string; scratch: ScratchAircraft }>({
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

  scratch: async ({}, use) => {
    const url = process.env.TEST_SUPABASE_URL;
    const key = process.env.TEST_SUPABASE_SECRET_KEY;
    const email = process.env.TEST_USER_EMAIL;
    if (!url || !key || !email) {
      throw new Error("scratch fixture needs TEST_SUPABASE_URL/_SECRET_KEY + TEST_USER_EMAIL");
    }
    const admin = createClient(url, key);
    const { data: profile, error: pe } = await admin
      .from("profile")
      .select("id")
      .eq("email", email)
      .single();
    if (pe || !profile) throw new Error(`scratch: harness profile not found for ${email}: ${pe?.message}`);

    const id = randomUUID();
    const tail = `NE2E${id.slice(0, 4).toUpperCase()}`;
    const { error: ae } = await admin.from("aircraft").insert({
      id,
      owner_id: profile.id,
      tail_number: tail,
      make: "Cessna",
      model: "172",
      engine_serials: [],
      prop_serials: [],
    });
    if (ae) throw new Error(`scratch: aircraft insert failed: ${ae.message}`);

    const { error: le } = await admin
      .from("logbook")
      .insert(["airframe", "engine", "prop", "avionics", "other"].map((type) => ({ aircraft_id: id, type })));
    if (le) throw new Error(`scratch: logbook insert failed: ${le.message}`);

    await use({ path: `/aircraft/${id}`, id, tail });

    // Teardown — cascade removes logbooks/pages/etc.
    await admin.from("aircraft").delete().eq("id", id);
  },
});

export { expect };
