# Build brief: MyTailLog redesign mockups

You are one of nine builders. Three design directions (A, B, C) each need three gallery pages of mockups:
`web1.html`, `web2.html`, `mobile.html`. You build exactly ONE page, named in your task. The design language for
your direction already exists and is settled: you extend it faithfully to every screen on your list.

MyTailLog: a free, open-source app for the solo owner-pilot of one piston aircraft. It turns decades of paper
logbooks into a searchable index (photograph pages, AI reads them, the owner confirms each entry beside the scan),
tracks what is due (annual, transponder, pitot-static, ELT, ADs, oil), and produces hand-off documents. Used at a desk
on the web to digitize and review, and one-handed on a phone at the aircraft. Users skew 50+, often outdoors in glare.

## 1. Files

Repo root: the repository root. Proposal lives in `docs\redesign\`.

Read first, in this order:
1. `docs\redesign\<dir>\system.css` : your direction's tokens and components (all rules scoped to `.da` / `.db` / `.dc`).
2. `docs\redesign\<dir>\index.html` : the finished home screens, web and phone. This is the reference for look, density, copy voice and markup style. Match it.
3. `docs\redesign\shared\gallery.css`, `shared\mock.css` : gallery chrome (`g-*` classes) and the `.scan` stand-in for a photographed logbook page.
4. Section 6 below for your direction's contract.
5. Research, as needed for what each screen must contain (do not skip functionality the current screens have):
   - `<scratch>\research\web-inventory.md` : every current web screen, field and action (964 lines; read the sections for your screens).
   - `<scratch>\research\mobile-inventory.md` : every current mobile screen (817 lines).
   - `<scratch>\research\docs-digest.md` : capabilities, rules, demo data.
   where `<scratch>` = `docs/redesign/research (the original scratch folder)`
6. `.claude\skills\impeccable\reference\craft-floor.md` : the quality floor. Read it before writing markup.

Write ONLY your one output file, `docs\redesign\<dir>\<page>.html`. Do not edit `system.css`, `index.html`, anything in `shared\`, or any other file in the repo. If you need a component that `system.css` lacks, add it in a `<style>` block in your own page, scoped under your direction class, built from the existing tokens (never new colours or fonts). Write the file in several passes (create it with the first few screens, then append with Edit) rather than one giant Write.

### Page skeleton (copy exactly, change title, fonts line, nav current item)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>…</title>
<!-- copy the Google Fonts <link> from your direction's index.html unchanged -->
<link rel="stylesheet" href="../shared/gallery.css">
<link rel="stylesheet" href="../shared/mock.css">
<link rel="stylesheet" href="system.css">
<style>/* page-local additions, scoped .da/.db/.dc */</style>
</head>
<body class="g-page">
<nav class="g-top" aria-label="Proposal"><div class="g-top-in">
  <b>MyTailLog redesign</b>
  <a href="../index.html">Overview</a><a href="../analysis.html">Analysis</a>
  <a href="../a/index.html">A · Paint Scheme</a><a href="../b/index.html">B · Section Tabs</a><a href="../c/index.html">C · Line Diagram</a>
</div></nav>
<nav class="g-top" style="position:static;border-bottom:0" aria-label="This direction"><div class="g-top-in">
  <a href="index.html">Direction overview</a><a href="web1.html">Web: status, capture, review</a><a href="web2.html">Web: records, aircraft, sharing</a><a href="mobile.html">Phone and tablet</a>
</div></nav>
<main class="g-wrap">
  <h1 class="g-h1">…</h1>
  <p class="g-lede">one or two sentences</p>
  <ul class="g-index"><li><a href="#figure-id">Screen name</a></li>…</ul>
  …sections…
</main>
<script src="https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js"></script>
<script>lucide.createIcons();</script>
<script src="../shared/gallery.js"></script>
</body>
</html>
```
Mark the current page in both navs with `aria-current="page"`.

### Sections and figures

