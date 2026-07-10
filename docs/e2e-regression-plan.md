# End-to-end regression testing plan

A browser-driven harness that verifies **every documented feature** works end to
end, run automatically, so config/integration regressions — like the CSP break
that silently killed PDF upload — can't reach prod. This complements what already
exists: unit/contract tests (`test/`, Node `node:test`) and CI
(`.github/workflows/ci.yml`: typecheck + lint + test + build on every PR).

## Principles

1. **Drive the real app in a real browser** (Playwright/Chromium) against a real
   Supabase — assert behavior, don't mock our own code.
2. **Deterministic & cheap by default.** Stub the *external, paid, or
   nondeterministic* services (Anthropic, FAA, Resend); keep a separate,
   occasional "live" tier for real AI.
3. **Isolated from prod.** A dedicated test Supabase project; never mutate real
   user data.
4. **Cross-cutting guards catch whole classes of bug** on every page (CSP
   violations, console errors, failed requests) — this is what would have caught
   the pdf-worker regression generically.

## Stack

- **@playwright/test** — Chromium, plus a mobile-viewport project for the capture
  PWA.
- **`playwright.config.ts`** — `webServer` builds+starts the app against the test
  env (or `TEST_BASE_URL` points at a deployed preview); `global-setup` handles
  auth; trace + screenshot + video on failure.
- **`tests/e2e/`** organized by feature area; shared fixtures for an authenticated
  page, demo-aircraft navigation, and the AI-stub toggle.

## Authentication (using your offer)

- **Recommended: a dedicated test account with email + password.** A `global-setup`
  logs in through the real UI once and saves `storageState` (cookies), reused by
  every test — robust with `@supabase/ssr`'s cookie sessions, and it
  regression-tests the login flow itself. Credentials come from CI secrets
  `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`.
- **Fallback: the JWT you offered** — injected into the session cookie in
  `global-setup`. Slightly more brittle with SSR cookie chunking; use only if
  password sign-in isn't enabled for the test account.

## Environment & test data

- **Dedicated test Supabase project** (separate from prod), all migrations
  applied. E2E writes never touch prod. (Needs you to create it + provide
  URL/anon/secret as CI secrets.)
- **Read-only flows** use the **demo aircraft (N734DM)** every account gets —
  deterministic, zero setup.
- **Write flows** create a **scratch aircraft** in setup and delete it in teardown
  (or use a per-run unique tail), on the test project.

## Stubbing external services (important — these run server-side)

Our AI/FAA/email calls happen in server components / route handlers, so
browser-level request interception can't reach them. The plan introduces an
env-gated test mode:

- **`E2E_STUB_AI=1`** → extraction / ask / scans / oil-analysis return canned
  fixture responses via a small injected fake in the extraction layer.
  Deterministic, free, fast. **Requires a tiny testability hook in code.**
- **FAA registry lookup** (enroll) → stub to a fixture (or allow real; it's
  stable).
- **MyFlightBook OAuth** → not driven E2E (external); test only the
  credential-save UI + status states.
- **Resend** → disabled/stubbed; no real email.
- **A separate "live" tier** (scheduled, not per-PR) runs a minimal path against
  **real Anthropic** to catch model/API drift — using a BYO test key and the
  existing cost caps.

## Cross-cutting guards (asserted on every test)

- **CSP-violation listener** — fail any test that fires a `securitypolicyviolation`.
  This generalizes the pdf-worker lesson to *all* flows and resources.
- **Console-error guard** — fail on unexpected `console.error`.
- **Bad-response guard** — fail on 4xx/5xx for app requests (with an allowlist for
  expected ones).

## Test inventory (mapped to the in-app Help sections = documented functionality)

**Tier A — read-only, demo aircraft, fast:**
- Landing + `/help` render; login / logout; dashboard shows the demo aircraft.
- Aircraft overview; **Status** grid (color-coded); **Timeline & search** (a query
  returns results); **Ask your logbook** (stubbed answer + citations render);
  **Maintenance forecast**; **AD/SB compliance**; **Installed equipment**;
  **Weight & Balance** history; **Records-gap audit**. Each asserts its documented
  elements render with no error.

**Tier B — write flows, scratch aircraft, stubbed AI:**
- **Enroll aircraft** (FAA lookup stub → 5 logbooks created).
- **Upload a PDF** → pages rasterize (**real pdf.js worker — this catches the
  CSP/worker regression**) → appear in the pages queue.
- **Extract** (stubbed) → entries appear in **Review** → confirm → status updates.
- **Find duplicates** → flags a planted duplicate.
- **"Other" document**: upload a W&B / AD fixture → revision / AD created.
- **Oil analysis**: import a fixture report → samples + trend chart render.
- **Equipment / maintenance scan** (stubbed) → proposals / updates.

**Tier C — account & integration:**
- **BYOK**: save a key → status shows "using your key"; remove it.
- **MyFlightBook**: save credentials → status reflects it (no real OAuth).
- **Notifications**: settings save round-trip.
- **Sharing**: invite by email → share row created (no real email).
- **Export**: CSV / print / `.zip` download; `.zip` re-import round-trip.

## Phasing

- **Phase 0** — Playwright + config + auth `global-setup` + cross-cutting guards +
  one smoke test (login → dashboard). Wire the fast tier into CI.
- **Phase 1** — Tier A (read-only) on the demo aircraft.
- **Phase 2** — the `E2E_STUB_AI` testability hook + Tier B write flows (including
  the real PDF-upload guard).
- **Phase 3** — Tier C account/integration flows.
- **Phase 4** — the scheduled "live" real-AI smoke tier.

## CI integration

- **Fast tier** (stubbed, ~minutes) runs on every PR alongside typecheck / lint /
  unit tests.
- **Live tier** runs nightly (cron) or on manual dispatch, gated on secrets, with a
  small real-AI budget.

## Open decisions (need your input before Phase 0)

1. **Dedicated test Supabase project** — OK to create one? (Strongly recommended
   over testing against prod.)
2. **Auth** — email + password test account (recommended), or the JWT you offered?
3. **AI stubbing** — OK to add the small `E2E_STUB_AI` testability hook in the
   extraction layer (keeps CI free + deterministic), plus the occasional live tier?
