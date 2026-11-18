# 13 · Build plan

How to build direction D without breaking the product owners rely on today. The web app is rebuilt in place inside `apps/web` behind a feature flag; the phone apps are new native projects (`apps/ios`, `apps/android`) that replace the Capacitor app (`apps/mobile`) once they reach parity. Backend changes are additive Supabase migrations. Each phase ends in something shippable, with exit criteria a reviewer can check.

Contents: 1 Starting point · 2 Principles for the build · 3 Repository layout · 4 Phases · 5 Per-phase detail · 6 Migration and cut-over · 7 Testing strategy · 8 Definition of done · 9 Risks · 10 Decisions to make before phase 1

## 1. Starting point (as of this package)
- **Web:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, `@supabase/ssr`, Playwright e2e, Vitest/Jest unit tests. Business logic in `apps/web/src/lib/` (notably `status.ts` due status, `aircraftHours.ts` and `hobbsTach.ts` meter time, `reminders.ts`, `compliance.ts`, `coverage.ts`, `recordRoom.ts`, `duplicates.ts`, `extraction/`, `capture/`, `sync/`, `backup/`, `adsb/`, `myflightbook.ts`, `weightBalance.ts`, `authored-entries.ts`, `entry-signing-challenge.ts`).
- **Mobile:** Capacitor + React (`apps/mobile`) with an offline store and the sync protocol in `apps/web/src/lib/sync/` (changes, mutations, push).
- **Backend:** Supabase Postgres with migrations 0001–0068, storage for scans, row-level security per aircraft membership (owner/editor/viewer), edge/cron jobs (AD catalog, ADS-B sweep, onboarding emails) in `.github/workflows/`.
- **Shared code:** `packages/shared` is reserved but not wired (Turbopack does not resolve symlinked packages; see its README). The web does not depend on fixing that: the due engine and map model run on the server. The phones share one Kotlin Multiplatform core (05-mobile-architecture.md §4) for due rules, map layout, sync and the local database.
Current behaviour that must survive: everything listed as "existing" in 08-capabilities.md.

## 2. Principles for the build
1. **One source of truth for due status.** The server computes due status, projections and the MapModel (09-data-and-api.md). Clients render; phones apply only the documented offline projection for locally logged flights, verified against server fixtures.
2. **Tokens first.** Generate CSS variables, Swift and Kotlin token files from `tokens.json` with a script (Style Dictionary or a 100-line Node script) in CI. No hard-coded colours or sizes in components.
3. **One implementation per side, one set of fixtures.** The server (TypeScript) owns due status, projections, suggested visits and the map model. The phones run a Kotlin Multiplatform core (`apps/core`, 05 §4.2: domain rules, map layout, sync engine, SQLDelight database) consumed by SwiftUI as an XCFramework and by Compose natively, and recompute only the offline subset in 09 §3.12. Fixtures (input JSON → expected output JSON) in `packages/shared/fixtures/` (`due-calendar.json`, `due-hours.json`, `status-thresholds.json`, `projection.json`, `plan-date.json`, `visit-risk.json`, `map-grouping.json`, `map-*.json`) are generated from the TypeScript implementation and run in both the web and the KMP test suites. If KMP is rejected at kickoff, the fallback in 05 §4.3 applies (GRDB on iOS, Room on Android) against the same fixtures.
4. **Feature-flag the web redesign.** Ship screens behind `ui_v2` per user so owners can switch back during the transition; remove the old UI at the end of phase 6.
5. **Rules have tests.** Each non-negotiable rule in 00 §3 has at least one automated test (see §7.2).
6. **Accessibility and copy are part of each component's done**, not a final pass.

## 3. Repository layout (target)
```
apps/
  web/                    Next.js (existing), new UI under src/app/(v2)/ and src/ui/
    src/ui/               Design system: tokens.css (generated), components from 02
    src/ui/map/           map-layout.ts (pure), Spine, RouteMap, LineAhead, DateScrubber
  core/                   Kotlin Multiplatform shared core (domain, map layout, sync, SQLDelight DB) → Android library + XCFramework
  ios/                    Xcode project: MyTailLog (iOS/iPadOS 18+), widgets, intents, share and notification extensions
  android/                Gradle project: app, feature-* modules, Glance widgets (minSdk 29, target latest)
  mobile/                 Capacitor app (retired after cut-over, §6)
packages/
  shared/
    tokens/tokens.json    → symlink or copy of docs/redesign/handoff/tokens.json (source of truth moves here)
    fixtures/             due, projection, verdict, map-layout fixtures (JSON)
    scripts/              build-tokens (CSS, Swift, Kotlin), check-strings (banned words, 12 §3)
supabase/migrations/      0069+ additive migrations (09-data-and-api.md)
```

