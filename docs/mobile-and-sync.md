# Offline sync engine & the iOS app

How the native app works and the self-hosted sync that feeds it. Design of record
for `apps/mobile` and the `/api/sync` + capture surfaces in `apps/web`.

## Goal

A native iOS app (iPhone + iPad) that syncs an aircraft once, then works **fully
offline** — every log entry, document, and original scanned page readable with no
signal — and can **capture** new logbook pages and **change existing records**
offline, uploading when there's signal again. No third-party sync vendor: the
whole engine is one Postgres table + one trigger + three endpoints.

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

### Writes: one path, durable queue, optimistic concurrency

Every mobile write goes through `enqueue()` (`apps/mobile/src/mutations.ts`) by
**mutation type**. The type catalogue and payload shapes are
[`ios-parity/CONTRACT.md`](ios-parity/CONTRACT.md) §3. UI code never calls
Supabase and never calls a server action.

```
enqueue(type, aircraftId, payload, { id?, base? })
   │  action_queue (SQLite) — survives a force-quit
   ▼
POST /api/sync/push   Bearer · can_edit_aircraft · compare `base`
   │  { mutations: Mutation[] }   max 100, dispatch table → lib/writes
   ▼
{ results: [{ id, status: "ok"|"conflict"|"error", row?, error? }] }
```

- **`id` is the idempotency key** and, for an insert, *is* the new row's id
  (`external_ref` for `hours_reading`). A lost response replayed on reconnect
  cannot create a second row. Inserts stay conflict-free
  (`onConflict: id, ignoreDuplicates`).
- **`base`** is the ISO `updated_at` of the row as the phone last saw it,
  required on every update/delete type and absent on inserts. The server loads
  the row; if `updated_at > base` it returns `conflict` with the *current* row
  and writes nothing. Migration `0058` audited every synced table for the column
  and its `BEFORE UPDATE` trigger, because the rule is only as good as the
  timestamp.
- **One implementation per write.** The push route is a dispatch table
  `MutationType → apps/web/src/lib/writes/<domain>.<fn>()`; the web's server
  actions are thin wrappers over the same functions. Each function does its own
  `can_edit_aircraft` check and `.select()`s its effect back — a viewer's UPDATE
  matches zero rows and returns no error, so "no error" is not success.
- **Server acceptance is the only thing that removes a queued write.**
- Some work genuinely needs a connection (extraction, the AI scans, Ask,
  enrolling an aircraft, requesting a backup). Those post directly to their
  Bearer routes and say so offline, rather than queueing forever —
  `validateMutation` refuses to queue an online-only type.

Captures use `POST /api/aircraft/[id]/capture` and document uploads
`POST /api/aircraft/[id]/documents`, both with **JSON base64** because
Capacitor's native HTTP does not handle multipart reliably; blobs queue on the
filesystem (`blob-upload.ts`), not in `action_queue`. `POST
/api/aircraft/[id]/actions` still accepts the four legacy types from phones in
the field, delegating to the same `lib/writes` functions for one release.

### Conflicts: yours and theirs

