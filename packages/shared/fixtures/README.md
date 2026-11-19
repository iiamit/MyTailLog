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

- Due engine (phase 1): `due-*.json`, `status-thresholds.json`, `projection.json`,
  `verdict.json` from `scripts/build-due-fixtures.ts`.
- Map (phase 2): from `scripts/build-map-fixtures.ts`, run by
  `apps/web/test/map-fixtures.test.ts` and `apps/core/.../MapFixturesTest.kt`.
  - `map-grouping.json` — stops and interchanges (09 §3.7, the phones' offline subset §3.12 item 7).
  - `map-model.json` — the whole MapModel for the fixture aircraft and the unconfirmed-gate rule case.
    An input may carry `_options` (`from`, `to`, `only`) for the query parameters of 09 §4.6.
  - `map-layout.json` — `input: { model, options }` → positioned primitives; compared within 0.5 units.
  - `map-layout-stress.json` — one 5,000-entry model, `options` is a list and `expected` one layout per entry.

The five aircraft of 10 §11 are not given as rows anywhere in the spec, so the
generator builds them from what 09/10/12 say and infers the rest:
N734DM (1978, four books, the 1983–1991 airframe gap, the 2005 engine overhaul,
the three-book annual of Aug 22, 2011, the GTN 650 in 2019, annuals and tach
values made up to fit, an unconfirmed 2026 annual); the hangar's second aircraft
(N4321J, a 2009 Piper scanned from 2022); nothing scanned (books and setup
answers only); a twin (engines and propellers 1 and 2 as `component_ref` L/R,
a second airframe volume); and 5,000 pseudo-random entries over sixty years.
