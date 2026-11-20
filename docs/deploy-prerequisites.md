# Deploy prerequisites

What a MyTailLog environment (production or test) needs outside the code. The general deploy steps are in the root [README](../README.md#deploy-firebase-app-hosting--supabase); the phone releases are in [release-ios.md](release-ios.md) and [release-android.md](release-android.md).

## Signed upload URLs (GCS)

With `STORAGE_BACKEND=gcs`, the phones' page uploads (`POST /api/aircraft/{id}/uploads`) hand out V4 signed URLs. On App Hosting there is no key file, so the client library signs through `iam.serviceAccounts.signBlob` as the runtime service account.

The App Hosting runtime service account needs **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`) **on itself**, in every project that uses GCS (production included):

```sh
SA=<runtime service account email>
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --project <project-id> \
  --member "serviceAccount:$SA" \
  --role roles/iam.serviceAccountTokenCreator
```

Without it, every phone upload fails. The API logs the signer's error (`[uploads] couldn't sign an upload URL ...`) and answers the phone with `{ code: "upload_unavailable" }` and "Couldn't prepare the upload. It will try again."

## Cloud Scheduler jobs

Three jobs, each its own job so a slow one never starves another:

| Job | Schedule | Does |
|---|---|---|
| `POST https://<host>/api/cron/daily` | once a day | MyFlightBook hours sync, reminder email and push, setup emails |
| `POST https://<host>/api/cron/backup` | once a day (nightly) | Scheduled backups to Dropbox and Google Drive that are due |
| `POST https://<host>/api/cron/reader` | every minute (`* * * * *`) | The reader: reads queued pages, and retries pages that waited for the AI allowance |

For all three:
- HTTP method **POST**, header `Authorization: Bearer <CRON_SECRET>` (the App Hosting secret of the same name).
- **Auth header: None.** An OIDC or OAuth token would replace the `Authorization` header, and the route would answer 401.
- **Attempt deadline 300s**, matching the routes' `maxDuration` and Cloud Run's request timeout.

Without the reader job, pages upload and then wait in "Waiting to be read" forever.

Two more jobs run on GitHub Actions and need `CRON_SECRET` as a repository secret: the ADS-B sweep (`.github/workflows/adsb-sweep.yml`, calls `/api/cron/adsb`; OpenSky blocks Google Cloud egress, so it can't run from Cloud Run) and onboarding email (`.github/workflows/onboarding-emails.yml`, `/api/cron/onboarding`).

## App links: `assetlinks.json` and the AASA

Both are served by the web app as static routes, so they deploy with it:

- `https://mytaillog.com/.well-known/assetlinks.json` (`apps/web/src/app/.well-known/assetlinks.json/route.ts`): Android App Links for `com.mytaillog.app`, with the SHA-256 of **Play's app signing key**. Add a fingerprint here if the app is ever signed by another key Android should trust.
- `https://mytaillog.com/.well-known/apple-app-site-association` (`apps/web/src/app/.well-known/apple-app-site-association/route.ts`): Universal Links for `38Z53C8X48.com.mytaillog.app`, paths `/app/auth/callback` and `/app/a/*`. Apple fetches it from the apex domain with no redirect, so `mytaillog.com` must answer it directly.

Email sign-in links on the phones depend on both. Android checks at install time; see [release-android.md](release-android.md#5-app-links) for re-verifying.

## Migrations: one file at a time

Apply each new file in `supabase/migrations/` on its own, in order, to test first and then production, and check the result before the next one. Never paste several files into one run: a failure part-way leaves the schema between two files with no record of which ran. Apply a migration before deploying code that uses it; enum-adding migrations in particular must land first. Details in [`supabase/README.md`](../supabase/README.md).

## The new design: `UI_V2_DEFAULT`

`UI_V2_DEFAULT` in `apps/web/apphosting.yaml` is the cut-over switch for the new web design (direction D, `apps/web/src/app/v2`).

- `"off"`: everyone sees the current design unless they chose the new one with **Try the new design**. Production is set this way today.
- Unset (or any other value): the new design is the default for everyone who hasn't chosen. The test backend runs this way.
- A browser's own choice (the `mtl_ui` cookie, set by "Try the new design" or "Switch back") always wins over the default (`apps/web/src/lib/uiV2.ts`).

Cutting over is a one-line change in `apphosting.yaml` and a deploy; switching back is the same in reverse. Pages the new design doesn't cover keep rendering the current design either way.

## Push

- **iOS:** APNs with the production environment. Set `APNS_ENV=production` (also the default when unset); `sandbox` only for builds run from Xcode. TestFlight and App Store builds register production tokens. See `apps/web/src/app/api/push/apns.ts`.
- **Android:** FCM through `FIREBASE_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`) and a Google identity allowed to send FCM messages (`apps/web/src/app/api/push/fcm.ts`).
