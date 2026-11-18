# MyTailLog — current mobile app inventory

Research date 2026-11-18, repo the repository root at `f1d79dd` (main, clean). Read-only.
All paths are relative to the repo root unless absolute. "Code-inferred" means the behaviour follows from the
source but was not run on a device (nothing here was run on a device).

**What the mobile app is.** `apps/mobile` is one Capacitor 8 + Vite + React 19 web bundle shipped as the iPhone,
iPad and Android app (`appId com.mytaillog.app`, `apps/mobile/capacitor.config.ts`). There is no separate native
UI: `apps/mobile/android/` is the generated shell and `ios/` is gitignored (recreated per
`apps/mobile/ios-config.md`). All screens are React with **inline style objects** built from `src/tokens.ts`;
there is no CSS framework and `src/index.css` is 87 lines of reset. Data is an on-device SQLite mirror
(`src/db.ts`) fed by a self-hosted change feed (`docs/mobile-and-sync.md`).

**Screenshots: there are none of the mobile app in the repo.** I viewed everything image-like:
- `apps/mobile/assets/play-feature-graphic.png` — Play Store banner: blue gradient, triangle logo, "Every log.
  One clear picture.", an illustrated paper page with a dark card and green/amber dots. No UI.
- `marketing/2026-11-social-launch/**` (posts 01–05, reel scenes 01–07, contact sheets, story, facebook) — navy
  slides with headline type ("Scan it. Find it. Use it.", "Your records. At the hangar."). The only product UI
  shown is a small **web** Status screenshot. `source/scan-in-hangar.png` is a hand holding a phone over an open
  paper logbook in a hangar — **the phone screen is blank black**.
- `apps/web/src/screenshots/{status,review,hub,ask,timeline,wb}.png` — desktop **web** captures (1600px wide,
  left sidebar with 3-letter idents, mono readouts). I viewed `status.png` and `review.png`; used below only for
  the web-vs-mobile comparison.
- `apps/web/public/**` — logos, store badges, icons.
The only visual artefacts for mobile are the three static HTML mock files in `docs/design/` (section 7).
Every visual statement about the shipped app below is therefore read from code, not from a picture.

---

## 1. Screen map

Root and shell

| Screen / view | File | Purpose |
|---|---|---|
| Boot placeholder | `apps/mobile/index.html` | "Opening MyTailLog…" and a pre-module startup-error message |
| Loading | `apps/mobile/src/App.tsx` (`App`) | "Loading…" until the Supabase session resolves |
| Sign in / sign up | `src/App.tsx` (`Login`) | Apple (iOS) or Google (Android) button, then email: Password / Magic link / Sign up |
| Not-native notice | `src/App.tsx` (`Shell`) | Desktop browser: "On-device storage needs the iOS or Android app" |
| Fleet home ("Your fleet") | `src/screens.tsx` (`Hangar`) + header in `src/App.tsx` | Aircraft cards worst-first, sync label, pending banner, account avatar |
| First run | `src/first-run.tsx` | Empty account after a sync: 3 steps, "How did you hear" survey, Add my aircraft |
| Add my aircraft sheet | `src/enroll-sheet.tsx` | Tail number → FAA registry lookup → confirm → enrol (online only) |
| Account menu sheet | `src/account-menu.tsx` | Sync, social link, offline download, rebuild, storage, backup, appearance, web links, sign out |
| Waiting to upload | `src/pending.tsx` (`Pending`, `PendingBanner`) | Queued writes, pages and documents; refusals with reason |
| Changed in two places (conflict) | `src/pending.tsx` (`Conflict`) | Field / Yours / Theirs table; Keep mine / Take theirs / Decide later |
| Announcement card | `src/announcement.tsx` | Floating in-app notice from `/admin`, dismiss per account |
| Lightbox | `src/lightbox.tsx` | Full-screen image, pinch 1–5×, pan, double-tap, swipe-down to close |

Aircraft context (phone: header switcher + tab bar; iPad: sidebar)

| Screen / view | File | Purpose |
|---|---|---|
| Aircraft switcher (header pill + sheet/dialog) | `src/switcher.tsx` | Change aircraft in place, keeps current tab; "See all aircraft" |
| Tab bar | `src/tabbar.tsx` | Status · Log · Records · Squawks |
| iPad sidebar, frame, two-pane | `src/layout.tsx` | 200px sidebar ≥700px; side-by-side panes ≥1000px |
| **Status** tab | `src/status-screen.tsx` (`Status`) | Verdict ring, tach/hobbs tiles, Needs attention, link to all items |
| All items | `src/status-screen.tsx` (`AllItems`) | Segments Inspections · Directives · Equipment; the only place to manage them |
| Item editor sheet | `src/item-editor.tsx` (`ItemEditor`) | Create / edit / delete a recurring inspection or overhaul |
| Mark done | `src/complete-screen.tsx` (`CompleteItem`) | Date, meter, hours, notes; VOR check demands place/error/signature/logbook |
| Directives list | `src/ad-compliance.tsx` (`AdList`) | AD/SB records judged worst-first |
| AD compliance sheet | `src/ad-compliance.tsx` (`AdSheet`) | Track / record compliance / retire / delete an AD or SB |
| Equipment list | `src/equipment-list.tsx` (`EquipmentList`) | Proposals found in logs, installed, removed |
| Component sheet / Remove sheet | `src/equipment-list.tsx` | Install/edit/delete a component; mark removed with date + entry |
| **Log** tab ("Log a flight") | `src/record-screen.tsx` (`Record`) | Tach/hobbs steppers, oil added, one Save button |
| Finish saving flight sheet | `src/record-screen.tsx` | Shown while saving / on partial failure: Retry remaining / Discard |
| Meter-replacement prompt | `src/meter-reset-prompt.tsx` | A reading lower than the last: new meter / mistyped / right as typed |
| Recent readings (+ editor sheet) | `src/record-screen.tsx` (`RecentReadings`, `ReadingEditor`) | Last 30 readings; tap to correct, swipe-left or button to delete |
| **Records** tab | `src/records-screen.tsx` (`Records`) | Segmented control Documents · Scans · History |
| Documents (vault) | `src/documents-screen.tsx` | Search, Add a document, "Carry aboard" AROW card, Everything else |
| Add a document sheet | `src/document-upload.tsx` (`DocumentUpload`) | Choose a file / Use the camera, type, name, add |
| Document actions sheet | `src/documents-screen.tsx` (`DocumentActions`) | Attach to an entry / detach / remove from vault |
| PDF viewer | `src/pdf-screen.tsx` | pdf.js canvas, Prev/Next, tap to zoom via lightbox |
| Weight & balance sheet | `src/wb-view.tsx` | Read-only current weighing, stale-equipment warning, earlier revisions |
| Oil sheet | `src/oil-view.tsx` | Read-only hours-per-quart and lab wear-metals table |
| Ask the logbooks (sheet on phone, pane on iPad) | `src/ask-pane.tsx` | Online-only Q&A with cited entries and daily allowance |
| Share a summary | `src/records-screen.tsx` (`shareSummary`) | Text summary to the OS share sheet (clipboard fallback) |
| Share a records link | `src/records-screen.tsx` | **Opens the website** (`/aircraft/{id}/share#record-room`) in the system browser |
| Scans · Browse | `src/screens.tsx` (`Pages`, `Thumb`) | 3-column thumbnails grouped by logbook, "Needs a look" filter, Confirm N clean |
| Scans · Manage | `src/page-manager.tsx` | Per-logbook sort, reorder (↑/↓, drag on iPad), select, retake, delete |
| Scan pages sheet | `src/capture-screen.tsx` | Logbook chips, Handwritten toggle, Scan pages, "On this phone" held pages |
| Native document scanner | `src/capture.ts` (`@capgo/capacitor-document-scanner`) | VisionKit (iOS) / ML Kit (Android), crop editor, up to 24 pages |
| Page viewer | `src/screens.tsx` (`PageViewer`) | Dark page view, swipe to turn, thumbnail strip, spotlight ring |
| Entries drawer (phone) | `src/review-pane.tsx` (`EntriesDrawer`) | Peek bar "Page N · Review"; opens to 62vh over the page |
| Page review | `src/review-pane.tsx` (`PageReview`, `ReviewPane`, `EntryCard`) | Entry cards, per-field edit, ◎ locate, confirm, merge, delete, mark page reviewed |
| Entry editor sheet | `src/entry-editor.tsx` | Edit an extracted entry or add a missed one; "What the scanner read" |
| History | `src/screens.tsx` (`Entries`) + `src/records-screen.tsx` (`HistoryFilters`) | Search, category chips, year select, month-grouped timeline |
| Entry detail | `src/screens.tsx` (`EntryDetail`) | Read-only entry with its scan; Print sticker / Create correction for signed entries |
| New logbook entry / correction | `src/authored-entry-screen.tsx` (`MobileEntryComposer`) | Template-driven authored entry, emailed 8-digit code, e-sign (online) |
| **Squawks** tab | `src/squawks-screen.tsx` | Waiting to upload, Open, Resolved (collapsed), "+ New squawk" FAB |
| New squawk sheet | `src/squawks-screen.tsx` (`Composer`) | Description + Low / Watch / Ground |
| Squawk detail (sheet on phone, pane on iPad) | `src/squawk-detail.tsx` | Edit, Mark resolved (date + entry), Reopen, Delete |

