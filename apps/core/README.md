# MyTailLog core (Kotlin Multiplatform)

The shared, UI-free core of the native apps (docs/redesign/handoff/05-mobile-architecture.md §4.2). Compiled to an Android library (consumed by `apps/android` as a composite build) and to `MyTailLogCore.xcframework` for `apps/ios`.

| Module | Holds |
|---|---|
| `:domain` | Wire types of today's sync protocol (`SyncChange`, `PullPage`, `Mutation`, `PushResult`) and the mutation catalogue mirrored from `apps/web/src/lib/sync/mutations.ts` |
| `:api` | Ktor client: `AuthApi` (Supabase Auth: email code and link with PKCE, password, ID token, PKCE code exchange, refresh, sign-out, the OAuth authorize URL) and `HttpSyncApi` (sync protocol v2: `GET /api/sync/v2/pull`, `POST /api/sync/v2/push`, `POST /api/sync/v2/conflicts/{id}`, Bearer token injected by the platform) |
| `:db` | SQLDelight, two databases per signed-in user: `MirrorDatabase` (`mirror.db`, server truth, rebuildable) and `OutboxDatabase` (`outbox.db`, unsent work, never rebuildable). Mirror: typed tables for aircraft, logbook, page, log_entry, maintenance_item, ad_compliance, item_completion, logbook_gap, hours_reading, scan_batch, squawk, aircraft_status_snapshot (query columns + `_raw` + `_seq`, listed in `MirrorTables`), `unknown_record` for the rest. Outbox: `mutation` (conflict records included), `file_job`, `activity` |
| `:sync` | `SyncEngine`: pull from the stored cursor (410 rebuilds the mirror, outbox kept); the outbox: enqueue, push oldest first per aircraft in hundreds, one change per row per request, dependencies on changes and file jobs, backoff, refusals cascade to dependents; conflicts block later changes to the row until the owner picks Keep mine / Keep both / Take theirs / Discard (`Conflicts` three-way diff); sync line counts |
| `:framework` | Umbrella that exports the four modules as one Apple framework |

Targets: `android` (minSdk 29), `iosArm64`, `iosSimulatorArm64`.

## Build and test

Needs JDK 21 and the Android SDK (`ANDROID_HOME`); the XCFramework and iOS tests need Xcode.

```sh
cd apps/core
./gradlew check                                   # Android host tests + iOS simulator tests, all modules
./gradlew :domain:allTests                        # one module
./gradlew :framework:assembleMyTailLogCoreXCFramework
# → framework/build/XCFrameworks/release/MyTailLogCore.xcframework (and debug/)
```

From `apps/android` the same modules are addressable as `:core:<module>:…` (for example `./gradlew :core:sync:allTests`).

## Fixtures

`packages/shared/fixtures/*.json` are the conformance vectors generated from the TypeScript implementation (13-build-plan.md §2.3). `:domain`'s `FixturesTest` reads every file there and fails on invalid JSON; it passes when the folder is empty or missing. The absolute path is generated into the test source set at build time (`generateFixturesDir`), so Android host and iOS simulator tests read the same files.

## Not yet here

Effective-row projection (05 §6.4), FTS5, the Capacitor import (05 §29.3) and the file transfer itself (platform code) arrive with the phases that use them (13 §5). SKIE for Swift-friendly `Flow`/`suspend` is not wired yet.
