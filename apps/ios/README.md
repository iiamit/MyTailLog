# MyTailLog for iPhone and iPad

The native SwiftUI app for direction D (spec: `docs/redesign/handoff`, especially 05 and 06). iOS/iPadOS 18.0+, Swift 6, SwiftUI + Observation. Bundle id `com.mytaillog.app` (the same as the Capacitor app it replaces).

Phase 0: app shell (D's PhoneTabBar over a hidden system tab bar, one `NavigationStack` per tab, PhoneHeader and PhoneLeaf per section; on iPad a `NavigationSplitView` with the binder Rail), the theme (tokens, fonts, button styles), and sign-in (M-AUTH-01) against Supabase Auth: Apple, Google, email link and code, password.

## Generate, build, test
The Xcode project is generated from `project.yml` and is not committed.

```sh
brew install xcodegen            # once
cd apps/ios
xcodegen generate                # writes MyTailLog.xcodeproj and MyTailLog/Info.plist
xcodebuild test -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPhone 17'
xcodebuild build -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5)'
```
Re-run `xcodegen generate` after adding or removing files. Tests use Swift Testing (`MyTailLogTests`, hosted in the app so the bundled fonts are registered).

## Configuration
- **Debug** reads `Config/Debug.xcconfig`: the TEST Supabase project and its publishable key (public by design).
- **Release** reads `Config/Release.xcconfig`, which includes `Config/Release.local.xcconfig` (not committed). Create it with `SUPABASE_HOST = <ref>.supabase.co` and `SUPABASE_PUBLISHABLE_KEY = sb_publishable_…`; a build with empty values stops with an error.
- The host has no scheme because `//` starts a comment in xcconfig files; the app adds `https://`.

## Sign-in (05 §8)
- **Apple:** native `SignInWithAppleButton` with a SHA-256 nonce, then `POST /auth/v1/token?grant_type=id_token`. Needs the Sign in with Apple capability on the App ID and `com.mytaillog.app` in the Supabase Apple provider's client IDs.
- **Google:** `ASWebAuthenticationSession` on `/auth/v1/authorize?provider=google` with PKCE, returning to `com.mytaillog.app://auth/callback` (URL scheme in `project.yml`), then `grant_type=pkce`. No Google SDK.
- **Email link and code:** one `/auth/v1/otp` email sent with a PKCE challenge and `redirect_to=https://mytaillog.com/app/auth/callback`. The link opens the app as a Universal Link (`applinks:mytaillog.com`; the AASA file is `apps/web/src/app/.well-known/apple-app-site-association/route.ts`) and is exchanged with the verifier kept in the Keychain. A link without that verifier asks for the code from the same email. The code goes to `/auth/v1/verify`.
- **Password:** sign in (`grant_type=password`), create an account (`/signup`), reset by a code from `/recover` then `PUT /user`.
- These complete only where the Supabase project has the provider and redirect URLs; the TEST project has password and email only.

## Where things come from
- **Tokens:** `MyTailLog/DesignSystem/Tokens.swift` is generated from `packages/shared/tokens/tokens.json` by `node packages/shared/scripts/build-tokens.mjs` (from the repo root). Never edit it by hand. `Section.swift` maps sections to their token colours; `Typography.swift` maps phone type roles to the bundled fonts with Dynamic Type (`relativeTo:`), tabular figures and Bold Text.
- **Fonts:** `MyTailLog/Resources/Fonts`, copies of `apps/web/src/app/fonts/LibreFranklin.ttf` and `Literata.ttf` (SIL OFL, licences beside them), registered through `UIAppFonts`.
- **Icons:** Lucide 0.469 glyphs as template SVGs in `Assets.xcassets/Icons`, written by `node apps/ios/scripts/build-icons.mjs` (needs `apps/web/node_modules`, or `LUCIDE_ICONS=<dir>`).
- **Shared core:** `Core/CoreBridge.swift` is the seam for the Kotlin Multiplatform core (`apps/core`). The app uses `InMemoryCore` until the XCFramework is ready; then add a conforming type that wraps it and pass it in `MyTailLogApp`.

## Layout
```
App/            entry point
Auth/           AuthClient (URLSession to /auth/v1), AuthFlow (PKCE, nonce, return URLs), SessionStore + Keychain, SignInView (M-AUTH-01)
Core/           CoreBridge protocol and the in-memory stand-in
DesignSystem/   generated Tokens, Section, Typography, Buttons, PhoneChrome (PhoneHeader, PhoneLeaf, PhoneTabBar)
Shell/          TabModel, RootView, phone and tablet shells, Rail
```
