# MyTailLog for Android (native)

Single-activity Jetpack Compose app, direction D (docs/redesign/handoff). Replaces the Capacitor app (`apps/mobile`) in place: same application id, `com.mytaillog.app`. minSdk 29 (Android 10), targetSdk 36.

| Module | Holds |
|---|---|
| `:app` | `MainActivity`, sign-in (every method in 05 §8.2 except passkeys, below), sign-out, the shell: D's PhoneTabBar with one back stack per tab on phones, the binder Rail with a list-detail scaffold from 700dp |
| `:core-design` | Generated tokens, `MyTailLogTheme` (colours through `LocalMyTailLogColors`, light and dark following the system, Material 3 roles mapped per 01 §11, Libre Franklin and Literata), the double `focusRing()`, the no-ripple `StateLayerIndication` (8% hover, 14% pressed), Lucide icons, phone components (PhoneHeader, PhoneTabBar, PhoneLeaf, PhoneRow, AddButton, SectionIcon), Rail, DButton |
| `com.mytaillog.core:*` | The Kotlin Multiplatform core in `../core`, built from source through `includeBuild("../core")` |

## Build, test, run

Needs JDK 21 (`JAVA_HOME`) and the Android SDK with platform 36 (`ANDROID_HOME`).

```sh
cd apps/android
./gradlew :app:testDebugUnitTest :core-design:testDebugUnitTest   # unit + Robolectric tests
./gradlew :app:assembleDebug                                      # app/build/outputs/apk/debug/app-debug.apk
./gradlew :core:sync:allTests                                     # the core, through the composite build
```

On an emulator:

```sh
$ANDROID_HOME/emulator/emulator -avd <name> &       # create one in Android Studio's Device Manager, API 29+
./gradlew :app:installDebug
adb shell am start -n com.mytaillog.app/.MainActivity
```

The installed Capacitor build has the same id; uninstall it first (`adb uninstall com.mytaillog.app`) because the signing keys differ.

## Supabase config

`BuildConfig.SUPABASE_URL` / `SUPABASE_KEY`:
- **debug** points at the TEST project (`https://arpirbajxbrjbkldteaz.supabase.co`, publishable key in `app/build.gradle.kts`).
- **release** has no default. Pass `-Pmytaillog.supabaseUrl=… -Pmytaillog.supabaseKey=… -Pmytaillog.apiUrl=…` (or put them in `~/.gradle/gradle.properties`); `preReleaseBuild` fails without them.

`BuildConfig.API_URL` is the web app that serves `/api/*`: debug uses `https://mfb-test.mytaillog.com` (deployed against the TEST project).

## Status (phase 1: 06 M-STATUS-01, 02, 05, 08; T-STATUS-01)

`StatusViewModel` reads the aircraft list through PostgREST (role from `owner_id`, `aircraft_share`, `is_demo`) and `GET /api/aircraft/{id}/status`, the server's snapshot (09 §3.12), through `core:api`'s `StatusApi`; snapshots are cached in memory until the phase 3 mirror. Wording per row is in `StatusText.kt` (unit-tested against a live sample in `app/src/test/resources/status-n734dm.json`); the Verdict comes from the server. Not yet: Mark done, Plan ahead, suggested visits, the page viewer behind PageCite, the AircraftSwitcher sheet (a menu stands in).

The session is stored in DataStore, encrypted with a Tink AES-256-GCM key held in Android Keystore (05 §8.1). `Account` refreshes it under one lock when it expires within a minute (on every return to the foreground and on `accessToken()`); a refresh token the server refuses signs out with "You've been signed out. Sign in again to keep syncing."

## Capture and offline (phase 3: 06 M-SCAN-01..03, M-FLIGHT-02/03, M-SYS-01, §1.3)

`OfflineStore` opens `filesDir/{userId}/mirror.db` and `outbox.db` through `core:sync`'s `SyncEngine`, keeps captured pages in `outbox/pages` and thumbnails in `cache/thumbs`. `SyncWorker` (WorkManager, network constraint, expedited, dataSync foreground "Uploading 2 pages to N734DM", hourly periodic) uploads held pages by signed URL first, then pushes and pulls. `page.register` is queued only once the page is in storage and its scan's `batch.create` is queued, so killing the app at any point loses nothing; a scan the app died during is finished on the next launch. Status and the aircraft list fall back to the last server copy offline; Logbooks writes that can't reach the server go to the outbox.

