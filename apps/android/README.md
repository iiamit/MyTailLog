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
- **release** has no default. Pass `-Pmytaillog.supabaseUrl=… -Pmytaillog.supabaseKey=…` (or put them in `~/.gradle/gradle.properties`); `preReleaseBuild` fails without them.

The session is stored in DataStore, encrypted with a Tink AES-256-GCM key held in Android Keystore (05 §8.1). `Account` refreshes it under one lock when it expires within a minute (on every return to the foreground and on `accessToken()`); a refresh token the server refuses signs out with "You've been signed out. Sign in again to keep syncing."

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
