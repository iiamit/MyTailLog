# One MyFlightbook connection: implementation and verification plan

**Prepared:** 2026-11-09. **Status:** plan only; no product or partner changes deployed.

## Decision and non-negotiable test boundary

The normal integration will be the MyFlightbook-initiated MyTailLog OAuth grant. MyFlightbook reads maintenance data and pushes its flight Hobbs/Tach readings under that one grant. MyTailLog will stop asking users to create individual MyFlightbook OAuth applications. Existing pull connections remain operational until each user has a verified replacement or an explicit exception is handled.

Run MyTailLog's **same production application code paths** against the existing **test Supabase project**, with a separate public HTTPS test deployment. Do not switch `mytaillog.com` to the test database, route test requests through the production session, or copy production user tokens into test. The production build embeds its Supabase URL/anon key and its OAuth issuer uses `NEXT_PUBLIC_SITE_URL`, so a request to the existing production deployment cannot safely select the test database.

The real cross-platform round trip must be:

```text
developer.myflightbook.com (test user, test aircraft)
  -> https://mfb-test.mytaillog.com/api/oidc/auth (test MTL backend + test Supabase)
  -> https://mfb-test.mytaillog.com/oauth/consent/... (test MTL user)
  -> https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir (registered callback)
  -> https://mfb-test.mytaillog.com/api/oidc/token and /api/v1/... (test MTL data)
```

The MyFlightbook **OAuth callback** is on MyFlightbook's development host. The MyTailLog authorization/token/API host must be configurable in its development client. Its current `MyTailLogClient.cs` hardcodes `https://mytaillog.com` for all three, so without that small MyFlightbook-side change, a true MyFlightbook-dev + MyTailLog-test-database round trip is impossible. The present Playwright test deliberately stops before navigating to the external callback; it verifies our half of the flow but does not prove a live partner exchange.

If MyFlightbook cannot point its development client at the test host, keep automated tests on the test database and use a separate scratch account/aircraft in **production** for the live partner canary. Label those as two different test tiers; do not claim the production canary tested the test database. No full legacy-pull sunset until the live partner tier passes.

## Verified code and data facts

- MyFlightbook's `ExternalMaintenanceRecord.PushHighWaterMarks` computes the greatest recorded Hobbs and Tach separately, and `MyTailLogClient.UpdateHighWaterForAircraft` sends both when positive. `oAuthController.PushHighWaterMaintenance` is local-only; source does not prove that a scheduler invokes it in production.
- MyFlightbook currently assigns `Tach1`'s date and flight ID to the **Hobbs** payload. Its query can produce a null Tach date/ID, but its row mapper converts those values unconditionally. Its all-time-maximum comparison cannot convey a current Tach below a pre-replacement maximum. These require partner fixes and a real test before cutover.
- MyTailLog accepts one or batched meter readings at `POST /api/v1/aircraft/{id}/hours`, preserving the other meter on an upsert and deduplicating by `(aircraft_id, source, external_ref)`.
- The old pull stores credentials/tokens in `private.mfb_connection` and runs manually or in the daily cron. The MyFlightbook-initiated grant is stored separately in `oauth_account_grant` or `oauth_aircraft_grant`. A legacy token cannot be silently converted into the latter grant.
- Existing `oauth-mfb-exchange.spec.ts` covers OAuth/refresh/reads with a simulated MyFlightbook callback; `oauth-write.spec.ts` covers writes, idempotency, scope denial, and separate meter flights. They do not exercise the live MyFlightbook development client or the scheduled push.

## Phase 0 — prerequisites and isolation

