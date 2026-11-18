# MyTailLog for Android (native)

Single-activity Jetpack Compose app, direction D (docs/redesign/handoff). Replaces the Capacitor app (`apps/mobile`) in place: same application id, `com.mytaillog.app`. minSdk 29 (Android 10), targetSdk 36.

| Module | Holds |
|---|---|
| `:app` | `MainActivity`, sign-in (email one-time code), the shell: D's PhoneTabBar with one back stack per tab on phones, the binder Rail with a list-detail scaffold from 700dp |
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

The session is stored in DataStore, encrypted with a Tink AES-256-GCM key held in Android Keystore (05 §8.1).

## Tokens and fonts

`core-design/src/main/kotlin/com/mytaillog/design/Tokens.kt` is generated from `packages/shared/tokens/tokens.json`. Never edit it by hand:

```sh
node packages/shared/scripts/build-tokens.mjs           # regenerate CSS, Swift and Kotlin
node packages/shared/scripts/build-tokens.mjs --check   # CI: fail if stale
```

Fonts in `core-design/src/main/res/font/` are copies of `apps/web/src/app/fonts/LibreFranklin.ttf` and `Literata.ttf` (variable, SIL OFL; licences in `core-design/src/main/assets/licenses/`).
