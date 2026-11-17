# MyFlightbook integration test backend

The test site uses the production web code path with the **test Supabase project**
(`arpirbajxbrjbkldteaz`) and MyFlightbook's development environment. It does
not use production data, storage, email, push, or cron credentials. The
environment override is [`apps/web/apphosting.mfb_test.yaml`](../apps/web/apphosting.mfb_test.yaml).

## Firebase setup

1. Use the existing **separate Firebase project** `test-67a88196`, now on
   Blaze. Its App Hosting backend is `mfb-test` in `us-east4`, linked to
   `iiamit/MyTailLog` at `/apps/web`. Deploy the feature branch while testing;
   switch to `main` after the integration is released if this backend should
   persist.
2. The backend's **Settings → Environment** name is `mfb_test`. This causes
   App Hosting to merge
   `apphosting.mfb_test.yaml` over `apphosting.yaml` on every rollout. Confirm
   the setting before the first rollout.
3. In that **test Firebase project**, create these five Cloud Secret Manager
   secrets and grant the App Hosting backend access to each:

   | Secret ID | Value |
   | --- | --- |
   | `MFB_TEST_SUPABASE_ANON_KEY` | Test Supabase project's publishable/anon key |
   | `MFB_TEST_SUPABASE_SECRET_KEY` | Test Supabase project's `sb_secret_...` key |
   | `MFB_TEST_ENCRYPTION_KEY` | A new random value, at least 32 characters; do not reuse production |
   | `MFB_TEST_OIDC_JWKS` | A new RS256 JWKS JSON from `node apps/web/scripts/gen-oidc-jwks.mjs`; keep stable across rollouts |
   | `MFB_TEST_CRON_SECRET` | A new random value used only to protect test cron routes |

   The app configuration pins the test Supabase URL and the test site URL.
   Firebase rejects empty environment values, so optional external providers
   use invalid `test-disabled` placeholders instead of production credentials.
   Do not exercise AI, email, backup, or push features on this backend.
   Secret values never belong in Git or Firebase console environment text
   variables. If using `firebase apphosting:secrets:set`, decline its offer to
   edit `apphosting.yaml`; the references already exist in the test override.
4. `mfb-test.mytaillog.com` is attached to the backend. Add the DNS records
   Firebase requested: `A mfb-test → 35.219.200.203` and
   `TXT mfb-test → fah-claim=023-02-7f604610-2a87-4ef5-92bc-4c60adb21ac6`.
   Wait for ownership and TLS to become active.
   The default `hosted.app` address can be used for a first smoke test, but
   OAuth issuer and redirects are pinned to the custom domain.
5. Before using the backend, inspect the rollout's **Environment variables in
   this build**. Confirm both `NEXT_PUBLIC_SUPABASE_*` variables refer to the
   test project at build and runtime, `SUPABASE_SECRET_KEY` resolves to the test
   secret, `NEXT_PUBLIC_SITE_URL` is the test domain, and
   `STORAGE_BACKEND=supabase`. Confirm no console-level overrides replace any
   of these; Firebase console values have higher precedence than YAML. Confirm
   the production GCS bucket and production API/push/email keys are absent.

There is **no Firebase Authentication provider setup** for this test site.
MyTailLog web authentication uses Supabase Auth. The test project's Auth URL
configuration must allow `https://mfb-test.mytaillog.com` and its
`/auth/callback` redirect. Any social login test also needs its provider
configuration in the **test Supabase project**. This is separate from the
MyFlightbook OAuth client registration. Production user accounts and aircraft
are not copied into the test project. Partner testers should create a test
account with an email they can receive, then enroll synthetic aircraft with
tails that match their MyFlightbook development account. The unconfirmed
`mfb-demo@mytaillog.com` test account has no aircraft and should not be used.

## MyFlightbook development setup and smoke test

The MyFlightbook development client currently points at `mytaillog.com` in its
source. It must be changed to use `https://mfb-test.mytaillog.com` for auth,
token, revoke, discovery/API calls in development only. On 2026-11-09, the
existing MyFlightbook OAuth client ID and secret were copied from production to
the **test Supabase database**, with only the development callback
`https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir` allowed.
The secret was re-encrypted with the test backend's distinct `ENCRYPTION_KEY`;
production registration and grants were unchanged. The test client has the
same read scopes, `hours:write`, and `offline_access`. No Firebase secret is
needed for the MyFlightbook client: it lives in the test database. A live token
endpoint probe accepted the client credentials and rejected only the deliberately
invalid authorization code (`invalid_grant`).

Before the live OAuth exchange, sign in with a test Supabase account and check
`https://mfb-test.mytaillog.com/api/oidc/.well-known/openid-configuration`.
Its issuer and endpoints must all use the test origin. Create a synthetic
aircraft only in the test DB, then verify a maintenance read and a Hobbs/Tach
push from MyFlightbook development. Check the resulting test DB rows and
access log; confirm production has no matching test records. The full test
matrix and rollout gate are in
[`plan-mfb-single-integration.md`](plan-mfb-single-integration.md).

## Current deployment state

The test Firebase project is on Blaze, the `mfb-test` backend is created and
tagged `mfb_test`, and GitHub is linked. Automatic rollouts are disabled; the
live branch is `codex/mfb-test-backend`. All five test secrets are provisioned.
The first successful manual rollout (`build-2026-11-09-002`, commit `1a8a5a6`)
is live. Firebase reports the custom domain's host, ownership, and certificate
as active. The home page returns 200, and the OIDC discovery document advertises
only `mfb-test.mytaillog.com` endpoints. The effective build configuration uses
the test Supabase project and test secret references. The project owner added
the test Supabase Auth redirect URL on 2026-11-09; the initial partner callback
was exercised on 2026-11-10.

On 2026-11-10, Eric reported a successful development OAuth exchange, a manual
run of his nightly push that populated Tach and Hobbs on the test aircraft,
and an annual inspection imported from MTL test into MFB development. His
changes are committed but not yet in MyFlightbook production. This partner
smoke report does not close the reset, repeat-push, refresh, revocation, or
production-canary gates in the integration plan. The Firebase CLI login on
this host expired before a fresh test-DB audit could be read independently.
