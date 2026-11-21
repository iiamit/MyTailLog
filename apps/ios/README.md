# MyTailLog for iPhone and iPad

The native SwiftUI app for direction D (spec: `docs/redesign/handoff`, especially 05 and 06). iOS/iPadOS 18.0+, Swift 6, SwiftUI + Observation. Bundle id `com.mytaillog.app` (the same as the Capacitor app it replaces), widgets `com.mytaillog.app.widgets`.

Building and uploading a release: [`docs/release-ios.md`](../../docs/release-ios.md) (or `scripts/release.sh` once the Mac is set up).

What it covers: sign-in; Status with the Verdict, line ahead, due groups, item detail and Plan ahead; Logbooks with the map, books, pages, entries and the review queue and desk; Capture (page camera, flights and tach); Maintenance, Aircraft and Documents; Share (record rooms, people, PDFs); offline with a mirror and an outbox; notifications, widgets, a Live Activity for reading, App Intents and Spotlight. On iPad, the binder Rail with two leaves.

## Generate, build, test
The Xcode project is generated from `project.yml` and is not committed.

```sh
brew install xcodegen            # once
(cd apps/core && ./gradlew :framework:assembleMyTailLogCoreXCFramework)   # the KMP core the app links (about 3 min)
cd apps/ios
xcodegen generate                # writes MyTailLog.xcodeproj, the Info.plists and entitlements
xcodebuild test -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPhone 17'
xcodebuild build -scheme MyTailLog -destination 'platform=iOS Simulator,name=iPad Pro 11-inch (M5)'
```
Re-run `xcodegen generate` after adding or removing files. Tests use Swift Testing (`MyTailLogTests`, hosted in the app so the bundled fonts are registered). `MyTailLogTests/Fixtures/status-n734dm.json` is a real snapshot, the same file as Android's test resource; `map-n734dm.json`, `gap-evidence-n734dm.json` and `review-n734dm.json` are the demo aircraft's map, a gap's evidence and its pages and unconfirmed entries. `BooksTests` also runs `packages/shared/fixtures/map-layout*.json` in place. The simulator build and tests need a few GB of disk; delete `~/Library/Developer/Xcode/DerivedData/MyTailLog-*` afterwards.

## Configuration
- **Debug** reads `Config/Debug.xcconfig`: the TEST Supabase project and its publishable key (public by design), and `API_HOST`, the TEST app API.
- **Release** reads `Config/Release.xcconfig`, which includes `Config/Release.local.xcconfig` (git-ignored; values in [`docs/release-ios.md`](../../docs/release-ios.md)). A build with empty values stops with an error.
- The host has no scheme because `//` starts a comment in xcconfig files; the app adds `https://`.

## Sign-in (05 §8)
- **Apple:** native `SignInWithAppleButton` with a SHA-256 nonce, then `POST /auth/v1/token?grant_type=id_token`. Needs the Sign in with Apple capability on the App ID and `com.mytaillog.app` in the Supabase Apple provider's client IDs.
- **Google:** `ASWebAuthenticationSession` on `/auth/v1/authorize?provider=google` with PKCE, returning to `com.mytaillog.app://auth/callback` (URL scheme in `project.yml`), then `grant_type=pkce`. No Google SDK.
- **Email link and code:** one `/auth/v1/otp` email sent with a PKCE challenge and `redirect_to=https://mytaillog.com/app/auth/callback`. The link opens the app as a Universal Link (`applinks:mytaillog.com`; the AASA file is `apps/web/src/app/.well-known/apple-app-site-association/route.ts`) and is exchanged with the verifier kept in the Keychain. A link without that verifier asks for the code from the same email. The code goes to `/auth/v1/verify`.
- **Password:** sign in (`grant_type=password`), create an account (`/signup`), reset by a code from `/recover` then `PUT /user`.
- These complete only where the Supabase project has the provider and redirect URLs; the TEST project has password and email only.
- **Sign out** asks first when the outbox holds unsent changes or pages ("Sync now" or "Delete them and sign out").

