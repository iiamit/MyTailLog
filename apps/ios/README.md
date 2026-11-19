# MyTailLog for iPhone and iPad

The native SwiftUI app for direction D (spec: `docs/redesign/handoff`, especially 05 and 06). iOS/iPadOS 18.0+, Swift 6, SwiftUI + Observation. Bundle id `com.mytaillog.app` (the same as the Capacitor app it replaces).

Phase 0: app shell (D's PhoneTabBar over a hidden system tab bar, one `NavigationStack` per tab, PhoneHeader and PhoneLeaf per section; on iPad a `NavigationSplitView` with the binder Rail), the theme (tokens, fonts, button styles), and sign-in (M-AUTH-01) against Supabase Auth: Apple, Google, email link and code, password.

Phase 2: Logbooks and review. The vertical map (M-BOOKS-01, one book M-BOOKS-05) with its stop, visit and gap sheets (M-BOOKS-02/03/04), Books and pages (M-BOOKS-06), Entry (M-BOOKS-07), Entries as a list (M-BOOKS-08), and the review queue and desk (M-REVIEW-01/02/03); on iPad the horizontal map with the page beside it (T-BOOKS-01) and the three-pane desk with keys (T-REVIEW-01).

Phase 1: Status. The phone home (M-STATUS-01/02) with the Verdict, the line ahead and the due groups; All items (M-STATUS-08) and Item detail (M-STATUS-05) pushed in the Status tab; on iPad the two leaves of T-STATUS-01 (a row selects, the right leaf shows that item). The overdue count badges the Status tab; the tail line and the RailPlate switch aircraft.

## Generate, build, test
The Xcode project is generated from `project.yml` and is not committed.

```sh
brew install xcodegen            # once
(cd apps/core && ./gradlew :framework:assembleMyTailLogCoreXCFramework)   # the KMP core the app links (about 3 min)
cd apps/ios
xcodegen generate                # writes MyTailLog.xcodeproj and MyTailLog/Info.plist
xcodebuild test -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPhone 17'
xcodebuild build -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5)'
```
Re-run `xcodegen generate` after adding or removing files. Tests use Swift Testing (`MyTailLogTests`, hosted in the app so the bundled fonts are registered). `MyTailLogTests/Fixtures/status-n734dm.json` is a real snapshot, the same file as Android's test resource; `map-n734dm.json`, `gap-evidence-n734dm.json` and `review-n734dm.json` are the demo aircraft's map, a gap's evidence and its pages and unconfirmed entries. `BooksTests` also runs `packages/shared/fixtures/map-layout*.json` in place.

## Configuration
- **Debug** reads `Config/Debug.xcconfig`: the TEST Supabase project and its publishable key (public by design), and `API_HOST`, the TEST app API that serves the status snapshot.
- **Release** reads `Config/Release.xcconfig`, which includes `Config/Release.local.xcconfig` (not committed). Create it with `SUPABASE_HOST = <ref>.supabase.co`, `SUPABASE_PUBLISHABLE_KEY = sb_publishable_…` and `API_HOST = <app API host>`; a build with empty values stops with an error.
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
- **Shared core:** the app links `MyTailLogCore.xcframework` (release build, from `apps/core/framework/build/XCFrameworks`; static, so `-lsqlite3` for SQLDelight). Only `Core/MapLayoutBridge.swift` imports it: it hands the map model to the core's `layoutMap` and returns Swift values, so the phone draws exactly what Android draws. `Core/CoreBridge.swift` stays the seam for the mirror and sync (phase 3); the app uses `InMemoryCore` until then.

## Status (phase 1)
- **Data:** `Status/StatusAPI.swift` lists the aircraft through PostgREST under RLS (role: owner, editor from `aircraft_share` by email, else viewer; the demo aircraft is read-only) and fetches `GET /api/aircraft/{id}/status` with the Supabase access token. The server is the authority; the app never works out what is due. Snapshots are cached in memory (`StatusModel`) until the phase 3 mirror.
- **Wording:** `Status/StatusText.swift` is a port of Android's `StatusText.kt` (groups, row values, spoken rows, item detail lines, line-ahead geometry). Change both together.
- **Not yet:** Mark done, swipe and long-press actions, the SourceMat page and history line, visit caps, Plan ahead (phase 5), offline and conflict bars (phase 3).

## Logbooks (phase 2)
- **Data:** `Books/BooksAPI.swift` reads `GET /api/aircraft/{id}/map` and `/gaps/{gapId}/evidence`, books, pages and entries through PostgREST under RLS, and page images through `GET /api/page/{id}/image` (thumbnails with `?thumb=1`) with the access token. Writes (`entry.confirm`, `entry.update`, `entry.delete`, `page.review`, `gap.setStatus`) go to `POST /api/sync/push` with the row's `updated_at` as `base`; viewers and the demo get no write controls, and a refusal reads "You can view this aircraft. The owner can make changes."
- **Rules:** `Books/BooksLogic.swift`: the review queue, fields least certain first (below 0.75 is doubt, as the web), the three outcomes, the writes a confirmation sends and the ones its Undo sends (edits put back first, then un-confirm).
- **Drawing:** `Books/RouteMapView.swift` draws the core's layout in a Canvas (phone vertical, iPad horizontal); every stop, visit, gap and ring is also an accessibility child, with Stops, Visits, Gaps and Due items rotors.
- **Not yet:** Scan pages (phase 3), Select mode, reorder, retake, delete and volumes; What it satisfied and attached documents on an entry; Add a missed entry, merge, continues-on-next-page and Read again on the desk; the reader's alternative reading and reason for a doubt (the extraction does not store them); offline (phase 3).

## Layout
```
App/            entry point
Auth/           AuthClient (URLSession to /auth/v1), AuthFlow (PKCE, nonce, return URLs), SessionStore + Keychain, SignInView (M-AUTH-01)
Core/           CoreBridge protocol and the in-memory stand-in; MapLayoutBridge (the only file that imports the KMP core)
DesignSystem/   generated Tokens, Section, Typography, Buttons, PhoneChrome (PhoneHeader, PhoneLeaf, PhoneTabBar), Records (Verdict, StatusMark, TrustMark, PageCite, LineChip, rows)
Status/         StatusAPI, StatusModel, StatusText, the Status screens and the LineAhead
Books/          BooksAPI, BooksModel, BooksLogic, MapData, MapElements, RouteMapView, the map sheets, scans, Logbooks and review screens
Shell/          TabModel, RootView, phone and tablet shells, Rail
```