1. Inventory in production, read-only: identify the actual MyFlightbook OAuth **client ID** (do not match by its display name); count legacy pull connections, partner grants, grants missing `hours:write`, and accounts/aircraft with successful partner POSTs. Record counts and timestamps, never export tokens or secrets.
2. Provision a minimal second Firebase App Hosting backend at `mfb-test.mytaillog.com`, sourced from the same commit as the proposed product change. Use an environment-specific App Hosting configuration. Set `NEXT_PUBLIC_SITE_URL` to the test origin at build **and** runtime; set both `NEXT_PUBLIC_SUPABASE_*` variables to the test project at build and runtime; give the backend only the test `SUPABASE_SECRET_KEY`, test `OIDC_JWKS`, test `ENCRYPTION_KEY`, and test-only OAuth client registration. Check the effective rollout environment: Firebase console overrides YAML values.
3. Set `STORAGE_BACKEND=supabase` for the test backend, using test storage. Do not mount the production GCS bucket, production email/push keys, or production cron secret. No scheduler targets this backend. Use test Supabase Auth redirect allowlisting for the test origin and test accounts/aircraft only. Configure DNS/TLS before testing browser cookies and redirects.
4. In MyFlightbook's **development** deployment, make the MyTailLog base URL configurable and set it to the test origin. Keep the normal production value unchanged. Register a distinct confidential MTL test client with its exact callback `https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir`, including `hours:write`, read scopes, and `offline_access`. Use a separate MFB development account with synthetic flights.
5. Verify isolation before authentication: the test page identifies the test Supabase project, a scratch aircraft exists only there, and the production account cannot log into the test backend. Abort if any test request reaches the production Supabase ref or production storage.

**Exit:** reachable test origin, correct issuer/discovery URL, distinct credentials, and a successful test-account login. Partner dev configuration is a hard prerequisite for the live test round trip.

## Phase 1 — make MyFlightbook's push safe

1. Partner PR: use `Hobbs1.AsOfDate`/`Hobbs1.FlightID` for the Hobbs reading; construct Tach only when a Tach high mark exists. Keep each meter's own external reference and date.
2. Agree with MyFlightbook on reset-aware Tach behavior. A decrease after replacement must be represented as a new reading with provenance, not ignored by `value > all-time maximum`; avoid treating airframe total time as displayed Tach. Make the trigger/retry behavior observable and ensure a failed POST does not advance the stored high-water mark.
3. Confirm the local-only push job is actually scheduled in MyFlightbook development and production, at what cadence, and whether manual invocation is available to partner testers. If it is not scheduled, add it there before relying on push as the sole source.
4. Verify matching and authorization behavior for a new aircraft, an account-wide grant, a selected-aircraft grant, an unmatched tail, and a grant without `hours:write`.

**Exit:** partner code merged in its development environment and documented push invocation/cadence. A source review alone is insufficient.

## Phase 2 — product and migration implementation

1. Replace the MyTailLog Profile credential form and manual pull button with one MyFlightbook card. Derive partner identity from the configured client ID. Distinguish: no grant; granted but no matched aircraft/readings; data received; stale/no recent delivery; and revoked/insufficient scope. Show per-aircraft last successful Hobbs and Tach with dates, source, and a link to MFB setup/re-consent. Never call a grant alone "synced."
2. Read status from existing `oauth_account_grant`/`oauth_aircraft_grant`, `oauth_access_log` (successful `hours:write` POST), and `hours_reading`. Add only the minimal indexing/status data if real query measurements require it. Preserve the generic Connected Apps revoke control.
3. Add a small per-user legacy-pull enable flag to `private.mfb_connection`, initially true for existing token holders. Once a partner grant with `hours:write` has delivered a reading for each expected matched aircraft, disable pull for that user. A no-flight aircraft can be verified with an explicit partner response/status rather than inventing a meter reading. Keep the legacy route privately available during migration, but prevent new registrations in the normal UI.
4. During overlap, guard the pull/upsert path against replacing a known meter with null when the same MFB flight ID has already arrived via push. Preserve all `hours_reading` history. Make migration state and failures visible to administrators without exposing secrets.
5. Update the integration guide, Help, README, landing-page claims, and any mobile/account copy that promises a daily MTL pull. Explain one authorization, the separate aircraft-matching action in MFB, the last-received status, re-consent for old grants, and how to disconnect. Remove legacy instructions after migration ends.

## Phase 3 — automated and live test milestone (mandatory rollout gate)

### Automated, against test Supabase

