# MyTailLog — iOS app (Capacitor + Vite + React)

Offline-first native app for iPhone/iPad. Sync an aircraft once, then browse every
log entry, document, and original scanned page **fully offline**, and **capture**
new logbook pages offline that upload when back online.

Standalone npm project (its own `node_modules` + `package-lock.json`) — it doesn't
touch the web app or its deploy.

**How it works** (architecture + the self-hosted sync engine):
[`../../docs/mobile-and-sync.md`](../../docs/mobile-and-sync.md). Module map, in
short: `sync.ts` (pull), `db.ts` (SQLite mirror + capture queue), `blobs.ts` (scan
cache + download-all), `capture.ts` (camera → queue → upload), `screens.tsx` /
`capture-screen.tsx` / `lightbox.tsx` (UI), `App.tsx` (auth + nav + swipe-back).

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

If sync errors, note the message — it comes straight from `/api/sync/pull`
(e.g. a 401 = token issue, a network error = the API base or connectivity).

## Notes
- `fetch()` runs through Capacitor's native HTTP (`CapacitorHttp`), so calls to
  `mytaillog.com` aren't blocked by browser CORS. Test in the **simulator**, not
  `npm run dev` in a desktop browser (that path would hit CORS).
- The session persists in WKWebView storage for now; it moves to the iOS Keychain
  in a later pass.
