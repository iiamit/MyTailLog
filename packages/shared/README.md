# @mytaillog/shared — reserved

Home for code shared across `apps/web` and `apps/mobile`.

Not yet wired up: Next 16 / Turbopack won't resolve a package that symlinks
outside the app root (workspace or `file:`), so sharing live TS across the web
build needs either an npm workspace **with** `transpilePackages` (blocked today by
an npm optional-native-deps hoisting bug — lightningcss), or a package compiled to
JS with its own build step. Until we set one of those up, the only shared logic
(`reduceChanges`, `SYNCED_TABLES`) lives in `apps/web/src/lib/sync/changes.ts` and
is mirrored by types in the mobile client — small enough that the duplication is
cheap. Revisit when the shared surface grows.