## Where things come from
- **Tokens:** `MyTailLog/DesignSystem/Tokens.swift` is generated from `packages/shared/tokens/tokens.json` by `node packages/shared/scripts/build-tokens.mjs` (from the repo root). Never edit it by hand. `Section.swift` maps sections to their token colours; `Typography.swift` maps phone type roles to the bundled fonts with Dynamic Type (`relativeTo:`), tabular figures and Bold Text.
- **Fonts:** `MyTailLog/Resources/Fonts`, copies of `apps/web/src/app/fonts/LibreFranklin.ttf` and `Literata.ttf` (SIL OFL, licences beside them), registered through `UIAppFonts`.
- **Icons:** Lucide 0.469 glyphs as template SVGs in `Assets.xcassets/Icons`, written by `node apps/ios/scripts/build-icons.mjs` (needs `apps/web/node_modules`, or `LUCIDE_ICONS=<dir>`).
- **Shared core:** the app links `MyTailLogCore.xcframework` (release build, from `apps/core/framework/build/XCFrameworks`; static, so `-lsqlite3` for SQLDelight). Three files import it: `Offline/OfflineStore.swift` (mirror, outbox and sync), `Core/MapLayoutBridge.swift` (the map layout, so the phone draws exactly what Android draws) and `Status/PlanText.swift` (Plan ahead's dates).

## Data
- **Status:** `Status/StatusAPI.swift` lists the aircraft through PostgREST under RLS and fetches `GET /api/aircraft/{id}/status`. The server's snapshot is the authority; the app never works out what is due. The last snapshot is kept on the phone (`Offline/StatusOffline.swift`), so Status opens offline. Wording is a port of Android's `StatusText.kt`; change both together.
- **Offline:** `Offline/OfflineStore.swift` holds `mirror.db` and `outbox.db` per user through the core's `SyncEngine` (sync v2), the pages waiting to upload, and when sync runs. Capture, Maintenance, Aircraft and Documents write to the outbox, so they work without signal.
- **Logbooks:** books, pages and entries come from the mirror once it has synced; the map comes from the server and its last copy is kept for offline. Review writes (`entry.confirm`, `entry.update`, `entry.delete`, `page.review`, `gap.setStatus`) go straight to `POST /api/sync/push` with the row's `updated_at` as `base`, so reviewing needs signal. Viewers and the demo get no write controls.
- **Not yet:** Mark done and the SourceMat crop on item detail, a tappable PageCite, Select mode and volumes on a book's pages, and the AircraftSwitcher sheet (a menu stands in). Each has a `shortcut:` comment with its trigger.

## Layout

The iPhone Duo uses the same window-based shell: bottom tabs below 600 pt, a side rail from 600 pt, and the binder when a regular-width window has at least 900 pt. Folding and unfolding resizes the window; SwiftUI and the system animate that transition. The selected aircraft and tab model stay in `RootView` while the shell changes. iPhone landscape is enabled. Review and page grids also follow available width, and the camera uses AVFoundation's rotation coordinator. In Simulator Device Hub, test the cover, unfolded inner display, landscape, and an intermediate window width while navigating Status, Logbooks, and Records. The simulator cannot verify physical camera or display brightness behavior.

```
App/            entry point
Auth/           AuthClient (URLSession to /auth/v1), AuthFlow (PKCE, nonce, return URLs), SessionStore + Keychain, SignInView (M-AUTH-01)
Books/          BooksAPI, BooksModel, BooksLogic, MapData, MapElements, RouteMapView, the map sheets, scans, Logbooks and review screens
Capture/        page camera and pipeline, scan sessions, flights and the tach reader
Core/           CoreBridge and MapLayoutBridge
DesignSystem/   generated Tokens, Section, Typography, Buttons, PhoneChrome, Records (Verdict, StatusMark, TrustMark, PageCite, rows)
Offline/        OfflineStore (mirror, outbox, sync), uploads, background work, the sync screens
Platform/       app links, notifications, App Intents, Spotlight, widget model, the reading Live Activity
Records/        Maintenance, Aircraft and Documents
Share/          record rooms, people and exports
Shell/          TabModel, the phone and tablet shells, landing
Status/         StatusAPI, StatusModel, StatusText, Status and Plan screens, the LineAhead
MyTailLogWidgets/  the widget extension (reads the App Group snapshot only)
```
