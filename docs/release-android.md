# Releasing the Android app

How to build the native Android app (`apps/android`) and upload it to Google Play. Version 2.0.0 (version code 100) is on the internal track today. It replaces the Capacitor app in place: same application id, `com.mytaillog.app`, and a higher version code than the Capacitor app's 14.

## 1. Tools

JDK 21 (`JAVA_HOME`), the Android SDK with platform 36 (`ANDROID_HOME`), and Node 24 for the upload script. The first build downloads the Gradle caches and the shared Kotlin core's dependencies, so leave a couple of GB free.

## 2. Files kept outside the repo

| File | What it is |
|---|---|
| `apps/android/app/google-services.json` | The Firebase Android app's config for `com.mytaillog.app` (FCM reminders). Git-ignored. Without it the app builds, and Reminders says this build has no FCM settings. |
| `~/.config/mytaillog/android/signing.properties` | The Play upload key: `storeFile`, `storePassword`, `keyAlias`, `keyPassword`. The same file the Capacitor app used. `MYTAILLOG_ANDROID_SIGNING_PROPERTIES` points elsewhere. |
| `~/.config/mytaillog/android/play-service-account.json` | A Google Cloud service account with release access in the Play Console. `MYTAILLOG_PLAY_CREDENTIALS` points elsewhere. |

None of these go in the repo.

## 3. Build the bundle

Raise `versionCode` (and `versionName` for a new version) in `apps/android/app/build.gradle.kts` first; Play refuses a version code it has seen.

```sh
cd apps/android
./gradlew :app:bundleRelease \
  -Pmytaillog.supabaseUrl=https://qyhoehgretgrgaxoledy.supabase.co \
  -Pmytaillog.supabaseKey='<the production anon key>' \
  -Pmytaillog.apiUrl=https://mytaillog.com \
  -Pmytaillog.googleWebClientId=<id>.apps.googleusercontent.com   # optional: native Google sign-in
# → app/build/outputs/bundle/release/app-release.aab
```

A release build stops if any of the first three is missing. Without `googleWebClientId`, Google sign-in falls back to the browser tab. The properties can also live in `~/.gradle/gradle.properties`, never in the repo's.

## 4. Upload

The Capacitor app's Play script does the upload. Run it from `apps/mobile`, pointed at the native app:

```sh
cd apps/mobile
MYTAILLOG_ANDROID_DIR=../android node scripts/play.mjs check      # optional: credentials and tracks
MYTAILLOG_ANDROID_DIR=../android node scripts/play.mjs draft      # uploads the .aab as an internal draft
MYTAILLOG_ANDROID_DIR=../android node scripts/play.mjs internal   # releases that draft to internal testers
```

Call the script directly, not `npm run play:draft`: that npm script builds and uploads the Capacitor app. The script reads the version code from `apps/android/app/build.gradle.kts` and refuses a bundle whose code differs or is already on Play. `closed` and `production` promote an internal release further.

## 5. App Links

`https://mytaillog.com/app/…` links (email sign-in, notifications, shares) open the app only when Android has verified `https://mytaillog.com/.well-known/assetlinks.json`, served by `apps/web/src/app/.well-known/assetlinks.json/route.ts`. It lists the **Play app signing** key's SHA-256, so only Play-installed builds verify; a sideloaded debug or upload-signed build opens links in the browser.

Android checks the file at install time. After changing it, or when a test phone installed the app before the file was live, uninstall and reinstall from Play (or run `adb shell pm verify-app-links --re-verify com.mytaillog.app`), then check with `adb shell pm get-app-links com.mytaillog.app`.

The Capacitor build has the same id but a different signing key: uninstall it before installing a debug build of the native app.
# Release optimization checks

The native 2.0 app uses AGP's R8 optimization in Release: code and resource shrinking,
obfuscation, and the platform's optimized keep rules. Do not add package-wide keep
rules to silence runtime problems; preserve only the reflected entry points involved.
The AAB contains its crash mapping and the baseline profiles supplied by AndroidX.
Google Play delivers device-specific ABI, density and language splits from this bundle.

On the Mac build host, `apps/android/scripts/release.sh draft` runs full Release lint,
builds the bundle, and checks its embedded R8 metadata. It refuses bundles with a
shrinking, optimization or obfuscation score below 25%, or without crash mappings.
It retains the exact AAB under ignored `apps/android/build/releases/` before upload.
Python 3 is required. Run the gate's self-check with:

```sh
python3 apps/android/scripts/test_verify_release.py
```

For Google's analysis of a built bundle, use the current Android SDK command-line tools:

```sh
android --no-metrics analyze --analysis=optimization app-release.aab
```

Before publishing, install and exercise an **optimized Release** build against the test
backend (override the three release Gradle properties); debug tests cannot detect R8
reflection failures. Verify login, sync and restart, offline files, document/camera
entry points, widgets and background work. Check native libraries' ELF load alignment
and APK alignment with `zipalign -c -P 16 -v 4 app-release.apk` for 16 KB devices.
The current minimum stays Android 10 (29), with target 36 and compile SDK 37; raising
the minimum alone does not optimize delivery or replace release testing.

References: [R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization),
[DEX scores](https://developer.android.com/google/play/vitals/code-optimization),
[16 KB pages](https://developer.android.com/guide/practices/page-sizes),
[target SDK policy](https://developer.android.com/google/play/requirements/target-sdk).