A `conflict` result keeps the action queued with the server's row attached and
raises it in **Waiting to upload** (`pending.tsx`). The owner sees both versions
with the differing fields marked, and chooses **Keep mine** (re-submit with
`base` = the server row's `updated_at`), **Take theirs** (drop the action), or
**Decide later** (leave it queued — it comes back). Nothing is ever silently
overwritten in either direction. Anything the server *refused* keeps its error
on the same screen: an action that failed and is shown nowhere is
indistinguishable from one that succeeded.

### Auth: Bearer, not cookies

The native app holds a Supabase session (no cookies in a `WKWebView`), so the
routes it hits accept `Authorization: Bearer <supabase jwt>`:
`createSyncClient(req)` (`apps/web/src/lib/supabase/sync.ts`) scopes a Supabase
client to that token so **RLS applies as the signed-in user**, falling back to the
cookie server client for browser use. This is *not* the OAuth resource server
(`/api/v1/*`, which uses OAuth tokens) — it's the user's own session.

Bearer-enabled routes: `/api/sync/pull`, `/api/sync/push`, `/api/page/[id]/image`,
`/api/document/[id]`, `/api/aircraft/[id]/capture`, `/api/aircraft/[id]/actions`,
`/api/aircraft/[id]/documents`, `/api/aircraft/[id]/ask`,
`/api/aircraft/[id]/backup/run`, `/api/pages/[id]/extract`, the two scan routes,
`/api/registry`, `/api/aircraft/enroll` and `/api/push`.

The session itself lives in the **iOS Keychain**
(`@aparajita/capacitor-secure-storage` as supabase-js's `auth.storage`), so it
survives a force-quit, a new TestFlight build, and a launch with no signal.
Signing out wipes the local mirror, the cursor and both queues — a shared iPad
must not open onto the previous owner's fleet.

## The app (`apps/mobile`)

Capacitor + Vite + React, standalone npm project. Dark "glass cockpit" theme
matching the web.

| Module | Role |
|---|---|
| `supabase.ts` | Supabase client + `API_BASE`. Session persists in WKWebView storage (→ Keychain later). |
| `sync.ts` | `pullAll()` — drains `/api/sync/pull` with the Bearer token to the tip. |
| `db.ts` | On-device SQLite (`@capacitor-community/sqlite`). Schema-agnostic mirror: every row as JSON in one `records(table_name,id,data,seq)` table; cursor in `sync_state`. Durable action and capture queues hold writes until server acceptance. |
| `blobs.ts` | Blob cache (read half). `localImageSrc()` downloads a page/document once via CapacitorHttp (binary→base64→Filesystem Data dir), serves via `Capacitor.convertFileSrc`. `prefetchAll()` = "download all for offline". Bounded — see below. |
| `blob-upload.ts` | The write half: a filesystem-backed queue of documents added offline (bytes and metadata in separate files, so listing what's waiting never reads a megabyte). 25 MB cap on device; photos downscaled. |
| `capture.ts` | VisionKit scan output + `drainCaptures()` (POST JSON base64 to the capture route). |
| `mutations.ts` / `actions.ts` | `enqueue()` by mutation type; `drainActions()` posts the queue to `/api/sync/push` and applies each result. |
| `pending.tsx` | Waiting to upload: queued writes, queued documents, refusals with their reason, and the yours/theirs conflict screen. |
| `layout.tsx` / `shortcuts.ts` | Size class (700pt), the iPad sidebar, `TwoPane`, `useShortcuts` (⌘ chords), `useDropFiles`. |
| `tokens.ts` / `theme.ts` | Light and dark palettes under one set of names, served as CSS custom properties so a mid-session appearance flip repaints without a relaunch. `alpha(color.x, "4D")` for a colour plus an alpha byte; `style`/`currentColor` for SVG, because a presentation attribute is not `var()`-substituted. |
| `push.ts` | APNs registration → `register_device_token` (migration `0059`); unregisters on sign-out. |
| `screens.tsx` / `capture-screen.tsx` / `lightbox.tsx` | Hangar → entries → detail → scans grid → full page viewer; capture flow; pinch-zoom lightbox. |
| `review-pane.tsx` / `entry-editor.tsx` | On-device page review: entries beside the scan, the ◎ spotlight, low-confidence chips, confirm/merge. |
| `App.tsx` | Auth + a small nav stack; a left-edge **swipe-back** gesture drives the same `back()` as the button. At regular width it composes the screens into `TwoPane`s instead. |

**Offline model:** the UI reads local SQLite (instant, network-independent);
connected writes push immediately, while offline writes retry on reconnect.
`Sync` also provides a manual push/pull retry; **Download all**
prefetches every scan/document to the filesystem so nothing needs a first online
view. Scans are immutable → downloaded once per device, ever.

### Size classes

`useSizeClass()` returns `"compact"` or `"regular"` off
`matchMedia("(min-width: 700px)")`. Compact is the iPhone *and* an iPad in Split
View or Slide Over: bottom tab bar, one pushed screen at a time, swipe-back.
Regular is an iPad full screen in either orientation: a 200pt sidebar, no tab
bar, and `TwoPane(primary, secondary, ratio)` side by side. **700pt is chosen so
an iPad at half a Split View stays on the phone layout** rather than showing two
unusable slivers. Screen components are not rewritten per size class — they take
props, and `App.tsx` composes them.

### The blob cache is bounded

`VITE_BLOB_CACHE_MB` (**default 500 MB**), enforced every 25 downloads because
`readdir` is O(files). Over the ceiling the **oldest page images** go first;
**documents are pinned and never purged**, because the AROW paperwork is the
reason this app works offline and a page image is one tap from re-downloading.
`prefetchAll()` fetches documents before pages for the same reason. The account
menu shows what's held and offers **Clear cached scans**.

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

The shared-code package. Offline edit of existing rows with conflict handling,
auto-drain on reconnect, the Keychain session, light appearance, push, and the
iPad layout are all done.

**Account deletion has no server side yet.** `/profile` has no delete action and
no `#delete-account` anchor, so the in-app link Apple requires lands on a page
that cannot delete anything. Fine for TestFlight; it blocks App Store submission
(guideline 5.1.1(v)). It is destructive and irreversible and wants its own PR —
see `apps/mobile/TESTFLIGHT.md` §8.
