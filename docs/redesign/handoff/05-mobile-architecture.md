# 05 · Mobile architecture

MyTailLog's phone and tablet apps are rebuilt as two native apps: SwiftUI for iPhone and iPad, Jetpack Compose for Android phones and tablets. They replace the Capacitor wrapper in `apps/mobile` under the same store listings and bundle identifiers, so an update replaces the old app in place. This file is the technical plan both apps are built to: minimum OS versions, project structure, navigation, the offline-first data layer and sync protocol, auth, background work, notifications, widgets, Live Activities, Siri and shortcuts, system search, document scanning and tach reading, the native map renderer, dark mode, sharing, printing, accessibility, localisation, privacy, testing and release. It keeps every capability of today's mobile app (see `research/mobile-inventory.md`; the screen-by-screen mapping is the coverage table at the end of 06-mobile-screens.md) and fixes the critique in that inventory (§8). Screen layouts are in 06-mobile-screens.md; tokens in 01-design-tokens.md; components in 02-components.md; the map geometry in 10-line-map.md; endpoints and tables in 09-data-and-api.md.

## Contents
1. Decisions at a glance
2. What today's app does that must survive
3. Platforms and minimum OS versions
4. Code organisation and the shared core
5. App structure and navigation
6. Offline-first data layer and sync
7. Files: scans, documents, photos and the cache
8. Auth
9. Background work
10. Push notifications
11. Widgets
12. Live Activities and ongoing notifications
13. Siri, App Intents, App Shortcuts, Android shortcuts
14. System search indexing
15. Document scanning
16. Reading the tach on device
17. Photos, file import and the share extension
18. Haptics
19. Dynamic Type and font scale
20. Appearance: light and the night hangar
21. The map, natively
22. Sharing, printing and PDF
23. Accessibility
24. Localisation readiness
25. Analytics, diagnostics and privacy
26. Security on the device
27. Performance budgets
28. Testing
29. Release and migration from the Capacitor app
30. Components to add
31. Open questions

---

## 1. Decisions at a glance

| Topic | Decision |
|---|---|
| Apps | Two native apps. iOS/iPadOS: Swift 6, SwiftUI, Observation. Android: Kotlin 2.x, Jetpack Compose, Material 3 components restyled to D. |
| Minimum OS | iOS and iPadOS 18.0. Android 10 (API 29), target the latest API Play requires at submission (36 at the time of writing). |
| Shared code | A Kotlin Multiplatform core (`core`) holding domain rules, the sync engine and the local database (SQLDelight). UI is 100% native per platform. Fallback if KMP is rejected at kickoff: GRDB (iOS) and Room (Android) with the same schema and shared conformance fixtures (§4.3). |
| Local database | SQLite. Two files per signed-in user: `mirror.db` (server truth, rebuildable) and `outbox.db` (unsent work, never rebuildable). FTS5 for search. |
| Sync | Keep today's protocol: pull by the `change_log.seq` cursor from `GET /api/sync/pull`; push through an outbox to `POST /api/sync/push` with client ids and `base` (`updated_at`) for optimistic concurrency. Sync on launch, foreground, after writes, on reconnect, by silent push, by pull to refresh and by background refresh. |
| Conflicts | Never resolved silently. Three-way diff (base, yours, theirs). Disjoint fields offer "Keep both changes"; overlapping fields offer "Keep mine", "Take theirs", "Decide later". |
| Navigation, phone | iOS: `TabView` with the system tab bar hidden and D's PhoneTabBar drawn over it, one `NavigationStack` per tab. Android: one `Scaffold` with D's PhoneTabBar as `bottomBar`, Navigation Compose with one back stack per tab (saved and restored). |
| Navigation, tablet | iOS: `NavigationSplitView` with the binder Rail (six SectionTabs) as the sidebar. Android: a custom Rail plus `ListDetailPaneScaffold` (material3-adaptive). Review uses three panes at 1000pt/dp and wider. |
| Scanning | A custom ScanCamera on both platforms (edges, steady-shot capture, count, "lands in" line) with the system scanner (VisionKit document camera, ML Kit Document Scanner) kept as a fallback. |
| Tach | Read on device (Vision / ML Kit text recognition). The number lands in a draft; the owner always confirms. Frames never leave the phone. |
| Widgets | WidgetKit (small, medium, large, three lock-screen accessories, StandBy) and Glance (small, medium, large). They read a precomputed snapshot written by the app; confirmed data only. |
| Live progress | One Live Activity on iOS and one ongoing notification on Android for "pages in progress": on this phone, uploading, being read, read. Updated by push from the reading worker. |
| Notifications | APNs and FCM. Categories with actions: Mark done, Remind me in a week, Open the page, Plan the visit, Review, Log a flight, Compare. Mark done always opens the app to confirm; nothing is marked done from a lock screen. |
| Search | In-app: one field for search and Ask (FTS5 offline, Ask online). System: Core Spotlight and AppSearch for confirmed entries, items, ADs, documents and squawks, with a setting to turn it off. |
| Map | Native Canvas renderers (SwiftUI `Canvas`, Compose `Canvas`) drawing a layout computed once in the shared core from the rules in 10-line-map.md. Accessible as a tree of lines and stops with rotors and custom actions, and as a list. |
| Privacy | No third-party analytics, crash or advertising SDKs. Platform crash reports only (Xcode Organizer, MetricKit, Play vitals). Firebase is used for FCM delivery only, analytics collection off. |

---

## 2. What today's app does that must survive

These behaviours are strengths of the Capacitor app (`research/mobile-inventory.md` §8, "Strengths worth keeping"). The native apps keep each one; the right column says where.