Non-UI modules worth knowing: `src/airworthiness.ts` + `src/status-logic.ts` (verdict), `src/review-rules.ts`,
`src/history.ts`, `src/sync.ts`, `src/actions.ts`, `src/mutations.ts`, `src/blobs.ts`, `src/blob-upload.ts`,
`src/push.ts`, `src/auth.ts`, `src/theme.ts`, `src/tokens.ts`, `src/ui.tsx`, `src/icons.tsx`, `src/shortcuts.ts`.

---

## 2. Navigation model (as implemented)

State, not a router. `src/App.tsx` holds one `Nav` value:
`{screen:"hangar"} | {screen:"pending"} | {screen:"aircraft", aircraft, tab, segment, sub}`.
`sub` is a single optional pushed screen: `entry | new_entry | page | complete | pdf | squawk | document | ask`
(`squawk` and `document` are declared but never set — those screens hold their own selection).
**Maximum push depth is 1.** There is no URL, no history stack, no per-tab stack, no transition animation.

Phone (width < 700px)
- **Fleet home** is the root. Tapping an aircraft enters the aircraft context at `tab:"status"`,
  `segment:"documents"` (always reset to these).
- **Header** inside an aircraft is only the `AircraftSwitcher`: a 44px pill with the tail number (Space Grotesk
  15px/700) and a 13px chevron, followed by make/model text. It is in normal flow (scrolls away), not sticky.
  There is no back button to the fleet, no account button and no sync indicator in this header.
- **Tab bar** (`src/tabbar.tsx`), fixed bottom, 92%-opaque `bg` with 20px backdrop blur, hairline top border,
  safe-area padding, four equal buttons, min-height 52, icon 21px + label 14px (0.875rem), active = accent colour
  and weight 600. Order, label, icon (inline SVG stand-ins for SF Symbols, `src/icons.tsx`):
  1. **Status** — gauge (`gauge.medium`)
  2. **Log** — plus in circle (`plus.circle`)
  3. **Records** — folder
  4. **Squawks** — flag
  No badges or counts on any tab. The bar is **hidden whenever a `sub` is pushed** (`App.tsx:533`).
- **Switching aircraft**: tap the tail pill → bottom sheet "SWITCH AIRCRAFT" listing every aircraft (tail,
  make/model, urgency pill) plus "See all aircraft". Switching keeps the tab and Records segment and clears `sub`.
  "See all aircraft" is the only route back to the fleet home other than back-from-tab-root.
- **Back**: one function `back()` — pops `sub`, else leaves the aircraft to the fleet. Triggers: on-screen
  "‹ Back"/"‹" buttons, an edge swipe (touch starts ≤24px from the left edge, moves >64px right, <55px vertical;
  no visual tracking), and Android system Back (order: lightbox → top `[data-android-back]` sheet → capture
  sheet → account menu → `back()` → minimise app at the fleet).
- **Sheets**: bottom sheets are hand-rolled fixed overlays (scrim `rgba(0,0,0,.5–.55)`, 20px top radius, max-height
  88–92vh). Four different sheet implementations exist: `capture-screen.tsx` `Sheet`, `document-upload.tsx`
  `RecordsSheet`, `record-screen.tsx` `Sheet` (via `modal.tsx` `<dialog>`), `item-editor.tsx` `Sheet` (via
  `<dialog>`), plus ad-hoc ones in `switcher.tsx`, `squawks-screen.tsx`, `squawk-detail.tsx`, `enroll-sheet.tsx`.
  The grabber bar is decorative — **no sheet supports drag-to-dismiss**; they mount and unmount with no animation.
- **Ask on the phone** is not a tab or a header action: Records → Documents segment → scroll past the vault →
  "More records" → "Ask the logbooks" (sheet).
- **Account menu on the phone is reachable only from the fleet home** (34×34 avatar showing the first two letters
  of the email). From inside an aircraft: tail pill → See all aircraft → avatar.

iPad / wide windows — two thresholds (`src/shortcuts.ts`): `SIDEBAR_MIN_WIDTH = 700`, `REGULAR_MIN_WIDTH = 1000`.
(`docs/mobile-and-sync.md`, `apps/mobile/README.md` and `CONTRACT.md` §5 still describe a single 700 threshold.)
- **≥700px**: 200px sidebar replaces the tab bar: aircraft switcher card (tail 19px, make/model, urgency pill;
  opens a centred 420px dialog rather than a bottom sheet), the four tabs as 48px rows (tooltip ⌘1–⌘4), an 8px
  gap then **Ask** (a "?" in a circle, tooltip ⌘K), and **Account** pinned to the bottom (empty circle icon).
  No counts, no visible shortcut hints, no sync line. `PendingBanner` sits above the content.
- **700–999px** (portrait iPad): sidebar + one full-width pane that pushes like the phone.
- **≥1000px**: `TwoPane` — Status | All items (55/45; Mark done replaces the right pane); Log | Recent readings
  (55/45); Squawks draws its own list | detail (55/45); Records 40/60 — Documents | PDF viewer (image documents
  still open the lightbox; the slot says "Pick a document to read it here"), History | Entry detail/composer,
  Scans = page grid | (page viewer 55 | page review 45) three-way with the spotlight shared. Ask replaces the
  secondary pane of any tab.
- The fleet home on iPad is the phone layout at max-width 640, centred, with no sidebar.
- Keyboard chords (`src/shortcuts.ts`): ⌘1–4 tabs, ⌘N (Squawks composer), ⌘F (Documents search), ⌘K Ask
  (sidebar only), ⌘←/⌘→ turn page, ⌘↩ confirm next entry / mark page reviewed. Ctrl is accepted.
- Pointer hover tint via `.hoverable` (`src/index.css`); HTML5 drag-drop of files onto Documents and drag-reorder
  of pages in Manage.

Deep links
- Only `com.mytaillog.app://auth/callback` (OAuth and magic-link return; `src/auth.ts`,
  `android/app/src/main/AndroidManifest.xml`). No links to an aircraft, entry, squawk or page.
- Push notifications register (`src/push.ts`) but there is **no tap handler**; a reminder opens the app wherever
  it was.
- Outbound: `Browser.open` / `target="_blank"` to the website for record-room links, print sticker, AD full
  text, help, profile, backups, MyFlightBook, developer access, account deletion, privacy.

---

## 3. Screen-by-screen spec

Conventions used by almost every aircraft screen: a title row with an `h1` (Space Grotesk 26px/700) and the tail
number right-aligned in 14px `faint`; 20px side padding; cards `surface` + 1px `hairline`; view-only users see
controls disabled plus a warning line (`canEdit`, `src/actions.ts`; unknown = allow).

### 3.1 Sign in (`src/App.tsx` `Login`)
Top to bottom: brand mark (gradient triangle + "MyTailLog"); provider button — iOS: black "Continue with Apple"
image button; Android: white "Continue with Google"; 12px note "Already have an account? Sign in with email
first, then connect Apple/Google in Account…"; "Or continue with email"; three mode buttons **Password · Magic
link · Sign up** (8px padding, ~34px tall); Email; Password (hidden for magic link); primary button "Sign in" /
"Send magic link" / "Create account" ("Working…" while busy).
States: errors and info share one red (`#ff6b6b`) `role="alert"` line — "Check your email for a sign-in link." is
rendered in the error colour. No forgot-password (magic link covers it). No offline message; the Supabase error
string is shown raw. Social sign-in opens the system browser and returns by deep link; a mismatched account
during linking wipes local data and signs out with an explanation (`src/auth.ts`).

### 3.2 Fleet home (`src/screens.tsx` `Hangar`, header in `App.tsx`)
1. Row: small brand mark; right, 34×34 round avatar (first two letters of the email) → Account menu.
2. `PendingBanner` when anything is queued: "N changes waiting to upload · View ›" → Waiting to upload.
3. "Your fleet" (26px) with a right-aligned status word: `Syncing…` / `Uploading…` / `Uploading pages… x of y` /
   `Syncing… n` / `Rebuilding…` (faint) or **Synced / Offline / Not synced yet** (always green, no timestamp).
