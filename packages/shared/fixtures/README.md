# Shared rule fixtures

Input JSON → expected output JSON for the rules the server owns and the phones
mirror offline (09-data-and-api.md §3, §3.12; 13-build-plan.md §2 item 3). The
TypeScript server, the web client and the Kotlin Multiplatform core
(`apps/core`) all run every file here and must match it byte for byte.
(09 names this folder `packages/core/fixtures`; 13 moved it here.)

## Contract

- Files are **generated** from the TypeScript implementation, never written by
  hand. A test fails when a committed fixture is stale, as with the tokens.
- One file per rule: `due-calendar.json`, `due-hours.json`,
  `status-thresholds.json`, `projection.json`, `plan-date.json`,
  `visit-risk.json`, `map-grouping.json`, `map-*.json`, and
  `snapshot-N734DM-2026-11-18.json` (09 §7: verdict, 11 items, 2 suggested
  visits).
- Each file: `{ "rule": "<09 section>", "algoVersion": <int>, "cases": [{ "name", "today", "input", "expected" }] }`.
  `input` uses database row shapes (`snake_case`, as stored; see
  `apps/web/src/lib/database.types.ts`); `expected` uses the API shapes in 09 §4
  (`camelCase` envelopes), for example MapModel (09 §4.6, 10 §2).
- Dates are `YYYY-MM-DD` calendar dates in the owner's time zone
  (`profile.time_zone`, UTC when null; 14-decisions.md K4). Only unconfirmed-gate
  inputs (`trust`) decide what counts (09 §3.1).

## Status

Empty in phase 0. 09 and 10 define the outputs but not the N734DM input rows
concretely enough to commit a fixture that is not invented; the due engine
(phase 1) and the map derivation (phase 2) generate them. The phase 0 map stub
is `apps/web/src/lib/mapModel.ts`, covered by `apps/web/test/map-model.test.ts`.