Group screens by workflow. Each group: `<h2 class="g-h2" id="…">Workflow name</h2>` then
`<p class="g-prose">` with two to four plain sentences: what the owner is doing, and what changed from today's app and why
(cite the current pain from the inventories' critique lists). Then the figures.

Web screen:
```html
<figure class="g-shot" id="a-w-due">
  <figcaption><b>Screen name</b><span>What the owner does here and what is new.</span><em>Replaces: /aircraft/[id]/status and /maintenance</em></figcaption>
  <div class="g-stage"><div class="artboard da" style="--w:1440;--h:900"> …the screen… </div></div>
  <button class="g-zoomhint" type="button">View at full size</button>
</figure>
```
The artboard is 1440 wide and grows with content (min 900). Add class `fixed` for a one-viewport app screen that must not grow.
For a drawer, dialog or small state, use a narrower artboard (`--w:720;--h:560`) rather than redrawing the whole shell.
Direction B and C web artboards need their shell classes exactly as in index.html (`artboard db web sec-…` / `artboard dc web`).

Phone screens go in rows; use `g-flow` when the row is a sequence (it numbers the captions):
```html
<div class="g-phones g-flow">
  <figure class="g-phone" id="a-m-scan-1">
    <div class="g-device"><div class="artboard da am"> …390 × 844 screen… </div></div>
    <figcaption><b>Name</b><span>One line.</span></figcaption>
  </figure>
</div>
```
Tablet: `<figure class="g-phone tablet"><div class="g-device tablet"><div class="artboard …">` is 1024 × 768.
Figure ids: `<dir>-w-<slug>` for web, `<dir>-m-<slug>` for phone, `<dir>-t-<slug>` for tablet. Unique within the page.

### Technical rules
- Static HTML and CSS only. No JavaScript beyond the three script tags in the skeleton. No images, no external assets except the Google Fonts link and Lucide.
- Icons: Lucide only, `<i data-lucide="name"></i>` (verified names include: camera, scan-line, book-open, wrench, plane, plane-landing, share-2, search, plus, check, circle-check, triangle-alert, clock-3, circle-help, file-text, file-plus-2, droplet, gauge, calendar, chevron-right, chevron-left, chevron-down, chevrons-up-down, settings, upload, printer, link, users, scale, history, wifi-off, cloud-upload, sticker, clipboard-check, x, pencil, trash-2, zoom-in, crop, bell, download, shield-check, stamp, list-checks, list-ordered, timer, fuel, radio, ellipsis, filter, eye, lock, key-round, refresh-cw, external-link, image, layers, map-pin, flag, paperclip, mail, copy, rotate-cw, split, merge, sun, moon, archive, folder, hard-drive, database, plug, qr-code, signature, badge-check, circle-alert, info, menu, house, route, signal, wifi, battery-full, battery-medium, circle-user-round, mic, keyboard, undo-2, send, arrow-up-down, grip-vertical, calendar-clock, activity, flask-conical, weight). Never emoji or unicode glyphs as icons. Never use an arrow character in link or button text.
- Scanned pages: use the `.scan` component from `shared/mock.css` (see how index.html of direction B uses `.scan-head`, `.scan-cols`, `.scan-body`, `.scan-sticker`, `.scan-stamp`, `.scan-hl`, `.scan-page`; small thumbnails are just `<div class="scan" style="--lh:9px;--top:14px"></div>`). Variants `.scan.engine`, `.scan.prop`. Position highlights in px, not %, when the scan has a fixed height.
- Charts (oil trend, W&B, forecast): inline SVG drawn to scale with labelled axes, coloured from the direction's tokens via `style="fill:var(--…)"` / `stroke:var(--…)`.
- Keep each web artboard between roughly 3 and 7 KB of markup; phone artboards 1.5 to 3 KB. Favour finishing every screen at good quality over gold-plating a few.

### Check your work (required)
Render and LOOK at your page. Use the PowerShell tool:
```
& "<scratch>\shot.ps1" -Page "a/web1.html" -Out "a-web1-due" -W 1500 -H 1150 -Query "only=a-w-due"
```
then open the PNG it prints with the Read tool. `only=` takes a comma list of figure ids, so batch three or four phone figures per shot (`-W 1500 -H 950`) and one web figure per shot. Use a unique `-Out` name starting with your direction and page.
Check every figure at least once: nothing overlapping or clipped, text not wrapping badly, tables aligned, icons present, colours from the system. Fix what you see, re-shoot only what you changed. If the PowerShell call is rejected with a message that a hook changed its input, re-issue it exactly as that message says. If a Bash/PowerShell command is unavailable, say so in your report rather than skipping silently.

## 2. Mock data (use these exact facts everywhere)

Today is Wednesday, Nov 18, 2026. Owner: Dana Morgan ("DM", dana@example.com). A&P/IA: D. Alvarez, A&P 3105582 IA. Shop for avionics: AeroCheck Instruments. A&P: M. Torres, A&P 3667012.

Aircraft: **N734DM**, 1978 Cessna 172N, S/N 17269841, demo aircraft. Engine Lycoming O-320-H2AD S/N L-14238-27A. Prop McCauley 1C160/DTM7557 S/N EM-77341. Tach 4212.4 (read Nov 14), Hobbs 4680.4, airframe total 4212.4. Engine 1409.4 since overhaul (overhauled 2005 at tach 2803.0, Signal Engines). Prop overhauled 2010 at 3204.8.
Second aircraft for the hangar and switcher: **N4321J**, 1966 Piper Cherokee 140, shared with Dana as editor, "2 items coming due".

Tracked items (11):
| Item | Rule | Last done | Due | Left | State |
|---|---|---|---|---|---|
| VOR check | 91.171, every 30 days, IFR only | Oct 12, 2026 | Nov 11, 2026 | lapsed 7 days | Overdue (IFR only) |
| Oil and filter change | every 50 h, advisory | Sep 3, 2026 at 4172.1 | tach 4222.1 | 9.7 h, about Dec 12 | Due soon |
| Transponder | 91.413, 24 calendar months | Dec 3, 2024 at 4131.5 | Dec 31, 2026 | 43 days | Due soon |
| Pitot-static and altimeter | 91.411, 24 months, IFR only | Dec 3, 2024 | Dec 31, 2026 | 43 days | Due soon |
| ELT battery | expiry | Feb 11, 2023 | Feb 28, 2027 | 102 days | Current |
| AD 2011-10-09 seat rails | recurring every 100 h | Jul 14, 2026 at 4168.3 | tach 4268.3 | 55.9 h, about Apr 2027 | Current |
| Annual inspection | 91.409, 12 calendar months | Jul 14, 2026 at 4168.3 | Jul 31, 2027 | 255 days | Current |
| ELT inspection | 91.207, 12 months | Jul 14, 2026 | Jul 31, 2027 | 255 days | Current |
| Engine TBO | 2000 h, advisory | overhaul 2005 at 2803.0 | tach 4803.0 | 590.6 h | Current (advisory) |
| Registration | 7-year renewal | (document) | Mar 31, 2029 | | Current |
| Insurance policy | annual, document | | no date on file | | Needs information |

Verdict sentence (the home headline): "One check has lapsed, for IFR only. Next is an oil change, in 9.7 hours."
Hours are projected to dates from recent flying, "about 3 hours a week", always written "about <date>" and never overriding a calendar limit.

ADs: 2011-10-09 seat rails (recurring 100 h, complied Jul 14 2026, source Airframe p. 60); 76-07-12 fuel filler caps (complied 1998, one-time); 2020-18-01 fuel pump diaphragm (not applicable, reason: different pump P/N).
Logbooks: Airframe (2 volumes, 198 pages), Engine (118 pages), Propeller (41 pages), Avionics (38 pages), Other (17 pages): 412 pages, 212 confirmed entries. 6 pages scanned Sunday Nov 15 are waiting for review: 4 read cleanly, 2 have a doubtful date or tach value. Gap: no airframe pages yet for 1983 to 1991.
Key entries: 1998-04-18 annual at 2101.5 (R. Mitchell, A&P 2214467 IA); 2005-09-14 engine overhaul at 2803.0; 2010-04-30 prop overhaul at 3204.8; 2011-08-22 annual with AD 2011-10-09 first complied at 3384.0; 2019-03-12 Garmin GTN 650 installed per STC SA01714WI at 3891.2 (SkyTech Avionics); 2023-02-11 ELT battery at 4038.9; 2024-12-03 transponder and static certification at 4131.5 (Airframe p. 58); 2026-05-09 oil change at 4131.5 with compressions 76/74/75/77 over 80; 2026-07-14 annual at 4168.3 (Airframe p. 60, Engine p. 37, Propeller p. 12); 2026-09-03 oil change at 4172.1, 7 qt Phillips XC 20W-50, Blackstone sample normal (Engine p. 38); 2026-10-12 VOR check (Airframe p. 61).
Equipment: Garmin GTN 650 P/N 011-01057-00 (2019); Rapco vacuum pump RA215CC (2021); ACK E-04 ELT (2015); King KX-155 removed 2019.
W&B: 1998 weighed 1441.20 lb, arm 39.420, moment 56,812.10; 2019 computed 1447.80 lb, arm 39.610, moment 57,347.36; max gross 2300 lb. The 2021 vacuum pump install is later than the last revision, so W&B shows a "may be stale" notice.
Squawks: "Left brake feels soft" (Watch, reported Nov 8 by Dana); "Nav light lens cracked" (Low, Oct 21); resolved: "Alternator belt squeal" (cleared by the Jul 14 annual entry).
Documents vault (14): airworthiness certificate, registration (expires Mar 31, 2029), POH, weight and balance report, insurance policy, STC SA01714WI paperwork, Form 337 for the GTN install, 8130-3 for the vacuum pump, oil analysis reports (3), radio station licence. AROW "carry aboard" card: Airworthiness, Registration, Operating handbook, Weight and balance.
Sharing: one record room link live ("Pre-buy for J. Okafor", expires Dec 18, opened 3 times); people: Dana (owner), Sam Reyes (editor, co-owner), D. Alvarez (viewer).
AI reading allowance: 50 pages a day shared; 31 used today; own key optional. Offline: everything is editable offline except AI reading, Ask, enrolling an aircraft.

## 3. Product rules that copy must respect
- The paper logbooks are the legal record (14 CFR 91.417). MyTailLog is an index. Never write "airworthy", "legal to fly", "grounded", "compliant" as a verdict, and never imply a sign-off. Say what the records show: "nothing tracked is overdue", "lapsed", "due".
- Unconfirmed AI readings never change what is due. Show the three levels of trust consistently: read by AI (not yet confirmed), confirmed by you, signed by a mechanic.
- Say this boundary once per context in a calm line, not as a banner on every screen.
- Terminology: tach, hobbs, annual, AD, SB, squawk, A&P, IA, W&B, Records Vault, record room.
- No invented testimonials, prices, user counts or accuracy claims. Free and open source (MIT).

## 4. What changes for the owner (apply in every direction)
The current app has 15 sidebar items, 6 hubs and 14 sub-tabs; status hides below 1536px; logging hours is buried; digitizing spans four dead-end screens; review is split in two. The redesign makes these changes:
1. **Five destinations**, not fifteen (names per direction in section 6), plus one global **Add** action (scan pages, log a flight, add oil, squawk, document, write an entry) and one **Search or ask** field (search and the cited "Ask your logbooks" are the same field).
2. **A sentence first.** Home leads with the verdict in words, then the evidence.
3. **One due list with both limits.** Every item shows its calendar limit and hours limit where it has them, names which one bites first, and converts hours to "about <date>". Items can be marked done in place.
4. **Every number carries its source.** A citation chip to the logbook page beside every derived value, in lists, answers, shared links and printed documents.
5. **Capture, read, review is one pipeline** with a visible queue: pages waiting to upload, being read (with the daily allowance shown), waiting for review, done. Reading runs in the background and announces when it finishes.
6. **Review is one desk.** Scan beside fields; selecting a field lights its ink on the scan; least-certain field first; three outcomes per field (accept, edit, not on this page); "Confirm page and next"; keyboard shortcuts on the web, swipe on the phone. Deleting asks first.
7. **Hand-offs start from the audience.** "Share" asks who it is for (IA for the annual, a buyer, an insurer, a co-owner) and builds the right record room, dossier or summary, with expiry, revoke, QR code and a view log.
8. New, from competitor research (label each of these in its caption as "New"):
   - Photograph the tach: the phone reads the number into a draft flight ("Review, don't retype").
   - "Pick a date": choose a date and expected hours, see what will have lapsed by then.
   - A home that changes with the aircraft's situation (all clear / something coming up / annual month / in the shop / preparing a sale).
   - "First read": after the first logbook is scanned, a short account of what the books revealed (overhauls, repeated repairs, gaps).
   - Squawk with a photo, sendable to the mechanic as a link.
   - Document expiries (registration, insurance) on the same due list.
   - "Do these together": suggest bundling items into one shop visit.
   - Written versus calculated times check (engine and prop time since overhaul).
   - Reminders that carry the whole answer, a lock-screen widget.

## 5. Screen lists

Every screen must show realistic content from section 2, in a state worth seeing (not empty unless the screen is an empty state). Keep the direction's shell on full web screens.

### web1.html : "Web: status, capture, review" (18 figures)
Group "Getting in": W01 Sign in (Google, Apple, email link, password; one calm line on what the app is). W02 Hangar (N734DM and N4321J with their one-line verdicts, add an aircraft, import a backup; demo aircraft marked). W03 Add an aircraft (tail number lookup result from the FAA registry filling make, model, year, serial, engine; the five logbooks it will create). W04 First session setup: three inputs on one screen (today's tach and hobbs, date of last annual or "find it on a scanned page", done) ending in the first verdict. W05 New aircraft home with nothing scanned yet (what is known, what to do next).
Group "What is due": W06 Home (repeat the home from index.html, adapted only if needed). W07 Home variants: two reduced artboards (`--w:1440;--h:520`, header plus headline area only) for "annual month" and "all clear". W08 Due list: all 11 items, grouped by horizon, both limits, legend chips that filter and count, mark done in place, "do these together" suggestion. W09 Item detail with mark-done drawer open (history of past completions each with its page, interval, which meter hours are counted on, lead time for reminders). W10 Pick a date (New). W11 ADs and SBs register (applies / recurring / complied / not applicable with reason; compliance history; "record compliance"). W12 Find ADs (FAA search by make and model, relevance, "Track this AD").
Group "Squawks": W13 Squawks list with one open in detail (severity Low / Watch / Ground, photo, who reported, link the entry that cleared it, send to mechanic).
Group "From paper to index": W14 Add pages (drop files, or "scan with your phone" QR hand-off; the pipeline queue with reading progress and today's allowance 31 of 50). W15 Pages library (by logbook and volume, state per page, reorder, select many). W16 Review desk (the core screen: full detail, see change 6; show one doubtful field selected with its ink highlighted, keyboard hints, entry spanning to next page option, add a missed entry, crop and re-read). W17 Review all: a list of the 6 waiting pages with "Confirm 4 clean" and the 2 that need eyes. W18 First read (New).

### web2.html : "Web: records, aircraft, sharing" (18 figures)
Group "Reading the records": X01 Timeline (decades, zoomable, density, the 1983 to 1991 gap visible, logbook filters, era bands for engine since overhaul). X02 Entry detail (transcribed text, the page beside it, trust level, attachments, linked items it satisfied, print sticker). X03 Search and Ask (one field; result list plus a cited answer to "When was the engine last overhauled?" with page-crop citations). X04 Write a logbook entry (template, fields, sign with an emailed code, sticker preview).
Group "The aircraft": X05 Hours and meters (reading history, ADS-B suggested flights "3 flights totalling about 4.2 h since your last reading", meter replacement, written versus calculated check New). X06 Oil and engine (oil analysis trend chart, burn rate, compression history). X07 Equipment (installed list, AI suggestions from the logs to confirm or reject, links to ADs). X08 Weight and balance (current figures, revision history, stale notice). X09 Documents vault (categories, AROW card, expiry dates). X10 Aircraft details and danger zone (edit, transfer ownership, delete with typed confirmation).
Group "The annual and the records audit": X11 Annual prep (what falls due at the annual, recurring ADs, open squawks, gaps; "share with your IA"). X12 Records gaps and duplicates (suspected gaps, duplicate scans, mis-keyed meter readings with suggested fixes).
Group "Hand-offs": X13 Share hub (audience presets, live record room links with expiry, opens, revoke, QR; people and roles). X14 Record room as the recipient sees it (no account; cover with "as of" date, summary, logbooks, documents; plain statement of gaps). X15 Pre-buy dossier (a typeset document, print layout, light paper regardless of direction theme, citations as footnotes). X16 Maintenance summary (one page, print layout).
Group "Data and account": X17 Import and export (CSV import column mapping step; export zip; scheduled Dropbox and Drive backups with last-run status). X18 Settings (profile, sign-in methods, reminders and lead times, AI reading allowance and own key, MyFlightBook connection, connected apps). Developer and admin screens are out of scope.

### mobile.html : "Phone and tablet" (about 34 phone figures, 3 tablet)
Group "Getting in": M01 Sign in. M02 Hangar. M03 Add an aircraft sheet.
Group "A glance at the aircraft": M04 Home (from index.html). M05 Home, all clear. M06 Home, offline with 3 changes waiting to upload. M07 Lock screen: a reminder that carries the whole answer, plus a small widget (New).
Group "After a flight" (g-flow): M08 Add sheet. M09 Log a flight: photograph the tach (New). M10 Log a flight: confirm the reading, large stepper, oil added presets, one Save. M11 Saved, with what it moved ("Oil change now 7.3 h away").
Group "Something is wrong" (g-flow): M12 Squawk: photo first. M13 Squawk: severity and words (dictation). M14 Squawk detail with "send to mechanic".
Group "Scanning at the hangar" (g-flow): M15 Choose the logbook (adds to the end, "198 pages so far", handwritten toggle). M16 Camera with page edges found and a running count. M17 The queue: on this phone, waiting to upload, being read. M18 Notification: "6 pages are read. 2 need a look."
Group "Review on the phone" (g-flow): M19 Review: the page fills the screen, entry in a bottom drawer. M20 A doubtful field with its ink highlighted and the three outcomes. M21 Page confirmed, next page one swipe away.
Group "What is due": M22 Due list. M23 Item detail with its page. M24 Mark done sheet. M25 VOR check log (the 91.171(d) fields: date, place, bearing error, signature). M26 Pick a date (New). M27 ADs.
Group "The records": M28 Logbooks (books and volumes, pages). M29 Timeline. M30 Entry with its scan. M31 Search and Ask with a cited answer.
Group "Aircraft and documents": M32 Aircraft (hours, equipment, W&B). M33 Documents with the AROW card. 
Group "Sharing": M34 Share: who is it for. M35 Link made: QR, expiry, copy.
Group "Sync and settings": M36 Waiting to upload, with a conflict ("yours" and "theirs"). M37 Settings (appearance, offline copy, storage, sign out).
Group "Tablet": T01 Home in two panes. T02 Review in three panes (pages, scan, fields). T03 Due list with detail.
Phone rules: targets at least 44px; primary actions in thumb reach near the bottom; body text 16px or larger, nothing under 13px; show the bottom tab bar on top-level screens and a back control on pushed screens; show sync state inside the aircraft.

## 6. Direction contracts

### A : Paint Scheme (`.da`, web `a-*`, phone `am-*`)
World: the owner's aircraft exterior. Gloss-white ground; header painted in the aircraft's main stripe colour with the tail number in wide block letters as the logo; the cheatline (second stripe plus gold pinstripe) sits under the header on every screen. The scheme is per aircraft: N734DM is petrol and capri; N4321J uses `.scheme-burgundy`. Show the scheme picker in "Add an aircraft".
Destinations: Today · Logbooks · Maintenance · Aircraft · Share. Phone tabs: Today · Logbooks · (+) · Due · More.
Signature: the horizon. Date-limited items ride the dark stripe, hour-limited items the light stripe, the gold line is now. Use it on Home, the due list (as the forecast), Pick a date, annual prep, and compactly (vertical) on the phone. Do not decorate other screens with stripes.
Type: Archivo (expanded width) for the tail number and headings; Atkinson Hyperlegible Next for everything else; Atkinson Hyperlegible Mono only for meter readings and aligned figures. Sizes are large on purpose: body 17px, never under 14px on web.
Status: round mark plus word, green / amber / red / grey (`a-mark`, `a-st`). `a-kind cal|hrs` tags say which limit applies. Citations are `a-src` pills.
Density: low to medium, one main column up to 1240px, generous white. Panels (`a-panel`) only for a distinct object; most sections are a heading rule plus rows. Organisation is status-first: every screen answers "what do I do next" at the top.

### B : Section Tabs (`.db`, web `b-*`, phone `bm-*`)
World: the tabbed records binder. Dark cover rail with one coloured tab per section, tab height proportional to how much the section holds; the open section's hue floods the board (set `sec-status | sec-books | sec-maint | sec-aircraft | sec-docs | sec-share | sec-setup` on the artboard and mark the matching tab `on`). Work happens on white leaves, usually two: the record on the left, its source page on the right dark mat (`b-leaf mat`).
Destinations (tabs): Status · Logbooks · Maintenance · Aircraft · Documents · Share; Search/ask, Add and account sit at the foot of the rail. Phone: five coloured tabs (Status, Logbooks, Maint., Aircraft, Share; Documents lives under Aircraft) and a square add button.
Signature: the tab rail and board colour, and the record-beside-source spread. Whenever a screen states a fact from the records, the page that proves it is visible or one click away on the right leaf.
Type rule (strict): Literata (`.paper`) is the paper's voice, used only for text transcribed from a scanned page (entry narratives, quotes in Ask answers, citations in documents). Libre Franklin is the app's voice for everything else. One body size (16px) does most of the work; headings hang in the left margin column (`b-hung`).
Status: ink marks and one alarm colour. Current is a black dot; due soon is a vermilion ring; overdue is a solid vermilion slip; unknown is a dashed ring. No green, no amber anywhere. Trust levels use `b-truth` (dotted / filled / diamond).
Density: medium to high, document-like, desk-first. Square corners (3 to 5px). No shadows beyond the leaf edge.

### C : Line Diagram (`.dc`, web `c-*`, phone `cm-*`)
World: an enamel transit diagram of the aircraft's life. Each logbook is a line with its own ink (Airframe blue, Engine magenta, Propeller porcelain, Avionics violet); entries are stops; annuals that signed several books are interchanges; dashed is a stretch with no pages; dotted is the future; rings ahead are what is due. Midnight ground on the web; phone screens use the porcelain day theme (`artboard dc day cm`) by default, with a few in the midnight theme to show both.
Destinations (slim left rail): Network · Due board · Books · Aircraft · Share (+ Settings at the foot). Command field at the top for search and ask. Phone tabs: Network · Due board · (+) · Books · More.
Signature: the diagram and its vocabulary. On Home it is large; on other web screens reuse it as a compact strip (`c-strip`, a 60 to 70px-high simplified SVG of the four lines with today marked and the current selection ringed) so every screen is located in time. Line colours tag everything that belongs to a logbook (`c-line`, `c-src`). Due items are a departures board: one row per stop, fixed columns When · Stop · Line · Left · Status, in arrival order.
Type: Encode Sans only, semi-condensed (`font-stretch:87%`) for labels and table heads, normal width for text. No monospace.
Status: shape plus word in a chip (`c-st`): filled dot "On time", ring "Due soon", square "Overdue", dashed ring "No record". Line colours are never status colours.
Density: high. Rounded capsule controls (the interchange shape). Panels on the midnight ground. Time-first organisation: lists are in date order, and the timeline is the primary way to browse.
SVG diagram rules: lines horizontal at fixed y per logbook, 8px stroke, bends only at 45 degrees, labels horizontal at one size, never rotate text. Copy the classes used in index.html (`ln`, `stop`, `cap`, `ring`, `today`).

## 7. Craft rules (the difference between a design and a template)
- No eyebrow or kicker label above a heading. No ALL-CAPS labels. No decorative numbering. No gradient text, glass, glows, or coloured side-borders on cards. No card grids of icon + heading + text. No nested cards. No hero-metric tiles. No progress rings or sparklines as decoration.
- Standard controls that read as controls: buttons, tabs, inputs, selects, toggles, tables with clear headers. The world lends type, colour, density and its one signature; it never replaces a control with a costume.
- One primary action per view. Destructive actions are quiet and ask first.
- Copy: plain, specific, sentence case, the owner's words. Buttons say what happens ("Confirm page", "Mark done"). Empty and error states say what to do next. No exclamation marks, no "peace of mind", "at a glance", "seamless", "powerful". No em-dash asides, no "not X but Y" constructions, no middle-dot chains longer than three items.
- Status is never colour alone: mark or shape plus a word.
- Numbers people compare line up (tabular figures, right-aligned in tables).
- Contrast: body text at least 4.5:1 against its ground. Use the ink tokens, never invented greys.
- Repeated elements are consistent across screens: same header, same row anatomy, same button sizes, same place for the same thing.
- Each screen should have one clear focal point. If everything is the same weight, cut or demote something.

## 8. Report back
When finished, reply with: the file path; the list of figure ids built; anything on the list you did not build and why; any component you added locally that should move into system.css; and what you verified by screenshot versus what you could not check.