4. Sync error text in red, raw message.
5. Aircraft cards sorted overdue → due soon → current → needs info, then by tail. Each: 3px semantic bar on the
   leading edge, tail (19px/700), urgency pill (OVERDUE / DUE SOON / CURRENT / NEEDS INFO), make + model (or
   "Details not set"), divider, one 14px line = the verdict detail, e.g. "Annual inspection: Due in 26 days.
   7 tracked; 0 need more information." (or "Nothing tracked yet").
6. Dashed button "+ Add pages to an aircraft" → Scan pages sheet with an aircraft picker first.
Empty states: before the first sync — "No aircraft on this device yet. Sync to load your fleet." + "Sync now";
after a sync with no aircraft — First run.
Not present: add another aircraft (the enrol sheet is mounted only by `first-run.tsx`), pull-to-refresh, last
sync time, per-aircraft squawk or to-review counts.

### 3.3 First run (`src/first-run.tsx`) and Add my aircraft (`src/enroll-sheet.tsx`)
Glow + large triangle; "Add your first aircraft"; three numbered steps (Add your aircraft / Snap your logbook
pages / Review the extracted entries); "How did you hear about MyTailLog?" with 9 pill chips and Skip (writes
straight to `profile`); primary **Add my aircraft**; secondary "Sync again".
Enrol sheet: Tail number field (19px, forced upper case, Enter = look up) → "Look it up" ("Looking it up…") →
confirm card (N-number, Aircraft, Serial number, Engine, Registered to) with **That's my aircraft** / "Try
another tail number"; registry miss → "The FAA registry has no match for X right now…" + "Add X anyway".
Errors: "Couldn't add it. Check your signal and try again." Both steps are online-only and not queued.

### 3.4 Account menu (`src/account-menu.tsx`)
A bottom sheet (max 560 wide, 88vh) — one long list, email at top:
- Connect Apple/Google sign-in (or "… connected")
- **Sync now**
- Help & docs ↗
- Send a test notification (only when push registered) — or "Reminders won't arrive on this phone" with the
  reason (denied / registration failure)
- **Download all for offline** — progress "Preparing offline files… r/t ready", "x of y checked; f failed so far",
  result "N files ready offline…", "Retry remaining files"
- **Rebuild from the server** — wipes the mirror and re-pulls; unsent work is kept
- **Storage: 123.4 MB held · Clear cached scans**
- Run a backup now (only inside an aircraft; "Backup scheduled — it runs tonight.")
- **Appearance** — 3-way segmented: Match my phone · Light · Dark ("Light is easier to read outside in the sun.")
- "ON THE WEBSITE": Profile and reminders ↗, Cloud backups ↗, MyFlightBook ↗, Developer access ↗
- **Sign out** (red). With unsent work: "N changes or uploads have not reached the server. Signing out discards
  them…" → Sync before signing out / Keep working / Discard unsent work and sign out. Sign-out wipes the mirror,
  cursor, queues and cached files.
- Delete my account ↗ (web), Privacy policy ↗, Close.
A "Share this aircraft" row exists in code but `App.tsx` never passes `onShare`, so it never renders.

### 3.5 Status (`src/status-screen.tsx`, logic in `src/status-logic.ts`, `src/airworthiness.ts`)
Computed on device from the mirror using the web's own pure functions (`@/lib/status`, `@/lib/compliance`, …).
Top to bottom:
1. Radial "backlight" glow in the verdict colour.
2. **Countdown ring** 120px: arc = fraction of the interval elapsed, animates once (400ms); centre number 28px
   with unit below ("days to next", "months to next", "hours to next", "days overdue", "hours over").
3. **Headline** 19px/700 in the semantic colour — exactly one of: "N tracked item(s) overdue", "N item(s) due
   soon", "Tracked assessment incomplete", "No tracked items overdue", "No tracked assessment yet".
4. Detail line (14px dim, max 250px): "<item>: <countdown>. N tracked; M need more information."
5. Two **meter tiles** TACH and HOBBS: value 21px, then "estimated · 5 days ago · <source>".
6. **NEEDS ATTENTION** — one card per overdue / due-soon line: title, FAR reference as a small 10px chip, due
   line in colour, interval + last done, an unreliable-hours warning, **Mark done** (maintenance items, editors
   only), **Review directive** (ADs → All items on Directives with that AD's sheet open).
7. Row button "View all tracked items" (or "Review N incomplete items") with "N within recorded limits · M
   tracked" and a green count → All items.
8. Footnote: "Worked out on this phone from your last sync. It mirrors your records — it isn't the logbook, and
   the PIC is still responsible for airworthiness under 91.7."
States: "Loading tracked maintenance…"; error → "Tracked status could not be loaded from this device…" + Try again.
Inputs to the verdict are maintenance items and **recurring** ADs only. Open squawks (including "Ground"
severity), missing AROW documents and open one-time ADs do not affect the ring, the headline or the fleet card.

**All items** (`AllItems`) — on the phone it replaces the Status content through component state (`showAll`),
not through `Nav`. Header "‹ All items  N734DM"; segment buttons **Inspections · Directives · Equipment**.
- Inspections: "+ Add an inspection or overhaul"; filter chips "All n / Required n / Advisory n"; rows with
  title, countdown, 4px progress bar, "Required · every 12 mo · 28 Sep 2026", tap to edit, **Mark done** button on
  every row; empty: "Nothing is being tracked yet…" + **Set up the standard inspections** (`mx.seedStandard`);
  "Scan the logs for completions" (online AI scan; "Reading your logs needs a connection" when offline; result
  "…They'll show here after the next sync.").
- Directives (`AdList`): "+ Track an AD or service bulletin"; rows with AD/SB chip, reference, status word,
  title, detail ("last 4 Mar at 2417.3 h · next … (in 180 days)"); empty text points to the web app.
- Equipment (`EquipmentList`): "FOUND IN YOUR LOGS" proposals with Add to equipment / Not on this aircraft;
  "+ Record an installation"; installed rows; "REMOVED" rows with Reinstalled / Edit; "Find equipment in the logs".

**Item editor** (sheet): What (standard kinds or "Something else"), Name, Required by regulation / Advisory,
Every … months, Every … hours, Last done, At … hours, Counts hours on, Notes; "Add item"/"Save changes";
two-step "Delete this item" → "Yes, delete X". Unsaved-changes guard uses `window.confirm`.
**AD sheet**: title = subject with the number as a tag; reference block (official title/abstract if synced, else
"The official text isn't on this phone…") + "Read the full directive on the web ›" (online); kind, Number,
Subject (new only); Status; Complied on + At … hours (tach); How it was complied with; Logbook entry that records
it (a `<select>` of up to 300 entries); One-time / Recurring + intervals; Why (when retired); Related equipment;
Notes; "Start tracking"/"Save"; two-step remove.
**Component sheet**: Name, Manufacturer, Type, Part number, Serial number, Installed on, entry picker, Life limit
+ unit, Notes; "Removed from the aircraft…" → Remove sheet (date + entry, explains directives retire); two-step
"Delete — it was never on this aircraft".
**Mark done** (`CompleteItem`, pushed; older visual style): `‹ Back  Mark done`; item title; "REQUIRED · last done
…"; Date; Hours counted on; Hours (prefilled from the current meter unless estimated); for a VOR check a box
citing 14 CFR 91.171(d) requiring Place, Bearing error, Signature, Logbook; Notes; "Mark done & reset the
counter". Result screen "Saved — … marked done 18 Nov. Synced." / "Waiting for a connection." Blocks when the
item is not on the device ("This item isn't on the phone yet. Sync, then mark it done.").

### 3.6 Log (`src/record-screen.tsx`)
1. "Log a flight" + tail; "Today · 18 Nov 2026".
2. View-only warning if applicable.
3. Panel with **TACH** and **HOBBS**: label, "was 2417.3", a small "Not this time" / "Record this" text toggle
   (min-height 32; one meter must stay on), a stepper row — 48px − key, value field (Space Grotesk 24px,
   `inputMode="decimal"`), 48px + key; 0.1 per tap, press-and-hold repeats every 90ms and jumps to whole hours
   after ~18 ticks. Live delta "+1.4 hours this flight"; lower-than-last warning in amber.
4. Panel **Oil added** (optional): None · 1 qt · 2 qt · Other (Other opens a decimal field, placeholder 0.5).
5. Primary **Save to logbook** (52px, disabled when nothing changed); status line "Saves immediately when
   connected · safely queues offline" → "Saved · synced" / "Saved · waiting for a connection".
6. **RECENT READINGS** (phone: inline below; ≥1000px: right pane): rows "Tach 2417.3 · Hobbs 3102.8", date and
   provenance ("from a log entry"…). Hand-entered rows: tap → "Correct this reading" sheet (date, two steppers
   with "Leave blank"); swipe left reveals a 96px red Delete; a "Delete reading" text button is also rendered
   under every editable row. Deletes confirm via `window.confirm`.
Sheets: "Finish saving flight" (saving / partial failure with Retry remaining save / Discard unfinished steps);
**Meter-replacement prompt** when a reading is below the current one — "Lower than the last reading — was the
tach replaced?", "2417.3 → 12.0", Notes, **Yes — new meter from today**, "I mistyped it", "It's right as typed —
save the reading", and the line "You can undo a meter swap from the reading list." (no such undo exists in the
UI; `meterReset.delete` is never enqueued anywhere in `apps/mobile/src`).
The reading date is always today; there is no date field on this screen.

