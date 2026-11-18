# 03 Information architecture (web)

This file defines how the MyTailLog web app is organised in direction D, "Tabbed Binder": the cover rail and its six section tabs, the
sub-tabs inside each section, the rail foot (Search or ask, Add, account), the aircraft switcher, the spine as a second way to move (by
time), global keyboard shortcuts, every route of the new app with the screen it renders and who may see it, a redirect for every route
of today's app, deep-link rules, back behaviour, what the tab counts and flags say and how they are computed, and how the shell adapts
from a 1920px desktop down to a phone-width browser. Screen-level detail (every element, state and string) is in 04-web-screens.md;
component anatomy in 02-components.md; map drawing and map keyboard in 10-line-map.md; shortcuts and focus in 11-accessibility-and-motion.md;
data, derived rules and API in 09-data-and-api.md (authoritative where a field or rule name differs). The phone's navigation is in
05-mobile-architecture.md; this file covers phone-width browsers only.

## Contents

1. [Principles this structure follows](#1-principles-this-structure-follows)
2. [The shell](#2-the-shell)
3. [The rail](#3-the-rail)
4. [Sections and sub-tabs](#4-sections-and-sub-tabs)
5. [Rail foot: Search or ask, Add, account](#5-rail-foot-search-or-ask-add-account)
6. [The aircraft switcher](#6-the-aircraft-switcher)
7. [The spine: navigation by time](#7-the-spine-navigation-by-time)
8. [Global keyboard shortcuts](#8-global-keyboard-shortcuts)
9. [Route table](#9-route-table)
10. [Redirects from today's routes and from app links](#10-redirects-from-todays-routes-and-from-app-links)
11. [Deep links and URL state](#11-deep-links-and-url-state)
12. [Back behaviour and breadcrumbs](#12-back-behaviour-and-breadcrumbs)
13. [Tab counts and flags](#13-tab-counts-and-flags)
14. [Roles and what each can see](#14-roles-and-what-each-can-see)
15. [Responsive behaviour](#15-responsive-behaviour)
16. [Page titles, loading, not found, offline](#16-page-titles-loading-not-found-offline)
17. [Open questions](#17-open-questions)
18. [Components to add](#18-components-to-add)

---

## 1. Principles this structure follows

| # | Rule | Consequence |
|---|---|---|
| 1 | Six destinations per aircraft, not fifteen. | Status, Logbooks, Maintenance, Aircraft, Documents, Share. Today's 15 rail items and 14 hub sub-tabs (web-inventory §2.4) fold into these six and at most five sub-tabs each. |
| 2 | One global Add and one Search or ask. | Every "add" entry point that today lives on a page header (Capture, Upload, Add an entry, Add a reading, Top off oil, Report a squawk, Upload a document) is also reachable from Add. Search and Ask are one field. |
| 3 | Every fact has its page one click away. | Every screen that states a fact from the records has a right leaf (SourceMat) or a PageCite that opens it. |
| 4 | Time is a second axis of navigation. | The Spine sits under every board head and moves the owner by date, from any section, into Logbooks › Map or Status › Plan ahead. |
| 5 | Every view is a URL. | The path names the screen and its subject; the query string names what is selected on it and how it is filtered. Any state can be bookmarked, sent to a co-owner and restored on reload. |
| 6 | No dead ends. | Every screen that today has no nav entry and no way back (web-inventory §2.4: `/start`, `/details`, `/upload`, `/summary`, `/compliance/explore`, `/entries/[entryId]`, `/pages/[pageId]/review`) now belongs to a tab and has a BackLink or a lit sub-tab. |
| 7 | Roles hide what a person cannot do. | A control a role cannot use is not rendered (today some pages show it and fail on submit, web-inventory §4.10). The server still enforces. |

## 2. The shell

Every signed-in screen inside an aircraft has four regions. Sizes are at the 1440px reference width; §15 covers other widths.

| Region | Component (02-components.md) | Size at 1440 × 900 | Content |
|---|---|---|---|
| Rail | Rail §3.1 | 216px wide, full viewport height, fixed | RailPlate, six SectionTabs, RailFoot. |
| Board head | BoardHead §3.9 | full board width, min height 78px (70px on Status) | Board title (type.board-title), SubTabs, board actions at the right (at most one primary). |
| Spine | Spine §4.2 | 52px tall including padding (40px strip), 10px below the board head | The whole life of the aircraft, with a window bracket over what this screen covers (§7). |
| Leaves | Leaves §3.11, Leaf §3.12, SourceMat §3.13 | the rest of the board; 10px gap; board padding 22px left, right and bottom | Usually two leaves: the record on the left (white Leaf), its source page on the right (SourceMat). The split is set per screen in 04-web-screens.md. |

The board shows the open section's colour (`color.section.{status|books|maint|aircraft|docs|share|setup}`); leaves are always white or the
dark mat; the map is never drawn on the coloured board.

Scrolling: the rail is fixed. The board head and the spine stay fixed at the top of the board; each leaf scrolls on its own (02 §3.11).
Below 760px of viewport height the board scrolls as one document instead, and the right leaf stops being sticky.

Outside an aircraft the same shell is used with the reduced rail of §3.5: the hangar, add an aircraft, account settings, import and export,
and the restyled pages kept from today (help, what's new, developer API, admin). Sign in, the record room recipient view, the mechanic link
page, OAuth consent and print previews have no rail (§9).

## 3. The rail

### 3.1 Order, top to bottom

| Order | Element | Behaviour |
|---|---|---|
| 1 | RailPlate (02 §3.2) | Tail number and `chevrons-up-down`; second line "{year} {make} {model}" with " · Demo" or a role suffix (" · Viewer"). Opens the aircraft switcher (§6). |
| 2 | SectionTab × 6 (02 §3.4) | Status, Logbooks, Maintenance, Aircraft, Documents, Share, in that order. |
| 3 | spacer | Pushes the foot down. |
| 4 | RailFoot (02 §3.5) | Search or ask (`/`), Add (`N`), account (initials and short name, e.g. "Dana M."). |

### 3.2 The six section tabs

| Tab | Colour token | Lands on | Line(s) under the label (rules in §13) | Flag |
|---|---|---|---|---|
| Status | color.section.status | `/aircraft/[id]/status` | "1 overdue, 3 soon" | none |
| Logbooks | color.section.books | `/aircraft/[id]/logbooks/map` | "412 pages in 5 books" / "212 entries" | "6 to review" (owner and editors only) |
| Maintenance | color.section.maint | `/aircraft/[id]/maintenance/items` | "11 tracked items" / "2 open squawks" | none |
| Aircraft | color.section.aircraft | `/aircraft/[id]/hours` | "Hours, equipment, W&B" / "{n} to answer" when suggestions wait | none |
| Documents | color.section.docs | `/aircraft/[id]/documents` | "14 in the vault" | none |
| Share | color.section.share | owner: `/aircraft/[id]/share`; others: `/aircraft/[id]/share/dossier` | owner: "1 link live"; others: "Dossier and summary" | none |

The open tab extends to the board edge and its colour continues into the board (02 §3.4 "Open state").

### 3.3 Tab height

Tabs are sized by how much the section holds. The rule (minimum, √n shares of the free rail height, cap) is defined once in 02-components.md
§3.4 "Height rule"; this file only fixes the counts each share uses, which are the counts of §13. At the reference data and a 900px viewport the
result is 58 / 172 / 104 / 78 / 62 / 58px (d-web-status).

### 3.4 Accessibility of the rail

- The rail is `<nav aria-label="Aircraft sections">`; each SectionTab is a link (not an ARIA tab, 11 §4); the open one has `aria-current="page"`.
- Accessible name = label, lines and flag: "Logbooks, 412 pages in 5 books, 212 entries, 6 to review".
- Focus order (11 §4): skip link, RailPlate, tabs, rail foot, board head, spine, sub-tabs, left leaf, right leaf.
- "Skip to the board" is the first focusable element on every page and moves focus to the board title.

### 3.5 The rail outside an aircraft (hangar and account)

| Element | Content |
|---|---|
| RailPlate | "MyTailLog" and the user's `profile.full_name` (or email). Not interactive (02 §3.2). |
| Tab | One tab, "Hangar", `color.section.setup`, line "{n} aircraft". Open on `/hangar` and `/aircraft/new`. |
| Aircraft list | RailAircraftLink (02 §3.6): heading "Aircraft", one link per aircraft to its Status. |
| RailFoot | Same three buttons. On the hangar, Add offers "Add an aircraft" and "Import a backup" only (§5.2). |

Account screens (`/account/*`) opened from inside an aircraft keep that aircraft's plate and tabs (none open) so the owner can go back in one
click; opened from the hangar, they use the hangar rail.

## 4. Sections and sub-tabs

Each section's board has a title (the tab's label unless stated) and up to five SubTabs (02 §3.10; links with aria-current, not ARIA tabs, per 11 §4 and 14-decisions.md A1). The first sub-tab
is where the tab lands. Counts in braces are live (§13). Board actions are right-aligned in the board head; "primary" is the one Button hue
(on-board) action, the rest are on-board secondary.

| Section | Sub-tab (as shown) | Routes that light it | Screens | Board actions |
|---|---|---|---|---|
| Status | What's due | `/status` | W-STATUS-01, W-STATUS-02 situations, W-SETUP-02 | readout "Tach {tach}, read {date}"; More (`ellipsis`: "It's in the shop", "I'm selling {tail}", "Not any more"; owner and editors); primary "Log a flight" (owner and editors) |
| Status | Plan ahead | `/status/plan` | W-STATUS-03 | readout |
| Status | (none lit; BackLink) | `/status/item/[itemKey]` | W-STATUS-04 | primary "Mark done" (owner and editors; "Log a VOR check" for the VOR item, "Record compliance" for ADs, "Renewed" for documents) |
| Status | (none lit) | `/setup` | W-SETUP-01 | "Skip for now" |
| Logbooks | Map | `/logbooks/map`, `/logbooks/list`, `/logbooks/entries/[entryId]` | W-BOOKS-01 to 04, W-BOOKS-12, W-BOOKS-10 | primary "Add pages" (owner and editors); on entry detail "Print sticker", "Write a correction" instead |
| Logbooks | Pages | `/logbooks/pages`, `/logbooks/add`, `/logbooks/first-read` | W-BOOKS-05, 06, 09 | primary "Add pages" (owner and editors; hidden on `/logbooks/add`) |
| Logbooks | Review {n} | `/logbooks/review`, `/logbooks/review/[pageId]` | W-BOOKS-08, W-BOOKS-07 | none |
| Logbooks | (none lit; board title "Write an entry") | `/logbooks/entries/new` | W-BOOKS-11 | "Discard draft" |
| Logbooks | (none lit; board title "Search or ask") | `/ask` | W-ASK-01 | none |
| Maintenance | Tracked items | `/maintenance/items` | W-MAINT-06 | primary "Track an item" (owner and editors) |
| Maintenance | ADs and SBs | `/maintenance/ads`, `/maintenance/ads/find` | W-MAINT-01, W-MAINT-02 | "Find ADs" (owner and editors); primary "Track an AD or SB" (owner and editors) |
| Maintenance | Squawks {n} | `/maintenance/squawks` | W-MAINT-03 | primary "Report a squawk" (all roles) |
| Maintenance | Annual prep | `/maintenance/annual` | W-MAINT-04 | readout "Last annual {date}"; primary "Share with your IA" (owner) |
| Maintenance | Records check {n} | `/maintenance/records-check` | W-MAINT-05 | readout "Checked after every review · last {date}" |
| Aircraft | Hours and engine | `/hours` | W-AIRCRAFT-01 | primary "Add a reading" (owner and editors) |
| Aircraft | Oil analysis | `/oil` | W-AIRCRAFT-02 | "Add oil" (owner and editors); primary "Import a lab report" (owner and editors) |
| Aircraft | Equipment | `/equipment` | W-AIRCRAFT-03 | primary "Add equipment" (owner and editors) |
| Aircraft | W&B | `/weight-balance` | W-AIRCRAFT-04 | primary "Add a revision" (owner and editors) |
| Aircraft | Details | `/details` | W-AIRCRAFT-05 | none |
| Documents | (no sub-tabs) | `/documents` | W-DOCS-01 | primary "Add a document" (owner and editors) |
| Share | Links and people (owner only) | `/share` | W-SHARE-01 | none |
| Share | Pre-buy dossier | `/share/dossier` | W-SHARE-03 | "Share with a buyer" (owner); primary "Print or save PDF" |
| Share | Maintenance summary | `/share/summary` | W-SHARE-04 | "Copy as text"; primary "Print or save PDF" |
| Account (grey board, title "Account") | Settings | `/account/settings` | W-ACCOUNT-02 | readout "Changes save as you make them" |
| Account | Import and export | `/account/data` | W-ACCOUNT-01 | none |

Decisions recorded here (changes from direction B and from the mockups):
- Status has two sub-tabs, "What's due" and "Plan ahead". Plan ahead replaces B's "Forecast" and "Pick a date". The full due list
  (B's Maintenance › Due list) is Status › What's due. Maintenance › Tracked items is where an item's rule is set (W-MAINT-06).
- Item detail (W-STATUS-04) belongs to Status, so a due row and its detail share one section. d-w-item draws it on the Maintenance board;
  this file overrides that. W-MAINT-06 links to it ("Open its history").
- Logbooks opens on Map. The entry list (B's timeline as a list, W-BOOKS-12) is the Map sub-tab's other view, chosen with a Segmented
  "Map | List" in the left leaf; it is also the map's "Show as list" equivalent (10 §10). Entry detail lights Map.
- "Add pages" is a board action, not a sub-tab (d-web-map); its screen lights Pages.
- Records check (W-MAINT-05) merges today's Records gap audit and Duplicates and fixes. Its gap rows open the gap on the map (W-BOOKS-04).
- Aircraft › Details holds transfer and delete (moved from Share, as B decided). Aircraft sub-tab labels follow D ("Hours and engine",
  "Oil analysis"); compressions stay on Oil analysis, oil-change intervals move to Hours and engine (d-w-engine).
- Documents has no sub-tabs; the carry-aboard card and the vault are one screen.

## 5. Rail foot: Search or ask, Add, account

### 5.1 Search or ask

| Property | Value |
|---|---|
| Trigger | The rail button, `/`, or Ctrl+K (Windows, Linux) / Cmd+K (macOS). |
| Result | Navigates to `/aircraft/[id]/ask` and focuses the SearchField (02 §7.4). If already there, focuses it and selects its text. |
| Scope | The current aircraft's confirmed entries, plus documents by title and reference for search. |
| From the hangar | Opens `/aircraft/[lastOpenedId]/ask` (the aircraft this user opened most recently, stored per user; fallback the first in hangar order). With zero aircraft the button is disabled with the tooltip "Add an aircraft first". |
| Offline | Search runs on loaded data; Ask says "Ask needs a connection. Searching still works." |

Search and Ask are one field: typing lists matching entries; Enter on text that reads as a question asks (04 §W-ASK-01 has the rule).

### 5.2 Add (W-ADD-01)

The AddMenu is specified in 02-components.md §3.7 (360px popover, six items, letter keys F, O, S, P, D, W, colour tile of the destination tab,
hidden for viewers). Destinations:

| Item (02 §3.7) | Result |
|---|---|
| Log a flight | Opens the Log a flight dialog (04 §W-ADD-01). |
| Add oil | Opens the same dialog with only the oil fields. |
| Report a squawk | `/maintenance/squawks?panel=new` |
| Add logbook pages | `/logbooks/add` |
| Add a document | `/documents?panel=new` |
| Write a logbook entry | `/logbooks/entries/new` |

Viewers have no Add button (02 §3.5); they report squawks from Maintenance › Squawks, which stays open to every role. On the hangar the menu
holds "Add an aircraft" (`/aircraft/new`) and "Import a backup" (opens the hangar's backup file picker, W-HANGAR-01).

### 5.3 Account

The account button opens the AccountMenu, a popover 280px wide anchored above the button. This is the full list; 02 §3.5 names four of
these items and should take the rest from here.

| Item | Destination | Notes |
|---|---|---|
| Notifications {n} | Opens the NotificationInbox panel (§5.4) | Count of unread; the account button shows an 8px ink dot (not the alarm colour) when n > 0. |
| Settings | `/account/settings` | |
| Import and export | `/account/data?aircraft={current id}` (no parameter on the hangar) | |
| Hangar | `/hangar` | |
| Help | `/help` | |
| What's new | `/whats-new` | Tag "New" when the user has not opened the latest entry. |
| Developer API | `/developers` | |
| Admin | `/admin` | Only when `profile.is_admin`. |
| Sign out | signs out, then `/login` | |

### 5.4 Notification inbox (web)

08-capabilities.md C-NOTIFY-02 puts the in-app inbox in the account menu on the web. "Notifications" opens a NotificationInbox panel: a
popover 400px wide, max height 70vh, anchored to the account button. Data: `GET /api/me/notifications` (09 §4.9). Each row: aircraft tail,
title (type.body-strong), body (type.small, 3 lines max), time ("2 h ago", "Nov 12"), unread dot; clicking a row marks it read and opens its
deep link through the app-link mapping of §10.3. Row actions as buttons when present ("Plan the visit", "Remind me Friday", "Review").
Footer: "Mark all as read", "Notification settings" (`/account/settings#reminders`). Empty: "Nothing new. Reminders and reading updates
appear here for 90 days." Keyboard: Up/Down, Enter, Esc returns focus to the account button.

## 6. The aircraft switcher

W-SWITCH-01, anatomy in 02-components.md §3.3 (popover under the RailPlate). Navigation rules owned here:

| Rule | Value |
|---|---|
| Rows | Every aircraft the user can open, current first with a check; each row shows tail, type, role line and the aircraft's verdict sentence (StatusSnapshot `verdict.text`). |
| Footer | "Hangar" (`/hangar`), "Add an aircraft" (`/aircraft/new`). |
| Switching | Keeps the section and sub-tab when the target has the same route: from `/aircraft/A/maintenance/squawks` to `/aircraft/B/maintenance/squawks`. The query string (selection, filters) is dropped because it belongs to aircraft A. |
| Role fallback | If the target role cannot open that sub-tab (Review as a viewer, Links and people as a non-owner), open the section's landing route for that role. |
| Subject routes | From a route with a subject (`/status/item/…`, `/logbooks/entries/…`, `/logbooks/review/…`), switch to the parent sub-tab's base route. |

## 7. The spine: navigation by time

The Spine (02 §4.2) sits on every in-aircraft board. Geometry, scale and drawing are defined in 10-line-map.md §4 and §8.1 (40px strip, scale break
12 months before today, real pixel size, never stretched); behaviour across screens is defined here and in 08-capabilities.md C-BOOKS-03.

### 7.1 What it draws

- The four books as thin lines (Other is not drawn); gaps dashed; "no pages exist" gaps as a thin solid stretch; the future dotted; today.
- Done interchanges (annuals signed in two or more books), suggested visits (`cap plan`), planned visits (small solid caps), rings ahead for
  overdue and due-soon items, open squawks as filled diamonds and resolved ones as hollow (on W-MAINT-03 only, 08 C-BOOKS-03), unconfirmed
  stops landing (on W-BOOKS-06, 07, 08).
- The window (`win`) bracketing what the screen covers (§7.3).
- Left label: tail number over a line naming the bracket ("1978 to 2027", "whole life", "2005 to 2015", "Sep 3, 2026", "to the annual").
  That line is also the bracket's accessible description.
- Right link: default "Open the map" with `route` icon; per-screen text in §7.3.
- Range: start of life (the earlier of `aircraft.year` and the first confirmed entry) to today + 12 months; on Plan ahead to today + 24 months.

### 7.2 Interactions

| Input | On Logbooks › Map and List | On every other screen |
|---|---|---|
| Hover | Hairline and tooltip with the date under the pointer ("Mar 2011"; ahead of today "Mar 1, 2027"). | Same. |
| Click before today | Recentres the map on that date with a window of ±2 years (`?from=&to=`, replace). | Opens `/logbooks/map?from=…&to=…` (±2 years around the date). |
| Click after today | Opens `/status/plan?date=YYYY-MM-DD` with the marker at that date. | Same. |
| Drag across | Sets the map window to the dragged range (replace). Ranges under 1 year snap to 1 year. | Opens the map with that range (W-BOOKS-03). |
| Drag the window body or its edges | Pans or resizes the map window. | Not draggable. |
| Right link | "Whole life" when zoomed (clears `from` and `to`); hidden when not zoomed. | Per §7.3. |

Keyboard (08 C-BOOKS-03): the spine is one focusable control (`role="group"`, name "Life of N734DM, 1978 to 2027. This screen covers the
next twelve months."). Left and Right move a date cursor by one year (one month after today); Shift with an arrow moves five years (six
months); Home goes to the start of life, End to today; Enter acts as a click at the cursor; Shift+Enter starts a range and a second
Shift+Enter ends it (acts as a drag); Esc clears the cursor.

### 7.3 What the window brackets, per screen

| Screen | Window | Label line | Right link |
|---|---|---|---|
| W-STATUS-01 What's due | today to today + 12 months | "{start year} to {end year}" | Open the map |
| W-STATUS-02 annual month, in the shop | today to today + 60 days | same | Open the map |
| W-SETUP-02 nothing scanned | today to today + 12 months; past drawn as one dashed span "no pages yet" | same | Open the map |
| W-STATUS-03 Plan ahead | today to the marker date, moving live | "{start} to {today + 24 months year}" | Open the map |
| W-STATUS-04 Item detail | the item's drawn history (first completion shown to next due) | "{first year} to {due year}" | Open the map |
| W-MAINT-01 ADs and SBs | the selected AD's compliance span | "{from} to {to}" | Open the map |
| W-MAINT-02 Find ADs, W-MAINT-06 Tracked items, W-AIRCRAFT-05 Details | none | "whole life" | Open the map |
| W-MAINT-03 Squawks | none; squawk diamonds drawn | "squawks marked" | Open the map |
| W-MAINT-04 Annual prep | today to the annual's due date | "to the annual" | Open the map |
| W-MAINT-05 Records check | the selected finding's span | finding's years | Show on the map |
| W-BOOKS-01 Map, W-BOOKS-02 one book | the visible range (whole life unless zoomed); for one book, the book's latest era | "whole life" | hidden |
| W-BOOKS-03 zoomed | the zoom window | "2005 to 2015" | Whole life |
| W-BOOKS-04 gap | the gap | "1983 to 1991" | Whole life |
| W-BOOKS-05 Pages | the selected book or volume span | "{from} to {to}" | Open the map |
| W-BOOKS-06 Add pages | the span the incoming pages land in; hollow stops | "{from} to {to}" | Open the map |
| W-BOOKS-07 Review desk | the page's landing date (one hollow stop) | "{Mon YYYY}" | See it on the map |
| W-BOOKS-08 Review all | the waiting pages' span; hollow stops | "{from} to {to}" | Open the map |
| W-BOOKS-09 First read | the book's span; books not yet in dashed | "1 book in" | Open the map |
| W-BOOKS-10 Entry detail | the stop ±1 month (10 §8.1) | "{Mon D, YYYY}" | Back to the map |
| W-BOOKS-11 Write an entry | today | "today" | Open the map |
| W-BOOKS-12 List | the list's window | same as the map | as the map |
| W-ASK-01 | none; matching stops drawn, others hidden | "{n} matches" | Open on the map |
| W-AIRCRAFT-01 Hours and engine | last engine overhaul to today | "since overhaul" | Open the map |
| W-AIRCRAFT-02 Oil analysis | first sample to today | "{year} to today" | Open the map |
| W-AIRCRAFT-03 Equipment | the selected part's install to removal or today | "{from} to {to}" | Open the map |
| W-AIRCRAFT-04 W&B | the latest revision to today | "since {year}" | Open the map |
| W-DOCS-01 | the selected document's date, or none | "{date}" or "whole life" | Open the map |
| W-SHARE-01 Share hub | whole life | "whole record" | Open the map |
| W-SHARE-03, 04, W-ACCOUNT-01, 02, W-HANGAR-01, 02 | no spine (W-HANGAR-01 cards carry a LifeStrip, 02 §4.3) | | |

## 8. Global keyboard shortcuts

The global set is defined in 11-accessibility-and-motion.md §4; this table repeats it with the routes and adds the navigation-level keys
this file owns. Single-key shortcuts are ignored while focus is in a text input, textarea, select or contenteditable, except where marked;
all can be turned off in Settings › Accessibility (WCAG 2.1.4). `?` opens the ShortcutSheet.

| Keys | Action | Where | Source |
|---|---|---|---|
| `/` | Focus Search or ask (navigates to `/ask`) | app shell | 11 §4 |
| Ctrl+K / Cmd+K | Same as `/`; works inside inputs | app shell | this file |
| `n` | Open the Add menu (owner and editors) | in an aircraft | 11 §4 |
| `?` | Show shortcuts | everywhere | 11 §4 |
| `g` then `s`, `l`, `m`, `a`, `d`, `h` | Go to Status, Logbooks, Maintenance, Aircraft, Documents, Share | in an aircraft | 11 §4 |
| `g` then `t` | Go to the hangar | everywhere | this file |
| Esc | Close the open popover, drawer, panel or dialog (asks first if it has unsaved changes); otherwise clear the selection (drops the selection parameter) | everywhere, inside inputs too | this file, 11 §4 |
| `j` / `k` | Next / previous row in the focused table or list, selecting it so the right leaf follows | due table, ADs, squawks, pages, entries, findings | this file |
| `m` | Mark done for the selected due row or the open item (opens the drawer) | W-STATUS-01, W-STATUS-04 | this file |
| `[` / `]` | Previous / next stop on this line | W-BOOKS-10 (StopStepper, 02 §4.9) | 02 |
| Review desk keys | `j`/`k` field, `a` accept, `e` edit, `x` not on this page, Enter accept and move on, Ctrl/Cmd+Enter confirm entry, Shift+Enter confirm page and next (works in inputs), `[`/`]` previous / next page | W-BOOKS-07 | 11 §4 and d-w-review |
| `+` / `−` / `0` | Zoom in, out, fit | any ScanViewer | 11 §4 |
| Map keys | arrows, Home/End, Page Up/Down, Enter, Shift+Enter, `+`/`−`/`0`, `l` list view, Esc | RouteMap, LineAhead | 10 §10 |

The `g` prefix waits 1.5 s for the second key and shows a KeyHint toast "g…" meanwhile. No Alt combinations are used, so screen-reader and browser keys are untouched.

## 9. Route table

Conventions: `[id]` is `aircraft.id` (uuid). Per-aircraft routes are prefixed `/aircraft/[id]`; the table drops the prefix (section 9.3).
Role columns: O owner, E editor, V viewer, P public. "✓" full, "R" read-only (renders without edit controls), "→ x" redirects for that role,
"–" 404 (no leak of existence, as today). A path names the screen and its subject; selections and filters are query parameters (§11).

### 9.1 Public, auth and kept as is

| Route | Screen | O | E | V | P | Notes |
|---|---|---|---|---|---|---|
| `/` and marketing (`/demo`, `/faq`, `/compare`, `/switch/myfbo`, `/guides/[slug]`, `/ads`, `/ads/[make]/[model]`, `/privacy`, `/account-deletion`) | marketing (restyle only) | ✓ | ✓ | ✓ | ✓ | `/demo`'s CTA points to `/login?mode=create` (today a missing `/signup`). |
| `/login` | W-AUTH-01 | | | | ✓ | `?next=`, `?mode=create`. Signed-in users go to `next` or `/hangar`. |
| `/auth/callback` | route handler | | | | ✓ | Default `next` becomes `/hangar`. |
| `/oauth/consent/[uid]` | OAuth consent (restyle) | ✓ | ✓ | ✓ | | No rail. |
| `/help`, `/whats-new`, `/whats-new/rss.xml`, `/developers/docs` | kept (restyle) | ✓ | ✓ | ✓ | ✓ | Hangar rail when signed in. |
| `/developers` | Developer API (restyle) | ✓ | ✓ | ✓ | | Hangar rail. |
| `/admin` | Admin (restyle) | admins | | | | 404 for others. |
| `/r/[token]` | W-SHARE-02 | | | | ✓ | Record room, no rail, `noindex` (§11.4). |
| `/r/[token]/doc/[docId]`, `/r/[token]/page/[pageId]` | file routes | | | | ✓ | Unchanged. |
| `/m/[token]` | mechanic link page (09 §4.12) | | | | ✓ | No rail, `noindex`; content in 04 §W-MAINT-03 "Mechanic link page". |
| `/print/entry/[entryId]?token=` | sticker print (restyle) | | | | token | Unchanged. |
| `/app/…` | universal links | | | | | Redirect to web routes (§10.3). |

### 9.2 Account level

| Route | Screen | O | E | V | Notes |
|---|---|---|---|---|---|
| `/hangar` | W-HANGAR-01 | ✓ | ✓ | ✓ | Replaces `/dashboard`. |
| `/aircraft/new` | W-HANGAR-02 | ✓ | ✓ | ✓ | Any signed-in user can add an aircraft and becomes its owner. |
| `/account` | → `/account/settings` | | | | |
| `/account/settings` | W-ACCOUNT-02 | ✓ | ✓ | ✓ | Per user. Anchors `#you`, `#signing-in`, `#signing`, `#reminders`, `#accessibility`, `#ai`, `#myflightbook`, `#apps`. |
| `/account/data` | W-ACCOUNT-01 | ✓ | ✓ | ✓ | `?aircraft=[id]`. Import needs owner or editor on that aircraft; export is open to all roles; cloud backups are per user. Anchors `#import`, `#export`, `#backups`. |

### 9.3 Per aircraft (prefix `/aircraft/[id]`)

| Route | Query (selection, filters) | Screen | Tab › sub-tab | O | E | V |
|---|---|---|---|---|---|---|
| (none) | | → `/status` (307) | | | | |
| `/setup` | | W-SETUP-01 | Status (none) | ✓ | ✓ | → `/status` |
| `/status` | `visit`, `filter`, `panel` | W-STATUS-01, W-STATUS-02, W-SETUP-02 (variant chosen by data, §11.3) | Status › What's due | ✓ | ✓ | R |
| `/status/plan` | `date`, `rate`, `visit` | W-STATUS-03 | Status › Plan ahead | ✓ | ✓ | R |
| `/status/item/[itemKey]` | `stop`, `panel` | W-STATUS-04 | Status (none) | ✓ | ✓ | R |
| `/maintenance` | | → `/maintenance/items` | | | | |
| `/maintenance/items` | `item`, `panel` (`new`, `edit`), `provider` | W-MAINT-06 | Maintenance › Tracked items | ✓ | ✓ | R |
| `/maintenance/ads` | `ad`, `panel` (`new`, `edit`, `record`) | W-MAINT-01 | Maintenance › ADs and SBs | ✓ | ✓ | R |
| `/maintenance/ads/find` | `q`, `sel` | W-MAINT-02 | Maintenance › ADs and SBs | ✓ | ✓ | → `/maintenance/ads` |
| `/maintenance/squawks` | `squawk`, `panel` (`new`, `send`, `resolve`) | W-MAINT-03 | Maintenance › Squawks | ✓ | ✓ | ✓ (reports; no resolve, delete or send) |
| `/maintenance/annual` | | W-MAINT-04 | Maintenance › Annual prep | ✓ | ✓ | R |
| `/maintenance/records-check` | `finding`, `panel` (`explain`) | W-MAINT-05 | Maintenance › Records check | ✓ | ✓ | R |
| `/logbooks` | | → `/logbooks/map` | | | | |
| `/logbooks/map` | `stop`, `visit`, `gap`, `book`, `from`, `to`, `q` | W-BOOKS-01 (W-BOOKS-02 with one `book`, W-BOOKS-03 with `from`/`to`, W-BOOKS-04 with `gap`) | Logbooks › Map | ✓ | ✓ | ✓ (gap actions hidden) |
| `/logbooks/list` | `stop`, `book`, `from`, `to`, `q` | W-BOOKS-12 | Logbooks › Map (List view) | ✓ | ✓ | ✓ |
| `/logbooks/entries/[entryId]` | `panel` (`sticker`), `line` | W-BOOKS-10 | Logbooks › Map | ✓ | ✓ | ✓ (no edits) |
| `/logbooks/entries/new` | `book`, `template`, `corrects`, `closes` | W-BOOKS-11 | Logbooks (none) | ✓ | ✓ | – |
| `/logbooks/pages` | `page`, `book`, `vol`, `state` | W-BOOKS-05 | Logbooks › Pages | ✓ | ✓ | R |
| `/logbooks/add` | `book`, `vol`, `capture` | W-BOOKS-06 | Logbooks › Pages | ✓ | ✓ | → `/logbooks/pages` |
| `/logbooks/first-read` | `book` | W-BOOKS-09 | Logbooks › Pages | ✓ | ✓ | R |
| `/logbooks/review` | `batch`, `filter` | W-BOOKS-08 | Logbooks › Review | ✓ | ✓ | → `/logbooks/map` |
| `/logbooks/review/[pageId]` | `entry`, `field`, `panel` (`crop`) | W-BOOKS-07 | Logbooks › Review | ✓ | ✓ | → `/logbooks/pages?page=[pageId]` |
| `/ask` | `q` | W-ASK-01 | Logbooks (board "Search or ask") | ✓ | ✓ | ✓ |
| `/hours` | `panel` (`reading`, `replacement`, `starting`) | W-AIRCRAFT-01 | Aircraft › Hours and engine | ✓ | ✓ | R |
| `/oil` | `sample` | W-AIRCRAFT-02 | Aircraft › Oil analysis | ✓ | ✓ | R |
| `/equipment` | `part`, `proposal`, `panel` (`new`, `edit`, `remove`) | W-AIRCRAFT-03 | Aircraft › Equipment | ✓ | ✓ | R |
| `/weight-balance` | `revision`, `panel` (`new`, `edit`) | W-AIRCRAFT-04 | Aircraft › W&B | ✓ | ✓ | R |
| `/details` | | W-AIRCRAFT-05 | Aircraft › Details | ✓ | R | R |
| `/documents` | `doc`, `panel` (`new`, `edit`) | W-DOCS-01 | Documents | ✓ | ✓ | R |
| `/share` | `room`, `audience` | W-SHARE-01 | Share › Links and people | ✓ | → `/share/dossier` | → `/share/dossier` |
| `/share/dossier` | | W-SHARE-03 | Share › Pre-buy dossier | ✓ | ✓ | ✓ |
| `/share/summary` | | W-SHARE-04 | Share › Maintenance summary | ✓ | ✓ | ✓ |

Identifiers used in paths and parameters (09-data-and-api.md is the source of each):

| Name | Value |
|---|---|
| `[itemKey]` | The due-item key of 09 §3.2: `mx:<maintenance_item.id>`, `ad:<ad_compliance.id>`, `doc:<document.id>`. In a path the colon is written as is (`/status/item/mx:3f…`); it is a legal path character. An `ad:` key renders the AD's item view with "Open in ADs and SBs"; a `doc:` key renders the expiry view with "Open in Documents". |
| `stop` on item detail | `item_completion.id` (09 §2.2). |
| `stop` on the map and list | `log_entry.id` of an entry in the stop (10 §9); the map selects the stop that holds it and lights that entry. |
| `visit` on the map | The interchange id of 09 §4.6. |
| `visit` on Status and Plan ahead | `planned_visit.id`, or a suggestion's `suggestion_key` (09 §3.5) prefixed `sugg:` (as in 09 §4.4). |
| `gap` | `logbook_gap.id` (09 §2.6). |
| `room` | `record_room.id`. `finding`: the Records check finding id (09). `batch`: `scan_batch.id`. Others are table ids. |

## 10. Redirects from today's routes and from app links

Server redirects are 308 for paths that move and keep their meaning. A destination that depends on a fragment (`#…`) is handled by the page
(browsers do not send fragments): the page reads `location.hash` on load and replaces the URL ("client" below). Query strings not listed are dropped.
Keep every redirect for at least 24 months; links in reminder, invitation and setup-tip emails already sent depend on them.

### 10.1 Account level and auth

| Today's route | New route | Kind | Notes |
|---|---|---|---|
| `/dashboard` | `/hangar` | 308 | |
| `/aircraft/enroll` | `/aircraft/new` | 308 | |
| `/profile` | `/account/settings` | 308 | |
| `/profile/credentials` | `/account/settings#signing` | 308 | |
| `/login`, `/auth/callback`, `/oauth/consent/[uid]` and `/decide` | unchanged | – | Callback default becomes `/hangar`. |
| `/developers`, `/developers/docs`, `/admin`, `/help`, `/whats-new`, `/whats-new/rss.xml` | unchanged | – | Restyle only. |
| `/r/[token]` with `?tab=summary`, `?tab=documents`, `?q=` | unchanged | – | |
| `/r/[token]?tab={logbookId}` | `/r/[token]?tab=logbooks&book={type}` | client | No `tab`: opens the first tab, `map`. |
| `/r/[token]/doc/[docId]`, `/r/[token]/page/[pageId]`, `/print/entry/[entryId]` | unchanged | – | |
| marketing routes | unchanged | – | |

### 10.2 Per aircraft (prefix `/aircraft/[id]`)

| Today's route | New route | Kind | Notes |
|---|---|---|---|
| (overview) | `/status` | 307 | Stays a valid "this aircraft's home" link, so 307. |
| `/start` | `/setup` | 308 | |
| `/details`, `/status`, `/documents`, `/equipment`, `/weight-balance`, `/ask`, `/share` | same path | – | `/share` now redirects non-owners to `/share/dossier` instead of 404. |
| `/maintenance` | `/maintenance/items` | 308 | |
| `/maintenance#item-{id}` | `/status/item/mx:{id}` | client | Handled on `/maintenance/items`. |
| `/compliance` | `/maintenance/ads` | 308 | |
| `/compliance#item-{id}` | `/maintenance/ads?ad={id}` | client | Handled on `/maintenance/ads`. |
| `/compliance/explore` | `/maintenance/ads/find` | 308 | |
| `/squawks` | `/maintenance/squawks` | 308 | |
| `/capture` | `/logbooks/add?capture=1` | 308 | `?logbook={id}` becomes `?book={type}`. |
| `/upload` | `/logbooks/add` | 308 | |
| `/pages` | `/logbooks/pages` | 308 | |
| `/pages/[pageId]/review` | `/logbooks/review/[pageId]` | 308 | Viewers then go on to `/logbooks/pages?page=[pageId]`. |
| `/review` | `/logbooks/review` | 308 | |
| `/entries/new` | `/logbooks/entries/new` | 308 | Keeps `?corrects=`. |
| `/entries/[entryId]` | `/logbooks/entries/[entryId]` | 308 | |
| `/meters` | `/hours` | 308 | |
| `/oil-analysis` | `/oil` | 308 | |
| `/timeline` | `/logbooks/map` | 308 | |
| `/timeline?entry={entryId}` | `/logbooks/map?stop={entryId}` | 308 | |
| `/import` | `/account/data?aircraft={id}#import` | 308 | |
| `/export` | `/account/data?aircraft={id}#export` | 308 | |
| `/duplicates`, `/audit` | `/maintenance/records-check` | 308 | |
| `/annual` | `/maintenance/annual` | 308 | |
| `/summary` | `/share/summary` | 308 | |
| `/prebuy` | `/share/dossier` | 308 | |
| `/share?room=Buyer#record-room` | `/share?audience=buyer` | client | The old dossier link; a `room` value that is not a uuid is read as an audience. |
| `/share#delete-aircraft` | `/details#delete` | client | The old hangar link. |

### 10.3 App links opened in a browser

Notifications and emails carry the app's deep links as universal links `https://mytaillog.com/app/…` (09 §4.9). On a phone with the app
installed they open the app; anywhere else the web serves `/app/…` as a 307 redirect to the matching web route:

| App path (after `/app`) | Web route |
|---|---|
| `/aircraft/{id}/status` | `/aircraft/{id}/status` |
| `/aircraft/{id}/status/item/{itemKey}` | `/aircraft/{id}/status/item/{itemKey}` |
| `/aircraft/{id}/status/plan?date=` | `/aircraft/{id}/status/plan?date=` |
| `/aircraft/{id}/status/visit/{visitId or suggestionKey}` | `/aircraft/{id}/status/plan?visit={id or sugg:key}` |
| `/aircraft/{id}/books/map?at=YYYY-MM-DD` | `/aircraft/{id}/logbooks/map?from={at − 2 y}&to={at + 2 y}` |
| `/aircraft/{id}/books/review?batch=` | `/aircraft/{id}/logbooks/review?batch=` |
| `/aircraft/{id}/books/entry/{entryId}` | `/aircraft/{id}/logbooks/entries/{entryId}` |
| `/aircraft/{id}/maint/squawk/{id}` | `/aircraft/{id}/maintenance/squawks?squawk={id}` |
| `/aircraft/{id}/share` | `/aircraft/{id}/share` |
| anything else | `/aircraft/{id}/status`, or `/hangar` when no aircraft id |

## 11. Deep links and URL state

### 11.1 What goes where

| State | Encoded as | History |
|---|---|---|
| Section, sub-tab, and the screen's subject (an item, an entry, a page under review) | path | push |
| What is selected on the screen (stop, visit, gap, row, page, sample, part, revision, document, room, finding) | query parameter (§9.3) | replace when changed on the same screen; push when arriving from another screen |
| Filters and view parameters (`book`, `from`, `to`, `state`, `filter`, `q`, `date`, `rate`, `vol`, `batch`) | query | replace |
| Transient panels (drawers, forms on the right leaf, dialogs) | `panel` | push, so Back closes the panel |
| Focused field on the review desk | `entry`, `field` | replace |
| Scroll per leaf, ScanViewer zoom, last Map or List choice, SourceMat drawer open (§15), Plan ahead's last date per aircraft (08 C-PLAN-01) | sessionStorage or localStorage in try/catch | n/a |

Clicking through forty stops must not take forty presses of Back to leave the map, so selections replace; a drawer behaves like a page,
so it pushes.

### 11.2 Query parameters

| Param | Values | Used on |
|---|---|---|
| `book` | `airframe`, `engine`, `prop`, `avionics`, `other` (comma-separated for several) | map, list, pages, add pages, first read, interchange tab |
| `vol` | volume id (09 §4.6) | pages, add pages |
| `from`, `to` | `YYYY` or `YYYY-MM` | map, list |
| `stop`, `visit`, `gap` | §9.3 | map, list, item detail, Status, Plan ahead, record room |
| `q` | text | list, ask, find ADs, map highlight, record room |
| `filter` | `overdue`, `due_soon`, `current`, `no_record` (comma-separated) on Status; `waiting`, `all` on Review | Status, Review all |
| `state` | `review`, `confirmed`, `reading`, `failed` | pages |
| `date`, `rate` | `YYYY-MM-DD`; hours per week, 0 to 60 in 0.5 steps | plan ahead |
| `entry`, `field` | entry id, field name | review desk |
| `audience` | `ia`, `buyer`, `insurer`, `people` | share hub |
| `aircraft` | aircraft id | account data |
| `capture` | `1` | add pages |
| `line` | book type | entry detail (which line the StopStepper walks for an interchange) |
| `mode`, `next` | `create`; same-origin relative path | login |
| `panel` | per screen (§9.3) | any |
| object selectors | `item`, `ad`, `squawk`, `finding`, `page`, `sample`, `part`, `proposal`, `revision`, `doc`, `room`, `sel`, `provider` | per §9.3 |

Unknown or malformed values are dropped with `router.replace`; they never produce an error page.

### 11.3 One route, several screens

`/status` renders the situation of 09 §3.6 (`StatusSnapshot.situation`), in its precedence: `setup` (W-SETUP-02), `in_shop`, `preparing_sale`,
`annual_month`, `attention` (W-STATUS-01), `all_clear` (the variants are W-STATUS-02). Additionally, an aircraft that is status-ready but has
no confirmed logbook entries uses W-SETUP-02's layout with the `attention` or `all_clear` verdict (the d-w-new case). The situation is not in
the URL: the same link always shows the aircraft as it is now.

### 11.4 Record room (recipient side)

| URL | Shows |
|---|---|
| `/r/[token]` | The room's cover tab (`record_room.cover`, default `map`). |
| `/r/[token]?tab=map&stop=[entryId]` | Map with a stop selected; its page only when scans are included, otherwise the entry text. |
| `/r/[token]?tab=summary` | Summary. |
| `/r/[token]?tab=logbooks&book=engine&q=overhaul` | One logbook, searched. |
| `/r/[token]?tab=documents` | Documents. |

A `stop` for an entry that is unconfirmed or outside the room's scope renders the tab without a selection, with no hint that it exists.

### 11.5 Deleted or changed objects

A link to a deleted object renders the base route with a quiet notice at the top of the left leaf: "That {entry | page | squawk | document |
item | link} was deleted." and, when the change log has it, "{name} deleted it on {date}." A suggested visit whose key no longer exists (its
items or week changed) falls back to the plan with "That suggested visit has changed. Here is the plan as it stands." A gap that is now
`filled` shows the map with "That gap has been filled." A map interchange id that no longer exists shows "That visit's entries have changed."

## 12. Back behaviour and breadcrumbs

The binder uses no breadcrumb trail. Position is carried by the open tab, the lit sub-tab and the spine's window. Screens one level below a
sub-tab show a BackLink as the first line of the left leaf (type.small 14px/600, `chevron-left`, `color.section-ink.{section}`).

| Screen | BackLink label | Target |
|---|---|---|
| W-STATUS-04 Item detail | "All tracked items" when the referrer is W-MAINT-06; "Plan ahead" from W-STATUS-03; "Annual prep" from W-MAINT-04; otherwise "What's due" | the referrer |
| W-MAINT-02 Find ADs | "ADs and SBs" | `/maintenance/ads` |
| W-BOOKS-07 Review desk | "All {n} waiting" | `/logbooks/review` |
| W-BOOKS-09 First read | "Pages" | `/logbooks/pages` |
| W-BOOKS-10 Entry detail | "Back to the map" / "Back to the list" / "Back to search" / "Back to {item label}" / "Back to the review desk" | the referrer, default the map with `?stop=` |
| W-BOOKS-11 Write an entry | "Back to {referrer}" | the referrer, default `/logbooks/map` |
| W-SETUP-01 | none; "Skip for now" | `/status` |
| W-SHARE-03, 04 previews | "Back to Share" | `/share` (owner) or the other print preview |

Rules:
1. The referrer is tracked in an in-memory navigation stack for the browser tab (`{path, screen, label}`). BackLink calls `history.back()`
   when the previous entry is its target; otherwise it navigates (push) to the target's canonical URL. A deep link opened fresh has no stack and
   uses the default target.
2. Browser Back follows §11.1: it closes a panel first, then leaves the screen; it never steps through selections made on one screen.
3. Leaving with unsaved edits (an open form with changed fields, an unsent squawk, a review field in edit) opens ConfirmDialog (02 §12):
   "Leave without saving? Your changes to {thing} will be lost." with "Keep editing" (focused) and "Leave". Autosaved drafts (Write an entry) do not ask.
4. StopStepper (`[` and `]`) replaces the URL: walking a line is not navigation.

## 13. Tab counts and flags

All counts come from confirmed data only (product rule: unconfirmed readings never change what is due). Status, review and squawk counts
come from `StatusSnapshot.counts` (09 §4.3); the others need one small call, `GET /api/aircraft/{id}/rail` (to be added to 09, see §17), returning
`{pages, booksWithPages, confirmedEntries, trackedItems, appliedAds, equipment, suggestionsWaiting, documents, liveLinks, people}`. Counts refresh
after every write by the current user and when the browser tab regains focus if older than 60 s.

| Tab | Text | Computation | Zero and edge cases |
|---|---|---|---|
| Status | "{o} overdue, {s} soon" | `counts.overdue`, `counts.dueSoon` over the same items as the W-STATUS-01 table (maintenance items, recurring and open ADs, tracked document expiries; squawks excluded). | `o` = 0: "{s} due soon". Both 0: "Next: {label}, {short date}" for the earliest `firstDate` ("Next: ELT battery, Feb 28"). No items: "Nothing tracked yet". `no_record` items are not counted here. |
| Logbooks | "{pages} pages in {books} books" / "{entries} entries" | all pages; logbooks with at least one page; confirmed entries | No pages: "No pages yet" / "Add the first book". One book: "in 1 book". |
| Logbooks flag | "{n} to review" | `counts.pagesToReview`: pages read and holding at least one unconfirmed entry | Hidden when 0 and for viewers. While `counts.pagesBeingRead` > 0 and n = 0: no flag, line 3 "{r} being read". |
| Maintenance | "{t} tracked items" / "{q} open squawks" | `t` = maintenance items + ADs with status open, complied or previously complied; `q` = `counts.openSquawks` | `q` = 0: "No open squawks". `t` = 0: "Nothing tracked yet". |
| Squawks sub-tab | "Squawks {q}" | as above | No number when 0. |
| Records check sub-tab | "Records check {f}" | open findings (not dismissed, not explained) | No number when 0. |
| Review sub-tab | "Review {n}" | as the Logbooks flag | No number when 0. |
| Aircraft | "Hours, equipment, W&B" / "{n} to answer" | pending equipment proposals + an undecided ADS-B suggestion + undismissed written-versus-calculated disagreements | Line 2 hidden when 0 and for viewers. |
| Documents | "{d} in the vault" | documents | 0: "Nothing filed yet". |
| Share | "{l} link live" / "{l} links live" | record rooms neither revoked nor expired | 0: "No links live". Editors and viewers: "Dossier and summary". |

The flag (02 §3.4, `color.alarm`) is used only for the Logbooks review count, so the alarm colour on the rail keeps one meaning: pages
you uploaded are waiting for you. Overdue items are named in the Status tab's text.

## 14. Roles and what each can see

Roles: owner (`aircraft.owner_id`), editor and viewer (`aircraft_share.role`). The demo aircraft is a viewer share for everyone.

| Capability | Owner | Editor | Viewer |
|---|---|---|---|
| Six tabs | yes | yes (Share: dossier and summary) | yes (Share: dossier and summary) |
| Add button | yes | yes | no |
| Mark done, track items and ADs, edit rules, book visits, set the situation | yes | yes | no |
| Add pages, review, confirm, delete pages and entries | yes | yes | no (Pages read-only, Review hidden) |
| Write and sign an entry | yes | yes | no |
| Report a squawk | yes | yes | yes |
| Resolve, reopen, delete, send a squawk | yes | yes | no |
| Log a flight, add oil, readings, equipment, W&B, documents | yes | yes | no |
| Edit aircraft details | yes | no | no |
| Transfer, delete the aircraft | yes | no | no |
| Record room links, people and roles | yes | no | no |
| Import a CSV into the aircraft | yes | yes | no |
| Export, download a backup, print summary and dossier | yes | yes | yes |
| Ask (uses the asker's AI allowance) | yes | yes | yes |
| Remove a shared aircraft from my hangar | n/a | yes | yes |

Where removing controls would leave a region empty, it shows one line instead: "You can view this aircraft. Ask {owner name} to make you an
editor to {verb}." A write rejected by the server shows "You don't have edit access to this aircraft." inline at the control.

## 15. Responsive behaviour

The bands are viewport widths and take precedence over the container-width rule of 02 §3.11 for the web shell (02 allows 04 to override).

| Band | Viewport | Rail | Leaves | Right leaf (source) | Spine | Bottom tabs |
|---|---|---|---|---|---|---|
| Desktop | 1280 and wider | 216px, full lines | Two leaves at the screen's split. At 1280 to 1439, any split wider than `1.62fr 1fr` is drawn as `1.62fr 1fr` so the right leaf keeps about 380px. From 1680, the right leaf is capped at 640px and the left takes the rest; prose keeps a 72ch measure. | inline | full | none |
| Small laptop | 1024 to 1279 | 184px; tab lines truncate to one line with an ellipsis | One leaf fills the board. | A Drawer (02 §3.15) with mat fill sliding over the left leaf from the right: width `min(560px, 92vw)` capped at 50% of the board, full height below the spine; close button and Esc. Opened by any PageCite, "Open page" or "Show page"; a Button "Show page" sits at the right of the board head. The review desk keeps two leaves at `1fr 1fr` in this band (the scan is the work). | full | none |
| Tablet-width browser | 768 to 1023 | 72px icon rail: each SectionTab a 72 × 56px colour block with its SectionIcon (02 §9.8) and a 12px label; the Logbooks flag becomes a count badge; RailPlate shows the tail only; RailFoot icons with tooltips | One leaf; board padding 12px; board title 24px; SubTabs scroll horizontally with the active one in view. | Drawer as above, width `min(560px, 92vw)`. The review desk stacks the page above the fields. | full; the label column hides and the tail moves into the board head | none |
| Phone-width browser | below 768 | none | Phone layout: PhoneHeader (02 §9.1) in the section colour with the tail, "Online", Search or ask icon and the account avatar; the board title and SubTabs as a scrolling strip; one PhoneLeaf. | A pushed full-screen view with "Back to {screen}", opened from a row's PageCite or "Open page". | hidden | PhoneTabBar (02 §9.4): Status, Logbooks, Maint., Aircraft, Share; AddButton above it (owner and editors) |

In every band:
- The map is horizontal from 768 up; below 768 it is the vertical map (10 §8.4; same drawing as M-BOOKS-01), and a tapped stop opens a
  BottomSheet as on M-BOOKS-02 instead of the right leaf.
- The line ahead is horizontal in every band; below 768 it uses the phone size of 10 §8.3.
- Phone-width: Documents has no bottom tab; `/documents` opens the Aircraft tab, whose sub-tab strip gains a "Documents" item at the end below 768 only.
- Phone-width tables collapse to two-line rows (DueRow and EntryRow phone anatomy, 02 §5.8 and §5.9).
- Phone-width: keyboard shortcuts are off; hover-only affordances have tap equivalents.
- Targets: 44 × 44px below 1024; from 1024 at least 24 × 24 with 8px spacing, and 40 × 40 for primary actions, rail tabs and table row actions (11 §3, 14-decisions.md A8).
- Print: rail, board head, spine and drawers are hidden; the left leaf prints full width on light paper.
- The source Drawer's open state (768 to 1279) persists per browser in localStorage (try/catch; default closed). Selecting a row updates its
  contents whether open or not.

## 16. Page titles, loading, not found, offline

| Topic | Rule |
|---|---|
| Document title | `{Screen title} · {tail} · MyTailLog` inside an aircraft ("Plan ahead · N734DM · MyTailLog"); `{Screen title} · MyTailLog` outside; record room "{tail}, records shared by {owner name}". A selection appends its object: "Squawk: Left brake feels soft · N734DM · MyTailLog". |
| Loading | Every route has a `loading.tsx` that renders the shell (rail, board head with title and sub-tabs, a grey four-line spine) and Skeleton leaves (02 §8.3). After 3 s a line "Still loading {thing}." appears. |
| Not found and no access | One `not-found.tsx`: board `color.section.setup`, title "Not found", text "There is nothing at this address, or you don't have access to it." and Buttons "Go to the hangar" and, inside an aircraft the user can open, "Go to {tail}". |
| Errors | An `error.tsx` per section keeps the rail usable: "This part of {tail} could not be loaded." + "Try again". |
| Offline | When the browser is offline or a request fails for network reasons, an OfflineStrip under the board head reads "You're offline. What is loaded stays readable; changes can't be saved until you reconnect." Write controls are disabled with that reason as tooltip. Exception: pages added on W-BOOKS-06 queue on the device and upload later, as today. |
| Announcements | Admin announcements show as a dismissible Well at the top of the left leaf on Status and the hangar only. |
| Footer note | Today's per-page footer ("Index, not the record…") is removed. The boundary is said once per context where it matters (12-copy-and-voice.md). |

## 17. Open questions

1. Item detail under Status overrides d-w-item's Maintenance board. Confirm (the phone's M-STATUS-05 is under Status, which agrees).
2. 09 needs a `GET /api/aircraft/{id}/rail` call (or more fields in `StatusSnapshot.counts`) for the non-status tab counts (§13).
3. Clicking the spine after today opens Plan ahead at that date; 08 C-BOOKS-03 and 10 §8.1 say every click opens the map. The map shows only a
   year ahead, so Plan ahead answers that click better. Lead to confirm.
4. 02 §3.5 lists four account-menu items; this file has nine plus the inbox (§5.3).
5. Viewers may open Logbooks › Pages read-only, and editors and viewers see the dossier and summary in the Share tab. Both widen today's access.
6. Cross-aircraft search from the hangar is not specified; Search or ask opens the last-opened aircraft.
7. The responsive bands (§15) override 02 §3.11's container thresholds for the web shell; 02 should point here.

## 18. Components to add

| Component | Purpose |
|---|---|
| AccountMenu | Popover from the account button (§5.3). |
| NotificationInbox | Web inbox panel opened from the account menu (§5.4). |
| BackLink | One-line link back to the parent screen (§12). |
| ShortcutSheet | Dialog listing keyboard shortcuts, opened with `?` (§8; content in 11 §4). |
| OfflineStrip | Quiet offline notice under the board head on the web (§16); the web counterpart of the phone's OfflineBanner. |
| IconRail | The 72px rail of the tablet-width band (§15). |
