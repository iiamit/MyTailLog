# Offline sync engine & the iOS app

How the native app works and the self-hosted sync that feeds it. Design of record
for `apps/mobile` and the `/api/sync` + capture surfaces in `apps/web`.

## Goal

A native iOS app (iPhone + iPad) that syncs an aircraft once, then works **fully
offline** — every log entry, document, and original scanned page readable with no
signal — and can **capture** new logbook pages offline that upload later. No
third-party sync vendor: the whole engine is one Postgres table + one trigger +
two endpoints.

## The sync engine (self-hosted, no vendor)

### `change_log` — the change feed (migration `0044`)

Every insert/update/delete on a synced per-aircraft table appends a row to
`change_log(seq bigint identity, table_name, row_id, op I|U|D, aircraft_id,
changed_at)` via one generic `SECURITY DEFINER` trigger (`log_change()`). Reasons:

- **`seq` (a `bigserial`) is the client's cursor** — a *total order* with no
  clock-skew or same-timestamp ambiguity.
- **Delete rows persist** after the underlying row is gone. The app is
  hard-delete-only, so timestamp-diffing could never propagate deletions; the log
  can.
- **RLS scopes the feed** (`change_log_read = has_aircraft_access(aircraft_id)`),
  exactly like the tables it mirrors. The definer trigger is the *only* writer, so
  the feed can't be forged.

The trigger is attached to `aircraft` + the 13 per-aircraft data tables the app
reads offline. Migration `0045` back-filled one synthetic `'I'` per existing row
so a fresh device (cursor 0) pulls the whole dataset — the trigger only captures
changes from its creation forward.

> **Adding a new synced table:** attach the `log_change()` trigger to it (see
> `0044`) *and* back-fill it, or a fresh device won't see its existing rows.

### `GET /api/sync/pull?cursor=<seq>&limit=<n>`

Returns `change_log` rows `> cursor` (RLS-scoped), collapsed to the **latest state
per record** (`reduceChanges` in `apps/web/src/lib/sync/changes.ts`): `upsert`
(with the current row, fetched RLS-scoped) or `delete`, plus `nextCursor` +
`hasMore`. The client applies, stores `nextCursor`, and loops while `hasMore`.
Idempotent — re-pulling an overlapping window is harmless.

### Writes: capture, not a generic push

v1 is read + **capture** (offline edits are a later phase, where conflicts live —
captures are inserts, so they're conflict-free). The app therefore reuses the
existing capture route rather than a `/sync/push`: `POST /api/aircraft/[id]/
capture`, which now accepts **JSON base64** in addition to multipart (Capacitor's
native HTTP doesn't do multipart file uploads reliably). The server stores the
blob + inserts the page (RLS) + extracts; the new page flows back on the next pull.

### Auth: Bearer, not cookies

The native app holds a Supabase session (no cookies in a `WKWebView`), so the
routes it hits accept `Authorization: Bearer <supabase jwt>`:
`createSyncClient(req)` (`apps/web/src/lib/supabase/sync.ts`) scopes a Supabase
client to that token so **RLS applies as the signed-in user**, falling back to the
cookie server client for browser use. This is *not* the OAuth resource server
(`/api/v1/*`, which uses OAuth tokens) — it's the user's own session.

Bearer-enabled routes: `/api/sync/pull`, `/api/page/[id]/image`,
`/api/document/[id]`, `/api/aircraft/[id]/capture`.

## The app (`apps/mobile`)

Capacitor + Vite + React, standalone npm project. Dark "glass cockpit" theme
matching the web.

| Module | Role |
|---|---|
| `supabase.ts` | Supabase client + `API_BASE`. Session persists in WKWebView storage (→ Keychain later). |
| `sync.ts` | `pullAll()` — drains `/api/sync/pull` with the Bearer token to the tip. |
| `db.ts` | On-device SQLite (`@capacitor-community/sqlite`). Schema-agnostic mirror: every row as JSON in one `records(table_name,id,data,seq)` table; cursor in `sync_state`. Plus the `capture_queue`. |
| `blobs.ts` | Blob cache. `localImageSrc()` downloads a page/document once via CapacitorHttp (binary→base64→Filesystem Data dir), serves via `Capacitor.convertFileSrc`. `prefetchAll()` = "download all for offline". |
| `capture.ts` | `takePhoto()` (@capacitor/camera → downscaled JPEG + thumbnail via canvas) + `drainCaptures()` (POST JSON base64 to the capture route). |
| `screens.tsx` / `capture-screen.tsx` / `lightbox.tsx` | Hangar → entries → detail → scans grid → full page viewer; capture flow; pinch-zoom lightbox. |
| `App.tsx` | Auth + a small nav stack; a left-edge **swipe-back** gesture drives the same `back()` as the button. |

**Offline model:** the UI reads local SQLite (instant, network-independent);
`Sync` pulls deltas from the stored cursor and applies them; **Download all**
prefetches every scan/document to the filesystem so nothing needs a first online
view. Scans are immutable → downloaded once per device, ever.

## Monorepo & a Turbopack gotcha

Repo layout: `apps/web` (Next), `apps/mobile` (Capacitor), `packages/`
(placeholder). `apps/web` is a **standalone** Next app (own `package.json` /
`package-lock.json` / `apphosting.yaml`); App Hosting builds it with the backend
**root directory set to `apps/web`**.

`packages/shared` is deliberately **empty** (a README). Sharing live TS across the
Next build hit two walls, both worth knowing:

1. **Turbopack won't resolve a package symlinked outside the app root** — workspace
   *or* `file:`, TS *or* compiled-JS. It's a hard project-root boundary; `Module
   not found: Can't resolve '@mytaillog/shared'` even though `tsc` resolves it.
2. **npm workspace + optional native deps hoisting is buggy** — `npm ci`/`npm
   install` skip the platform binary (`lightningcss-linux-x64-gnu`) in CI when the
   lockfile was generated on another OS, so the build fails on Linux.

So cross-app code-sharing needs a **compiled** package with its own build step (not
a symlinked src package), or a workspace once the npm optional-deps issue is worked
around. For 40 lines (`reduceChanges`) it wasn't worth it: the module stays in
`apps/web/src/lib/sync/changes.ts` and the mobile client re-declares the types.

## Shipping to TestFlight

See [`apps/mobile/TESTFLIGHT.md`](../apps/mobile/TESTFLIGHT.md). Notable: all three
camera/photo Info.plist usage strings are required (`@capacitor/camera` throws at
runtime naming a missing one, even for camera-only capture), and set
`ITSAppUsesNonExemptEncryption = NO`.

## Deferred

Offline **edit** of existing rows (+ conflict handling); auto-drain captures on
reconnect; session → iOS Keychain; the shared-code package; `apps/web`
consolidation is done.