## 4. Phases at a glance
| Phase | Theme | Web | iOS | Android | Backend | Exit |
|---|---|---|---|---|---|---|
| 0 | Foundations | Token pipeline, ui_v2 flag, Rail/Board/Leaf shell, fonts | Project skeleton, design tokens, navigation shell, auth | Same | Migrations for new tables (09), MapModel endpoint stub, fixtures | Shell renders all six sections empty on three platforms; tokens generated in CI |
| 1 | Status | Status board, Verdict, DueTable, LineAhead, item detail | Home (Verdict, line ahead, due list), item sheet | Same | Due engine v2 (both limits, first, projections, calendar-month), Verdict API | Status parity with current app plus line ahead; rule tests green |
| 2 | Logbooks | Route map, entry with page, interchange, gap, pages, Review desk, search, Ask | Vertical map, entry sheet, interchange cards, gap sheet, review | Same | MapModel derivation (interchanges, gaps, eras), gap status, review events | Owners can review and confirm a full logbook on any platform |
| 3 | Capture and offline | Upload and import, reading queue, allowance | Document-scanner capture, offline store, sync, background upload, reading progress | Same (ML Kit document scanner, WorkManager) | Sync protocol v2 (09), conflict records | Scan 20 pages offline, sync later, review on web |
| 4 | Maintenance, Aircraft, Documents | Squawks, ADs, tracked items, visits, meters, W&B, equipment, documents | Same set, phone-sized | Same | Visits, suggested-visit rule, squawk link | Feature parity for these sections |
| 5 | Share and plan | Plan ahead, record room, dossier, maintenance summary, annual prep, exports, backups | Plan ahead, share sheet, record room management | Same | Record room v2 (view counts, expiry), dossier render, scheduled backups | All hand-offs work end to end; printed outputs pass review |
| 6 | Platform polish and cut-over | Settings, account, onboarding, keyboard shortcuts, dark mode, remove v1 UI | Widgets, Live Activity, App Intents/Shortcuts, iPad split views, notifications | Glance widgets, App Shortcuts, tablet panes, notifications | Notification scheduling, digest | Native apps released; Capacitor app retired; v1 web UI removed |
Phases 1–5 run in parallel across platforms once phase 0 is done; within a phase, backend lands first.

