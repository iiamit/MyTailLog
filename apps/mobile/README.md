# MyTailLog — iOS app (Capacitor + Vite + React)

Offline-first native app for iPhone/iPad. Sync an aircraft once, then — **fully
offline** — see whether it's airworthy, browse every log entry, document and
original scanned page, pull up the AROW paperwork for a ramp check, **scan** new
logbook pages, and **change things**: review and correct extracted entries,
manage inspections/ADs/equipment, resolve squawks, add documents. Every write is
saved on the device first and uploaded on the next sync.

Scanning uses **Apple's own document scanner** (VisionKit, the one Notes uses) via
`@capgo/capacitor-document-scanner`: automatic edge detection, perspective
correction and the black-and-white document look, natively and instantly. You can
correct its crop by hand before keeping a page, and one session takes up to **24
pages**, so a whole logbook goes in without reopening the camera.

Standalone npm project (its own `node_modules` + `package-lock.json`) — it doesn't
touch the web app or its deploy.

**How it works** (architecture + the self-hosted sync engine):
[`../../docs/mobile-and-sync.md`](../../docs/mobile-and-sync.md). Module map, in
short: `sync.ts` (pull), `db.ts` (SQLite mirror + capture/action queues),
`blobs.ts` (scan cache + download-all + raw bytes), `capture.ts` (camera → queue
→ upload), `actions.ts` (offline write queue → drain), `airworthiness.ts` (status,
computed on device), `screens.tsx` / `status-screen.tsx` / `documents-screen.tsx`
/ `pdf-screen.tsx` / `record-screen.tsx` / `complete-screen.tsx` /
`squawks-screen.tsx` / `pending.tsx` / `capture-screen.tsx` / `lightbox.tsx` (UI),
`mutations.ts` (the one write path — `enqueue()` by mutation type),
`layout.tsx` + `shortcuts.ts` (iPad: size class, sidebar, two panes, ⌘ chords),
`theme.ts` + `tokens.ts` (light/dark, follows the phone), `push.ts` (APNs
registration), `enroll-sheet.tsx` (add an aircraft), `blob-upload.ts` (offline
document uploads), `review-pane.tsx` + `entry-editor.tsx` (page review + the
◎ spotlight), `item-editor.tsx` / `ad-compliance.tsx` / `equipment-list.tsx` /
`meter-reset-prompt.tsx` (airworthiness management), `page-manager.tsx` /
`squawk-detail.tsx` / `ask-pane.tsx` (records), `App.tsx` (auth + nav +
swipe-back).

## Writing anything (the one path)

UI code never calls Supabase and never calls a server action. Every write goes
through `enqueue()` in `src/mutations.ts` by **mutation type** — the catalogue is
[`../../docs/ios-parity/CONTRACT.md`](../../docs/ios-parity/CONTRACT.md) §3:

```
enqueue(type, aircraftId, payload, { id?, base?, label? })
   │  action_queue (SQLite) — survives a force-quit
   ▼
POST /api/sync/push   Bearer · can_edit_aircraft · compare `base`
   │
   ▼
{ ok | conflict | error } per mutation → applied to the local mirror
```

- `id` is the idempotency key, and for an insert it **is** the new row's id, so a
  lost response replayed on reconnect can't create a second row.
- `base` is the ISO `updated_at` of the row as the phone last saw it. It is
  **required** on every update/delete type and absent on inserts. The server
  compares it and writes nothing if the row has moved on.
- The one implementation of each write lives in `apps/web/src/lib/writes/*` and
  is shared with the web app's server actions. There is no second copy.
- A few things genuinely need a connection — extraction, the AI scans, Ask,
  enrolling an aircraft, requesting a backup, uploading a document blob. Those
  post directly to their Bearer routes and say "needs a connection" offline
  rather than queueing forever. Document *blobs* queue on the filesystem
  (`blob-upload.ts`), not in `action_queue`.

### Conflicts — yours and theirs, never a silent winner

When the server answers `conflict`, the queued action is kept with the server's
row attached and surfaces in **Waiting to upload** (`pending.tsx`). The owner
sees the two versions side by side with the differing fields marked and picks:

- **Keep mine** re-submits with `base` set to the server row's `updated_at`.
- **Take theirs** drops the queued action.
- **Decide later** leaves it queued; it comes back.

Nothing is overwritten in either direction without that choice. Anything the
server *refused* keeps its error there too — an action that failed and isn't
shown anywhere is indistinguishable from one that succeeded.

## Size classes (iPhone / iPad)

`useSizeClass()` in `layout.tsx` returns `"compact"` or `"regular"` off
`matchMedia("(min-width: 700px)")` (`REGULAR_MIN_WIDTH` in `shortcuts.ts`).

| | compact | regular |
|---|---|---|
| when | iPhone; iPad in Split View or Slide Over | iPad full screen, both orientations |
| chrome | bottom tab bar, header switcher | 200pt sidebar, no tab bar |
| screens | one at a time, pushed, swipe-back | `TwoPane` — primary + secondary |
| ⌘ chords | ⌘1–4, ⌘N, ⌘F | those plus ⌘K (Ask), ⌘←/⌘→, ⌘↩ |

**700pt is deliberate**, not a device width: it keeps an iPad at half of a Split
View on the phone layout rather than two unusable slivers. Screen components are
*not* rewritten per size class — they take props, and `App.tsx` composes them
into `TwoPane`s at regular width. `TwoPane` renders `primary` only at compact and
the caller presents `secondary` as a sheet or a push, which is the existing phone
behaviour.