The page camera is CameraX with our own edge finder (`PageFinder`: Otsu threshold, largest bright region, four corners) and `Matrix.setPolyToPoly` to flatten, not OpenCV (its AAR is 112 MB and can't run in JVM tests). ML Kit's Document Scanner is the fallback; ML Kit text recognition (bundled, about 11 MB per ABI) reads the page's dates for "Lands in 1984, inside the airframe gap" and the tach. `LiveCaptureTest` runs the upload path against the test server when `MTL_QA_USER` names the QA account's JSON.

## Maintenance, Aircraft and Documents (phase 4: 06 M-MAINT-01..07, M-AIRCRAFT-01..06, M-DOCS-01..03, M-FLIGHT-01/03/04/05)

Every screen reads this phone's mirror (`OfflineStore.records`: typed tables plus the raw `unknown_record` rows of component, document, oil, W&B and the rest) with the outbox laid over it (`overlay` in `Records.kt`), so a change made offline shows at once with "On this phone". Writes go through `OfflineStore.change`/`delete` as sync v2 mutations (squawk.*, ad.*, mx.*, component.*, proposals.*, wb.*, reading.*, meterReset.*, oil.*, document.*, timeCheck.dismiss). Squawk photos and documents are file jobs (`squawk_photo`, `document`): the sync run uploads them after the push, a photo only once its squawk is on the server, then pushes `squawkPhoto.create` (it waits on the file). Online only, disabled with the reason offline: Find ADs (the Federal Register, queried from the phone like the browser does), mechanic links, the logbook scans for completions and equipment, time checks, aircraft details (PostgREST, owner RLS). Tablet: list in the left leaf, the detail in the right (`TabletRecords`). `LiveRecordsTest` runs the writes against the test server when `MTL_QA_USER` is set.

## Plan and share (phase 5: 06 M-STATUS-03/04, T-STATUS-02, M-SHARE-01..03)

Plan ahead (`PlanScreens.kt`) runs core's `planDate` on the status snapshot, so it works offline; the 24-month visits come from `GET …/visits?horizonMonths=24` when there is signal. `PlanScale` draws the 24-month horizon with the first six months at double scale (14 D5); the DateScrubber drags, taps and steps a week at a time under TalkBack (`setProgress`). Visits: dashed caps on both line-aheads and rows on Status; booking, changing and cancelling queue `visit.create`/`visit.update`/`visit.setStatus` (and `provider.upsert` for a new shop), sending the list makes a 30-day link (`POST …/visits/{id}/send`) and opens the share sheet. Share (`ShareScreens.kt`): who it is for, a preview, what the room holds, `POST …/record-rooms`, the link with its QR (ZXing, white in dark mode too, full screen at full brightness), the open log, extend and revoke; people through PostgREST `aircraft_share` (owner RLS); the summary and dossier PDFs and the due-list CSV. All of Share is online only and says so; the last room list is kept under `filesDir/{user}/rooms/` so QR and copy work offline. `LiveShareTest` makes, opens anonymously, counts and revokes a room on N734QA, checks plan parity against `POST …/plan`, and books, sends and cancels a visit through the outbox.

## Sign-in (05 §8, 06 M-AUTH-01)

| Method | How | Returns by |
|---|---|---|
| Apple | Supabase OAuth (PKCE) in a Custom Tab | `com.mytaillog.app://auth/callback` |
| Google | Credential Manager `GetSignInWithGoogleOption` → ID token + nonce → `grant_type=id_token`. No Google account on the device, or no client ID: the same OAuth Custom Tab as Apple | — / custom scheme |
| Email link and code | One `/otp` email with a PKCE challenge. The code is typed; the link is a verified App Link. A link with no verifier on this phone shows "Enter the 6-digit code from the same email" | `https://mytaillog.com/app/auth/callback` |
| Password | "Use a password instead": sign in, create an account (name, 8+ characters), reset by emailed code | — |
| Passkeys | Phase 2 (needs server WebAuthn) | — |

Sign out: Aircraft › Settings (tablet: the Aircraft leaf) › **Sign out**, confirmed, revokes the refresh token if online and forgets the session.

Config this code needs (Apple and Google are configured in the **production** Supabase project only):
- `-Pmytaillog.googleWebClientId=<id>.apps.googleusercontent.com`: the Google Cloud **Web** client ID set on Supabase's Google provider. Also create an **Android** OAuth client in the same Google Cloud project for `com.mytaillog.app` with the SHA-1 of each signing key (debug, upload, Play app signing), and add the Web client ID to the provider's Authorized Client IDs. Without the property, Google uses the Custom Tab.
- Supabase › Auth › URL configuration › Redirect URLs: `com.mytaillog.app://auth/callback` and `https://mytaillog.com/app/auth/callback` (both projects).
- The Magic Link and Confirm signup email templates must carry `{{ .Token }}` as well as `{{ .ConfirmationURL }}`; Reset password must carry `{{ .Token }}`.
- `https://mytaillog.com/.well-known/assetlinks.json` with `delegate_permission/common.handle_all_urls` for `com.mytaillog.app` and the SHA-256 of each signing key, or the email link opens the browser instead of the app.

## Tokens and fonts

`core-design/src/main/kotlin/com/mytaillog/design/Tokens.kt` is generated from `packages/shared/tokens/tokens.json`. Never edit it by hand:

```sh
node packages/shared/scripts/build-tokens.mjs           # regenerate CSS, Swift and Kotlin
node packages/shared/scripts/build-tokens.mjs --check   # CI: fail if stale
```

Fonts in `core-design/src/main/res/font/` are copies of `apps/web/src/app/fonts/LibreFranklin.ttf` and `Literata.ttf` (variable, SIL OFL; licences in `core-design/src/main/assets/licenses/`).