## 5. Per-phase detail
Each phase lists the specs it implements. "Done" means the acceptance checklists in those files are ticked.
### Phase 0 · Foundations
- `packages/shared/scripts/build-tokens`: tokens.json → `apps/web/src/ui/tokens.css` (CSS variables with `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` blocks and `[data-section]` board colours), `apps/ios/.../Tokens.swift` + asset catalog colour sets with dark appearances, `apps/android/core-design/.../Tokens.kt` (MyTailLogColors light/dark, typography, spacing). CI fails if generated files are stale.
- Fonts: self-host Libre Franklin and Literata (variable, OFL) on web (`next/font/local`), bundle in both apps; register for Dynamic Type via `UIFontMetrics` / Compose `TextStyle` scaling.
- Web shell: Rail, RailPlate (aircraft switcher), SectionTab (heights by content counts), RailFoot, Board, BoardHead, Spine placeholder, SubTabs, Leaves/Leaf, SourceMat (02). Routes per 03.
- KMP core: module skeleton (`core:domain`, `core:db`, `core:sync`, `core:api`), XCFramework build in CI, fixtures wired.
- iOS: SwiftUI app shell with D's own PhoneTabBar and PhoneHeader (05 §5; system bars cannot show the coloured tabs), iPad split layout, sign-in per 05 §8 (email code, Sign in with Apple, passkeys), Keychain session storage.
- Android: single-activity Compose app, Navigation Compose with D's PhoneTabBar, tablet panes, sign-in per 05 §8 (email code, Credential Manager with Google and passkeys).
- Backend: account deletion endpoint (required for App Store submission; missing today), WebAuthn (passkey) registration and assertion routes.
- Backend: migrations 0069+ for new tables and columns (09), `GET /aircraft/{id}/map` returning a stub derived from entries, fixtures folder seeded with N734DM.
- Exit: three shells navigate all six sections; tokens and fonts identical by visual check against the mockups; CI builds web, iOS (xcodebuild test) and Android (gradle check).
### Phase 1 · Status
- Specs: 04 W-STATUS-*, 06 M-STATUS-* and T-STATUS-*, 02 Verdict/DueTable/DueRow/StatusMark/TrustMark/PageCite/LineAhead, 10 §8.3, 12 §4, 09 due engine.
- Port `status.ts` logic into the due engine v2 on the server; add earlier-limit naming, calendar-month rule, projection with confidence, due-soon thresholds per item.
- Exit: due fixtures (≥ 60 cases incl. both limits, calendar-month, stale meters, no record, unconfirmed entries ignored) pass in TS, Swift, Kotlin; Status screens match mockups; Verdict grammar matches 12 §4 in all states.
### Phase 2 · Logbooks and review
- Specs: 04 W-BOOKS-*, W-REVIEW-*, 06 M-BOOKS-*, M-REVIEW-*, T-BOOKS-01, T-REVIEW-01, 10 entirely, 02 RouteMap/ScanViewer/ReviewField/QueueRow, 07 review and gap flows.
- `map-layout.ts` with snapshot tests on the five fixture aircraft (10 §11); Swift and Kotlin layout ports run the same fixtures and compare primitive positions within 0.5 units.
- Exit: 10 §14 and the Review desk keyboard flow (11 §4) pass; an owner can confirm 100 entries without a mouse.
### Phase 3 · Capture and offline
- Specs: 05 (offline store, sync, capture, background work), 06 M-CAPTURE-*, 07 scanning and sync flows, 09 sync protocol and conflicts.
- iOS: custom AVFoundation camera (05 §15) with Vision document segmentation, live coaching, page count and the "lands in 1984, inside the airframe gap" line; VisionKit's document camera as fallback; background `URLSession` uploads; BGProcessingTask for queued work; SQLDelight store via the KMP core.
- Android: custom CameraX camera with OpenCV edge detection (05 §15); ML Kit Document Scanner as fallback; WorkManager with constraints for uploads; SQLDelight store via the KMP core.
- Tach photos are read on the device (Vision / ML Kit text recognition), offline, outside the AI allowance (05 §16).
- Exit: airplane-mode test scripts in 07 pass on both platforms; no data loss in kill-during-upload tests; conflicts surface per 09.
### Phase 4 · Maintenance, Aircraft, Documents
- Specs: 04/06 W-MAINT-*, W-AIRCRAFT-*, W-DOCS-* and phone equivalents; 08 squawks, ADs, tracked items, visits, meters, W&B, equipment, documents, MyFlightBook and ADS-B imports.
- Exit: every "existing" capability in these sections from 08 works in v2; new ones marked for this phase work.
### Phase 5 · Plan and share
- Specs: W-STATUS Plan ahead, W-SHARE-*, M-SHARE-*, 10 §8.3 DateScrubber and §13 print, 08 record room, dossier, maintenance summary, annual prep, exports, scheduled backups.
- Dossier and summary render server-side to PDF (headless Chromium or a PDF library) from the same React components used on screen, light theme, with page citations.
- Exit: a record room link opened on a phone without an account shows the right pages, honours expiry and revoke, and counts views; printed dossier reviewed against 10 §13.
### Phase 6 · Platform polish and cut-over
- iOS: WidgetKit (small, medium, large, lock screen, StandBy) with the LineAhead, Live Activity for AI reading progress, App Intents ("Log a flight", "What's due on N734DM"), Spotlight indexing of entries, iPad keyboard shortcuts and pointer, Stage Manager sizes.
- Android: Glance widgets, ongoing notification for reading progress, App Shortcuts and App Actions, predictive back, large-screen list-detail panes, keyboard and mouse.
- Web: settings, account, onboarding, keyboard shortcuts sheet, dark mode toggle, remove v1 UI and the `ui_v2` flag.
- Exit: store releases approved; 11 §14 checklist passes on all three platforms; Capacitor app retired (§6).

## 6. Migration and cut-over
- **Data:** all migrations are additive; v1 web and the Capacitor app keep working against the same database until cut-over. New columns get defaults; derived data (interchanges, gaps, eras) is computed, not migrated by hand. Gap statuses start `open`.
- **Sync protocol:** v2 endpoints run beside v1; the Capacitor app keeps v1 until retired. Server accepts both for at least 90 days after the native release.
- **Native release:** ship iOS and Android as version 3.0 under the existing listings (bundle ID / application ID `com.mytaillog.app`) so owners update rather than reinstall. On first launch the native app imports the Capacitor app's unsent changes, held pages and session, pulls a fresh mirror from cursor 0, and deletes the old database only after every imported change is accepted or discarded (05 §29.3). Owners on iOS below 18 or Android below 10 keep the Capacitor build, which keeps syncing (05 §29.4).
- **Web:** `ui_v2` opt-in during phases 1–5 ("Try the new design" in the account menu, with "Switch back"), default-on at phase 6 start, v1 removed two releases later.
- **URLs:** v1 URLs redirect to their v2 equivalents (03 lists the mapping); public record room links (`/r/...`) keep working unchanged.

