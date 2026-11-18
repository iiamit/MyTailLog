# MyTailLog core (Kotlin Multiplatform)

The shared, UI-free core of the native apps (docs/redesign/handoff/05-mobile-architecture.md §4.2). Compiled to an Android library (consumed by `apps/android` as a composite build) and to `MyTailLogCore.xcframework` for `apps/ios`.

| Module | Holds |
|---|---|
| `:domain` | Wire types of today's sync protocol (`SyncChange`, `PullPage`, `Mutation`, `PushResult`) and the mutation catalogue mirrored from `apps/web/src/lib/sync/mutations.ts` |
| `:api` | Ktor client: `AuthApi` (Supabase email one-time code: `/auth/v1/otp`, `/auth/v1/verify`) and `HttpSyncApi` (`GET /api/sync/pull`, `POST /api/sync/push`, Bearer token injected by the platform) |
| `:db` | SQLDelight, two databases per signed-in user: `MirrorDatabase` (`mirror.db`, server truth, rebuildable) and `OutboxDatabase` (`outbox.db`, unsent work, never rebuildable). Phase 0 schema: `sync_state`, `unknown_record`, `mutation` |
| `:sync` | `SyncEngine`: pull pages from the stored cursor until `hasMore` is false; push in batches of 100; refuses online-only types |
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

Typed mirror tables, the outbox state machine (backoff, conflicts, projection), FTS5, due rules and map layout arrive with the phases that use them (13 §5). SKIE for Swift-friendly `Flow`/`suspend` is not wired yet.