- Reuse the existing Playwright runner with `TEST_SUPABASE_*` and the same app commit. Expand the simulated MFB exchange so **one token** carries the complete read/write scope set, reads airworthiness, posts independent Hobbs/Tach readings, refreshes, and reads again.
- Verify Hobbs-only; Tach-only; both on one flight; different flight IDs/dates; repeated POST; same flight ID sent by two meter records; correction preserving the other meter; malformed input; missing scope; revoked grant; selected-aircraft restriction; no aircraft; wrong user.
- Verify migration classification and flag transitions: legacy only, partner only, both verified, both unverified, old grant missing `hours:write`, and no flight since grant. Assert that cutover never deletes historical readings or credentials before the user's replacement is verified.
- Confirm the status card accurately distinguishes OAuth consent from observed data. Test browser callback/CSP behavior and exact redirect URI.

### Real cross-platform exchange, against both test environments

Use a MyFlightbook development user and a MyTailLog test user with a matching synthetic tail. Capture a redacted run record: app commit, MFB dev commit, client ID suffix, test tail, scopes, timestamps, HTTP status, flight IDs, and resulting test-DB rows. Do not log tokens or client secrets.

1. Start at MyFlightbook dev, authorize MTL test, choose account-wide or selected-aircraft access, and follow the **real browser** redirect into the MFB dev callback. Confirm the MFB dev client exchanges and refreshes tokens against the MTL test host.
2. Run "Update from MyTailLog" and verify MFB dev displays the test aircraft's maintenance/airworthiness data.
3. Enter synthetic flights covering the meter matrix and trigger/await the real MFB dev push job. Verify MTL test `oauth_access_log`, `hours_reading`, current meters, and status card agree on both meter values and each meter's own date/flight ID.
4. Re-run the job (no duplicates), revoke the grant (push fails without data change), re-consent (push resumes), and verify a replaced tach is not stuck behind the old maximum. Exercise an older MFB-side token through refresh after its OAuth client rewrite.
5. Include a legacy-connected MTL test account; confirm no gap or null overwrite during overlap and that the pull stops only after verified push delivery.

**Pass gate:** every case above passes; no test call touches production Supabase/storage; a real scheduled MFB dev push is observed; both directions use one grant; and results are signed off in the PR/release checklist. If any case fails, do not remove the legacy path or start broad migration.

## Phase 4 — production canary, rollout, and sunset

1. Deploy the compatible MTL code with the legacy path still active for current users. Enable the new UI/status for a small canary. On production, use consenting scratch/canary accounts and verify at least one real MFB production scheduled push and a maintenance read; compare actual `hours:write` access logs and resulting readings. This is a **production canary**, not a substitute for the test-DB milestone.
2. Migrate verified users in batches. Offer legacy-only users a concise action notice: authorize MyTailLog in MFB, select aircraft, run Update from MyTailLog, then check receipt in MTL. Do not migrate by merely detecting an OAuth grant. Keep the old pull active for non-responders until there is a policy and an announced date.
3. Monitor per-account failures, missing scopes, unmatched aircraft, delivery age, meter provenance, duplicate rows, and refresh errors. Roll back by re-enabling the old pull for affected accounts; no meter history is deleted.
4. After every active legacy account is verified or individually resolved and the announced transition window ends, remove the old routes, cron pass, form/actions, client code, tests specific to that path, and `private.mfb_connection` via a committed migration. Keep `hours_reading` and the shared encryption key used by other features. Tell users they may revoke/delete their self-registered MFB OAuth app in MyFlightbook.

## Dependencies and readiness

MTL can implement the test backend, automated tests, UI, migration controls, and docs. The **live test milestone depends on MyFlightbook** accepting a configurable development base URL, fixing meter provenance/null/reset behavior, and providing access to its development account and push job. The source currently does not confirm that the production push schedule is running. Do not promise full rollout until these dependencies and the milestone are verified.

The local checkout currently has production Supabase URLs in `.env.local` and `apps/web/.env.local`; no `TEST_SUPABASE_*` variables are exported in this shell. The CI workflow has test-database secrets and already runs the application code against them. Implementation must obtain the test values through the established secret store or a private local env file, not copy production env files into the test deployment.
