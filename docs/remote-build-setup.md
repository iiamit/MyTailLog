# Remote build machine — iOS + Android release setup

How this Mac builds the two **native** apps (`apps/ios`, `apps/android`) and ships
them to TestFlight / the App Store and to Google Play's internal, closed and
production tracks, headlessly. The Capacitor app (`apps/mobile`) is being retired;
its `play.mjs` is reused for upload, but the binaries now come from the native
projects.

## Toolchain (installed)

| Tool | Where | Notes |
|---|---|---|
| Xcode 27.2 | `/Applications/Xcode.app` | pre-existing |
| Node 25 / npm 11 | Homebrew | pre-existing |
| xcodegen 2.48 | `brew install xcodegen` | generates `MyTailLog.xcodeproj` from `project.yml` |
| JDK 21 (Temurin-equiv) | `brew install openjdk@21` → `/opt/homebrew/opt/openjdk@21` | keg-only; `JAVA_HOME` set in env |
| Android SDK | `~/Library/Android/sdk` | platforms 36 & 37.0, build-tools 36.0.0 & 37.0.0, platform-tools; licenses accepted |

Environment lives in `~/.config/mytaillog/env.sh`, sourced from `~/.zshenv` so
non-interactive/ssh/cron shells get `JAVA_HOME`, `ANDROID_HOME`, `PATH` and the
credential variables. After editing it, `source ~/.zshenv` or start a new shell.

## Credentials to provide (nothing secret is committed)

Place these files, then releases run unattended:

| File | What it is | How to get it |
|---|---|---|
| `~/.config/mytaillog/ios/AuthKey.p8` | App Store Connect API key. Creates/installs the App Store **profiles** and uploads to TestFlight. | App Store Connect → Users and Access → Integrations → App Store Connect API → generate key. Note the **Key ID** and **Issuer ID**. |
| `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` | the key's IDs | set in `~/.config/mytaillog/env.sh` |
| **Apple Distribution cert** (`.p12`, cert + private key) imported into the login keychain | signs the App Store build. An ASC API key **cannot** create a cloud-managed distribution cert, so this is a one-time human step. | Account Holder/Admin: Developer portal → Certificates → Apple Distribution; export from Keychain as `.p12` with its private key; `security import dist.p12 -k ~/Library/Keychains/login.keychain-db -P <pw> -T /usr/bin/codesign`. Profiles are then created automatically by `apps/ios/scripts/make-profiles.mjs`. |
| `apps/ios/Config/Release.local.xcconfig` | prod Supabase + API host for iOS | `SUPABASE_HOST = <ref>.supabase.co`, `SUPABASE_PUBLISHABLE_KEY = sb_publishable_…`, `API_HOST = <app API host>` (host only, no scheme) |
| `~/.config/mytaillog/android/upload-keystore.jks` + `signing.properties` | the Play **upload key** (same one the Capacitor app used) | copy `signing.properties.template`, fill `storeFile/storePassword/keyAlias/keyPassword` |
| `~/.config/mytaillog/android/play-service-account.json` | Google Play Publisher API service account | Play Console → Users & permissions / Google Cloud → service account JSON with Play access |
| `apps/android/app/google-services.json` | Firebase config for FCM (package `com.mytaillog.app`) | Firebase console (or pass `-Pmytaillog.firebase*`) |
| `~/.gradle/gradle.properties` | prod `mytaillog.supabaseUrl` / `supabaseKey` / `apiUrl` (+ optional `googleWebClientId`, `firebase*`) | uncomment the template already written there |

Apple portal prerequisites cloud signing can't invent: App ID `com.mytaillog.app`
with Sign in with Apple, Associated Domains, App Groups and Push; App Group
`group.com.mytaillog.app`; widget App ID `com.mytaillog.app.widgets`.

## Build & verify (no credentials needed)

```sh
# Android: compiles the KMP core via the composite build + unit tests + debug APK
cd apps/android && ./gradlew :app:testDebugUnitTest :core-design:testDebugUnitTest :app:assembleDebug

# iOS: KMP XCFramework + generate project + simulator build
cd apps/core && ./gradlew :framework:assembleMyTailLogCoreXCFramework
cd ../ios && xcodegen generate
xcodebuild build -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPhone 17'
```

## Release — iOS (TestFlight → App Store)

```sh
apps/ios/scripts/testflight.sh [version]     # default version 2.0.0, build number = UTC timestamp
```
Builds the XCFramework, generates the project, archives Release (development
cloud signing), ensures the App Store profiles exist (`make-profiles.mjs` creates
them via the API against the imported distribution cert), exports an App Store
IPA with **manual** signing, and uploads it with `altool`. It then appears in
TestFlight after processing; promote to a store release in App Store Connect.

Signing note: automatic/cloud signing fails on this account with "Cloud signing
permission error" because the API key can't create a cloud-managed distribution
certificate. The pipeline sidesteps that — it signs with the local Apple
Distribution cert and API-created profiles — so the distribution `.p12` above is
required and the profiles (`MyTailLog App Store`, `MyTailLog Widgets App Store`)
are regenerated/installed on each run.

## Release — Android (internal → closed → production)

```sh
apps/android/scripts/release.sh check        # inspect tracks & bundle versions
apps/android/scripts/release.sh draft        # build signed AAB + upload as internal DRAFT (no testers)
apps/android/scripts/release.sh internal     # promote the draft to internal testers
apps/android/scripts/release.sh closed       # promote completed internal bundle to closed (alpha)
apps/android/scripts/release.sh production    # promote completed internal bundle to production
```
Bump `versionCode` in `apps/android/app/build.gradle.kts` before each new build —
Play rejects a duplicate. The current value is 100 (above the Capacitor app's 14).

A successful AAB upload is not a finished release: complete the Play Console
declarations (Data safety, content rating, app access, privacy policy) before
promoting past internal. New developer accounts need 12 testers for 14 days
before production access.