## 7. Testing strategy
### 7.1 Layers
| Layer | Web | iOS | Android |
|---|---|---|---|
| Unit | Vitest (logic, map-layout, formatters) | Swift Testing (UI state) + KMP core tests | KMP core tests (kotlin.test) + JUnit + Turbine |
| Shared fixtures | due, projection, verdict, map-layout JSON fixtures run in all three | same | same |
| Component | React Testing Library + jest-axe; Storybook-style catalogue page at `/dev/components` (dev only) | SwiftUI previews for every component state; snapshot tests (swift-snapshot-testing) light/dark/AX5 | Compose previews; Paparazzi or Roborazzi snapshots light/dark/200% |
| Screen | Playwright visual snapshots at 1280 and 1440 (light, dark) vs approved baselines | XCUITest + accessibility audit | Compose UI tests + ATF |
| E2E flows | Playwright against a seeded Supabase (N734DM fixture) for every flow in 07 | XCUITest for capture, offline, review, log flight | Same with Espresso/Compose |
| Offline | — | Network Link Conditioner scripts | Airplane mode + adb kill tests |
| Accessibility | axe in Playwright on every route | performAccessibilityAudit | ATF checks |
### 7.2 Rule tests (must exist)
- Unconfirmed entries do not change: due status, projections, Verdict, LineAhead rings, visits, record room content, dossier, exports, notifications (one test per output).
- No banned words in string catalogs (12 §3) — lint in CI.
- Every due value rendered has a PageCite (component test asserting the prop is required and present in fixtures).
- Both limits shown and the earlier labelled "first" (fixtures).
- Calendar-month items due at month end (fixtures).
- Status never conveyed by colour alone (snapshot in grayscale + forced-colors run).
- Due reminders: lead and lapse at most once per due cycle, weekly while lapsed at most 8, and at most one push and one email digest per user per day (server test, 14-decisions.md D7).

## 8. Definition of done (every PR)
- [ ] Implements the referenced screen IDs / components / flows, and ticks their acceptance criteria in the PR description.
- [ ] Uses tokens only; no literal colours, font sizes or spacing.
- [ ] Light, dark, reduced motion, large text and keyboard / screen reader checked.
- [ ] Offline, viewer-role, unconfirmed-data and empty states implemented where the spec lists them.
- [ ] Strings externalised with keys from 12.
- [ ] Tests at the layers in §7 for the change; rule tests untouched or extended.
- [ ] Screenshots (web 1440, phone 390, tablet if relevant, light and dark) attached to the PR.

## 9. Risks
| Risk | Mitigation |
|---|---|
| Server and phone rules drift | One KMP core for both phones; JSON fixtures generated from the TypeScript server run in CI on both sides; server stays the authority; values computed on the phone carry the "On this phone" marker until the next sync (09 §3.12) |
| Map label layout too slow or inconsistent on phones | Pure layout functions with fixtures, caching per model version (10 §12); fall back to the list view |
| Native rewrite takes longer than expected | Capacitor app stays in service; phases ship web first where needed; native parity gate before retirement |
| Owners confused by the new structure | ui_v2 opt-in with switch back, first-use hints (11 §10), v1 → v2 URL redirects |
| AI reading errors trusted as fact | Rule 2 enforced by tests; trust marks everywhere; review desk is the only path to confirmed |
| App store review of record room / AI features | Clear disclosures (12 §11), no medical/financial claims, privacy labels list no tracking |

## 10. Decisions to confirm at kickoff
- Kotlin Multiplatform core (recommended, 05 §4.2) vs the native fallback (GRDB + Room). SwiftData is ruled out.
- Minimum OS versions: iOS/iPadOS 18, Android 10 / API 29 (05 §3).
- PDF rendering for dossier and summary: headless Chromium in a worker vs a PDF library.
- An `aircraft.time_zone` column (09 open question 7) so "today" is the same on server and device.
- Open questions collected at the end of 02, 04, 05, 06, 08, 09 and 10; none blocks phase 0.