### 3.7 Records › Documents (`src/documents-screen.tsx`, `src/document-upload.tsx`, `src/pdf-screen.tsx`)
1. Search field (16px, live results, × to clear). While searching: "N matches" flat list or "Nothing matches
   that. Try part of a document's name, its type, or a reference number."
2. Dashed drop zone containing the primary **Add a document** and the hint "Or drag a file in from Files" (the
   hint shows on phones too).
3. "N documents saved on this device … — they upload when connected." + **Upload now** when uploads are waiting.
4. **Carry aboard** card — "AROW — required on every flight", chip **ALL PRESENT** / **N MISSING**, four rows
   (airworthiness certificate, registration, POH/AFM, weight & balance); present rows open the document, missing
   rows say "Not in the vault yet" (not tappable — no shortcut to add that type).
5. **EVERYTHING ELSE** rows: title, "PDF · added Mar 2023 · attached to an entry", ⋯ button → actions sheet.
6. **MORE RECORDS** rows: Weight & balance, Oil, Ask the logbooks, Share a summary, Share a records link.
Empty: "Nothing in the vault yet. Add the registration and airworthiness certificate and they travel with you."
Opening: PDFs push the viewer (`‹ Back  title  1 / 3`, canvas, ‹ Prev / Next ›, "Tap the page to zoom."; states
"Opening…", "Not on device — connect once, or use "Download all".", "This PDF couldn't be opened…"); images open
the lightbox directly. No share/export of a document.
**Add a document** sheet: two source buttons "Choose a file — Files or photos" / "Use the camera — Finds the page
edges"; READY TO ADD list with size and ×; WHAT IS IT `<select>`; "Name it (optional)"; "Add this document";
"PDF or a photo, up to 25 MB each. Photos are shrunk before they go so they upload on one bar." Offline: "Saved
on this device — it uploads when you're back in range." Online success: "N added to the vault. Sync to see them."
**Document actions** sheet: "WHICH ENTRY DOES IT BELONG TO" `<select>` (60 most recent), Attach / Detach, two-step
"Remove from the vault". No rename or retype (`document.update` is never enqueued).
**Weight & balance** (read-only): Current weighing card (Empty weight, Useful load, CG arm, Max gross, moment,
ref, reason, notes), amber "Equipment changed since this weighing" list, Earlier revisions. Empty: "No weight &
balance on file. Add the current weighing on the web app…".
**Oil** (read-only): "HOW MUCH IT DRINKS" — average hours per quart (28px), meter used, last 12 intervals; "WHAT
THE LAB FOUND" — table of key wear metals for the last 4 samples plus a fleet column, latest lab comments. Lab
reports can only be added on the web.
**Share a summary**: builds the same text as the web's printable summary and calls `navigator.share`; fallback
copies to the clipboard.

### 3.8 Records › Scans (`src/screens.tsx` `Pages`, `src/page-manager.tsx`)
Mode buttons **Browse · Manage**, and a fixed pill FAB **Scan** (camera icon, 50px, bottom-right above the tab bar).
Browse: "111 pages · 4 to check"; chip "Needs a look · 4" (toggles the filter) and, while filtered, **Confirm N
clean**; logbook chips (All + each book, min-height 36); sections "AIRFRAME · 1–61" over a 3-column grid of 3:4
thumbnails with the page number bottom-right and an amber dot top-left when an entry is unconfirmed. Empty: "No
scans yet." / "Every page has been checked."
Manage (one logbook at a time): logbook chips; sort chips Filed order · Date · Tach · AFTT (second tap flips
direction) and **Select**/Done; "Keep this as the filed order" when a sort is a definite order; grid (3 columns,
5 on iPad) where each thumbnail has ↑ ↓ nudge buttons; in select mode a sticky bar with **Retake this page**
(single selection: rescans, queues the new page, deletes the old) and **Delete N** → centred "Are you sure?"
dialog naming how many entries go with the scans.

