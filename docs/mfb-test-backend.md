# MyFlightbook integration test backend

The test site uses the production web code path with the **test Supabase project**
(`arpirbajxbrjbkldteaz`) and MyFlightbook's development environment. It does
not use production data, storage, email, push, or cron credentials. The
environment override is [`apps/web/apphosting.mfb-test.yaml`](../apps/web/apphosting.mfb-test.yaml).

## Firebase setup

1. Create a **separate Firebase project** on the Blaze plan for this backend.
   Firebase recommends separate projects for separate environments. Link the
   MyTailLog GitHub repository under **App Hosting → Create backend**, with
   `apps/web` as its app root. Use the feature branch while testing; switch to
   `main` after the integration is released if this backend should persist.
2. Open that backend's **Settings → Environment** and set the environment name
   exactly to `mfb-test`. This causes App Hosting to merge
   `apphosting.mfb-test.yaml` over `apphosting.yaml` on every rollout. Confirm
   the setting before the first rollout.
3. In that **test Firebase project**, create these four Cloud Secret Manager
   secrets and grant the App Hosting backend access to each:

   | Secret ID | Value |
   | --- | --- |
   | `MFB_TEST_SUPABASE_ANON_KEY` | Test Supabase project's publishable/anon key |
   | `MFB_TEST_SUPABASE_SECRET_KEY` | Test Supabase project's `sb_secret_...` key |
   | `MFB_TEST_ENCRYPTION_KEY` | A new random value, at least 32 characters; do not reuse production |
   | `MFB_TEST_OIDC_JWKS` | A new RS256 JWKS JSON from `node apps/web/scripts/gen-oidc-jwks.mjs`; keep stable across rollouts |

   The app configuration pins the test Supabase URL and the test site URL.
   Secret values never belong in Git or Firebase console environment text
   variables. If using `firebase apphosting:secrets:set`, decline its offer to
   edit `apphosting.yaml`; the references already exist in the test override.
4. Connect `mfb-test.mytaillog.com` to this backend under **Settings → Domains**
   and apply the DNS records Firebase gives you. Wait for TLS to become active.
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
MyFlightbook OAuth client registration.

## MyFlightbook development setup and smoke test

The MyFlightbook development client currently points at `mytaillog.com` in its
source. It must be changed to use `https://mfb-test.mytaillog.com` for auth,
token, revoke, discovery/API calls in development only. The MyTailLog test DB
needs a **separate confidential client** whose callback is exactly
`https://developer.myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir`. Give it
the required read scopes, `hours:write`, and `offline_access`. Keep the client
secret in MyFlightbook development configuration, not in Firebase.

Before the live OAuth exchange, sign in with a test Supabase account and check
`https://mfb-test.mytaillog.com/api/oidc/.well-known/openid-configuration`.
Its issuer and endpoints must all use the test origin. Create a synthetic
aircraft only in the test DB, then verify a maintenance read and a Hobbs/Tach
push from MyFlightbook development. Check the resulting test DB rows and
access log; confirm production has no matching test records. The full test
matrix and rollout gate are in
[`plan-mfb-single-integration.md`](plan-mfb-single-integration.md).

## Current deployment state

The repository override is ready to deploy once the separate Firebase project,
backend, secrets, domain, and test Supabase Auth URL configuration exist. The
test backend has **not** been created or deployed by committing this file.
