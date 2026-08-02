import { defineConfig, devices } from "@playwright/test";
import { generateKeyPairSync, randomUUID } from "node:crypto";

// A throwaway RS256 signing key for the OAuth provider (OIDC_JWKS) — ephemeral
// per test run, so no key material is committed.
function testJwks(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = privateKey.export({ format: "jwk" });
  return JSON.stringify({ keys: [{ ...jwk, use: "sig", alg: "RS256", kid: randomUUID() }] });
}

// E2E harness (Phase 0). Runs the real app in Chromium against the dedicated
// TEST Supabase project — see docs/e2e-regression-plan.md.
//
// Env:
//   E2E_BASE_URL            point at an already-running app (skips webServer)
//   TEST_SUPABASE_URL/_ANON_KEY/_SECRET_KEY   the TEST project (NOT prod)
//   TEST_USER_EMAIL/_PASSWORD                 the harness account (auth.setup.ts)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  // When E2E_BASE_URL is set we assume the app is already running (e.g. a
  // deployed preview). Otherwise build + start it locally with the TEST env.
  // NEXT_PUBLIC_* are baked at build time, so the build must see them here.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL ?? "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY ?? "",
          SUPABASE_SECRET_KEY: process.env.TEST_SUPABASE_SECRET_KEY ?? "",
          NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
          ENCRYPTION_KEY: process.env.TEST_ENCRYPTION_KEY ?? "e2e-test-encryption-key",
          // A dummy key makes the AI UI render (extractionConfigured); E2E_STUB_AI
          // makes getAnthropic return canned responses so no real calls are made.
          ANTHROPIC_API_KEY: "e2e-stub-key",
          E2E_STUB_AI: "1",
          // Same pattern for ADS-B: E2E_STUB_ADSB makes openSkyClient() return
          // canned flights so the daily sweep never touches the live OpenSky API
          // (which needs real OAuth credentials and burns a shared credit
          // bucket). Set here ONLY — never in prod/apphosting.yaml.
          E2E_STUB_ADSB: "1",
          CRON_SECRET: "e2e-cron-secret",
          // OAuth provider signing keys (see e2e/oauth.spec.ts).
          OIDC_JWKS: process.env.TEST_OIDC_JWKS ?? testJwks(),
        },
      },
});
