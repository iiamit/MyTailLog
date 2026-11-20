# packages/shared

Data the web app and the native apps must agree on: the design tokens and the rule fixtures. It holds no runtime code that any app imports.

| Part | What it is | Who reads it |
|---|---|---|
| `tokens/tokens.json` | The design tokens (colours for both themes, section inks, type, space, radius, motion): the single source for direction D | `scripts/build-tokens.mjs` writes `apps/web/src/ui/tokens.css`, `apps/ios/MyTailLog/DesignSystem/Tokens.swift` and `apps/android/core-design/src/main/kotlin/com/mytaillog/design/Tokens.kt`. The apps use those generated files, never the JSON |
| `fixtures/*.json` | Input and expected output for the rules the server owns and the phones mirror: due dates and hours, status thresholds, projection, the Verdict, Plan ahead dates, visits, and the logbook map (grouping, model, layout) | Web tests (`apps/web/test/due-fixtures`, `map-fixtures`, `plan-date`, `visits-engine`, `share-model`), the Kotlin core (`apps/core/domain`: `DueFixturesTest`, `MapFixturesTest`, `FixturesTest`), and iOS `BooksTests` (the map layout cases, read in place) |
| `scripts/build-due-fixtures.ts`, `scripts/build-map-fixtures.ts` | Generate the fixtures by running the TypeScript implementation | Run from `apps/web`; `--check` fails when a committed fixture is stale. Details in [`fixtures/README.md`](fixtures/README.md) |

## Commands

```sh
node packages/shared/scripts/build-tokens.mjs            # regenerate CSS, Swift and Kotlin tokens
node packages/shared/scripts/build-tokens.mjs --check    # CI: fail if a generated file is stale
cd apps/web && node --import tsx ../../packages/shared/scripts/build-due-fixtures.ts [--check]
cd apps/web && node --import tsx ../../packages/shared/scripts/build-map-fixtures.ts [--check]
```

Change a rule in `apps/web/src/lib`, regenerate the fixtures, and the Kotlin port fails its tests until it matches. Change a colour in `tokens.json`, regenerate, and all three apps pick it up.

## Why it lives outside `apps/web`

- **The native apps can't import from the web app.** Swift and Kotlin read JSON and generated source, so the shared truth has to be data in a neutral place, not a TypeScript module.
- **The web build can't import a shared package either.** Next 16 / Turbopack won't resolve a package symlinked outside the app root (workspace or `file:`), and npm workspaces skip platform binaries such as lightningcss in CI. So nothing here is a package the web imports: tokens arrive as a generated CSS file inside `apps/web`, and only the web tests read fixtures, by relative path.
- **One owner per rule.** The fixtures are generated from the TypeScript implementation, so the server stays the authority and the Kotlin core proves it matches.