## The blob cache has a ceiling

Scans and documents are downloaded once and kept in the app's Data dir, so they
render with the network off. That cache is bounded by `VITE_BLOB_CACHE_MB`
(**default 500 MB**), checked every 25 downloads because `readdir` is O(files):

- Over the ceiling, the **oldest page images** are deleted first.
- **Documents are pinned** and never purged — the AROW paperwork is the reason
  this app works offline, and a page image is one tap from re-downloading.
- **Download all** fetches documents before pages for the same reason.
- The account menu shows what's held and offers **Clear cached scans**.

## Design system

The app follows the approved **"Verdict first"** iOS redesign, specified in the
Claude Design project (`MyTailLog iOS Redesign - Approved 1a.dc.html`) and pulled
via the DesignSync MCP. `src/tokens.ts` transcribes its tokens — palette, type
scale, spacing, radii, hit targets — and is the only place they're written down.
**Change them in the design first, not here.**

Two translations, because the handoff was authored for SwiftUI and this app is
Capacitor + React:

| Handoff says | Here |
| --- | --- |
| `Color` / `DesignTokens.swift` | `src/tokens.ts` |
| SF Symbols | inline SVG in `src/icons.tsx`, drawn to the same optical weight |
| `.monospacedDigit()` | `fontVariantNumeric: "tabular-nums"` (monospace as a *face* is retired) |
| `TabView` | `src/tabbar.tsx` |
| Dynamic Type | rem-relative sizes; the webview honours the OS text-size setting |

Fonts are **self-hosted** (`@fontsource/*`) rather than loaded from Google as the
design file does — this app has to render its own typography in a hangar with no
signal.

### iOS form-control sizing

Keep editable `input`, `textarea`, and `select` text at **16px or larger**.
WKWebView automatically zooms a focused control below 16px; in a fixed bottom
sheet that looks like horizontal overflow and can leave the whole app panned
after the keyboard closes. Do not work around it with viewport clipping or
modal width constraints—the focused control's font size is the cause.

## Shared code with the web app

`@/…` resolves into `apps/web/src` (see `vite.config.ts` + `tsconfig.json`), so
the status screen runs the **same pure compliance and hours math the web app
runs** — `status.ts`, `maintenance.ts`, `compliance.ts`, `utilization.ts`,
`hobbsTach.ts`, and the pure `toReadings` / `currentMetersFrom` out of
`aircraftHours.ts`.

This is deliberate. A second copy of airworthiness arithmetic on the device is
how the phone and the web start disagreeing about whether an annual is due, on
numbers people fly against.

Two rules:
- **Only PURE modules may be imported.** Anything touching `next/server`, the
  cookie-based Supabase client, or server actions will not build here.
- **It only works one way.** Vite resolves outside its root; Next/Turbopack does
  not (see [`../../packages/shared/README.md`](../../packages/shared/README.md)),
  so nothing in `apps/web` may ever import from `apps/mobile`.

## Prerequisites
- Node 20+, a Mac with **Xcode** installed (+ an iOS simulator).
- `npm i -g @capacitor/cli` is optional — `npx cap …` works.

## Run in the iOS simulator

```bash
cd apps/mobile

# 1. Config — same Supabase values as the web app (anon key is public)
cp .env.example .env
#    edit .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY  (VITE_API_BASE defaults to prod)

# 2. Install + build the web bundle
npm install
npm run build          # produces dist/ (Capacitor needs it before adding iOS)

# 3. First time only: create the native iOS project
npx cap add ios

# 4. Build + copy into the iOS project, then open Xcode
npm run ios            # = vite build && cap sync ios && cap open ios

# 5. In Xcode: pick a simulator (e.g. iPhone 15) and hit ▶︎ Run
```

After a code change: `npm run cap:sync` (rebuild + copy) then re-run in Xcode, or
just `npm run ios`.

## What to check
1. The app boots to a **Sign in** screen.
2. Sign in with your MyTailLog account.
3. Tap **Sync now** → it should report the number of changes pulled, the cursor,
   your aircraft tail number(s), and a per-table count (page, log_entry, …).
4. An aircraft with anything overdue/due-soon shows a **coloured pill** in the
   hangar list. Open it → **Status** shows current tach/hobbs with provenance,
   then every maintenance item and recurring AD worst-first.
5. **Documents** → the four AROW slots, each either the document or an explicit
   "not in the vault yet". Tap a **PDF** — it renders in-app (pdf.js, page by
   page), because a registration or airworthiness certificate is usually a PDF
   and "open it on the web" is useless during a ramp check. Turn on airplane mode
   and check all of this still renders — that's the whole point of these screens.

If sync errors, note the message — it comes straight from `/api/sync/pull`
(e.g. a 401 = token issue, a network error = the API base or connectivity).

## Notes
- `fetch()` runs through Capacitor's native HTTP (`CapacitorHttp`), so calls to
  `mytaillog.com` aren't blocked by browser CORS. Test in the **simulator**, not
  `npm run dev` in a desktop browser (that path would hit CORS).
- The session lives in the **iOS Keychain** (`@aparajita/capacitor-secure-storage`
  as supabase-js's `auth.storage`, `whenUnlocked`, iCloud sync off). Existing
  testers are migrated from WKWebView storage once, on first launch, so nobody is
  signed out. There is no biometric unlock — that is a separate plugin and the
  Keychain already keeps the token off a jailbroken filesystem.