| Behaviour today | Where it lives now |
|---|---|
| A full on-device mirror of every aircraft the user can open, read with no signal | §6.2, §6.3 |
| Every write saved locally first, queued durably (survives force-quit), idempotent client ids | §6.4 |
| Conflicts shown as yours and theirs, with "Decide later"; refusals keep their reason; nothing overwritten silently | §6.6, 06 M-SYS-01 |
| Sign-out refuses to drop unsent work without an explicit choice; sign-out wipes the device copy | §8.6 |
| Scans captured offline, held on the phone, uploaded later; "Adds to the end — N pages so far" | §7, §15, 06 M-SCAN-01 |
| VisionKit / ML Kit scanning with crop and multi-page sessions | §15 (kept as the fallback path) |
| Bounded file cache: oldest page images purged first, documents pinned; "Download all"; storage readout; "Clear cached scans"; "Rebuild from the server" | §7.3, 06 M-SYS-02 |
| One arithmetic for web and phone (status, compliance, hours, oil computed by the web's own functions) | §4 (shared core plus conformance fixtures against the web) |
| Push reminders with registration state and failure reasons visible; "Send a test notification" | §10, 06 M-SYS-05 |
| Light and dark appearance that switches live | §20 |
| Stepper hour logging with press-and-hold, live delta, "Not this time" | 06 M-FLIGHT-03 |
| Meter-replacement prompt when a reading is lower than the last | 06 M-FLIGHT-03 |
| VOR check enforcing the 91.171(d) fields | 06 M-STATUS-07 |
| AROW "Carry aboard" card | 06 M-DOCS-01 |
| The ◎ spotlight: every extracted field shows where it was read | 06 M-REVIEW-01, M-REVIEW-02 |
| iPad sidebar, two-pane and three-pane layouts, keyboard chords, drag and drop, pointer hover | §5.4, 06 T-* and M-SYS-08 |
| Authored entry with emailed signing code; print sticker; create correction | 06 M-BOOKS-09, M-BOOKS-07 |
| In-app announcements from `/admin` | 06 conventions, Notice |
| Account linking (Apple, Google) with the mismatched-account wipe | §8.3 |

The critique items in the inventory (§8) are fixed as follows: sync on launch and foreground with an "as of" time (§6.7); global sync, offline and conflict state inside every aircraft screen (06 conventions); Settings reachable from every screen (06 M-SWITCH-01); the Verdict includes squawks marked Ground and missing carry-aboard documents as named facts (06 M-STATUS-01); real navigation stacks with state restoration (§5); native sheets, transitions, drag-to-dismiss and haptics (§5, §18); a meter field that accepts typing (06 M-FLIGHT-03); local calendar dates, never UTC (§24); one-tap camera path and pushed results (§9, §10, §12); Dynamic Type everywhere (§19); 44pt/48dp targets (§23); squawk photos (06 M-MAINT-03); text selection allowed on record text (§23).

---

## 3. Platforms and minimum OS versions

### 3.1 iOS and iPadOS 18.0
- **Hardware floor is unchanged from iOS 17**: iOS 18 runs on iPhone XS, XS Max, XR and later (2018). Choosing 18 over 17 excludes no iPhone; it only excludes owners who have not updated, a small share by the time the app ships in 2027. iPadOS 18 runs on iPad (7th generation) and later, iPad mini 5 and later, iPad Air 3 and later, all iPad Pro from 2018.
- **What 18 gives that this app uses**: mature Observation (`@Observable`) and `NavigationStack` path restoration; the `Tab` API and `sidebarAdaptable` behaviours (used on iPad, §5.4); App Intents improvements including `IndexedEntity` for Spotlight and Control Center controls (§13); accented and tinted widget rendering modes (§11); `onScrollGeometryChange` for the collapsing PhoneHeader; zoom navigation transitions for page thumbnails; `presentationSizing` for iPad sheets; improved `TextRenderer`.
- **Below 18 we lose nothing we need from 17**: interactive widgets (17), `DataScannerViewController` (16), `VNDetectDocumentSegmentationRequest` (15), Live Activities with push updates (16.1) and push-to-start (17.2) are all available.
- Today's app declares iOS 15.6. Owners on iOS 15.6 to 17.x keep the Capacitor build they have (it keeps syncing; see §29.4 for the protocol guarantee) and are asked to update iOS when they open it after the native release.
- On iOS 26 and later the app adopts the system appearance where it does not conflict with D: system sheets, menus, alerts, pickers and keyboard toolbars take the current system material. D's PhoneTabBar, PhoneHeader and leaves stay as specified (they are the brand); see §5.2.

### 3.2 Android 10 (API 29) minimum
- Android 10 introduced the **system-wide dark theme** setting the app follows for the night hangar, **gesture navigation** (the back gesture this app designs for), and **scoped storage** (one file-access model, no legacy storage paths). API 29 covers well over 90% of active Play devices.
- Credential Manager (passkeys and Sign in with Google) needs API 28 or later; ML Kit text recognition v2 and CameraX need 21 or later; Glance widgets need 23 or later. Nothing we need requires more than 29.
- Version-gated features: predictive back animations (Android 14+, API 34; the callback API works from 33), themed monochrome launcher icon (13+), notification permission prompt (13+, `POST_NOTIFICATIONS`), per-app language (13+), photo picker (system on 13+, backported through Google Play services on 29 to 32), user-initiated data transfer jobs (14+), progress-style "Live Updates" notifications (16+), AppSearch platform storage visible to system search (12+).
- `targetSdk`: the latest level Google Play requires on the submission date (API 36 at the time of writing). `compileSdk` equal to or above target.

### 3.3 Form factors
| Device | Layout |
|---|---|
| iPhone, any size; iPad in Slide Over or a narrow Split View (compact width) | Phone layout (06 M-*) |
| iPad full screen or wide Split View (regular width) | Tablet layout (06 T-* and §5.4) |
| Android width < 600dp (compact) | Phone layout |
| Android 600–839dp (medium: small tablets, unfolded foldables in portrait) | Rail plus single pane, list-detail where the screen has one |
| Android ≥ 840dp (expanded) | Rail plus two panes; review three panes at ≥ 1000dp |
| Apple Watch, Wear OS | Optional complication only (06 M-SYS-09) |
| Mac (Designed for iPad), ChromeOS | Not a target. The iPad app is allowed to run on Apple silicon Macs unmodified; no Mac-specific work. |

Orientation: phones portrait only, except M-REVIEW-01, M-REVIEW-02 and the document viewer, which also rotate to landscape (a logbook page photographed sideways is easier to check rotated). Tablets: all orientations.

---

## 4. Code organisation and the shared core

### 4.1 Repository layout
```
apps/
  ios/                      Xcode project (new)
    MyTailLog/              app target (SwiftUI)
    MyTailLogWidgets/       WidgetKit extension (widgets, Live Activity, Control)
    MyTailLogIntents/       App Intents extension (intents that run without the app)
    MyTailLogShare/         Share extension ("Save to MyTailLog")
    MyTailLogNotifications/ Notification Service extension (mutable content, images)
    Packages/DesignSystem   Swift package: tokens (generated), fonts, components
    Packages/MapKitD        Swift package: map renderers (Canvas) and accessibility
  android/                  Gradle project (new)
    app/                    application module (Compose)
    designsystem/           tokens (generated), fonts, components
    map/                    map renderers (Canvas) and semantics
    widgets/                Glance widgets
    baselineprofile/        baseline profile generator
  core/                     Kotlin Multiplatform shared core (new; consumed by both)
  mobile/                   the Capacitor app (frozen after the native release; deleted one release later)
```

### 4.2 The shared core (decision: Kotlin Multiplatform)
`core` is a KMP library compiled to an Android library and an Apple XCFramework (`iosArm64`, `iosSimulatorArm64`). It contains no UI.

| Module | Contents |
|---|---|
| `core:model` | Row types for every synced table (generated from the schema in 09-data-and-api.md), the `MutationType` catalogue and payloads, enums (trust level, status, severity, logbook type). |
| `core:rules` | Status and due computation (both limits, "first", calendar-month rule, hours projected to "about <date>" from recent use, never overriding a calendar limit), Verdict sentence selection, the line-ahead model, Plan ahead ("what lapses by"), visit suggestions, review ordering (least certain field first), history grouping, written-versus-calculated time check, oil burn. Pure functions only. |
| `core:map` | The route-map, spine and line-ahead layout from 10-line-map.md: lines, stops, interchanges, gaps, eras, rings, label placement, hit regions. Output is a platform-neutral display list (shapes and text runs with token names, not colours). |
| `core:db` | SQLDelight schema, migrations, queries, FTS5 tables. Drivers: native SQLite on iOS, the bundled SQLite driver on Android (guarantees FTS5 and one SQLite version on every device). |
| `core:sync` | Pull and apply, the outbox, effective-row projection (server row plus pending mutations), push and result handling, backoff, conflict diff, file-queue bookkeeping (not the file transfer itself, which is platform code, §7). |
| `core:api` | Ktor client for the sync endpoints and online-only routes, with the Supabase access token injected by the platform. |

Platform code owns: UI, navigation, auth SDKs, file transfer (background `URLSession`, WorkManager), camera and Vision / ML Kit, notifications, widgets, intents, search indexing, printing.

**Swift interop**: use SKIE (Touchlab) so Kotlin `Flow`s arrive as `AsyncSequence`, sealed classes as Swift enums with exhaustive `switch`, and `suspend` functions as `async`. A thin Swift layer (`CoreBridge`) wraps the core in `@Observable` stores; SwiftUI views never import Kotlin types directly except model values.

**Why KMP, with the trade-offs**

| Option | For | Against | Verdict |
|---|---|---|---|
| KMP core (domain + sync + DB) | One implementation of the parts where a bug loses data or misstates what is due (sync, conflicts, due rules). Native on Android at zero cost. SQLDelight is mature on iOS. Same core could later compile to JS/Wasm for the web. | iOS engineers work against a Kotlin API; build adds the XCFramework step (~1 to 2 min); debugging across the boundary is weaker; app size +4 to 6 MB on iOS. | **Chosen.** |
| Rust core (UniFFI, rusqlite) | Fast, small, one implementation for both apps. | Foreign to both platform teams; a third language beside TypeScript; more FFI boilerplate for async and streams. | Rejected. |
| Run the web's TypeScript rules in JavaScriptCore / QuickJS | Literally the same functions as the web ("one arithmetic" kept exactly). | Bridging cost for every list render, no types across the boundary, awkward for the sync engine, JS engine on Android adds size. | Rejected for production. Allowed only as a test oracle (§4.3). |
| Fully native twice (Swift + Kotlin), shared fixtures | Most idiomatic for each team. | Two implementations of sync and due rules drift; every rule change is three changes (web, iOS, Android). | Fallback only. |

If the team rejects KMP at kickoff, the fallback is: GRDB on iOS (not SwiftData: no FTS, weak control over migrations and threading, awkward sharing with extensions) and Room 2.7+ with the bundled SQLite driver on Android, both implementing the schema and the sync algorithm in this file, both passing the same conformance fixtures.

### 4.3 Keeping web, iOS and Android in step: conformance fixtures
The web's TypeScript functions (`apps/web/src/lib/status`, `compliance`, hours, oil) remain the reference until the web adopts the core. A generator in `apps/web/test/fixtures/` writes JSON vectors: input rows (items, readings, entries, ADs) plus "today", and the expected output (status per item, due date, "about" date, which limit is first, Verdict sentence id and arguments, line-ahead positions). The core's test suite runs every vector; CI fails on any difference. A rule change lands in TypeScript and the fixtures in the same PR, then the core catches up before the next mobile release. 10-line-map.md layouts get the same treatment (fixture: input timeline plus viewport, expected display list).

### 4.4 Generated design tokens
`tokens.json` (01-design-tokens.md) generates: an iOS asset catalog (every colour with Any and Dark appearances), a Swift `Tokens` enum (space, radius, type roles), and a Kotlin `MyTailLogColors` / `MyTailLogType` / `MyTailLogSpace` set provided through `CompositionLocal`s. Generation runs in CI; hand edits to generated files fail the build. Fonts (Libre Franklin 400–800, Literata 400/500/700 with optical sizes) are bundled in both apps (SIL OFL; licence text in Settings › About).

---

## 5. App structure and navigation

### 5.1 Information architecture on the phone
Five tabs, as in the mockups: **Status · Logbooks · Maint. · Aircraft · Share** (Documents lives under Aircraft on the phone; it is a sixth tab on tablets, matching the web rail). Global entries: the AircraftSwitcher (tail line in every PhoneHeader), Search-or-ask (the search square in the PhoneHeader), Add (the AddButton on top-level screens), and the sync line. Settings, Hangar and Waiting to upload are reached from the switcher sheet (06 M-SWITCH-01) and from the sync line. Screen ids, entry points and the full map are in 06-mobile-screens.md §2.

Launch: the last aircraft opened, on the tab last used, scrolled to the top. First launch after sign-in with no aircraft: M-HANGAR-01 empty state. One aircraft: its Status.

### 5.2 iOS phone
- **Root**: `TabView(selection:)` with five `Tab`s, each containing its own `NavigationStack(path:)`. The system tab bar is hidden (`.toolbar(.hidden, for: .tabBar)` on each stack root) and D's PhoneTabBar is placed with `.safeAreaInset(edge: .bottom)` on the `TabView`, so content insets correctly and each tab keeps its state, scroll position and lifecycle. Why not the system tab bar: it cannot draw D's coloured tab blocks, the raised active tab or the cover ground; on iOS 26 it would also restyle as glass. Why not a hand-made ZStack of stacks: `TabView` gives tab state retention, scene restoration and accessibility containers for free.
- **PhoneTabBar accessibility**: the bar is an accessibility container with the tab-bar trait (`UIAccessibilityTraits.tabBar` via a `UIViewRepresentable` container or the SwiftUI equivalent when available); each tab is a button with `.isSelected` when active and the value "1 overdue" style counts read after the label (06 §1.3). Long-press on a tab shows the Large Content Viewer (`.accessibilityShowsLargeContentViewer`) at accessibility text sizes.
- **Tab re-selection**: tapping the active tab pops its stack to root; tapping again scrolls to top.
- **Top-level screens** hide the navigation bar and draw the PhoneHeader (board colour, tail line, board title, search square). It collapses on scroll from 96pt to 52pt (title moves inline at 17pt/800) using `onScrollGeometryChange`.
- **Pushed screens** use the system navigation bar tinted to the board: `.toolbarBackground(section, for: .navigationBar)`, `.toolbarBackgroundVisibility(.visible)`, `.toolbarColorScheme(.dark)` (books: `.light`, because its board takes dark text). The system back button and the interactive edge-swipe back are kept. The board title sits in the leaf's first line or as the inline title per screen spec.
- **Sheets**: `.sheet` with `presentationDetents` (`.medium`, `.large`, or a custom `.height`), `presentationDragIndicator(.visible)`, `presentationBackground(color.leaf)`. Map sheets (stop, visit, gap) use `.presentationBackgroundInteraction(.enabled(upThrough: .medium))` so the map stays scrollable above. Every sheet has a visible Close button (top trailing, 44×44) as well as drag-to-dismiss. Sheets with unsaved input use `.interactiveDismissDisabled(hasChanges)` and ask "Discard this squawk?" style questions.
- **Full-screen covers**: ScanCamera (M-SCAN-02), tach camera (M-FLIGHT-02), Search and Ask (M-ASK-01), Review (M-REVIEW-01 when entered from a notification).
- **Alerts and confirmations**: `.confirmationDialog` for destructive choices with the destructive role; never `window.confirm`-style modal text walls.
- **State restoration**: each stack's `NavigationPath` is `Codable` and stored with `@SceneStorage` per tab, so a relaunch returns to the same screen.

### 5.3 Android phone
- **Root**: one `Scaffold` whose `bottomBar` is D's PhoneTabBar (a custom composable; not Material `NavigationBar`, which cannot draw per-tab colour blocks). Edge-to-edge (`enableEdgeToEdge()`); the bar pads for the gesture or 3-button navigation inset with the cover colour behind it.
- **Navigation**: Navigation Compose with type-safe `@Serializable` routes. Each tab is a nested graph; switching tabs uses `popUpTo(startDestination) { saveState = true }`, `launchSingleTop = true`, `restoreState = true`, so each tab keeps its back stack. Re-selecting the active tab pops to its root. (Navigation 3 is acceptable instead if it is stable at kickoff; the behaviour above is the requirement.)
- **Top-level screens** draw the PhoneHeader as a custom collapsing top bar using `TopAppBarScrollBehavior` (`exitUntilCollapsed`): 96dp expanded, 64dp collapsed (Material's minimum) with the title inline.
- **Pushed screens** use Material 3 `TopAppBar` with `containerColor = section`, `titleContentColor = onSection`, navigation icon `arrow_back` (Material Symbols Rounded), content description "Back to <previous title>".
- **Predictive back** is on (`android:enableOnBackInvokedCallback="true"`). Navigation Compose provides the cross-activity and in-app predictive animations; sheets use `BackHandler`/`PredictiveBackHandler` to animate their own collapse. Rules and order of back handling are in 06 M-SYS-07.
- **Bottom sheets**: Material 3 `ModalBottomSheet` (leaf container colour, the platform's drag handle and corner radius) for task sheets (Add, Mark done, Scan pages). Map sheets use `BottomSheetScaffold` (a standard, non-modal sheet) so the map behind stays interactive, with peek height equal to the iOS `.medium` detent content.
- **Dialogs**: Material 3 `AlertDialog` for destructive confirmation, with the destructive button in `color.alarm-text`.
- **Process death**: route arguments and screen state survive via `SavedStateHandle`; drafts (squawk, flight, mark done) are written to the outbox database as drafts, not kept in memory.

### 5.4 Tablets
- **iPad (regular width)**: `NavigationSplitView` with two or three columns. The sidebar column is the binder Rail: RailPlate (aircraft switcher with tail, type and sync line), six SectionTabs (Status, Logbooks, Maintenance, Aircraft, Documents, Share) with the sublines from the mockups ("1 overdue, 3 soon", "412 pages 6", "2 open squawks", "Tach 4212.4", "14 in the vault", "1 link live"), and the RailFoot (Search or ask ⌘K, Add ⌘N, Account). Sidebar width 240pt (the web's 216px rail plus touch padding); `.navigationSplitViewColumnWidth(240)`; the sidebar stays visible in landscape (`.balanced`) and collapses to an overlay in portrait on 11-inch and smaller iPads. The board (content and detail columns) uses the web's board and leaves: the spine under the BoardHead, the record on the left leaf, the page on the right SourceMat.
- **Android tablets (medium and expanded)**: a custom Rail (same content, 240dp, collapsible to a 96dp icon rail at medium width) and `ListDetailPaneScaffold` from `material3-adaptive` for list-detail screens, `SupportingPaneScaffold` for Plan ahead. Foldables: the hinge is respected through `WindowInfoTracker` (no content under a vertical fold; list left, detail right).
- **Pane rules** (both platforms): two panes at ≥ 700pt (iPad) / ≥ 840dp (Android) — left leaf 1.62 : right leaf 1 on records screens, 1 : 1 on review; three panes for review at ≥ 1000pt/dp (page rail 120pt, scan, fields). Below those widths the screen behaves as the phone: detail pushes. The per-screen tablet mapping is in 06 §9.
- **Keyboard, pointer, drag and drop**: 06 M-SYS-08.

### 5.5 Deep links and routes
One route table drives notifications, widgets, intents, Spotlight, App Links and the share extension. Universal Links (iOS, `applinks:mytaillog.com`) and App Links (Android, verified `assetlinks.json`) on `https://mytaillog.com/app/...`; the custom scheme `com.mytaillog.app://` stays only for the OAuth return (§8).

| Path | Opens |
|---|---|
| `/app/a/{aircraftId}` | Status (M-STATUS-01) |
| `/app/a/{aircraftId}/due` | All items (M-STATUS-08) |
| `/app/a/{aircraftId}/item/{itemId}` | Item detail (M-STATUS-05) |
| `/app/a/{aircraftId}/item/{itemId}/done` | Mark done sheet over item detail (M-STATUS-06) |
| `/app/a/{aircraftId}/plan?date=YYYY-MM-DD` | Plan ahead (M-STATUS-03) |
| `/app/a/{aircraftId}/visit/{visitId}` | Suggested or planned visit (M-STATUS-04) |
| `/app/a/{aircraftId}/map?from=YYYY&to=YYYY&book={logbookId}` | Map (M-BOOKS-01 / 05) |
| `/app/a/{aircraftId}/entry/{entryId}` | Entry (M-BOOKS-07) |
| `/app/a/{aircraftId}/page/{pageId}` | The page in the ScanViewer, with the entry list |
| `/app/a/{aircraftId}/review` and `/review/{pageId}` | Review (M-REVIEW-01) |
| `/app/a/{aircraftId}/queue` | Pages in progress (M-SCAN-03) |
| `/app/a/{aircraftId}/scan?book={logbookId}` | Scan pages (M-SCAN-01) |
| `/app/a/{aircraftId}/flight` | Log a flight (M-FLIGHT-02 or 03 per the setting "Start with the camera") |
| `/app/a/{aircraftId}/squawk/new` and `/squawk/{squawkId}` | M-MAINT-03 / M-MAINT-02 |
| `/app/a/{aircraftId}/ad/{adId}` | AD detail (M-MAINT-06) |
| `/app/a/{aircraftId}/docs` and `/doc/{documentId}` | M-DOCS-01 / M-DOCS-02 |
| `/app/a/{aircraftId}/share` and `/share/link/{roomId}` | M-SHARE-01 / M-SHARE-02 |
| `/app/sync` | Waiting to upload (M-SYS-01) |
| `/app/settings` and `/app/settings/notifications` | M-SYS-02 / M-SYS-05 |
| `/app/auth/callback` | Magic-link and email-change return (§8) |

A link to an aircraft the user cannot open shows "This aircraft isn't shared with dana@example.com." with "Switch account" and "Close". A link that arrives before the first sync waits on "Getting your records onto this phone…" then continues. Record room links (`/r/{token}`) are not claimed by the app; they open in the browser for recipients without an account.

---

## 6. Offline-first data layer and sync

### 6.1 Principles
1. The UI reads only the local database. No screen waits on the network to show records.
2. Every write is an outbox mutation applied optimistically to what the UI shows, then pushed.
3. Server acceptance is the only thing that removes a mutation.
4. Server truth and local intent are stored separately, so a pull can never overwrite unsent work and a rejected write never leaves a wrong value behind.
5. Online-only actions are never queued. They say so and offer what can be done instead.

### 6.2 Databases and schema
Per signed-in user, under the app's private storage (§7.1):

| File | Holds | Backed up by the OS | Rebuildable |
|---|---|---|---|
| `mirror.db` | Server rows for every synced table, the sync cursor, FTS5 index, derived caches (status per item, line-ahead model, widget snapshot) | No | Yes, by "Rebuild from the server" |
| `outbox.db` | Mutations, drafts, file-queue manifests, conflict records, the sync activity log (last 200 events) | Yes (iOS device backup; Android Auto Backup includes this file only) | No |

Mirror tables are **typed**, one per synced table (09-data-and-api.md is the source of the column list): `aircraft`, `logbook`, `page`, `log_entry`, `maintenance_item`, `ad_compliance`, `ad_reference`, `component`, `equipment_proposal`, `squawk`, `hours_reading`, `meter_reset`, `oil_addition`, `oil_analysis_sample`, `document`, `scanned_document`, `weight_balance`, `adsb_flight`, plus any table 09 adds for the redesign (for example squawk photos, planned shop visits, record rooms the user created, aircraft access/roles). Every mirror table has:
- the server columns, typed;
- `_raw TEXT` — the full JSON row as received, so a column added on the server before the app knows it survives and is sent back untouched;
- `_seq INTEGER` — the `change_log.seq` that last wrote it.
Rows for a table the app does not know yet go to `unknown_record(table_name, id, raw, seq)` and are ignored by the UI until an app update knows them.

`sync_state(key, value)`: `cursor` (last applied seq), `last_pull_ok_at`, `last_push_ok_at`, `schema_version`, `user_id`.

Outbox tables:
```
mutation(id TEXT PK,            -- UUIDv7, the idempotency key; for inserts, the new row's id
         aircraft_id TEXT, type TEXT, payload JSON,
         target_table TEXT, target_id TEXT,  -- the row it changes (for projection and blocking)
         base TEXT,               -- updated_at of the server row when the owner made the change; null for inserts
         base_row JSON,           -- that server row (for the three-way diff)
         label TEXT,              -- owner-readable, e.g. "Flight, tach 4212.4 to 4214.8"
         created_at TEXT, attempts INT, next_try_at TEXT,
         status TEXT,             -- pending | sending | conflict | refused | blocked
         error TEXT, server_row JSON, depends_on TEXT)
file_job(id PK, kind: page|document|squawk_photo, aircraft_id, local_path, bytes, sha256,
         meta JSON, status: held|uploading|uploaded|registered|failed, progress REAL, attempts, error)
draft(id PK, kind, aircraft_id, json, updated_at)   -- unsaved forms survive process death
activity(id, at, kind, text, ref)                    -- what sync did, for M-SYS-01
```

### 6.3 Pull
- `GET /api/sync/pull?cursor={seq}&limit=500`, Bearer token. Response (09-data-and-api.md is authoritative): `{ changes: [{ table, id, op: "upsert" | "delete", row?, seq }], nextCursor, hasMore, serverTime, minAppVersion }`.
- **The cursor is `change_log.seq`, not `updated_at`.** Keep it: a sequence is a total order with no clock skew or equal-timestamp ambiguity, and delete rows persist in the feed so deletions propagate. `updated_at` is used only as the concurrency token on writes (§6.5).
- Apply each page in one transaction: upsert or delete the typed row, update `_raw` and `_seq`, update FTS rows, then write `cursor = nextCursor` in the same transaction. Loop while `hasMore`. Re-pulling an overlapping window is harmless (idempotent).
- After the last page: recompute derived caches for affected aircraft (status, line ahead, widget snapshot), reindex system search for changed rows (§14), and publish a change notification to observers (Flows / `@Observable` stores).
- First sync on a new device starts at cursor 0. Progress is shown as "Getting N734DM's records onto this phone" with counts by table group (entries, pages), never a bare spinner (06 M-HANGAR-01, loading state).
- An access revocation arrives as deletes for that aircraft's rows; the app removes the aircraft, its files and its index entries, and shows once: "N4321J is no longer shared with you." If the outbox holds mutations for it, they move to `refused` with that reason.

### 6.4 Write path: the outbox
```
UI action
  └─ core.enqueue(type, aircraftId, payload)       validates; refuses online-only types
       ├─ write mutation row (outbox.db) with base + base_row from the SERVER row
       ├─ recompute the effective row(s) and derived caches (mirror.db caches only)
       └─ schedule push (immediately if online; else on reconnect / background)
```
- **Effective rows**: the UI never reads a raw mirror row for a table that can have pending mutations; it reads `effective(row) = server row with every pending, sending, blocked or conflict mutation for that row replayed in created order`. Replay functions live in `core:rules` (one per mutation type, the same functions used for the optimistic patch). Inserted rows that exist only in the outbox are projected in. Projection is incremental (only rows with mutations) and cached.
- A row with unsent mutations carries `pendingState` (`onPhone`, `sending`, `conflict`, `refused`) for the UI's "On this phone" caption (06 §1.4).
- **Push**: `POST /api/sync/push` with up to 100 mutations per request, oldest first, one aircraft at a time. Result per mutation:
  - `ok` → delete the mutation, write the returned row as server truth (and its `updated_at`), recompute projections.
  - `conflict` → `status = conflict`, store `server_row`; every later mutation targeting the same row becomes `blocked` until the conflict is decided. Other rows keep flowing.
  - `error` (refusal: validation, permission, signed entry) → `status = refused` with the owner-readable `error`; the projection drops it (the UI shows the server value again) and the item appears in Waiting to upload with "Discard this change".
  - Network failure or 5xx → `attempts += 1`, `next_try_at = now + backoff` (5s, 10s, 20s … capped at 15 min, the current `sync-policy.ts` schedule); stays `pending`.
- **Ordering and dependencies**: a mutation that refers to a row created by an earlier queued mutation (for example a squawk photo for a new squawk, `document.setEntry` for a new entry) sets `depends_on`; it is not sent until the dependency is `ok`, and it becomes `refused` if the dependency is refused.
- **Mutation catalogue**: today's catalogue (`docs/ios-parity/CONTRACT.md` §3) carries over unchanged. Types the redesign adds (owned by 09-data-and-api.md; listed here so the apps reserve them): `squawkPhoto.create`, `squawkPhoto.delete`, `visit.create`, `visit.update`, `visit.setStatus {cancelled}`, `reminder.snooze`, `vor.log` (or `mx.complete` with the VOR fields), `page.register` (after a direct-to-storage upload, §7.2), `gap.setStatus` ("no pages exist" / "asked the previous owner"), `entry.correct` (authored correction). `meterReset.delete`, `oil.delete`, `wb.upsert`, `document.update`, `entry.setLinks` already exist in the contract and are now wired to screens. Link creation, extension and revocation are online routes, not mutations (14-decisions.md D1).

### 6.5 What is online-only
Never queued; the control is disabled offline with a one-line reason and, where possible, an offline alternative.

| Action | Offline copy | Offline alternative |
|---|---|---|
| AI reading of pages | "Reading starts when you have signal." | Pages are held and uploaded later; reading starts automatically after upload. |
| Ask (questions) | "Asking needs signal. Search still works on this phone." | The same field searches the local index. |
| Enrol an aircraft (registry lookup, create) | "Adding an aircraft needs signal." | None. |
| Run a backup | "Backups run from the server. Try again with signal." | None. |
| Find ADs (FAA search) | "Finding ADs needs signal." | Tracked ADs stay readable and editable. |
| Signing an authored entry (emailed code) | "Signing needs signal to send the code. Your draft is saved." | The draft is kept. |
| AD full text not yet cached | "The full text isn't on this phone yet." | The tracked record is readable. |
| Import a backup | "Importing needs signal." | None. |

| Make, extend or revoke a record room link | "Making a link needs signal, so it works the moment you send it." | The room's settings are kept as a draft and the button becomes **Make the link** as soon as the phone is online. |
| Make or revoke a mechanic (squawk) link | "Making a link needs signal." | The squawk and its photos save and sync as usual. |
| Invite or remove people, transfer, delete aircraft, CSV import, first read | "This needs signal." | None. |

**Decided (09 §5.3):** links are made by the server, online only, so a link the owner sends always works and tokens are never generated on a device. Booking a visit (`visit.create`) is *not* online-only; it queues like any other edit.

### 6.6 Conflicts
A conflict is the server's `conflict` result for an update or delete whose `base` is older than the row's current `updated_at`. The phone has three versions: **base** (`base_row`, what the owner saw), **yours** (base plus the mutation), **theirs** (`server_row`). The core computes, per field: changed by you, changed by them, changed by both.

| Case | What the owner sees (06 M-SYS-01) | Buttons |
|---|---|---|
| You and they changed different fields | "You and Sam changed different things. Both can be kept." Field table with both changes marked. | **Keep both changes** (primary: re-submit only your changed fields with `base` = theirs' `updated_at`) · Keep mine · Take theirs · Decide later |
| Same field changed by both | "Sam changed this on the web at 9:12, while your phone was offline." Field / Yours / Theirs (Sam), differing rows marked. | **Keep mine** (re-submit with new `base`) · Take Sam's · Decide later |
| They changed it to exactly your values | Not a conflict. The mutation is marked done and the activity log says "Already on the server: <label>". | — |
| They deleted the row you edited | "Sam deleted this squawk at 9:12. Your note can't be added to it." Your values shown with Copy. | **Discard my change** · Copy my text |
| You deleted, they edited | "Sam changed this at 9:12 after you deleted it." Their values shown. | **Delete anyway** · Keep theirs |
| A signed (authored) entry | Refusal, not conflict: "Signed entries can't be changed. Create a correction instead." | Create a correction · Discard this change |

Rules: conflicts are listed in Waiting to upload, counted in the sync line ("1 to decide", alarm colour, because a conflict is an error state), shown on the affected row ("Changed in two places", 06 §1.4), and announced by a local notification if the app is in the background when it occurs (category CONFLICT, §10). "Decide later" leaves the mutation in `conflict`; it never times out. Signing out with a conflict pending counts as unsent work (§8.6).

### 6.7 When sync runs
| Trigger | iOS | Android | What runs |
|---|---|---|---|
| Launch | app start | `Application.onCreate` → main activity start | push, then pull |
| Foreground | `scenePhase == .active` and last pull > 60 s ago | `ProcessLifecycleOwner` ON_START, same rule | push, then pull |
| After a write | debounce 1.5 s | same | push, then pull |
| Connectivity regained | `NWPathMonitor` satisfied | `ConnectivityManager.NetworkCallback.onAvailable` | push, then pull |
| Pull to refresh | `.refreshable` | `PullToRefreshBox` | push, then pull; result toast |
| Silent push "changes" | `content-available: 1`, handled in `didReceiveRemoteNotification` (system budget applies) | FCM data message → expedited `SyncWorker` | pull only |
| Background refresh | `BGAppRefreshTask` `com.mytaillog.sync.refresh`, earliest begin 30 min | `PeriodicWorkRequest` 1 h, network constraint | push, pull, recompute widget snapshot |
| Explicit | "Sync now" in the switcher sheet and Settings | same | push, then pull |

The server sends a "changes" silent push to a user's other devices when a write lands for an aircraft they can open, coalesced to at most one per device per 5 minutes (09-data-and-api.md).

**Freshness is always shown**: the sync line under the tail number ("synced 9:38", "syncing", "offline", "3 waiting", "1 to decide", "not synced yet"), and, when the last successful pull is older than 6 hours, a second line under the Verdict (never inside it) reads "From records synced <day, time>." (06 M-STATUS-01). This fixes critique #1.

### 6.8 Rebuild and schema changes
- "Rebuild from the server" (Settings): deletes `mirror.db` and re-pulls from cursor 0. The outbox is untouched; projections reapply when rows return.
- App updates migrate `mirror.db` with SQLDelight migrations; if a migration is not possible (rare, declared in the release), the app rebuilds the mirror and keeps the outbox.
- The pull response carries `minAppVersion`. If this build is older, the app shows a blocking "Update MyTailLog to keep syncing" screen with the store button; reading and writing offline still work behind "Keep working offline" (writes stay queued until the update).

---

## 7. Files: scans, documents, photos and the cache

### 7.1 Where files live
| Kind | iOS path (Application Support, per user id) | Android path (`filesDir/{userId}`) | Protection / backup |
|---|---|---|---|
| Captured pages not yet uploaded | `Outbox/pages/{fileJobId}.jpg` | `outbox/pages/…` | iOS `completeUntilFirstUserAuthentication`, included in backup; Android included in Auto Backup only if under the 25 MB quota (otherwise lost on device transfer; acceptable, stated in open questions) |
| Documents and squawk photos not yet uploaded | `Outbox/files/{fileJobId}.{ext}` | `outbox/files/…` | as above |
| Page thumbnails (400px) | `Cache/thumbs/{pageId}.jpg` | `cache/thumbs/…` (in `filesDir`, not `cacheDir`, so the OS does not purge it) | excluded from backup |
| Page images (2000px) | `Cache/pages/{pageId}.jpg` | `cache/pages/…` | excluded from backup |
| Documents | `Cache/docs/{documentId}.{ext}` | `cache/docs/…` | excluded from backup; pinned (never purged by the ceiling) |
| Widget snapshot | App Group container `group.com.mytaillog.app/widget/{aircraftId}.json` | `filesDir/widget/…` (read by Glance in-process) | excluded |

Sign-out deletes the whole per-user directory and the App Group files for that user.

### 7.2 Upload
Captured pages, documents and squawk photos upload **directly to storage** with a signed URL, then register through the outbox:
1. `POST /api/aircraft/{id}/uploads` (Bearer) with `{kind, contentType, bytes, sha256}` → `{uploadUrl, storagePath, expiresAt}` (09-data-and-api.md owns the route; it replaces today's JSON-base64 capture and document routes, which stay for one release for old builds).
2. iOS: a background `URLSession` upload task (`URLSessionConfiguration.background(withIdentifier: "com.mytaillog.uploads")`), file-based, so it continues while the app is suspended. Android: `UploadWorker` (expedited WorkManager job, network constraint, foreground service type `dataSync` with the "Uploading 2 pages" notification; on Android 14+ a user-initiated data transfer job when started from the camera).
3. On success the core enqueues `page.register {id, logbookId, storagePath, capturedAt, isHandwritten, sequenceHint}` (or `document.create`, `squawkPhoto.create`) as a normal outbox mutation. Page order is assigned by the server on arrival ("adds to the end"), as today.
4. Signed URLs expire; an expired URL is re-requested transparently. A failed upload is retried with the outbox backoff and shown on M-SCAN-03 / M-SYS-01 with its reason.
Images are JPEG, quality 0.85, longest edge 2000px for pages (today's size, which the reader is tuned for) and 1600px for squawk photos; a 400px thumbnail is made on the phone at capture so the queue and map can show the page at once. Documents keep their original format up to 25 MB (today's cap); photos chosen as documents are converted to JPEG and downscaled to 2400px.

### 7.3 What is cached for offline, and the ceiling
| Content | Rule |
|---|---|
| All rows of every aircraft the user can open | Always (the mirror). |
| Page thumbnails, all pages | Always, downloaded after each pull in the background (412 pages ≈ 16 MB). The map, Pages library, review queue and search results need them. |
| Page images cited by what is due | Always and pinned: for each tracked item and AD, the page of its last completion; for each open squawk, the page of a linked entry. This keeps "the page is one tap away" true on the Status screen offline. |
| Carry-aboard documents (airworthiness certificate, registration, operating handbook, current W&B) | Always and pinned. |
| Other documents | On first view, then pinned. |
| Other page images | On first view (LRU), or all of them when "Keep a full offline copy" is on (Settings, per aircraft). |
| Ceiling | Default 1 GB for unpinned page images (Settings: 500 MB, 1 GB, 2 GB, No limit). Over the ceiling the least recently viewed unpinned page images go first. Documents and pinned pages are never purged; if they alone exceed the ceiling they stay (today's rule). |
| Full offline copy download | iOS: background `URLSession` download tasks; on iOS 26+ a `BGContinuedProcessingTask` with system progress UI when the owner starts it. Android: `OfflineCopyWorker`, unmetered network by default ("Use mobile data for the offline copy" toggle), foreground notification with progress. Progress text: "Saving pages for offline: 212 of 412". |

Storage readout (Settings): "1.3 GB on this phone · pages 1.2 GB · documents 96 MB" with "Clear cached pages" (removes unpinned page images only; thumbnails stay).

---

## 8. Auth

### 8.1 Client
supabase-swift (iOS) and supabase-kt (Android, via the core's Ktor client for API calls) with PKCE. The access token is injected into every core API call; refresh is handled by the SDK with a shared lock so the background upload, widget refresh and foreground sync never refresh concurrently.

Session storage: iOS Keychain, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, access group shared with the extensions (widgets, intents, share, notification service) so they can call the API. Android: the refresh token in DataStore encrypted with a Tink AEAD key held in Android Keystore (`EncryptedSharedPreferences` is deprecated). Sessions survive relaunch, airplane mode and app updates.

### 8.2 Methods (06 M-AUTH-01)
| Method | iOS | Android |
|---|---|---|
| Sign in with Apple | Native `ASAuthorizationAppleIDProvider` → identity token + nonce → `signInWithIdToken(provider: .apple)`. Required on iOS because Google is offered. | Supabase OAuth for Apple in a Custom Tab (Apple has no Android SDK); returns by the custom scheme. |
| Google | `ASWebAuthenticationSession` with Supabase OAuth (PKCE). No Google SDK on iOS. | Credential Manager with Sign in with Google (`GetSignInWithGoogleOption`) → ID token + nonce → `signInWithIdToken(provider: google)`. |
| Email link and code | One email carries both a link and a 6-digit code (Supabase email OTP). The link is a Universal Link (`/app/auth/callback`) that completes in the app when tapped on the same phone; the code is for an email read on another device. | Same, with a verified App Link. |
| Password | "Use a password instead" (sign in, sign up, reset by email code). | same |
| Passkeys | Phase 2, when the server supports WebAuthn sign-in issuing a Supabase session (open question 4). Client: `ASAuthorizationPlatformPublicKeyCredentialProvider`, associated domain `webcredentials:mytaillog.com`. Offered after sign-in in Settings › Sign-in methods ("Add a passkey"), then first on M-AUTH-01. | Credential Manager `CreatePublicKeyCredentialRequest` / `GetPublicKeyCredentialOption`, `assetlinks.json` with `get_login_creds`. |

### 8.3 Linking accounts
Settings › Sign-in methods: "Connect Apple" / "Connect Google" via `linkIdentity`. Today's guard stays: if the provider returns a different user than the one linking, the app signs out, wipes the device copy and says "This sign-in belongs to another account. Sign in with your original email and connect it again." Connecting never merges two accounts.

### 8.4 Deep-link return
OAuth (Custom Tab, ASWebAuthenticationSession) returns to `com.mytaillog.app://auth/callback`. Email links return to `https://mytaillog.com/app/auth/callback`. If an email link opens on a phone that did not start the sign-in (no PKCE verifier), the app shows "Enter the 6-digit code from the same email" rather than an error.

### 8.5 Roles
The mirror carries the user's role per aircraft (owner, editor, viewer) from 09-data-and-api.md. The UI hides edit controls for viewers (06 §1.5); the server enforces it (RLS). A viewer can report a squawk (today's rule); everything else a viewer attempts is refused with "You don't have edit access to N734DM."

### 8.6 Sign-out and account deletion
- Sign-out with nothing unsent: confirm "Sign out of MyTailLog on this phone? The records stay on the server." → wipe mirror, outbox, files, keychain, search index, widgets (they show "Open MyTailLog to sign in"), unregister the push token.
- With unsent work: "3 changes and 2 pages haven't reached the server. Signing out deletes them from this phone." → **Sync and sign out** (primary; waits up to 60 s with progress, then reports what is left) · Keep working · "Delete them and sign out" (alarm, second confirmation). Today's rule, kept.
- Account deletion in the app (App Store guideline 5.1.1(v)): Settings › Delete my account → explanation, type the tail number or "delete" to confirm, online only, calls the server deletion endpoint (09-data-and-api.md; today none exists — open question 5). Never a link out to the website as the only path.

---

## 9. Background work

| Job | iOS | Android | Constraints |
|---|---|---|---|
| Upload held files | Background `URLSession` upload tasks; resumed in `application(_:handleEventsForBackgroundURLSession:)` | `UploadWorker`, expedited, unique per file job, foreground `dataSync` | network |
| Push outbox, pull | `BGAppRefreshTask` `com.mytaillog.sync.refresh` (earliest 30 min), silent pushes | `SyncWorker` periodic 1 h + one-time on FCM "changes" | network |
| Full offline copy | Background `URLSession` downloads; `BGContinuedProcessingTask` on iOS 26+ | `OfflineCopyWorker` | unmetered unless allowed |
| Thumbnail backfill after pull | in the sync job | in `SyncWorker` | network |
| Widget snapshot refresh | after every pull or write, and in `BGAppRefreshTask`; `WidgetCenter.reloadTimelines(ofKind:)` | `GlanceAppWidget.updateAll` from the same places | none |
| Spotlight / AppSearch reindex | after pull, batched (500 items per batch) | same | none |
| Reading progress | server push (Live Activity, §12) | FCM data → notification update | — |
| Purge over the cache ceiling | after downloads, every 25 files (today's rule) | same | none |

Rules: every job is idempotent and resumable; no job holds a database write transaction across a network call; background jobs never show UI except the required Android foreground notification, whose copy is the owner's words ("Uploading 2 pages to N734DM", "Saving pages for offline: 212 of 412"). iOS background-task identifiers are declared in `BGTaskSchedulerPermittedIdentifiers`; Android jobs are unique-named so repeated scheduling never duplicates them.

---

## 10. Push notifications

### 10.1 Delivery
APNs (token-based `.p8` auth) and FCM HTTP v1, sent by the server's daily reminder job and by event producers (reading finished, conflict, ADS-B flight seen, record room opened). Device registration: `POST /api/push/devices` with `{token, platform, appVersion, locale, timeZone, enabledCategories}` on every launch (tokens are reissued after restores and upgrades; today's behaviour) and on token refresh; `DELETE` on sign-out or when the owner turns notifications off. The Notification Service extension (iOS) attaches a small rendered line-ahead image to due reminders when the payload includes `lineAheadImageUrl` (optional) and localises nothing (the server sends final copy in the user's locale).

Payload (both platforms, inside `aps`/`data`): `type`, `aircraftId`, `itemId?`, `pageIds?`, `visitId?`, `url` (a §5.5 path), `threadId` (aircraft id, for grouping), `collapseId` (item id + due cycle, so a repeat replaces rather than stacks).

### 10.2 Categories and actions
| Category | Example (exact copy is the server's, 12-copy-and-voice.md) | Actions | Action behaviour |
|---|---|---|---|
| `DUE` (coming due, lapsed) | "N734DM: transponder and pitot-static due Dec 31" / "43 days left. AeroCheck Instruments did both on Dec 3, 2024 (Airframe p. 58), so one visit can cover them." | **Mark done** · **Remind me in a week** · **Open the page** | Mark done: foreground, opens M-STATUS-06 prefilled with today and the current tach; nothing is completed from the lock screen because a completion needs the date, the meter and the entry. Remind me in a week: background, enqueues `reminder.snooze {itemId, until}` and suppresses locally; works offline. Open the page: foreground, opens the cited page. |
| `VISIT` (items fit one visit) | "N734DM: three items fit one visit, week of Dec 7" | **Plan the visit** · **Remind me Friday** | Plan: foreground to M-STATUS-04. Remind: background snooze to the coming Friday 09:00 local. |
| `PAGES_READ` | "6 pages are read. 2 need a look." | **Review the 2** · **Later** | Review: foreground to M-REVIEW-01 at the first doubtful page. Later: dismiss. |
| `FLIGHT_SEEN` (ADS-B, opted in) | "N734DM flew about 1.4 h today. Log it?" | **Log a flight** · **Not this aircraft** | Log: foreground to M-FLIGHT-03 with the suggested reading prefilled as a draft. Not this aircraft: background, dismisses the ADS-B flight (`adsb.dismiss`). |
| `CONFLICT` | "A change to "Left brake feels soft" needs you to decide." | **Compare** | Foreground to M-SYS-01 conflict. |
| `SHARE_OPENED` | "J. Okafor opened the pre-buy record room (3rd time)." | none | Tap opens M-SHARE-03. Off by default. |
| `UPLOAD_STUCK` (local) | "2 pages are still on this phone. They upload when you have signal." | **Open** | Local notification after 24 h held. |
| silent `SYNC` | — | — | Triggers a pull (§6.7). |

iOS: `UNNotificationCategory` per row; foreground actions use `.foreground`; Remind actions are background (`UNNotificationAction` without `.foreground`), handled in `userNotificationCenter(_:didReceive:)` within the system's background time. Interruption level `.active` for all (no time-sensitive or critical alerts). Thread identifier = aircraft id; summary argument = tail number.
Android: channels **Coming due** (default importance), **Pages read** (default), **Reading progress** (low), **Uploads** (low), **Sync problems** (default), **Flights seen** (default), **Shared links** (low). Actions are `NotificationCompat.Action`s with `PendingIntent`s; background actions go to a `BroadcastReceiver` that enqueues the mutation and updates the notification to "Reminder moved to Nov 25." Grouping by aircraft with `setGroup`.

Rate limits are the server's: one per item per due cycle, a daily digest per aircraft (rule 9 in 00-product-principles.md). Notification permission is asked in context (06 M-SYS-04), never on first launch.

---

## 11. Widgets

### 11.1 Kinds
| Widget | iOS family | Android (Glance) size | Content |
|---|---|---|---|
| Line ahead | `systemMedium` (and `systemLarge`) | 4×2 (min 250×110dp), resizable to 4×3 | Tail and "next 60 days"; the line ahead for the chosen horizon with rings by status and suggested visits as dashed caps (10-line-map.md, widget scale); two (medium) or five (large) DueRows; tap target per row opens that item. d-m-lock. |
| Next item | `systemSmall` | 2×2 (min 110×110dp) | Tail; the next item's name; its value ("9.7 h" / "43 days") in type.numeric 28pt; "about Dec 12"; status mark and word. Overdue first if any. |
| Lock screen line | `accessoryRectangular` | — | "N734DM next 60 days" + a 3-line mini line ahead in monochrome, or text "VOR check lapsed, IFR only / Oil change 9.7 h, about Dec 12" when the line cannot render (b-m-lock). |
| Lock screen count | `accessoryCircular` | — | Days or hours to the next item with a gauge of the interval used; when the item is overdue the gauge is a solid filled disc and the word "over" sits under the number. |
| Lock screen inline | `accessoryInline` | — | "N734DM: oil 9.7 h · transponder 43 d" |
| StandBy | `systemSmall` in StandBy (night: red-tinted by the system) | — | as Next item |
| Control (iOS 18) | `ControlWidgetButton` | Quick Settings tile (`TileService`) | "Log a flight": opens M-FLIGHT-02. |

### 11.2 Data and rules
- Widgets read a **snapshot** JSON the app writes per aircraft after every pull, write and background refresh: `{aircraftId, tail, generatedAt, syncedAt, verdict: {text, leadPhrase}, items: [{id, name, logbook, status, dueText, leftValue, leftUnit, aboutDate, isFirstLimit}], lineAhead: <display list for 60 days and 12 months>, visits: [...]}`. Widgets never open the database and never call the network (except the iOS widget may request a timeline reload). Snapshot contents are computed from **confirmed data only** (rule 2).
- Timeline: an entry now and one at each local midnight for 7 days (day counts change at midnight); `.after(next midnight)` policy plus explicit reloads on snapshot writes. Android: `updatePeriodMillis = 0`; updates are pushed by the app and by `SyncWorker`; a daily `WorkManager` job at 00:05 local refreshes counts.
- Staleness: if `syncedAt` is older than 24 hours, the widget adds "as of Nov 16" under the tail.
- Signed out or no aircraft: "Open MyTailLog to choose an aircraft."
- Configuration: iOS `AppIntentConfiguration` with `aircraft: AircraftEntity` only (the horizon is fixed at 60 days, 14-decisions.md D6); Android a configuration activity with the same choice (06 M-SYS-06). Default aircraft: the last one opened.
- Rendering: the widget is a leaf (color.leaf, light or dark per the system appearance) so the inks hold; status by StatusMark shape plus word; in iOS accented/tinted rendering modes, rings and caps use `widgetAccentable()` and line inks become the single tint, which is acceptable because status is never colour alone. Android: the line ahead is drawn into a bitmap by the app (same `core:map` display list, rendered with Compose `Canvas` to an `ImageBitmap` at the widget's size from `LocalSize`) with a content description listing the items; the rows are real Glance `Text`s so they scale with font size.
- Accessibility: each widget has one accessible summary: "N734DM. VOR check lapsed 7 days ago, IFR only. Oil change in 9.7 hours, about December 12. Transponder due December 31."

---

## 12. Live Activities and ongoing notifications

**One activity: "Pages in progress"** (d-m-read, d-m-queue). Started by the app when a scan session ends with pages held or uploading (ActivityKit must start in the foreground; push-to-start, iOS 17.2+, starts it when pages uploaded from the web begin reading, if the owner allowed it in M-SYS-05).

| Phase | Lock screen (iOS) / ongoing notification (Android) | Dynamic Island compact (leading / trailing) | Minimal |
|---|---|---|---|
| On this phone | "2 pages on this phone · They upload when you have signal." | book icon / "2 held" | book icon |
| Uploading | "Uploading 1 of 2 · Airframe vol. 1" + progress bar | book / "1/2" | progress ring |
| Being read | "Reading 4 pages · 2 of 4 read · a minute or two" + progress | book / "2/4" | progress ring |
| Read | "6 pages are read. 2 need a look." + buttons **Review** (deep link) | book / check | check |
| Paused (allowance) | "4 pages wait for tomorrow's reading allowance." | book / "wait" | book |

- Updates: upload progress locally from the upload task; reading progress by APNs `liveactivity` pushes from the reading worker (push token sent to `POST /api/push/live-activities`). If no update arrives for 10 minutes the app, when next foregrounded, reconciles from the mirror.
- End: on "Read", with `dismissalPolicy: .after(now + 1 hour)`; immediately when the owner opens Review.
- Expanded Dynamic Island: tail, phase text, progress, and the mini airframe strip from d-m-read showing where the pages fall in time (rendered from the display list as SwiftUI shapes; no images).
- Android: an ongoing notification in channel **Reading progress** with `setProgress`; on Android 16+ use the progress-centric style (`Notification.ProgressStyle`) and request promotion as a Live Update where the system allows; otherwise standard. The upload phase is the `UploadWorker`'s foreground notification; the activity continues as a normal (non-foreground) notification updated by FCM data messages.

---

## 13. Siri, App Intents, App Shortcuts, Android shortcuts

### 13.1 Entities (iOS App Intents)
`AircraftEntity` (id, tail, make/model; default query = aircraft the user can open; `EntityStringQuery` matches tail numbers spoken as "November seven three four Delta Mike"), `TrackedItemEntity`, `EntryEntity` (confirmed and signed only), `DocumentEntity`, `SquawkEntity`. Entries, items, documents and squawks adopt `IndexedEntity` so Spotlight and Siri can find them (§14).

### 13.2 Intents
| Intent | Parameters | Runs | Result |
|---|---|---|---|
| `WhatsDueIntent` "What's due" | aircraft (default: last opened) | In the intents extension, offline, from the mirror | Spoken/printed dialog = the Verdict sentence; snippet view = the small line ahead with the next three items. |
| `LogFlightIntent` "Log a flight" | aircraft; tach (asks "What does the tach read?" if missing; `Double`, one decimal); hobbs (optional); oil quarts (optional) | Extension; needs confirmation ("Log 2.4 hours on N734DM, tach 4214.8?") | Enqueues `reading.create` (+ `oil.create`); dialog "Saved. The oil change is now 7.3 hours away." A reading lower than the last opens the app at the meter-replacement question instead of saving. |
| `AddOilIntent` "Add oil" | aircraft; quarts | Extension | Enqueues `oil.create`. |
| `ReportSquawkIntent` "Report a squawk" | aircraft; what (String); severity (Low, Watch, Ground; asks if missing) | Extension | Enqueues `squawk.create`; "Squawk added to N734DM." |
| `ScanPagesIntent` "Scan logbook pages" | aircraft; logbook | Opens the app | M-SCAN-01 or straight to the camera if the logbook is given. |
| `OpenAircraftIntent`, `OpenItemIntent`, `OpenEntryIntent` | entity | Opens the app | the route in §5.5 |

`AppShortcutsProvider` phrases (each includes the app name, as the system requires): "What's due in \(.applicationName)", "What's due on \(\.$aircraft) in \(.applicationName)", "Log a flight in \(.applicationName)", "Add oil in \(.applicationName)", "Report a squawk in \(.applicationName)", "Scan logbook pages with \(.applicationName)". Shortcut tiles use the section colour of where the result lands (Status blue, Maint. teal, Logbooks yellow). The Action button and Control Center control run `LogFlightIntent` with `openAppWhenRun` so the camera can read the tach.

### 13.3 Android
- **Static shortcuts** (`res/xml/shortcuts.xml`, long-press on the launcher icon): Log a flight, What's due, Scan pages, Report a squawk. Each targets the §5.5 route for the last opened aircraft.
- **Dynamic shortcuts**: one per recently opened aircraft ("N4321J status"), pushed with `ShortcutManagerCompat.pushDynamicShortcut` so the system can rank them.
- **Capabilities** in `shortcuts.xml` for Google Assistant/Gemini App Actions (custom intents "log a flight", "what's due") are best effort: shipped if the assistant supports them at release, not a launch requirement.
- **Quick Settings tile** "Log a flight" (`TileService`), opening M-FLIGHT-02.

---

## 14. System search indexing
- **iOS**: Core Spotlight. Items indexed: confirmed and signed entries (title: the entry's first sentence in the owner's words, e.g. "Engine overhaul"; content description: "Engine · Sep 14, 2005 · tach 2803.0 · p. 13"; keywords: tail, logbook, AD numbers, part numbers), tracked items ("Transponder test · due Dec 31, 2026"), ADs ("AD 2011-10-09 · Seat rails"), documents (title, type, expiry), open squawks. Unconfirmed (read-by-AI) entries are **not** indexed system-wide (the system result cannot carry the TrustMark); they are found in the app's own search, marked. `domainIdentifier` = aircraft id, so revoking access or signing out deletes a whole aircraft's items with one call. Tapping a result uses `CSSearchableItemActionType` → §5.5 route.
- **Android**: Jetpack AppSearch. On Android 12+ `PlatformStorage` with documents visible to the system (`setSchemaTypeDisplayedBySystem`), so device search surfaces that support it can show them; below 12, `LocalStorage` (in-app only). Same item set and rules as iOS.
- **Setting**: Settings › "Show records in phone search" (default on). Turning it off deletes the index.
- **In-app search** (M-ASK-01) uses the FTS5 index in `mirror.db` over entries (description, work performed, parts, signer, AD/SB refs), items, ADs, documents, squawks, equipment; ranking prefers confirmed entries and recent dates; works offline.

---

## 15. Document scanning

### 15.1 Primary: ScanCamera (custom), both platforms
The mockup camera (d-m-camera, b-m-scan-camera) needs the app's own overlay (running count, the last page, "Page found. Hold still.", and "Lands in 1984, inside the airframe gap"), which the system scanners cannot show.

| Step | iOS | Android |
|---|---|---|
| Preview and capture | `AVCaptureSession` (back wide camera, `.photo` preset), `AVCapturePhotoOutput` at full resolution, continuous autofocus, torch toggle | CameraX `Preview` + `ImageCapture` (max quality) + `ImageAnalysis` (640px, `STRATEGY_KEEP_ONLY_LATEST`) |
| Page edge detection | `VNDetectDocumentSegmentationRequest` on video frames, 10–15 per second | OpenCV (Android SDK, native) contour detection: grey, blur, Canny, `findContours`, `approxPolyDP` to the largest convex quadrilateral covering ≥ 25% of the frame |
| "Hold still" and auto-capture | Quad corners move < 2% of the frame diagonal for 0.6 s, plus device motion below threshold (`CMMotionManager`) → capture with a medium impact haptic and a 120 ms white flash on the overlay (reduced to a border pulse with Reduce Motion) | same with `SensorManager` |
| Crop and flatten | `CIPerspectiveCorrection` with the detected quad; correction for small rotation; no colour filters (the page image must stay faithful) | OpenCV `getPerspectiveTransform` + `warpPerspective` |
| Where the page lands | `VNRecognizeTextRequest` (`.fast`, en-US, no language correction) on the flattened page; parse dates (m/d/yy, m/d/yyyy, "Jun 11 1984") in the date column; take the median year; look it up in the map model for that logbook to say "Lands in 1984, inside the airframe gap" or "Lands in 1993, after page 203". If no date is legible, the line is omitted. Never stored as data. | ML Kit Text Recognition v2 (Latin, bundled model) on the flattened page; same parsing |
| Manual | Shutter button always available; manual corner adjust after capture from the strip of thumbnails ("Adjust corners") | same |
| Limits | No hard page limit; each page is written to `Outbox/pages` immediately (memory stays flat). A session of 50 pages shows "That's 50 pages. Upload these before shooting more?" with Continue. | same |

Each captured page creates a `file_job` (held) with logbook id, capture time, handwritten flag and the device's sequence hint. Upload starts at once if online (§7.2).

### 15.2 Fallback: system scanner
"Use the system scanner" (M-SCAN-01 overflow menu, and automatically if the custom camera cannot start): iOS `VNDocumentCameraViewController`; Android ML Kit `GmsDocumentScanning` (`SCANNER_MODE_FULL`, JPEG, page limit 24; requires Google Play services). Output goes through the same file-job path. The "lands in" line is then shown on the queue (M-SCAN-03) instead of in the camera.

### 15.3 Permissions
Camera permission is requested the first time the camera opens, after a pre-permission explanation (06 M-SYS-04). Denied: the camera screen shows "MyTailLog needs the camera to photograph pages. You can allow it in Settings." with **Open Settings** and **Choose photos instead** (photo picker, §17).

---

## 16. Reading the tach on device
(b-m-tach-photo, M-FLIGHT-02.) "Review, don't retype."
- **Pipeline**: live camera preview with a framing guide (a 280×120pt rounded rectangle); text recognition on frames inside the guide: iOS `VNRecognizeTextRequest` (`.accurate`, `usesLanguageCorrection = false`, `minimumTextHeight` 0.1 of the region); Android ML Kit Text Recognition v2 with `ImageAnalysis`. `DataScannerViewController` is not used (less control over the guide and parsing).
- **Parsing**: candidates are runs of 3 to 6 digits, with or without a decimal point. Mechanical hour meters show tenths on the last drum, often without a point: a run of N digits is interpreted as `value / 10` when the reading with a point is implausible. A candidate is **plausible** if it is ≥ the last reading for that meter and ≤ last reading + 24 × days since the last reading (capped at +100 h). Score by plausibility, then by closeness to `last + typical flight` (recent median flight length). A value is "found" when the same candidate wins 3 consecutive frames.
- **Found**: the guide outlines the digits, the value shows in type.numeric 34pt ("4214.8"), the line "Hour meter found. Last reading was 4212.4." appears, light haptic. **Nothing is saved**: the value goes to M-FLIGHT-03 as a draft with the caption "Read from your photo. Check it against the meter."
- **Not found in 8 seconds**: "Can't read it yet. Move closer, or type it." with **Type it** prominent.
- **Lower than the last reading**: never offered as found; if the owner types it, the meter-replacement question appears (06 M-FLIGHT-03).
- **Hobbs next**: button "Hobbs next" runs the same flow for the hobbs; skipped when the aircraft records only tach ("Not this time" stays on).
- **Privacy**: frames are processed in memory and never written or uploaded. No photo of the meter is kept.

---

## 17. Photos, file import and the share extension
- **Squawk photos**: camera (`UIImagePickerController`-free: the same AVFoundation/CameraX preview used elsewhere, without edge detection) or library via `PhotosPicker` (iOS) / the system photo picker (`PickVisualMedia`, Android). Up to 4 photos per squawk. EXIF location is stripped before upload; capture time is kept.
- **Documents**: `.fileImporter` (iOS: PDF, JPEG, PNG, HEIC, TIFF) and `ACTION_OPEN_DOCUMENT` (Android, same MIME types); camera with edge detection (ScanCamera in single-document mode) for paper documents.
- **Share extension / share target**: "Save to MyTailLog" accepts PDFs and images from Mail, Files, Photos and other apps. The extension shows a compact sheet: aircraft (default last opened), "What is it?" (document type chips: Registration, Airworthiness certificate, Insurance policy, Form 337, 8130-3, Weight and balance, Oil analysis, Logbook pages, Other), optional name, **Save**. "Logbook pages" routes images to the scan queue for a chosen logbook instead of the vault. Files are copied into the App Group outbox and uploaded by the app (iOS) or by `UploadWorker` (Android `ACTION_SEND` / `ACTION_SEND_MULTIPLE` activity). Works offline.
- **Backup import** (M-HANGAR-01 "Import a backup"): `.zip` MyTailLog exports are uploaded to the server's import route (online only) and appear as a new aircraft when processed. CSV files need column matching: "A CSV needs its columns matched on a computer. We'll email you a link to finish on the website." with **Email me the link**.
- **Drag and drop** (iPad, Android tablets): files dropped on Documents or on a logbook in Pages; pages dragged within a logbook to reorder (06 M-SYS-08).

---

## 18. Haptics
iOS: SwiftUI `.sensoryFeedback`; Android: `View.performHapticFeedback` with `HapticFeedbackConstants` (fall back to `VIRTUAL_KEY` below API 30). Respect the system setting; never haptics on scroll or passive updates.

| Event | iOS | Android |
|---|---|---|
| Page edges found and steady (camera) | `.selection` | `SEGMENT_FREQUENT_TICK` (API 34+) / `CLOCK_TICK` |
| Page captured | `.impact(weight: .medium)` | `CONFIRM` |
| Tach value found | `.impact(weight: .light)` | `CONTEXT_CLICK` |
| Stepper tick (0.1) | `.selection`, at most 20 per second | `CLOCK_TICK` |
| Stepper jumps to whole hours (press and hold) | `.impact(weight: .light)` once | `LONG_PRESS` once |
| Swipe action crosses its threshold | `.impact(weight: .light)` | `GESTURE_THRESHOLD_ACTIVATE` (API 34+) |
| Date scrubber crosses a ring | `.selection` | `SEGMENT_TICK` |
| Save succeeded (flight, mark done, squawk, confirm page) | `.success` | `CONFIRM` |
| Refusal, conflict raised, validation error | `.warning` | `REJECT` |
| Destructive confirm | `.impact(weight: .heavy)` | `LONG_PRESS` |

---

## 19. Dynamic Type and font scale
- Every text style is a type role from 01-design-tokens.md §5, built with the bundled fonts and scaled: iOS `Font.custom("LibreFranklin-…", size: role.size, relativeTo: role.textStyle)` and `@ScaledMetric` for paddings, icon sizes and row heights tied to text; Android `sp` units throughout, with Android 14 non-linear scaling honoured (no fixed `dp` text).
- Supported range: iOS xSmall to AX5; Android 85% to 200%. Layout rules at large sizes (≥ iOS AX1, Android ≥ 150%):
  - DueRow: the right column (value and status word) moves under the title; LineChip and meta wrap; minimum row height grows with content.
  - PhoneHeader: the board title wraps to two lines before truncating; the tail line truncates the model, never the tail number.
  - PhoneTabBar: labels hide and the bar grows to 56pt; long-press shows the Large Content Viewer (iOS) / a tooltip with the label (Android).
  - Sheets switch to the large detent automatically.
  - Steppers stack the − and + keys above and below the value at AX3 and larger.
  - The map keeps its geometry; labels use type.map scaled up to 1.6× and the label placer drops labels that no longer fit (they stay available to VoiceOver/TalkBack and in the list view).
- Bold Text (iOS) and Android bold text setting: 400 → 600, 600 → 700, 700 → 800.
- Tested sizes in snapshot tests: default, XL, AX3, AX5 (iOS); 100%, 130%, 200% (Android).

---

## 20. Appearance: light and the night hangar
- Modes: **Match system** (default), **Light**, **Dark**, set in Settings (b-m-settings). iOS `.preferredColorScheme` on the root; Android `AppCompatDelegate.setDefaultNightMode` plus the Compose theme. Switching repaints live (today's behaviour).
- The dark palette is defined in 01-design-tokens.md §3 (leaves charcoal #1c1e23, boards one step darker, section inks and logbook inks lightened, alarm #ff7357 with dark text on fills). On the phone this means:
  - **Boards and the PhoneTabBar** use the dark section colours; the tab bar ground is the dark cover (#0d0e11).
  - **Leaves** become charcoal; the map, spine and line ahead draw on the charcoal leaf with the dark logbook inks; rings keep their shapes (ink ring = light ink, due soon = alarm ring, overdue = solid alarm, unknown = dashed ink-3).
  - **The SourceMat and scanned pages** do not change: the mat is darker (#0b0c0e) and page images are never tinted, inverted or dimmed. Smart Invert is disabled on page images (`accessibilityIgnoresInvertColors`).
  - **Status slips**: overdue slip is alarm fill with #1a0a06 text in dark (01 §3).
  - **Camera screens** are the cover colour in both modes.
  - **Widgets** follow the system appearance (iOS widget rendering and Android `GlanceTheme` with D's colours).
  - **Launch screen**: cover colour with the wordmark, both modes (no white flash at night).
- "Light reads best outdoors" stays as the hint under the Appearance control.

---

## 21. The map, natively
The route map (M-BOOKS-01, 05; T-BOOKS-01), the spine (every tablet board; the review header strip M-REVIEW-01; mini strips on M-ASK-01, M-SCAN-04) and the line ahead (M-STATUS-01, 03, 04, M-FLIGHT-03/04, widgets) are drawn natively from one layout model.

- **Layout**: `core:map` computes the geometry from 10-line-map.md (orientation: vertical on the phone with newest at the top and one column per book; horizontal for the line ahead and on tablets; scales and the scale break; era bands; label placement without overlap) and returns a **display list**: primitives (`Line(path, ink, style: solid|future|gap|thin)`, `Stop(center, trust)`, `Cap(rect, plan|sel)`, `Ring(center, status)`, `Today(x|y)`, `Window(rect)`, `Text(run, role, anchor)`), each with a stable id and a hit region. Platforms only draw.
- **Drawing**: iOS SwiftUI `Canvas` (resolving token colours from the environment, text via `context.draw(Text)` with the type.map role scaled for Dynamic Type); Android Compose `Canvas`/`drawWithCache` with `TextMeasurer`. The phone map is virtualised: the display list is tiled into 600pt segments and only visible tiles are drawn inside a `ScrollView`/`LazyColumn` of tiles, so 48 years scroll at 120 Hz.
- **Interaction**: tap hit-testing uses the hit regions expanded to 44pt (iOS) / 48dp (Android); when two or more stops fall within one target, a small menu lists them ("3 entries here: Jul 14 annual · Jul 2 oil change · Jun 28 squawk cleared"). Pinch to zoom time (phone vertical: pinch vertically; tablets: horizontally) between the whole life and a 2-year window, with the scale break preserved; double-tap zooms one step at the tap; zoom changes re-run layout (debounced 100 ms) so labels stay at 12–13pt. Long-press a stop: context menu (Open page, Open entry, Copy date and tach, Share the page).
- **Selection**: the selected stop draws `cap sel`/a 4pt stroke and the sheet or right pane shows it (M-BOOKS-02 to 04; T-BOOKS-01).
- **Line ahead scrubbing** (M-STATUS-03): a draggable date marker; dragging re-runs `core:rules` "what lapses by" for each day boundary crossed; haptic tick per ring crossed; VoiceOver adjustable action steps a week, a month with the rotor.
- **Accessibility** (details in §23 and 11-accessibility-and-motion.md): the canvas exposes an accessibility tree built from the display list: one container per line ("Airframe logbook, 198 pages, 1978 to today, gap 1983 to 1991"), its stops in time order ("Engine overhaul, September 14, 2005, tach 2803.0, Signal Engines, confirmed by you"), gaps ("No airframe pages, 1983 to 1991. Engine and propeller entries exist for these years"), visits and rings. iOS: `accessibilityRepresentation`/`accessibilityChildren` with `AccessibilityRotor`s "Stops", "Visits", "Gaps", "Due"; custom actions "Open page", "Next stop on this line", "Previous stop on this line", "Same date in other books". Android: invisible semantics nodes aligned with each primitive (`Modifier.semantics { contentDescription; customActions; onClick }`), years as `heading()`, lines as `CollectionInfo`/`CollectionItemInfo`, so TalkBack can move by heading (year) and by control. Every map screen also offers **List** (the entries in date order, W-BOOKS-12 / 06 M-BOOKS-08) as a full equivalent.

---

## 22. Sharing, printing and PDF
- **Share sheet**: iOS `ShareLink` / `UIActivityViewController`; Android `Intent.createChooser` with `ACTION_SEND`. Shared items: record room link (URL + "N734DM records, read only, until Dec 18" as the subject), squawk link for the mechanic, an entry (the page image + "Engine overhaul, Sep 14, 2005, tach 2803.0. Engine logbook p. 13. From MyTailLog; the paper logbook is the record."), the maintenance summary PDF, the dossier PDF.
- **QR codes** for record room links (M-SHARE-02): generated on the phone (`CIQRCodeGenerator`; ZXing core on Android), error correction M, shown at 220pt with the link under it; tapping enlarges to full screen with maximum brightness for scanning.
- **Maintenance summary** (W-SHARE-04 content spec, 04-web-screens.md): rendered **on the phone** from the mirror so it works offline: iOS `UIGraphicsPDFRenderer` drawing SwiftUI views via `ImageRenderer`/`render(in:)` per page, US Letter with A4 by locale; Android `PdfDocument` drawing Compose content captured with `GraphicsLayer`. Confirmed data only; every line with its page citation.
- **Pre-buy dossier** (W-SHARE-03): generated **on the server** (it embeds hundreds of page images); the phone requests it (online), downloads the PDF to the cache, and opens it in the document viewer with Share and Print. Offline: "The dossier is made on the server. Ask for it when you have signal; your last copy from Nov 2 is on this phone." when a previous copy exists.
- **Print**: `UIPrintInteractionController` with the PDF; Android `PrintManager` with a `PrintDocumentAdapter` over the PDF. Signed-entry stickers print from an on-phone PDF at the label size the web uses (the sticker template is shared from 04-web-screens.md).
- **Viewing PDFs**: PDFKit `PDFView` (iOS); Android `PdfRenderer` in a zoomable pager (or the androidx `pdf-viewer` fragment when stable). Text in PDFs is selectable on iOS.

---

## 23. Accessibility
Platform implementation of 11-accessibility-and-motion.md:
- **Targets**: 44×44pt (iOS) and 48×48dp (Android) minimum for everything tappable, including the tail line, LineChips that are links, map stops (expanded hit regions) and sheet close buttons.
- **Labels**: every icon-only control has an accessible name equal to the visible tooltip (Search or ask, Add, Close). DueRows read as one element: "Oil and filter change. Engine. Due in 9.7 hours, about December 12. Due soon." with actions "Mark done", "Open the page", "Plan a visit". TrustMarks read their words ("read by AI, not yet confirmed").
- **Rotors and actions**: lists offer custom actions instead of requiring swipes (every swipe action is also an accessibility action and a long-press menu item). Review fields: actions "Looks right", "Edit", "Not on this page"; headings per entry. The map: §21.
- **Order**: Verdict first, then the line ahead summary ("Line ahead, next 12 months: …"), then rows. The PhoneTabBar is last in the reading order.
- **Voice Control / Voice Access**: visible text and accessible names match ("Tap Mark done").
- **Reduce Motion**: no sliding page transitions in review (cross-fade), no camera flash, no animated line-ahead ring movement (M-FLIGHT-03 shows before and after instead).
- **Contrast and colour**: tokens already meet 4.5:1 (01). Increase Contrast (iOS) / high-contrast text (Android): rule → rule-2, ink-3 → ink-2.
- **Text selection**: record text is selectable (`.textSelection(.enabled)` on entry text, AD numbers, serials, part numbers; `SelectionContainer` on Android). This fixes critique #22.
- **Audits**: `XCUIApplication().performAccessibilityAudit()` in UI tests; Compose `AccessibilityChecks.enable()` in Espresso tests; manual VoiceOver and TalkBack passes on every release for the flows in 07-flows.md.

---

## 24. Localisation readiness
v1 ships in US English. Ready for more:
- Strings: iOS String Catalogs (`.xcstrings`) with plural variations; Android `strings.xml` with `<plurals>`. No string concatenation; every sentence is one key with arguments. Copy keys follow 12-copy-and-voice.md.
- **Dates are local calendar dates.** All date-only fields (`entry_date`, `reading_date`, `last_done_date`, `reported_at` day) are `LocalDate` (`kotlinx-datetime`) in the aircraft owner's current time zone, never derived from UTC `Date` (critique #10). Display uses the device locale: US "Nov 18, 2026" / "Dec 12"; today's forced `en-GB` format is removed.
- Numbers: tach and hobbs with one decimal, locale decimal separator for display and input (both "." and "," accepted while typing).
- Units are aviation units and not localised (hours, quarts, pounds, inches for arm) unless 09 adds metric W&B.
- Layout mirrors for right-to-left languages **except time**: the line ahead and spine run left to right (past to future) in every locale; the phone vertical map is unaffected.
- Pseudo-localisation (accented, 40% longer) and a right-to-left pseudo-locale run in snapshot tests.
- Per-app language (iOS Settings › MyTailLog › Language; Android 13 per-app locale) is supported automatically by the catalogs.

---

## 25. Analytics, diagnostics and privacy
- **No third-party tracking, analytics, attribution, advertising or crash SDKs.** No App Tracking Transparency prompt (we do not track). Firebase on Android is limited to Cloud Messaging; `firebase_analytics_collection_deactivated` and `google_analytics_adid_collection_enabled=false` are set and the Analytics module is not a dependency.
- **Product metrics** stay server-side and derived from records (the activation funnel in `/admin` today), not from screen tracking.
- **Crashes and performance**: Xcode Organizer crash reports and MetricKit (`MXMetricManager`) diagnostics; Google Play vitals. Optional in-app setting "Send crash details to MyTailLog" (default off): uploads MetricKit diagnostic payloads / Android `ApplicationExitInfo` traces to our own endpoint with no record content.
- **Logs**: `os.Logger` / `Log` with privacy redaction (`.private` for any record text, tail numbers and emails); a "Copy diagnostics" button in Settings › About exports the last 500 sync activity lines without record content for support.
- **Store disclosures**: iOS privacy manifest (`PrivacyInfo.xcprivacy`) for the app and every extension with required-reason API entries (UserDefaults, file timestamps, disk space for the storage readout); App Store privacy label: contact info (email) and user content (photos, documents, other user content) linked to the user, used for app functionality only, no tracking. Play Data safety: same, plus "data is encrypted in transit" and "you can request deletion".
- **On-device processing** is the default: tach reading, page edge detection, "lands in" dating and search never leave the phone. AI reading and Ask send page images and questions to the server, as today, and say so where they start.

---

## 26. Security on the device
- Data protection: iOS files `completeUntilFirstUserAuthentication` (background uploads need access while locked after first unlock); Android app-private storage (file-based encryption by the OS).
- Tokens only in Keychain / Keystore-encrypted DataStore; never in UserDefaults, SharedPreferences or logs.
- Certificate validation is the platform's (no pinning: the backend's certificates rotate and pinning has caused outages; open question 7 if security review wants it).
- Screenshots and the app switcher are not blocked (owners screenshot status for their mechanic).
- Universal/App Links are verified; the custom scheme accepts only `auth/callback`.
- Extensions read the session from the shared keychain group and call only the endpoints they need.
- A shared iPad: sign-out wipes everything (today's rule); no multi-user mode.

---

## 27. Performance budgets
| Measure | Budget (iPhone 12 / Pixel 6 class) |
|---|---|
| Cold start to the Verdict rendered from the mirror | ≤ 1.2 s |
| Warm start / foreground to interactive | ≤ 300 ms |
| Tab switch | ≤ 100 ms, no blank frame |
| Map scroll (412 pages, 212 stops, 48 years) | 120 Hz on ProMotion / 90 Hz on capable Android; no frame over 16 ms |
| Pull of 1 000 changes applied | ≤ 2 s on device, UI responsive throughout |
| First full sync, demo aircraft (412 pages, 212 entries) excluding thumbnails | ≤ 20 s on LTE |
| Camera open to first edge overlay | ≤ 600 ms |
| Capture to page saved on disk | ≤ 400 ms per page |
| Memory during a 50-page scan session | ≤ 250 MB |
| App size (download) | iOS ≤ 35 MB, Android ≤ 30 MB per ABI split (OpenCV and the ML Kit text model are the largest parts) |
Android ships a Baseline Profile for startup, tab switches and map scroll. Both apps measure startup and hitches in CI on real devices weekly (Xcode Cloud / Firebase Test Lab without analytics; or a device farm of choice).

---

## 28. Testing
| Layer | iOS | Android | Shared |
|---|---|---|---|
| Core logic | — | — | Kotlin `commonTest` on JVM and iOS simulator: rules, map layout, sync engine, conflict diff; **conformance fixtures** from the web (§4.3); property tests for projection (any interleaving of pull and push yields server truth plus pending intents). |
| Sync integration | — | — | A local Supabase (`supabase start`) with migrations and the web app's sync routes in CI; scripted scenarios: offline write then pull; conflict on each mutation type; refusal; viewer write; access revoked; 10 000-row first sync; server returns 5xx then recovers; cursor resume after kill. |
| Fault injection | URLProtocol stub | OkHttp interceptor | Drop, delay, duplicate responses to prove idempotency. |
| UI unit / snapshot | Swift Testing + swift-snapshot-testing | Roborazzi (Compose screenshot tests) | Every screen in 06 in: light, dark, default text size, AX3/200%, viewer role, offline with changes waiting, conflict present, empty state, RTL pseudo-locale. |
| UI flows | XCUITest | Compose UI tests (Espresso) | The flows in 07-flows.md: sign in by code, log a flight by photo (camera stubbed with fixture frames), scan five pages offline then reconnect, review and confirm a page, mark done, resolve a conflict, share a record room link. |
| Camera and recognition | Vision on recorded frame sequences | ML Kit on the same frames | A fixture set of 200 tach photos and 100 logbook pages (from the demo books, varied light) with expected values; accuracy is tracked per release, not asserted as a public claim. |
| Accessibility | `performAccessibilityAudit()` | `AccessibilityChecks` | Manual VoiceOver/TalkBack script per release. |
| Migration | Capacitor database fixtures (§29.3) imported | same | — |
| Performance | XCTest metrics (launch, scroll) | Macrobenchmark | Budgets in §27 as thresholds. |

Device matrix minimum per release: iPhone SE (3rd gen), iPhone 12, a current Pro Max, iPad (9th gen), iPad Pro 13-inch; Android: Pixel 6a (Android 15/16), Samsung Galaxy A-series (mid-range, One UI), a 2020-era Android 10 device, Galaxy Tab S-series, a foldable.

---

## 29. Release and migration from the Capacitor app

### 29.1 Identity and stores
Same identifiers as today: iOS bundle id `com.mytaillog.app` (plus `.widgets`, `.intents`, `.share`, `.notifications` extensions), Android `applicationId com.mytaillog.app`. Same App Store and Play listings. Version 3.0.0 (marketing) with build numbers continuing from the Capacitor app's highest build. Android signing uses the existing upload key (Play App Signing).

### 29.2 Pipeline
- CI: GitHub Actions (lint, unit, snapshot, core fixtures on every PR); Xcode Cloud or fastlane on macOS runners for iOS archive and TestFlight; Gradle Play Publisher (or fastlane supply) for Play internal testing.
- Tracks: TestFlight internal → external (the current beta group) → App Store with **phased release** (7 days); Play internal → closed → production **staged rollout** 5% → 20% → 50% → 100% with a hold on any crash-rate regression in vitals.
- Feature flags: a signed `GET /api/app-config` (no third party) with booleans per feature (custom camera, passkeys, Live Activity push-to-start, App Actions) and `minAppVersion`.
- Release notes come from `CHANGELOG.md`; the in-app "What's new" is an announcement (admin notice) on first launch of a version.

### 29.3 Migrating from the Capacitor app (first launch of 3.0)
Owners may have unsent work in the old app. On first launch the native app:
1. Finds the old SQLite database (`@capacitor-community/sqlite` stores `mytaillogSQLite.db`: iOS `Library/CapacitorDatabase/`, Android `databases/`) and the old blob queue directories (`blob-upload.ts` filesystem queue).
2. Reads the old session from the old secure storage (iOS Keychain items written by `@aparajita/capacitor-secure-storage`; Android its encrypted preferences). If a valid refresh token is found, the owner stays signed in; otherwise they sign in, and the import waits until the same user id signs in.
3. Imports `action_queue` rows (pending, conflict, failed) into the outbox, mapping the four legacy types (`reading`, `oil`, `squawk`, `mx_complete`) and the contract types one to one; imports `capture_queue` (base64 images written to files) and the document file queue as file jobs.
4. Ignores the old mirror and cursor: pulls from cursor 0 into the new typed mirror (it is rebuildable).
5. Shows once: "Welcome to the new MyTailLog. 3 changes and 2 pages from the previous version are still on this phone and will upload." and logs the import in the activity list. If a different user signs in: "Changes from dana@example.com are on this phone. Sign in as Dana to upload them, or delete them." with **Delete them** (alarm, confirm).
6. Deletes the old database and files only after every imported mutation is accepted or discarded.
Migration code ships in 3.x and is removed in 4.0.

### 29.4 Server compatibility
The server keeps accepting the Capacitor app's routes (`/api/aircraft/[id]/actions` legacy types, JSON-base64 capture and document routes) until the share of active installs on the old build is under 2% for 30 days, then returns `minAppVersion` above it.

---

## 30. Components to add
These are native-only components not on the 02-components.md list. 02 owns the shared ones (PhoneTabBar, PhoneHeader, PhoneLeaf, AddButton, BottomSheet, Widget, RouteMap, LineAhead, DateScrubber …).
| Component | Definition |
|---|---|
| SyncLine | The second line of the PhoneHeader under the tail number: sync state words, alarm for "1 to decide" and "Sync failed". Tap opens the switcher sheet's sync row. 06 §1.3. |
| OfflineBar | A 36pt cover-coloured strip under the PhoneHeader when offline or when changes wait: icon + "3 changes on this phone. They upload when you have signal." Tap opens M-SYS-01. b-m-home-offline. |
| PendingCaption | The "On this phone" caption (cloud-upload icon + text, ink-3) on a row whose effective value comes from an unsent change; "Changed in two places" in alarm for a conflict. |
| ScanCamera | The custom camera of §15 with its overlay (count, last page, hold-still line, lands-in line, Done). |
| MeterReader | The tach camera of §16 with its guide and found-value readout. |
| MeterStepper | The large tach/hobbs stepper with typed entry, press-and-hold acceleration, live delta and "Not this time". 06 M-FLIGHT-03. |
| SeverityPicker | Three rows Low / Watch / Ground with their meanings; nothing selected by default. 06 M-MAINT-03. |
| SignaturePad | Finger signature for the VOR check log (PencilKit `PKCanvasView` on iOS; a Compose path recorder on Android), exported as PNG. 06 M-STATUS-07. |
| PermissionPrimer | A full-height leaf explaining a permission before the system prompt. 06 M-SYS-04. |
| LiveActivityView / ProgressNotification | §12. |
| QRCard | QR code, link text and Copy. 06 M-SHARE-02. |
| Notice | In-app announcement as a leaf row at the top of the Status leaf (not a floating card), with "Read the announcement" and Dismiss. Fixes critique #25. |

---

## 31. Open questions
1. **KMP adoption.** This file recommends a Kotlin Multiplatform core. The lead and the build plan (13-build-plan.md) need to confirm it before kickoff; the fallback (GRDB + Room with shared fixtures) changes staffing, not screens.
2. **Pull cursor.** The brief mentions "pull by updated_at cursors"; this file keeps the existing `change_log.seq` cursor and uses `updated_at` only as the write concurrency token. 09-data-and-api.md should state the same.
3. **Queued link creation. Resolved: online-only (09 §5.3); see §6.5.** Original note: Record room links, squawk links and visit bookings are queued with client-generated tokens so they can be made offline. 09 must accept client tokens (store only the hash, as `record_room.token_hash` does today) or declare them online-only.
4. **Passkeys** depend on server WebAuthn support that issues a Supabase session. Phase 2 until 09 specifies it.
5. **Account deletion endpoint** does not exist on the server today and blocks App Store submission (guideline 5.1.1(v)). 09 must add it before the iOS release.
6. **Direct-to-storage uploads** (§7.2) need a new signed-upload route and `page.register`; 09 owns both.
7. **Certificate pinning**: not planned; confirm with security review.
8. **Android Auto Backup** only includes `outbox.db` under the 25 MB quota; held page images over the quota are lost if the owner moves to a new phone before they upload. Acceptable? The UPLOAD_STUCK local notification after 24 h mitigates it.
9. **Online-only list.** The brief names four online-only actions (AI reading, Ask, enrolling, backups). The current app also has signing an authored entry, Find ADs (FAA search), AD full text and backup import as online-only; this file keeps them online-only. 00-product-principles.md rule 7 may need the longer list.
10. **Push-to-start Live Activities** for pages uploaded from the web need the owner's opt-in and a server-side token store; confirm the server work is in scope for v1.
11. **App Actions on Android** depend on what Google's assistant supports at release; treated as best effort.
