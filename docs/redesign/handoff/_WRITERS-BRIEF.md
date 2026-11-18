# Writers' brief: MyTailLog direction D handoff package

You are writing part of a handoff package that a coding agent will use to implement the MyTailLog redesign
(direction D, "Tabbed Binder") on the web (Next.js) and as native iOS (SwiftUI) and Android (Jetpack Compose) apps.
The reader is a capable engineer-agent with no access to this conversation. It will build exactly what the documents say, so:
be complete, concrete and unambiguous. Prefer numbers, states, rules, copy strings and acceptance criteria over adjectives.
If something is a decision, state it as a decision. If something is open, put it in an "Open questions" list at the end of your file.

## 1. Sources (read what your part needs)
Repo root: the repository root. Proposal: `docs\redesign\`.
- Direction D (the chosen design): `docs\redesign\d\index.html` (concept, home screens), `d\web.html` (20 web screens), `d\mobile.html`
  (19 phone + 3 tablet), `d\system.css` (map vocabulary, imports B).
- Direction B (D's base; every screen D did not redraw is B's screen plus the spine): `docs\redesign\b\index.html`, `b\web1.html`,
  `b\web2.html`, `b\mobile.html`, `b\system.css`.
- Mockup briefs (data, rules, screen intents): `docs\redesign\research\mockup-brief.md` (sections 2, 3, 4, 5, 6-B, 7) and `mockup-brief-d.md`.
- Current product: `docs\redesign\research\web-inventory.md` (every current web route, field, action), `mobile-inventory.md`,
  `docs-digest.md` (capabilities, rules, backlog, demo data). Code: `apps\web\src`, `apps\mobile\src`, `supabase\migrations`, `packages\`.
- Research: `docs\redesign\research\competitors-ga.md`, `competitors-adjacent.md`. Analysis page: `docs\redesign\analysis.html`.
- Product truth: `PRODUCT.md`, `README.md`, `SECURITY.md` at repo root.
To look at a mockup figure: `docs\redesign\research\shot.ps1 -Page "d/web.html" -Out "<name>" -W 1440 -H 900 -Query "only=<figure-id>&bare=1&open=1"`
(PowerShell; it prints the PNG path; open it with Read). Phone figures: `-W 1500 -H 1000 -Query "only=<id1>,<id2>"`. Figure ids are the `id`
attributes of `<figure>` elements. Reading the HTML source is usually enough; screenshot when layout matters.

## 2. The package (files and owners)
All in `docs\redesign\handoff\`. Write ONLY your own files.
| File | Owner |
|---|---|
| README.md, 00-product-principles.md, 01-design-tokens.md, tokens.json, 10-line-map.md, 11-accessibility-and-motion.md, 12-copy-and-voice.md, 13-build-plan.md | lead |
| 02-components.md | components writer |
| 03-information-architecture.md, 04-web-screens.md | web writer |
| 05-mobile-architecture.md, 06-mobile-screens.md | mobile writer |
| 07-flows.md, 08-capabilities.md, 09-data-and-api.md | flows and data writer |
Cross-reference other files by name and section (e.g. "see 10-line-map.md §4 Scales"). Do not duplicate long content another file owns.

## 3. Shared vocabulary (use these names exactly)
### Tokens (defined in 01-design-tokens.md; the CSS custom properties in b/system.css and d/system.css map 1:1)
color.cover (#17191e), color.cover-2, color.on-cover, color.on-cover-2, color.leaf (#ffffff), color.leaf-2, color.ink, color.ink-2, color.ink-3,
color.rule, color.rule-2, color.section.{status|books|maint|aircraft|docs|share|setup}, color.section-ink.{…}, color.on-section.{…},
color.alarm (#dd3418), color.alarm-bg, color.line.{airframe|engine|propeller|avionics|other}.
font.app = Libre Franklin (the app's voice). font.paper = Literata (only text transcribed from a scanned page).
Type roles: type.board-title, type.lede, type.heading, type.body, type.body-strong, type.small, type.caption, type.label, type.paper, type.paper-small, type.numeric (tabular figures).
Space: space.1…space.8 (4px base). Radius: radius.s (3px leaves), radius.m (4px controls), radius.l (5px tabs), radius.pill (phone sheets use platform defaults).
### Components (specified in 02-components.md)
Rail, RailPlate (aircraft switcher), SectionTab, RailFoot (Search-or-ask, Add, Account), Board, BoardHead, SubTabs, Spine, Leaves, Leaf,
SourceMat (the dark mat holding a scanned page), ScanViewer (page image with ink highlight, zoom, crop), HungSection (heading in the margin column),
Verdict (the opening sentence), DueTable and DueRow, StatusMark (current / due soon / overdue / no record / advisory), TrustMark (read by AI /
confirmed by you / signed by a mechanic), PageCite (citation to a logbook page), LineChip (logbook ink tag), RouteMap, LineAhead, DateScrubber,
VisitCapsule (suggested or planned shop visit), MapLegend, Button (primary, secondary, hue, on-board, on-mat, alarm, quiet; sizes m and s),
Field, TextInput, PaperInput, Select, Segmented, Toggle, Checkbox, KeyHint, AlarmSlip, Well, KeyValueList, CoverageBar, Toast, EmptyState,
QueueRow, ReviewField, Stepper, PhoneTabBar (five coloured tabs), PhoneHeader, PhoneLeaf, AddButton (phone square FAB), BottomSheet, Widget.
If you need a component not on this list, name it in PascalCase, define it in your file, and list it under "Components to add" at the end.
### Screen IDs (canonical; every file uses these)
Web (figure ids of the mockups in brackets; d = d/*.html, b = b/*.html):
- W-AUTH-01 Sign in [b-w-signin] · W-HANGAR-01 Hangar [d-w-hangar] · W-HANGAR-02 Add an aircraft [b-w-add] · W-SETUP-01 First-session setup [b-w-setup] · W-SETUP-02 New aircraft, nothing scanned [d-w-new]
- Status tab: W-STATUS-01 What's due, the home [d-web-status in d/index.html] · W-STATUS-02 Home situations: annual month [d-w-annual], all clear [b-w-clear], in the shop, preparing a sale · W-STATUS-03 Plan ahead [d-w-plan] · W-STATUS-04 Item detail with mark-done drawer [d-w-item, b-w-item]
- Maintenance tab: W-MAINT-01 ADs and SBs [d-w-ads] · W-MAINT-02 Find ADs [b-w-findad] · W-MAINT-03 Squawks [d-w-squawks] · W-MAINT-04 Annual prep [d-w-annualprep] · W-MAINT-05 Records check: gaps, duplicates, mis-keyed readings [b web2 audit figure] · W-MAINT-06 Tracked items setup (edit intervals, add custom item)
- Logbooks tab: W-BOOKS-01 Map [d-web-map in d/index.html] · W-BOOKS-02 Map, one book [d-w-map-engine] · W-BOOKS-03 Map, decade zoom [d-w-map-decade] · W-BOOKS-04 Gap selected [d-w-map-gap] · W-BOOKS-05 Pages library [b-w-pages] · W-BOOKS-06 Add pages and the reading queue [d-w-queue, b-w-addpages] · W-BOOKS-07 Review desk [d-w-review] · W-BOOKS-08 Review all [b-w-reviewall] · W-BOOKS-09 First read [d-w-firstread] · W-BOOKS-10 Entry detail [d-w-entry] · W-BOOKS-11 Write a logbook entry [b web2 write figure] · W-BOOKS-12 List view of entries (B's timeline as a list) [b web2 timeline figure]
- Global: W-ASK-01 Search and Ask [d-w-ask] · W-ADD-01 Add menu · W-SWITCH-01 Aircraft switcher
- Aircraft tab: W-AIRCRAFT-01 Hours and meters [d-w-engine, b web2 hours] · W-AIRCRAFT-02 Oil and engine health [b web2 oil] · W-AIRCRAFT-03 Equipment [b web2 equipment] · W-AIRCRAFT-04 Weight and balance [b web2 wb] · W-AIRCRAFT-05 Aircraft details and danger zone [b web2 details]
- Documents tab: W-DOCS-01 Documents vault and carry-aboard card [b web2 docs]
- Share tab: W-SHARE-01 Share hub [d-w-share] · W-SHARE-02 Record room, recipient view [d-w-room] · W-SHARE-03 Pre-buy dossier [d-w-dossier] · W-SHARE-04 Maintenance summary [b web2 summary]
- Account: W-ACCOUNT-01 Import and export, backups [b web2 data] · W-ACCOUNT-02 Settings [b web2 settings]
- Kept from today with new tokens only: developer portal, OAuth consent, admin, marketing site (out of scope for redesign; restyle only).
Phone (iOS and Android): M-AUTH-01 Sign in · M-HANGAR-01 Hangar · M-HANGAR-02 Add an aircraft · M-STATUS-01 Status home [d-m-status] · M-STATUS-02 Home situations: all clear, offline with changes waiting [b-m-home-clear, b-m-home-offline] · M-STATUS-03 Plan ahead [d-m-plan] · M-STATUS-04 Suggested visit [d-m-suggest] · M-STATUS-05 Item detail [d-m-item] · M-STATUS-06 Mark done [b-m-mark-done] · M-STATUS-07 VOR check log [b-m-vor] · M-MAINT-01 ADs [b-m-ads] · M-MAINT-02 Squawk detail [b-m-squawk-detail] · M-MAINT-03 New squawk: photo then words [b-m-squawk-photo, b-m-squawk-words] · M-BOOKS-01 Map [d-m-map] · M-BOOKS-02 Stop sheet [d-m-stop] · M-BOOKS-03 Visit cards [d-m-visit] · M-BOOKS-04 Gap [d-m-gap] · M-BOOKS-05 One book [d-m-engine] · M-BOOKS-06 Books and pages [b-m-books] · M-BOOKS-07 Entry [b-m-entry] · M-SCAN-01 Choose the logbook [b-m-scan-book] · M-SCAN-02 Camera [d-m-camera] · M-SCAN-03 Queue [d-m-queue] · M-SCAN-04 Pages-read notification [d-m-read] · M-REVIEW-01 Review a page [d-m-review] · M-REVIEW-02 Doubtful field [b-m-review-doubt] · M-REVIEW-03 Next page [b-m-review-next] · M-FLIGHT-01 Add sheet [b-m-add] · M-FLIGHT-02 Photograph the tach [b-m-tach-photo] · M-FLIGHT-03 Confirm the flight [d-m-flight] · M-FLIGHT-04 Saved [d-m-saved] · M-ASK-01 Search and Ask [d-m-ask] · M-AIRCRAFT-01 Aircraft [b-m-aircraft] · M-DOCS-01 Documents and carry-aboard [b-m-docs] · M-SHARE-01 Who is it for [d-m-share] · M-SHARE-02 Link made [d-m-link] · M-SYS-01 Waiting to upload, conflict [b-m-pending] · M-SYS-02 Settings [b-m-settings] · M-SYS-03 Lock screen, widget, notifications [d-m-lock, b-m-lock]
Tablet: T-STATUS-01 Status two panes [d-t-status] · T-STATUS-02 Plan ahead [d-t-plan] · T-BOOKS-01 Map with pages [d-t-map] · T-REVIEW-01 Review three panes [b-t-review]

## 4. Product rules every document must respect
- The paper logbooks are the legal record (14 CFR 91.417). The app is an index and decision support. Never use "airworthy", "legal to fly",
  "grounded", "compliant" as an app verdict. Say what the records show.
- Unconfirmed AI readings never change what is due, forecasts, reminders, shares or exports of status. Three trust levels everywhere:
  read by AI, confirmed by you, signed by a mechanic.
- Hours limits project to "about <date>" from recent use and never override a calendar limit; the earlier of the two is named "first".
- Calendar-month rule for 91.409/91.411/91.413/91.207 items (due at the end of the month).
- Offline first on mobile: everything works offline except AI reading, Ask, enrolling an aircraft and backups; changes queue and sync; conflicts are never silent.
- Free and open source (MIT); daily shared AI reading allowance (50 pages), optional own key.
- Roles: owner, editor, viewer. Record room links: no account, read-only, confirmed entries only, expiry, revoke, view count.

## 5. Style of your documents
Markdown. Start with a one-paragraph summary and a table of contents. Use tables for specs. For every screen or component give:
purpose, entry points, layout (regions top to bottom / left to right with sizes), content and data bindings (field names from the data model),
every state (loading, empty, error, offline, permission-limited for viewer role, unconfirmed data present), every interaction and its result,
copy strings (exact, sentence case), accessibility notes, and acceptance criteria as a checklist. Reference the mockup figure id.
Plain, specific language. No marketing words. No emoji.

## 6. Report back
Reply with: the files you wrote, their line counts, anything you could not specify and why, and decisions you made that the lead should
check for consistency with the other files.
