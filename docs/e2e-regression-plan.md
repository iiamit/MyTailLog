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
  env (or `E2E_BASE_URL` points at a deployed preview); `e2e/auth.setup.ts` handles
  auth; trace + screenshot + video on failure.
- **`apps/web/e2e/`** organized by feature area; shared fixtures (`e2e/fixtures.ts`)
  for the CSP guard, `demoBase` (read-only demo aircraft) and `scratch` (a
  throwaway owned aircraft, cascade-deleted on teardown).

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
- **CSV import**: map → preview → import → the entries appear for review; the
  route refuses a non-CSV, a header-only file, an over-cap file, and a mapping
  with no date column; a viewer-level share gets a 403.

## Phasing

- **Phase 0 — DONE.** Playwright + config + auth setup + cross-cutting guards +
  a smoke test (login → dashboard). Fast tier wired into CI (`.github/workflows/e2e.yml`).
- **Phase 1 — DONE.** Tier A (read-only) on the demo aircraft (`read-only.spec.ts`).
- **Phase 2 — PARTIAL.** The `E2E_STUB_AI` hook exists (ask + oil-analysis shapes)
  with the real PDF-upload guard. Still open: extract → review → confirm, find
  duplicates, equipment/maintenance scan — all need new stub branches (the stub
  keys off the request's output schema, so each flow needs its own).
- **Phase 3 — PARTIAL.** Done: BYOK, sharing, export/import round trip. Still
  open: MyFlightBook credential-save UI, notification settings round-trip.
- **Phase 4** — the scheduled "live" real-AI smoke tier. Not started.

### Beyond the original plan

Features shipped after this plan was written, now covered: the **self-hosted sync
engine** (`sync-pull.spec.ts` — cursor convergence, delete propagation, RLS
scoping, Bearer auth), **Records Vault + blob serving** (`documents.spec.ts` —
also the end-to-end proof that the storage abstraction serves what it stored,
which is what the Supabase→GCS cutover changed), **squawks** (`squawks.spec.ts`),
and the **secret-ciphertext lockdowns** (0039 + 0047, in `rls-isolation.spec.ts`).

Still uncovered: meters / hobbs↔tach reconciliation UI (the logic is
unit-tested), enroll (FAA lookup), the capture route's JSON-base64 path, and the
oil-consumption panel.

## CI integration

- **Fast tier** (stubbed, ~minutes) runs on every PR alongside typecheck / lint /
  unit tests.
- **Live tier** runs nightly (cron) or on manual dispatch, gated on secrets, with a
  small real-AI budget.

## Decisions (confirmed)

1. **Dedicated test Supabase project** — yes. Write-flow tests run there, never
   against prod.
2. **Auth** — email + password test account; Playwright logs in once and reuses
   `storageState`.
3. **AI** — add the `E2E_STUB_AI` testability hook for a fast/free/deterministic
   per-PR tier, plus a scheduled **live** real-AI smoke tier.

## What you need to provision (before the harness can run)

- A **test Supabase project** with all `supabase/migrations/*.sql` applied, and its
  **Site URL / redirect** configured (or password sign-in enabled) for the test
  account.
- A **test account** (email + password) in that project — ideally with the demo
  aircraft present (auto-created on signup) and, for write flows, permission to
  create a scratch aircraft.
- **CI secrets** (GitHub → repo Settings → Secrets): `TEST_SUPABASE_URL`,
  `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SECRET_KEY`, `TEST_USER_EMAIL`,
  `TEST_USER_PASSWORD`, and (for the live tier) a small-budget `TEST_ANTHROPIC_KEY`.

## Next step

Phase 0 scaffolding (Playwright config + auth `global-setup` + cross-cutting
guards + the `E2E_STUB_AI` hook + a login→dashboard smoke test) can be built now
against `TEST_BASE_URL`/secrets read from env — it runs the moment the project +
secrets above exist.
