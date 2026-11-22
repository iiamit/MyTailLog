# Releasing the iOS app

How to build MyTailLog for iPhone and iPad on a clean Mac and upload it to App Store Connect, where it goes out through TestFlight. The short path, once the Mac is set up, is `apps/ios/scripts/release.sh`.

## 1. Tools

| Tool | Version | Why |
|---|---|---|
| Xcode | 27.2 | Builds, signs and uploads |
| xcodegen | 2.47 (`brew install xcodegen`) | Generates `MyTailLog.xcodeproj` from `apps/ios/project.yml`; the project is not committed |
| JDK | 21 (`JAVA_HOME`) | Builds the shared Kotlin core into `MyTailLogCore.xcframework` |
| Node | 24 | Only to regenerate design tokens (`node packages/shared/scripts/build-tokens.mjs`) |

Leave about 2 GB free for the Kotlin/Native toolchain in `~/.konan` and the Gradle caches. The first core build downloads both and takes a few minutes.

## 2. Signing

- Team **38Z53C8X48**, automatic signing (set in `project.yml`). Bundle ids `com.mytaillog.app` and `com.mytaillog.app.widgets`, with the App Group `group.com.mytaillog.app`.
- The **Apple Distribution** certificate must be in the login keychain with its private key. Export it as a `.p12` from the Mac that has it, or create a fresh one in Xcode › Settings › Accounts › Manage Certificates.
- **The first upload from a new Mac goes through Xcode Organizer** (Product › Archive, then Distribute App › App Store Connect). The App Store Connect API key can't create provisioning profiles, so a command-line upload from a Mac with no profiles stops with "Cloud signing permission error". Once Organizer has made the profiles, the script works.

## 3. Environment

The release script uses the Apple account already signed in to Xcode. An App Store Connect API key is optional; when all three settings below are present, the script uses it instead. Keep the key outside the repo:

```sh
export APP_STORE_CONNECT_KEY_ID=<key id>
export APP_STORE_CONNECT_ISSUER_ID=<issuer id>
export APP_STORE_CONNECT_KEY_PATH=~/.config/mytaillog/ios/AuthKey_<key id>.p8
```

## 4. Release config

Create `apps/ios/Config/Release.local.xcconfig`. It is git-ignored; never commit it or paste the key anywhere in the repo.

```
SUPABASE_HOST = qyhoehgretgrgaxoledy.supabase.co
SUPABASE_PUBLISHABLE_KEY = <the production anon key>
API_HOST = mytaillog.com
```

No `https://`: `//` starts a comment in xcconfig files, and the app adds the scheme. A Release build with empty values stops with an error.

## 5. Build and upload

On the Mac build host, unlock the login keychain and run the release script in the same terminal session:

```sh
security unlock-keychain "$HOME/Library/Keychains/login.keychain-db"
source "$HOME/.config/mytaillog/env.sh"
apps/ios/scripts/release.sh
```

The script runs these steps. By hand, from the repo root:

```sh
# 1. The shared core, as a release XCFramework
(cd apps/core && ./gradlew :framework:assembleMyTailLogCoreReleaseXCFramework)

# 2. The Xcode project
cd apps/ios && xcodegen generate

# 3. Archive. The build number is a UTC timestamp, so it always goes up.
BUILD=$(date -u +%Y%m%d%H%M)
AUTH=(-allowProvisioningUpdates) # Xcode's signed-in account; API key arguments are optional
xcodebuild archive -project MyTailLog.xcodeproj -scheme MyTailLog -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/MyTailLog.xcarchive \
  CURRENT_PROJECT_VERSION="$BUILD" "${AUTH[@]}"

# 4. Export and upload
xcodebuild -exportArchive -archivePath build/MyTailLog.xcarchive \
  -exportOptionsPlist ExportOptions.example.plist -exportPath build "${AUTH[@]}"
```

`ExportOptions.example.plist` holds method `app-store-connect`, destination `upload`, the team id, `signingStyle` automatic and `manageAppVersionAndBuildNumber` false (the version comes from `MARKETING_VERSION` in `project.yml`, the build number from step 3). Set `EXPORT_OPTIONS` to use a different file with the script.

The build appears in TestFlight once App Store Connect has processed it, usually within 15 minutes. To ship a new version, raise `MARKETING_VERSION` for both targets in `project.yml` first.

## 6. Push

TestFlight and App Store builds register production APNs tokens (`aps-environment: production`). The server must send to production: `APNS_ENV=production` (also the default when unset; `sandbox` only for builds run from Xcode). See `apps/web/src/app/api/push/apns.ts`.

## 7. Universal links

Email sign-in links and `https://mytaillog.com/app/…` open the app through the AASA file served by `apps/web/src/app/.well-known/apple-app-site-association/route.ts`. It names team 38Z53C8X48 and `com.mytaillog.app`; nothing to change for a release. See [`deploy-prerequisites.md`](deploy-prerequisites.md).
# Release optimization and validation

The native app's XcodeGen spec owns Release settings for the app and widget:
whole-module Swift compilation optimized for size, dead-code stripping, stripped
installed products, retained dSYMs and built-product validation. The shared Kotlin
framework must also be built in **Release**. Keep debug/test settings separate.

The app includes `PrivacyInfo.xcprivacy` declaring its app-private UserDefaults use.
Review this whenever adding a required-reason API or SDK; do not copy unrelated
privacy reasons. Store privacy labels remain a separate declaration of actual data
collection and use.

Both upload entry points request symbol upload. `scripts/testflight.sh` retains the
archive, dSYMs and signed IPA in ignored `apps/ios/build/release-<build>/`, and validates
the IPA with App Store Connect before uploading. Keep these files for each shipped
build; deleting them can prevent symbolication of future crashes. Source the Mac's
protected release environment before invoking either script.

Inspect the complete archive log for compiler, linker, signing and asset warnings.
XcodeGen already enables the recommended compiler warnings; fix the cause rather
than disabling warnings. The minimum remains iOS 18, above Xcode 27.2's recommended
minimum. Use the current stable Xcode/SDK; SDK submission requirements are independent
of the app's minimum OS. Asset catalogs and App Store thinning handle device-specific
delivery; archive and universal IPA sizes are not the user's download size.

Test optimized simulator builds and a signed TestFlight build before public release.
Simulator tests cannot certify APNs, camera hardware, background execution or Apple's
review decisions.

References: [size optimization](https://developer.apple.com/documentation/xcode/doing-basic-optimization-to-reduce-your-app-s-size),
[release testing](https://developer.apple.com/documentation/xcode/testing-a-release-build),
[required-reason APIs](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api),
[submission requirements](https://developer.apple.com/news/upcoming-requirements/).