### 3.9 Scan pages — the capture flow (`src/capture-screen.tsx`, `src/capture.ts`)
Entry points: the Scan FAB on Records › Scans (aircraft inherited) or "+ Add pages to an aircraft" on the fleet
home (asks "WHICH AIRCRAFT" first).
Sheet, top to bottom: grabber; "Scan pages" + tail; **WHICH LOGBOOK** chips (first logbook preselected) and "Adds
to the end — 24 pages so far."; **Handwritten entries** switch (default on; "Reads cursive as well as typed
entries. Turn it off for printed pages and they come back faster."); primary **Scan pages** (52px, camera icon);
"The scanner finds the page edges. Shoot the whole stack in one go — up to 24 pages."
Tapping it opens the **native** scanner (Apple's VisionKit document camera / Google ML Kit): auto edge detection,
manual crop adjust, multi-page up to 24. Nothing in the camera UI is the app's own.
On return each page is downscaled to 2000px JPEG (+400px thumbnail) in the webview and written to the SQLite
capture queue; then the shell tries to upload. Messages: "Opening scanner…", "Saving 3 pages…", then "Saved and
uploaded." or "Saved on this phone — waiting for a connection."
**ON THIS PHONE** card (only while pages are held): thumbnail strip (38×50, newest first, max 12), "3 pages saved
on your phone — They upload automatically when connected. You can also retry now.", secondary **Upload 3 pages**
("Uploading 2 of 3" → "3 pages uploaded — they'll appear once they're read.").
Empty states: "No logbooks yet — Create one in the web app and it will appear here." (scan disabled); "No
aircraft yet — Add one in the web app…".
The sheet stays open after scanning. It has no close button; it closes by tapping the scrim (top ≤8% of the
screen when the sheet is tall) or Android Back. Page order is assigned by the server on arrival. After upload the
server extracts; the phone learns the result only on a later sync.

### 3.10 Page viewer and review on the phone (`src/screens.tsx` `PageViewer`, `src/review-pane.tsx`, `src/entry-editor.tsx`)
Viewer: near-black ground; "‹" and "Page 16 of 97"; the scan at full width with shadow; hint "Swipe to turn · tap
to zoom" (or "Showing where that was read · tap ◎ again to clear"); a horizontal strip of 38×50 thumbnails for
jumping. Horizontal swipe on the image turns the page; tap opens the lightbox. States: "Loading…", "Not on
device — connect once, or use "Download all"."
**Entries drawer**: a 60px bar pinned to the bottom, "Page 16" + "Review"; tap or swipe up opens to 62vh over the
page (the page stays visible above for the spotlight); "Hide" closes.
**Review pane** inside it: "2 entries" and a status ("1 to check" / "Reviewed" / "Flagged" / "Nothing to check");
sideways-writing warning; when not yet read — "This page hasn't been read yet." / "Being read now — entries
appear on the next sync." / "Reading this page didn't work last time. Try again?" + **Read this page · N of M
left today** (online only; "Daily limit reached (M pages)").
Each **entry card**: badge (Confirmed / Looks right / Needs a look / Continues from the previous page); one row
per field (Date, Tach, Hobbs, Airframe total, What was done, Details, Parts, Signed by, Certificate,
Airworthiness directives, Service bulletins) — label 14px with an amber **Check this** chip when the reader was
unsure, value 17px; tapping the row opens the editor focused on that field; a 48px **◎** button spotlights where
the value was read (accent ring + dimmed page). Actions: **Confirm** (or Undo confirm), "Merge into the entry on
the previous page", two-step Delete.
Page actions: "Missed an entry?", **Mark page reviewed** / Reopen review, **Something's wrong** / Clear the flag.
Feedback line: "Entry confirmed · synced" / "· saved on this phone, uploads when connected". Failures show a
"Reload review" recovery.
**Entry editor** sheet: Entry category (logbook `<select>`), Date, steppers for TACH / HOBBS / AIRFRAME TOTAL
with "Leave blank", text fields, collapsible "What the scanner read" (raw OCR), Save changes / Add entry, inline
discard confirmation.
There is no "Confirm & next" flow, no re-read of an already-read page, no crop/clean-up, and no per-entry
attachments or reference links (all exist on the web review page, `apps/web/src/screenshots/review.png`).

### 3.11 Records › History and entries (`src/screens.tsx` `Entries`/`EntryDetail`, `src/history.ts`, `src/records-screen.tsx`)
History: a small accent button **New logbook entry**; "Search the history" field; chips Everything · Inspections ·
Oil · Avionics · Other; a year `<select>`; then month sections ("AUGUST 2026") of timeline rows — 30px category
glyph tile (text glyphs ◍ ◎ ✓ ▫ in hard-coded colours) on a connector rail, sentence-cased title (first
sentence, de-shouted), "N merged" tag when duplicates were collapsed, one-line summary, "14 Mar · tach 2417.3 ·
R. Brock · superseded". Empty: "No entries yet." / "Nothing matches what you picked."
Entry detail (pushed; older visual style): `‹ Back  <tail>`; date in accent; description 17px; the scanned page
image ("⤢ Tap to zoom", or "Scan not on device — connect once to download it."); "WORK PERFORMED" and "PARTS"
blocks at 13.5px; rows Meters, Signature on scan / Electronically signed, AD / SB. For e-signed entries: **Print
sticker** (opens a protected web print view in the browser; "A connection is needed…") and **Create correction**.
Entry detail is read-only: no edit, no "open on Scans", no attached documents list.
New logbook entry (`MobileEntryComposer`, pushed, online for signing): Logbook, Template (default oil & filter),
template source note, Completed date, Tach/Hobbs/Airframe number inputs, template fields, "Work performed — review
before signing" textarea (Reset wording), Your full name, Person who performed the work, Sign with certificate,
"Add a certificate" box, attestation checkbox, **Email a signing code** → "Confirm your signature" with the
8-digit code and **Sign this entry**. The draft autosaves to localStorage. This screen reads and writes Supabase
directly (profile, signing_credential, RPC) rather than through `enqueue()`.

### 3.12 Search and Ask
There is no global search. Search exists in three places, each scoped: Documents (name/type/reference),
History (free text + category + year), and Ask.
**Ask the logbooks** (`src/ask-pane.tsx`): intro text with two example questions; chat turns (your question in a
raised bubble right-aligned; answer card with "From these entries" citations: date · label + snippet);
composer — 2-row textarea "Ask about this aircraft's records" + **Ask**; above it "Needs a connection · N of M
questions left today"; footnote "An index of the books, not the legal record…". Offline: the composer is
replaced by "Asking needs a connection — the answer is worked out on the server…". Pending: "Reading the
logbooks…". The conversation is not persisted and resets on aircraft change. Citations are rendered as buttons
but are **disabled**: no caller passes `onOpenEntry` (`App.tsx:506,756`, `records-screen.tsx:225`).

### 3.13 Squawks (`src/squawks-screen.tsx`, `src/squawk-detail.tsx`)
"Squawks" + tail; **WAITING TO UPLOAD** dashed cards ("Not on the server yet") for unsent new squawks;
**OPEN · N** cards — 8px severity dot, the full description (never truncated), "Watch · 3 weeks ago · <reporter>";
swipe right ≥96px reveals "SLIDE TO RESOLVE" → "RELEASE TO RESOLVE" (resolves today, no entry linked; no undo
other than opening it and Reopen); a collapsed **Resolved  N ›** row; fixed pill FAB **+ New squawk**.
Empty: "Nothing open."
New squawk sheet: autofocused textarea "What did you notice? e.g. #3 CHT reads intermittently"; three severity
buttons **Low** (accent) · **Watch** (amber) · **Ground** (red), default Low; **Add squawk**; Cancel.
**No photo, no voice, no location, no link to a component.**
Detail sheet "Squawk": severity + "Reported 14 Mar"; description (17px); reporter; resolution notes; buttons Edit
/ **Mark resolved** → "WHEN WAS IT FIXED" date + "WHICH ENTRY CLEARED IT" `<select>` ("Not recorded in the books
yet" + 60 recent entries) → Resolve / "Not yet"; resolved: Reopen / Edit; "Delete this squawk" with an inline
red confirm ("Resolving it keeps the history; deleting removes it."). Resolution notes can be read but not written.

### 3.14 Waiting to upload and conflicts (`src/pending.tsx`)
`‹ Back  Waiting to upload`; cards: "N documents" / "N scanned pages" ("saved on this phone — uploads when
connected"), then each queued change with its owner-readable label, timestamp and attempt count, and one of:
the same "saved on this phone" line; a retry note ("Couldn't reach the server — will try again…"); a refusal in
red with **Discard this change**; or a conflict note with **Compare**. Empty: "Everything you've recorded has
reached the server."
**Changed in two places**: "‹ Decide later"; explanation with the other save's time; a three-column table
Field / Yours / Theirs with differing rows tinted amber (field names are de-snake-cased column names);
**Keep mine — upload over theirs**, **Take theirs — drop my change**.
This screen uses fixed 10.5–13.5px type and the older `ui.tsx` style. Back from it always lands on the fleet.

### 3.15 In-app updates (`src/announcement.tsx`, `docs/in-app-updates.md`)
Admin-published notices (title ≤120, body ≤500, optional link). On mobile: a floating card fixed 84px above the
bottom safe area, accent border, shadow, title, body, "Learn more" (opens the website), × to dismiss (stored per
account, shared with web). Fetched when online and on becoming visible. It overlays whatever is underneath,
including FABs. There is no app-version update prompt; "in-app updates" means these notices only.

### 3.16 Theme (`src/tokens.ts`, `src/theme.ts`)
Dark and light palettes under the same token names, written to `<html>` as CSS custom properties, so switching
repaints live. Default "Match my phone"; can be pinned Light or Dark in the Account menu; the status-bar style
follows. Scan/page viewer and lightbox stay dark in both.

---

## 4. Offline and sync, as the UI exposes it

What works offline (after one sync, and after "Download all for offline" for files)
- Reading everything in the mirror: fleet, status verdict, all items, ADs, equipment, readings, squawks, history,
  entry text, W&B, oil. Page images and documents only if cached (each is cached on first view, or in bulk by
  Download all; cache ceiling 500 MB, oldest page images purged first, documents pinned).
- Writing through the queue: readings, oil, squawk create/edit/resolve/reopen/delete, entry edit/confirm/delete/
  merge/create, page review/reorder/delete, maintenance items, mark done, ADs, equipment, document attach/delete,
  scanned pages (capture queue) and new documents (file queue).
- Online only, and each says so: Ask, Read this page, the two "scan the logs" actions, Add my aircraft, Run a
  backup, e-signing an authored entry, Print sticker, AD full text, everything linked to the website.

Indicators
- Fleet home only: the status word (Synced / Offline / Not synced yet / Syncing…) and the pending banner.
- Inside an aircraft on the **phone there is no global indicator** — no offline badge, no pending count, no sync
  error (the banner and the error text render only in the fleet branch of `App.tsx`). On iPad the pending banner
  shows above the content; the sync error text does not render there at all.
- Per action: "Saved · synced" vs "Saved · waiting for a connection" (wording varies by screen: "uploads when
  connected", "saved on this phone, uploads when connected", "Waiting for a connection.").
- Squawks lists unsent squawks under "Waiting to upload"; Documents shows a "saved on this device" card.
- "Synced" carries no time. Status says "from your last sync" without saying when that was.

When sync runs (`App.tsx`)
- After any write (`writeFinished` → push then pull), on the browser `online` event, on "Sync now", on First-run
  buttons, after a mirror heal.
- **Not on launch and not on returning to the foreground** — there is no `appStateChange`/visibility hook and
  the launch effect only loads local data. A phone that was offline at the last use shows stale data until the
  user writes something or finds "Sync now" (code-inferred).
- Results of server-side work (extraction, AI scans, document upload) appear only after a later sync; copy says
  "appear on the next sync" / "Sync to see them".

Conflicts and failures
- Updates carry the row's `updated_at`; if the server's row is newer the change parks as a conflict with the
  server's row. Nothing is overwritten silently. Resolution is on the Waiting-to-upload screen only (no badge on
  the affected item).
- Server refusals stay listed with their reason until discarded. Online failures back off 5s → 15min.
- Sign-out refuses to drop unsent work without an explicit choice.

Optimistic UI: every write patches the local mirror immediately. One deliberate exception: merging an entry into
the previous page is not applied locally until the server confirms.

---

## 5. Workflows, step by step

Counts are taps from a cold open on a phone with one aircraft already synced; typing is called out separately.

**A. Scan a logbook page at the aircraft**
1. Open app → fleet home. 2. Tap the aircraft. 3. Tap **Records**. 4. Tap **Scans** (the segment resets to
Documents every time the aircraft is opened). 5. Tap the **Scan** FAB. 6. (Pick a logbook chip if not the first.)
7. Tap **Scan pages**. 8. Native scanner: shoot one or many pages, adjust crops, Save. 9. Back in the sheet:
"Saved and uploaded." 10. Tap the scrim to close.
Shortcut: fleet home → "+ Add pages to an aircraft" → pick aircraft → Scan pages (3 taps to camera).
Friction: 5 taps to the camera on the main path; the FAB is thumb-reachable but the segmented control and the
sheet's dismiss target are at the top; no close button; the sheet must be closed manually; no automatic follow-up
— extracted entries arrive only after a later manual sync, then review is Scans → "Needs a look" → page → drawer.
Logbooks cannot be created on the phone ("Create one in the web app").

**B. "Am I legal to fly / what's due?"**
1. Open app → the fleet card already shows a pill and one line. 2. Tap the aircraft → Status ring + headline +
Needs attention. 3. Optional: "View all tracked items".
Friction: the answer is hedged by design ("No tracked items overdue", never "airworthy") and omits open squawks
(even Ground severity), missing AROW documents and open one-time ADs; data freshness is unknown (no last-sync
time, no sync on launch); the fleet card line is long ("…7 tracked; 0 need more information."). ADs and equipment
are two levels down (Status → View all → Directives).

**C. Log hours after a flight**
1. Open app. 2. Tap aircraft. 3. Tap **Log**. 4. Hold **+** on Tach (and Hobbs) until the value is right, or
tap the number and type. 5. Tap **Save to logbook**.
Friction: both meters are on by default, so a tach-only aircraft needs "Not this time" on Hobbs every flight; the
date is fixed to today (a flight logged the next morning needs Save → Recent readings → tap row → change date →
Save correction); the Save button sits below two panels — on a small phone it can be under the fold; typing into
the value field fights the `toFixed(1)` reformatting (section 8, #9).

**D. Add oil**
Same screen: Log → tap **1 qt** / **2 qt** / **Other** + type → **Save to logbook**. Oil cannot be saved without
at least one meter included, and an oil-only save also writes a reading at the current values. There is no list
of past top-offs on Log; they are under Records → Documents → More records → Oil, read-only (a mistaken top-off
cannot be deleted on the phone).

**E. File a squawk with a photo**
1. Open app. 2. Tap aircraft. 3. Tap **Squawks**. 4. Tap **+ New squawk**. 5. Type the description. 6. Pick
Low / Watch / Ground. 7. Tap **Add squawk**.
**A photo cannot be attached** — the composer and the squawk record have no image. The nearest thing is adding a
photo to the vault as a document (Records → Add a document → Use the camera → type "Other"), which cannot be
linked to the squawk. The primary button and severity row sit just above the keyboard (good reach).

**F. Show records to a mechanic**
- Hand over the phone: Records → Documents (AROW card, PDFs offline) / History (search, entry + scan, pinch
  zoom) / Scans (page viewer). Works offline once files are downloaded.
- Send a summary: Records → Documents → scroll to More records → **Share a summary** → OS share sheet (text only).
- Give access to the full records: Records → Documents → More records → **Share a records link** → leaves the
  app for the website's share page (needs signal and a browser sign-in); the link is created and managed there.
- Signed-entry sticker: History → entry → Print sticker → browser.
Friction: the two share actions are the last rows under the vault list on a non-default segment; there is no
QR/AirDrop hand-off, no PDF export of an entry or the summary, and no in-app record-room management.

Other places that punt to the web: create a logbook; add a second aircraft; edit aircraft details; W&B editing;
oil-analysis reports; AD full text and AD lookup; sharing/access management; profile, reminders, backups,
MyFlightBook, own AI key; import/export; annual prep, pre-buy dossier, audit; account deletion.

---

## 6. Parity gaps

Web can, mobile cannot (web routes under `apps/web/src/app/aircraft/[id]/`; sidebar visible in
`apps/web/src/screenshots/status.png`)
- Add a second aircraft; edit aircraft details; create/rename logbooks (`enroll`, `details`).
- Overview hub; **Forecast** tab; AD/SB explorer by make/model (`compliance/explore`, `/ads`).
- Timeline with the per-logbook **coverage bar** and gap audit (`timeline`, `audit`); duplicates tool.
- Upload PDFs/images of pages from files (`upload`); CSV import; export (`import`, `export`).
- Review extras: re-extract a read page, crop & clean up, per-field confidence %, entry attachments ("Add file",
  "Link from Vault"), reference links, Previous/Next page controls in review.
- W&B editing; oil-analysis report scanning; delete an oil top-off; undo a meter reset; rename/retype a document
  (contract types `wb.upsert`, `wb.delete`, `oil.delete`, `meterReset.delete`, `document.update`,
  `entry.setLinks` exist in `docs/ios-parity/CONTRACT.md` §3 but nothing in `apps/mobile/src` enqueues them).
- Annual prep, pre-buy dossier, printable summary page (`annual`, `prebuy`, `summary`).
- Sharing & transfer, record-room link creation/revocation (`share`); profile, reminder lead times, cloud
  backups, MyFlightBook, signing credentials page, developer OAuth apps, account deletion.
- Ask citations that open the cited entry/page (mobile renders them inert).
- Edit an entry from History/Timeline (mobile edits only via Scans → page → drawer).
- A fleet dashboard beyond the simple card list (`dashboard`).

Mobile can, web cannot (or does differently)
- Native multi-page document scanner with crop; offline capture queue.
- Full offline mirror, offline writes, queued-change list and the yours/theirs conflict screen.
- Push reminders (APNs/FCM) and a test-notification check.
- Light appearance (the web is dark-only on screen, `DESIGN.md`).
- OS share sheet for the summary; "Download all for offline"; storage readout; rebuild-from-server.
- Stepper-based hour logging with press-and-hold; swipe gestures (resolve squawk, delete reading, turn page).
- iPad three-way review layout and ⌘ chords.

Open items recorded in `docs/ios-parity/CONTRACT.md` §12 and `stream-reports.json`
- Account deletion had no server side when written (a web page `account-deletion` now exists; the app links to it).
- Home-screen widget and Siri Shortcut not built (need native Swift targets; `apps/mobile/ios-config.md`).
- Pushes for "extraction finished" and "conflict waiting" not built; only due/overdue reminders.
- Android push registration was paused pending a startup crash (`apps/mobile/README.md`).
- Oil consumption on the phone has no tach↔hobbs bridge, so it can be narrower than the web's series.
- AI-scan results cannot trigger a pull from inside All items.
- Design files were never pushed to the Claude Design project; they live only in `docs/design/`.

---

## 7. Visual design as implemented

Source of truth: `apps/mobile/src/tokens.ts` ("direction 'Verdict first'", transcribed from a SwiftUI-targeted
handoff that is not in the repo), `src/ui.tsx` (legacy aliases + shared chrome), `src/index.css`, `src/icons.tsx`.

Colour (dark / light)

| Token | Dark | Light | Role |
|---|---|---|---|
| bg | #0F1216 | #F2F5F9 | app ground (tab bar at 92%) |
| surface | #191D24 | #FFFFFF | cards, rows, sheets |
| surfaceRaised | #212630 | #E8ECF3 | stepper keys, chips, selected segment |
| hairline | #2B313C | #D3DAE4 | every 1px border |
| ink / dim / faint | #ECEFF4 / #9AA3B0 / #8B95A3 | #10151C / #4E5967 / #606A78 | text ramp |
| accent / accentLight / onAccent | #5AA9FF / #8EC8FF / #0B1017 | #1667CE / #8EC8FF / #0B1017 | one accent; gradient is theme-independent |
| warning / danger / success | #F2B544 / #FF7060 / #4ED69A | #8A5300 / #C0271B / #0B7A4B | status only |
Tints: semantic colour at 12% fill / 30% border (success border 24%, accent fill 14%). Document ground before
paint: #090c12 / #e7ecf3. Light-theme contrast is unit-tested (`apps/web/test/mobile-theme.test.ts`).
The one primary fill is `linear-gradient(135deg, #5AA9FF, #8EC8FF)` with dark text, in both themes.

Type — two self-hosted families (`@fontsource`): **Space Grotesk** (500/600/700) for quantities, identifiers and
titles; **Instrument Sans** (400/500/600) for everything else. Monospace is retired; digits use `tabular-nums`.
Scale (rem, root 16px): screen title 26/700; compact title 22; hero number 28; tail on card 19; verdict 19; meter
value 21; body 17/1.5; button 16/600; card title 15; row title 14.5; secondary and meta 14; tab label 14;
section label 12/600 uppercase 0.08em; chip 11/600 uppercase. Editable controls are 16px (WKWebView zoom rule).
In practice many screens bypass the scale with fixed pixel sizes: 41 declarations at 9–12.5px across 13 files
(e.g. thumbnail page numbers 9.5px, reference chips 10px, Pending metadata 10.5–11.5px, Mark-done labels 11px).

Space, shape, targets — screen gutter 20; radii chip 9, control 12, row 14, card 16, panel 18, sheets 20, primary
button 15, pill 999; `hit = { min 48, stepper 48, primary 52, key 56 }`; tab buttons 52. Known targets below 44:
fleet avatar 34×34; Login mode buttons ~34 tall; "‹ Back" in `TopBar` ~30 tall; logbook filter chips and Records
segments 36; "Not this time" 32; page-strip thumbnails 38×50; lightbox close 40×40; search clear 40 wide;
announcement × and First-run survey chips/Skip unpadded.

Depth and motion — flat cards with hairlines; shadows only on FABs (accent-tinted), the page image, the entries
drawer and the announcement card; a radial glow behind the verdict ring and First-run logo. Motion: the ring
sweep (400ms), switch knob and swipe rows (~150–180ms), hover tint. No screen or sheet transitions; no haptics
(no haptics plugin in `apps/mobile/package.json`). `prefers-reduced-motion` is honoured for the few transitions.

Component primitives (all inline-styled; none is a shared component library)
`Screen`, `Brand`, `TopBar`, `Row`, `Card`, `Pill`, `input`, `primary`, `ghost` (`src/ui.tsx`);
`Sheet`/`Field`/`Chips`/`Problem`/`SheetButtons`/`EntryPicker`/`field` (`src/item-editor.tsx`);
`Sheet`/`Stepper`/`sheetInput`/`sheetPrimary`/`sheetCancel` (`src/record-screen.tsx`);
`RecordsSheet`/`SheetLabel`/`DropZone` (`src/document-upload.tsx`); `Modal` (`src/modal.tsx`);
`Sidebar`/`RegularFrame`/`TwoPane`/`PanePlaceholder` (`src/layout.tsx`); `TabBar`; `AircraftSwitcher`;
`SegButton`, `ModeButton`, `FilterChip`, `MoreRow`, local `Primary`/`Secondary`/`Danger`/`Ghost` buttons repeated
per file. Pickers are native `<select>` and `<input type="date">`. Icons: 7 inline SVGs (gauge, plus-circle,
folder, flag, chevron-down, chevron-right, camera) at 1.6 stroke; everything else is a text glyph (‹ › × ⋯ ◎ ⤢
✓ ↑ ↓ ▸ ▾ ◍ ▫ ↗).
Global: `user-select: none` on everything except inputs; focus-visible outline in accent.
Dates are formatted `en-GB` ("14 Mar 2026") everywhere regardless of device locale.

Two visual generations coexist. Redesigned screens (Status, Log, Records, Squawks, sheets) use tokens and the
rem scale. `CompleteItem`, `EntryDetail`, `PdfViewer`, `Pending`/`Conflict`, `MobileEntryComposer` and `Login`
still use the older `ui.tsx` idiom: "‹ Back" ghost button + 19px title, 10.5–13.5px text, 10–12px radii,
hard-coded `#ff6b6b` errors, unstyled native checkbox and text-link buttons.

How it differs from the web app (`DESIGN.md`, "The Glass Cockpit")

| | Web | Mobile |
|---|---|---|
| Theme | dark only on screen | dark + light, follows the phone |
| Numbers | JetBrains Mono readouts everywhere | no mono; tabular figures in the brand faces |
| Working type | 10–13.5px | 14–17px on redesigned screens |
| Primary button | flat accent fill, 9px radius | accent gradient, 15px radius, 52px tall |
| Corners | 6–12px | 9–20px |
| Shadows / glows | "don't" | FAB shadows, ring glow |
| Navigation | left sidebar with 3-letter idents, 14 destinations | 4 tabs + switcher |
| Status model | counts + worst-first card grid, ISO dates | one verdict ring + attention cards, "14 Mar" dates |
| Palette | #0a0d13 ground, green #43d38a, red #ff6156 | #0F1216 ground, green #4ED69A, red #FF7060 |
`PRODUCT.md` says mobile "follow[s] the same web design language; mobile is not a separate native design
language", while `tokens.ts` and `apps/mobile/README.md` describe an approved, SwiftUI-authored iOS redesign with
different rules. The two documents disagree; the code follows the second.

What the in-repo "iOS Redesign" docs propose (`docs/design/`)
- Direction **"Verdict first"**: one verdict in words before any list; one accent; semantic colour always paired
  with a word; hairlines not shadows; no monospace; never name the queue ("saved on your phone"); owner's words
  ("Check 1 field", not "low confidence"; subject as title, AD number as a tag). The original ten phone screens
  (the "Approved 1a" file) are **not in the repo**; only addenda are.
- `screen-11-scan-pages.md` + `…Scan pages 11.dc.html` (two 340×718 phone frames: sheet as opened; pages held):
  capture becomes a sheet over Scans, inherits the aircraft, logbook chips, "Adds to the end — 24 pages so far",
  Handwritten switch, one primary, held-pages card with secondary Upload. **Shipped almost verbatim.** Its open
  question (reorder on the phone) was later answered by Manage mode.
- `screens-12-24-ipad-and-editors.md` + two `.dc.html` files (1194×834 iPad frames and phone frames):
  12 Sidebar (200pt, switcher popover, counts/shortcut hints per row, Ask with sparkles, account + "Synced 4 min
  ago"); 13 Status 40/60 with a "Clear for now" row naming the healthy items, 13L light variant; 14 Log with the
  last 30 readings beside it, hover Edit/Delete, lower-reading flags, a ½ qt preset; 15 Scans three-way review
  with a 2-column field grid; 16 Documents with type chips and a drop target; 17 History with entry + scan and
  "Open on Scans" / "Attach a document"; 18 Squawks with in-app resolve; 19 Ask as a 420pt overlay with source
  chips, follow-up actions and suggestions; 20 Field editor (read chip, raw transcription, crop strip, 0.1
  stepper, "Looks right" / "Blank it" / "Show on scan ◎"); 21 Item editor with a live "Next due works out to…"
  line, 21a AD compliance; 22 Equipment install/remove, 22a meter-replacement alert; 23 Add a document with type
  chips, 23a searchable entry picker, 23b resolve squawk with "What was done"; 24 Conflict with two columns and
  "1 of 2"; a light palette table.
- Proposed but **not implemented**: sidebar counts/shortcut hints/sync line and named account; the switcher
  popover (a centred dialog shipped); "Clear for now" naming items; the single-field editor with crop and raw
  read (a whole-entry editor shipped); searchable entry picker (a `<select>` shipped); "Next due works out to"
  preview; ½ qt preset; lower-reading flags in the list; Ask overlay, suggestion chips and tappable sources;
  "Open on Scans"; "What was done" on resolve; conflict "1 of N" and two-column cards (a three-column table
  shipped); pane ratios (40/60 specified, 55/45 shipped for Status/Log/Squawks); the single 700pt breakpoint
  (700 + 1000 shipped); verdict words GROUNDED/AIRWORTHY (shipped copy avoids both).

---

## 8. Critique

Problems (all grounded in code; none device-verified)

1. **No sync on launch or foreground, and no "as of" time.** `App.tsx` pulls only after a write, an `online`
   event or a manual tap. The fleet shows a green "Synced" with no timestamp (`App.tsx:662`) and Status says
   "from your last sync". For a screen that answers "is anything overdue", unknown freshness is the worst flaw.
2. **Inside an aircraft the phone shows no offline, pending or error state.** `PendingBanner` and the sync
   error render only in the fleet branch (`App.tsx:627–681`). A refused or conflicted change is invisible until
   the user backs out to the fleet.
3. **Account, Sync now and Appearance are unreachable from an aircraft on the phone.** The header is only the
   tail pill (`switcher.tsx`). Switching to Light in sunlight takes: tail pill → See all aircraft → 34px avatar →
   scroll → Light.
4. **The verdict ignores squawks and paperwork.** `computeAirworthiness` reads maintenance items and recurring
   ADs only (`airworthiness.ts:51–117`). A "Ground" squawk or a missing registration leaves the ring green-ish
   and the fleet pill "CURRENT". The tab with the grounding item carries no badge (`tabbar.tsx`).
5. **Three vocabularies for the same state.** `tokens.ts` `semantic.word` (WITHIN RECORDED LIMITS / NEEDS
   INFORMATION), `ui.tsx` `URGENCY_LABEL` (CURRENT / NEEDS INFO), headline strings in `status-logic.ts`, and the
   design mocks (GROUNDED / AIRWORTHY). The fleet card line "…7 tracked; 0 need more information." is not
   glanceable.
6. **All items and Mark-done live outside navigation.** `showAll` and `completing` are component state
   (`status-screen.tsx:43,277`), so the edge swipe and Android Back from "All items" exit to the fleet list
   (`App.tsx:255–263`), and a tab switch loses the place. ADs and equipment are two levels under a row at the
   bottom of Status.
7. **One-level push with two stacked headers and no scroll management.** A pushed screen renders under the
   still-visible switcher row, then its own "‹ Back" bar (`App.tsx:683–696`). Everything is one document
   scroller with no scroll reset or restore (no `scrollTo` anywhere), so opening an entry from deep in History
   likely lands mid-screen and Back loses the list position. Entry → Create correction → Back skips the entry.
8. **Not native-feeling: no transitions, no drag-to-dismiss, no haptics.** Sheets pop in; the grabber is
   decoration; four sheet implementations differ in padding, title size and whether there is a Close button
   (`capture-screen.tsx`, `document-upload.tsx`, `record-screen.tsx`, `item-editor.tsx`). The capture sheet can
   only be closed by tapping the scrim at the top of the screen. Six `window.confirm` dialogs
   (`record-screen.tsx`, `item-editor.tsx`, `ad-compliance.tsx`) sit beside inline confirms elsewhere.
9. **The meter value field fights typing.** `Stepper` binds `value.toFixed(1)` to a controlled input
   (`record-screen.tsx:699–712`): typing "2" then "4" yields 2.0, not 24. Steppers are fine for +1.3 h; they
   are slow for a first reading or a large correction, and the fallback is broken.
10. **Log a flight cannot set a date, and "today" is UTC.** `todayIso()` is `new Date().toISOString().slice(0,10)`
    (`record-screen.tsx:36`); an evening flight in US time zones is stored under tomorrow's date while the screen
    shows the local date. Same pattern in `complete-screen.tsx`, `squawk-detail.tsx`, `equipment-list.tsx`.
    All dates are forced to `en-GB` format for a largely US audience.
11. **The camera path is long and the loop is not closed.** Five taps to the scanner because Records always
    opens on Documents (`App.tsx:660`) and Scan is on a sub-segment; after upload nothing tells the user when
    pages are read (no push, no auto-pull); review then starts from a different place. "Confirm N clean" in
    Browse never drains because `Pages` gets no `onQueued` (`records-screen.tsx:176`) and always reports
    "uploads when connected".
12. **Review on the phone is cramped and slow.** The drawer is 62vh over the scan, each field is a full-width
    48px row, the ◎ target is at the right edge while the ring appears in the 38% of page left visible, and
    there is no confirm-and-advance: Confirm → Mark page reviewed → Hide → swipe → Review, per page.
13. **Small and fixed type survives in exactly the outdoor-critical places.** 41 declarations at 9–12.5px
    (`pending.tsx`, `complete-screen.tsx`, `screens.tsx`, `page-manager.tsx`, `pdf-screen.tsx`); FAR chips at
    10px; meta text is `faint` (#8B95A3 on #191D24). Fixed px ignores text-size settings; the rem scale has no
    `-apple-system-body` hook, so iOS Dynamic Type is probably not honoured despite the README's claim.
14. **Sub-44pt targets on primary routes**: the account avatar (34), "‹ Back" (~30), Records segments and logbook
    chips (36), "Not this time" (32), lightbox close (40), page-strip thumbnails (38 wide).
15. **Top-heavy layouts for one-handed use.** Titles, the switcher, segmented controls, Browse/Manage, filters,
    search and "Add a document" are all at the top; Save to logbook is in flow below two panels rather than
    pinned; only two screens have a bottom FAB. Sheets put Close/Cancel top-right.
16. **Ask and sharing are buried.** Ask is the third row of "More records" under the vault on a non-default
    segment; citations are inert (`ask-pane.tsx:150–153`, no `onOpenEntry` passed). "Share a records link"
    leaves the app. For "show the mechanic" there is no single obvious action.
17. **Squawks cannot carry a photo**, and swipe-to-resolve fires with no undo or confirmation
    (`squawks-screen.tsx:68–76`). Severity defaults to Low. Resolution notes are display-only.
18. **Promises the UI does not keep.** "You can undo a meter swap from the reading list" (no such control);
    "Or drag a file in from Files" on phones; "Sync to see them" as an instruction; "Share this aircraft" row
    never rendered; README says the webview honours OS text size.
19. **Native pickers do heavy lifting badly.** "Which entry" is a `<select>` of 60–300 truncated lines
    (`item-editor.tsx:260–281`, `squawk-detail.tsx:206–222`); AD status, document type, template and logbook
    are all `<select>`s; the authored-entry form is one long page of them with an unstyled checkbox.
20. **Two visual generations and duplicated primitives.** Mark done, Entry detail, PDF viewer, Waiting to
    upload/Conflict, the entry composer and Login look like a different app (older `ui.tsx` idiom, 10.5–13.5px,
    `#ff6b6b`). Button, chip and sheet styles are re-declared per file, so radii, heights and font sizes drift
    (primary radius 9/10/12/14/15; sheet titles 14.5/19/22px).
21. **Hard-coded colours bypass the theme.** History category tiles (`screens.tsx:187–192`), error red, the page
    viewer ground, thumbnail badges. Text glyphs (◍ ◎ ▫ ⋯ ⤢) stand in for icons and render differently on iOS
    and Android.
22. **`user-select: none` everywhere** (`index.css:39–43`): an owner cannot copy an AD number, a serial, a part
    number or an entry's text to send to a mechanic.
23. **Status wastes the first screen on decoration when nothing is wrong** and repeats itself when something is:
    the ring, the headline, the detail line and the first attention card all state the same item. Meter tiles
    are read-only (no tap-through to Log). The disclaimer is the last thing on the page in 14px faint.
24. **The fleet home's only action is mislabelled and partial.** The dashed row says "+ Add pages to an
    aircraft" (the code comment calls it "Add aircraft"); a second aircraft cannot be added on the phone at all.
25. **The announcement card floats over content and FABs** at a fixed offset with a tiny ×, and has no relation
    to app-version updates, which have no in-app surface.
26. **iPad is a stretched phone in places.** The fleet home is a 640px column with no sidebar; image documents
    never fill the document pane; the sidebar lacks the counts and sync line the design specified; docs still
    describe one breakpoint.

Strengths worth keeping

1. **Offline-first that is honest.** Local SQLite mirror, durable queues that survive force-quit, idempotent
   ids, and copy that says where the data is ("saved on this phone", never "queued") — `mutations.ts`,
   `actions.ts`, `capture.ts`, `blob-upload.ts`.
2. **Conflicts are never silent.** Optimistic concurrency with a yours/theirs choice and "Decide later"; refusals
   keep their reason (`pending.tsx`). Sign-out will not drop unsent work without consent.
3. **One arithmetic for web and phone.** Status, compliance, hours and oil math are imported from `apps/web/src/lib`
   rather than re-implemented (`airworthiness.ts`, `apps/mobile/README.md`).
4. **The native scanner decision.** VisionKit/ML Kit with crop and 24-page sessions replaced a slow in-webview
   OpenCV attempt; "Adds to the end — N pages so far" removes the worry about shooting in order.
5. **Source is always one tap away.** The ◎ spotlight ties each extracted field to its place on the scan; raw
   OCR sits under the editor; entry detail embeds the page; "Check this" replaces confidence percentages.
6. **Domain-correct details.** VOR check enforces 91.171(d) fields and writes a real entry; a backwards reading
   asks "meter replaced or mistyped?"; removal vs deletion of equipment is explained at the tap; the AROW "Carry
   aboard" card with a verdict; legal-boundary copy on Status and Ask.
7. **Plain, owner-language copy throughout**, including empty and error states that say what to do next, and the
   AI allowance stated where it is spent.
8. **Aircraft switched in place with the tab preserved**, and a flat four-tab model that replaced a deep
   back-stack.
9. **Colour is never the only signal**; a real light theme with tested contrast and live switching; safe-area
   handling; 16px inputs to prevent WKWebView zoom; 48px default targets on the redesigned screens.
10. **Thoughtful tablet behaviour**: sidebar and split thresholds chosen from content width, three-way review,
    keyboard chords, drag-and-drop, pointer hover.
11. **Stepper logging concept**: start at the last reading, show the live delta, press-and-hold acceleration, one
    Save for meters and oil, "Not this time" rather than asserting an unread meter.
12. **Operational transparency**: push registration state and failure reasons surfaced, storage use shown,
    rebuild-from-server as an escape hatch, startup error fallback in `index.html`.
