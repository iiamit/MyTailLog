# 04 Web screens

This file specifies every web screen of the MyTailLog redesign, direction D ("Tabbed Binder"), using the canonical screen IDs. For each
screen it gives the purpose, how the owner gets there, the layout regions with sizes at the 1440 × 900 reference, every element with its
data binding, every state, every interaction and its result, exact copy, role differences, what the spine brackets, and acceptance
criteria. Screens D redrew follow D's mockup; screens D did not redraw start from B's mockup with the spine added and D's contract applied
(Status holds the due list, Plan ahead replaces Forecast and Pick a date, Logbooks opens on Map). The file ends with a table that maps every
capability of today's web app (web-inventory.md §3 and §4) to the screen that now holds it. Routes, tabs, shortcuts and responsive rules
are in 03-information-architecture.md; components in 02-components.md; map drawing in 10-line-map.md; copy rules in 12-copy-and-voice.md;
data names in 09-data-and-api.md (authoritative where this file disagrees).

## Contents

- [0. Conventions used in every screen spec](#0-conventions-used-in-every-screen-spec)
- Getting in: [W-AUTH-01](#w-auth-01-sign-in) · [W-HANGAR-01](#w-hangar-01-hangar) · [W-HANGAR-02](#w-hangar-02-add-an-aircraft) · [W-SETUP-01](#w-setup-01-first-session-setup) · [W-SETUP-02](#w-setup-02-new-aircraft-nothing-scanned)
- Status: [W-STATUS-01](#w-status-01-whats-due-the-home) · [W-STATUS-02](#w-status-02-home-situations) · [W-STATUS-03](#w-status-03-plan-ahead) · [W-STATUS-04](#w-status-04-item-detail-with-mark-done-drawer)
- Maintenance: [W-MAINT-01](#w-maint-01-ads-and-sbs) · [W-MAINT-02](#w-maint-02-find-ads) · [W-MAINT-03](#w-maint-03-squawks) · [W-MAINT-04](#w-maint-04-annual-prep) · [W-MAINT-05](#w-maint-05-records-check) · [W-MAINT-06](#w-maint-06-tracked-items-setup)
- Logbooks: [W-BOOKS-01](#w-books-01-map) · [W-BOOKS-02](#w-books-02-map-one-book) · [W-BOOKS-03](#w-books-03-map-decade-zoom) · [W-BOOKS-04](#w-books-04-gap-selected) · [W-BOOKS-05](#w-books-05-pages-library) · [W-BOOKS-06](#w-books-06-add-pages-and-the-reading-queue) · [W-BOOKS-07](#w-books-07-review-desk) · [W-BOOKS-08](#w-books-08-review-all) · [W-BOOKS-09](#w-books-09-first-read) · [W-BOOKS-10](#w-books-10-entry-detail) · [W-BOOKS-11](#w-books-11-write-a-logbook-entry) · [W-BOOKS-12](#w-books-12-list-view-of-entries)
- Global: [W-ASK-01](#w-ask-01-search-and-ask) · [W-ADD-01](#w-add-01-add-menu-and-log-a-flight) · [W-SWITCH-01](#w-switch-01-aircraft-switcher)
- Aircraft: [W-AIRCRAFT-01](#w-aircraft-01-hours-and-engine) · [W-AIRCRAFT-02](#w-aircraft-02-oil-analysis) · [W-AIRCRAFT-03](#w-aircraft-03-equipment) · [W-AIRCRAFT-04](#w-aircraft-04-weight-and-balance) · [W-AIRCRAFT-05](#w-aircraft-05-aircraft-details-and-danger-zone)
- Documents: [W-DOCS-01](#w-docs-01-documents-vault-and-carry-aboard-card)
- Share: [W-SHARE-01](#w-share-01-share-hub) · [W-SHARE-02](#w-share-02-record-room-recipient-view) · [W-SHARE-03](#w-share-03-pre-buy-dossier) · [W-SHARE-04](#w-share-04-maintenance-summary)
- Account: [W-ACCOUNT-01](#w-account-01-import-and-export-backups) · [W-ACCOUNT-02](#w-account-02-settings)
- [Kept from today, restyle only](#kept-from-today-restyle-only)
- [Coverage: every current web capability and where it lives now](#coverage-every-current-web-capability-and-where-it-lives-now)
- [Open questions](#open-questions) · [Components to add](#components-to-add)

---

## 0. Conventions used in every screen spec

### 0.1 Reference data and sizes

All examples use the mock data of mockup-brief.md §2: today is Wednesday, Nov 18, 2026; aircraft N734DM (1978 Cessna 172N), owner Dana
Morgan; second aircraft N4321J shared with Dana as editor. Sizes are at a 1440 × 900 viewport unless stated. At that width the shell gives:
rail 216px; board inner width 1180px (22px padding each side); two leaves share 1170px (10px gap). A split written `1.62fr 1fr` therefore
means a left leaf of 723px and a right leaf of 447px. Leaf padding under a Spine is 22px top, 28px sides, 20px bottom (02 §3.12), so a
leaf's inner width is its width minus 56px (723 → 667); the SourceMat has 18px padding. Board head min height 78px (70px on Status). Spine
52px. 03 §15 gives the behaviour at other widths.

### 0.2 The shell, assumed unless a screen says otherwise

Rail (03 §3), BoardHead with the board title, SubTabs and board actions (03 §4), Spine under the board head (03 §7, bracket per screen
below), then Leaves. Left leaf = the record (white Leaf). Right leaf = the source: a SourceMat holding a ScanViewer with the page, its
caption line ("{Book} logbook, page {n}" in type.body-strong on-cover, then "{date} · {trust}" in type.small), a Zoom Button (on-mat, s),
"On the map" (on-mat, s; jumps to `/logbooks/map?stop=[entryId]`), and, when the page has a transcribed quote for the selected entry, the
quote in type.paper under the image.

### 0.3 Shared view models

The screens bind to the shapes defined in 09-data-and-api.md; this file uses their field names.

| Name | Where defined | Used for |
|---|---|---|
| StatusSnapshot, DueItem, Ring, VisitView | 09 §4.3 | Verdict, due table, line ahead, visits, rail counts. Item keys `mx:<id>`, `ad:<id>`, `doc:<id>`; statuses `overdue`, `due_soon`, `current`, `no_record` (shown as Overdue, Due soon, Current, No record); `advisory` flag. |
| Plan answer | 09 §4.4 | Plan ahead's lapsed, lapses, still in date, cannot be checked. |
| Map model (lines, stops, interchanges, gaps, eras, squawks, rings, visits) | 09 §4.6, 10 §2 | Spine, RouteMap, LineAhead. |
| PageRef | 09 §4.7 | Rendered by PageCite (02 §5.4) as "Airframe p. 58", with "vol. 2" when the book has volumes. |
| Trust | 09 §2.1 (`trust_level`: `ai_read`, `confirmed`, `signed`) | TrustMark (02 §5.3): read by AI, confirmed by you, signed by a mechanic. |
| Reading queue and allowance | 09 §4.8 | Add pages, Review all, Settings. |
| Item completion | 09 §2.2 (`item_completion`) | Item and AD histories, mark done. |
| Planned visit, service provider, logbook gap, mechanic link, record room | 09 §2.4, §2.5, §2.6, §2.8, §2.12 | Visits, providers, gaps, squawk links, rooms. |

### 0.4 Common states (referenced by code in each screen)

| Code | State | Rule |
|---|---|---|
| S-LOAD | Loading | Shell renders at once; leaves show skeleton Wells; the spine shows four grey thin lines. After 3 s a line "Still loading {thing}." in type.small. |
| S-ERR | Load error | Left leaf replaced by an inline error block (plain ink text, not an AlarmSlip): "{Thing} could not be loaded." + Button quiet "Try again". The rail and other sections keep working. Never a blank page. |
| S-OFF | Offline | OfflineStrip under the board head (03 §16). Every write control is disabled with the tooltip "You're offline. This can't be saved until you reconnect." Read views keep working from loaded data. |
| S-VIEW | Viewer | Edit controls are not rendered. Where that would leave an empty region, show "You can view this aircraft. Ask {owner name} to make you an editor to {verb}." |
| S-UNCONF | Unconfirmed data present | Unconfirmed readings never move a due date, a count, a forecast or a share. Where a screen lists records, unconfirmed ones show with the TrustMark "read by AI" and a dotted outline; where a computed figure would change on confirmation, show the line "{n} pages waiting for review do not move any date." with a link "Review {n} pages" (editors). |
| S-WRITE-ERR | Write rejected | Inline error under the control, never a toast only: "You don't have edit access to this aircraft." / "Someone else changed this just now. Reload and try again." (with a "Reload" button) / "Not signed in." (with "Sign in"). |

### 0.5 Feedback

Toasts (Toast component) for completed writes: bottom centre of the board, 6 s (10 s with an action, 20 s with a screen reader; 11 §11), text plus an optional "Undo" for reversible actions
(mark done, resolve, dismiss, delete when the server supports restore). Errors are never toast-only (S-WRITE-ERR). Destructive actions
use ConfirmDialog (03 §18) that names what will go: "Delete page 23 and its 3 entries?" with the alarm Button "Delete page and entries" and "Cancel" (default focus).

### 0.6 How to read the "Elements" tables

"Binding" names the data field (table.field) or a view-model field from §0.3. Quoted text is exact copy; `{braces}` are substitutions.
Sizes are the element's rendered size at 1440.

---

## Getting in

### W-AUTH-01 Sign in

Mockup: b-w-signin. Route: `/login`. No rail. Replaces `/login`.

**Purpose.** Sign in or create an account with one of four methods, after one calm line on what the app is.

**Entry points.** Any protected route when signed out (`/login?next=…`); marketing CTAs (`/login?mode=create`); sign out.

**Layout.** Board `color.section.setup` filling the viewport, no rail. Centred two-leaf spread, total 960px wide, top 120px:
| Region | Size | Content |
|---|---|---|
| Cover leaf (left) | 400px wide, `color.cover` ground | Wordmark "MyTailLog" (type.board-title), the line, the licence line. |
| Sign-in leaf (right) | 560px wide, white Leaf | Heading, two provider buttons, divider, Segmented method switch, form, links. |

**Elements.**
| Element | Content / binding | Notes |
|---|---|---|
| Line | "Your aircraft's logbooks, photographed, read and searchable, with what is due worked out from the pages themselves." | type.lede on-cover |
| Boundary line | "The paper logbooks stay the legal record. MyTailLog is the index to them." | type.body on-cover-2 |
| Licence line | "Free and open source under the MIT licence." | type.small |
| Heading | "Sign in" / with `mode=create`: "Create your account" | type.heading |
| Sub | "Use the account you made before, or make one now. It takes a minute." | |
| Google | Button secondary m, full width, "Continue with Google" | Supabase OAuth |
| Apple | Button secondary m, full width, "Continue with Apple" | |
| Divider | "or with your email" | |
| Method switch | Segmented: "Email me a link" (default) / "Use a password" | |
| Email | TextInput, label "Email", `type=email`, autocomplete `email` | |
| Password | TextInput, label "Password", shown only in password mode, autocomplete `current-password` (create mode: `new-password`) | |
| Submit | Button primary m: "Email me a sign-in link" / "Sign in" / "Create account" | |
| Help line (link mode) | "The link signs you in on this computer and works once. Nothing to remember." | type.small |
| Links | "New here? Create an account" (toggles `mode=create`), "Forgot password?" (password mode), "Look around the demo aircraft" (goes to `/demo`; the demo aircraft itself needs an account) | |
| Social note | "You can connect Google or Apple later in Settings." | under provider buttons, type.small |

**States.** Idle; sending ("Sending…" on the button, disabled); link sent (form replaced by "Check {email} for your sign-in link. It works once, for an hour." and "Use a different email"); password error inline under the field ("That email and password don't match." / "Enter your email."); provider error ("Google sign-in didn't finish. Try again, or use your email."); create mode; signed in already (redirect to `next` or `/hangar`).

**Interactions.** Provider buttons start OAuth with `next`. Submit in link mode calls the magic-link endpoint; in password mode signs in or creates. Enter submits. Esc does nothing.

**Accessibility.** One `<h1>` ("Sign in"); the Segmented is a radio group; errors are linked with `aria-describedby` and announced politely.

**Acceptance criteria.**
- [ ] All four methods work; magic link is the default.
- [ ] `?next=` is honoured after every method, only for same-origin relative paths.
- [ ] `?mode=create` shows "Create your account" and "Create account".
- [ ] The demo CTA never links to a missing route.
- [ ] No rail, no spine; works at 320px wide (leaves stack, cover leaf first, 16px gutters).

### W-HANGAR-01 Hangar

Mockups: d-w-hangar (D), b-w-hangar. Route: `/hangar`. Hangar rail (03 §3.5), board `color.section.setup`, title "Hangar". Replaces `/dashboard`.

**Purpose.** Choose an aircraft. Each aircraft is a binder on the shelf with its life strip, its one-line verdict and what waits; add an aircraft or restore one from a backup.

**Entry points.** After sign-in; RailPlate switcher "Hangar"; `G` `T`; the MyTailLog plate on account screens.

**Layout.** One leaf (`b-leaves one`), full board width 1180px. Board actions: "Import a backup" (secondary), "Add an aircraft" (primary).
| Region | Size | Content |
|---|---|---|
| Announcement (optional) | full width | Admin announcement Well, dismissible. |
| "How did you hear" Well (optional) | full width | Shown when `profile` is younger than 14 days and `heard_about` is empty. |
| Aircraft cards | 1 column, each card full width, 196px tall | One HangarCard per aircraft, in order: owned first by tail, then shared by tail, demo last. |
| Add and import row | 2 columns, 112px tall | "Add an aircraft" and "Import a backup" dashed cards. |
| Boundary line | full width | "MyTailLog is an index of your logbooks. The paper logbooks remain the record (14 CFR 91.417)." type.small ink-3. |

**HangarCard elements** (component HangarCard, see Components to add).
| Element | Content / binding | Notes |
|---|---|---|
| Life strip (card header) | LifeStrip (02 §4.3) drawn from the aircraft's map model (whole life, no window), "{first} to {last year}" and "{pages} pages, {books} books" on the left; decade ticks under it. | The strip links to `/aircraft/[id]/logbooks/map`. |
| Tail | `aircraft.tail_number`, type.heading 24px/800 | Link to `/aircraft/[id]/status`. |
| Tags | "Demo aircraft" when `is_demo`; "Shared with you, editor" / "Shared with you, viewer" from `aircraft_share.role` | Tag style per 02-components.md. |
| Type line | "{year} {make} {model} · S/N {serial_number} · you are the owner" / "· you can add and confirm entries" (editor) / "· you can view" (viewer); "Details not set" when make and model are empty | |
| Verdict | The same Verdict sentence as Status (W-STATUS-01), one line, type.body-strong | Falls back to "Status could not be worked out. Open the aircraft to check." |
| Counts | StatusMark chips "{o} overdue", "{s} due soon"; "{r} pages waiting for review" or "No pages waiting" (editors and owner); gap line "No airframe pages for {from} to {to}" when the aircraft has a gap (the longest one) | |
| Facts | KeyValueList: "Tach" `{tach}` + "read {date}"; "Entries" `{n}` + "confirmed"; "Next visit" "Suggested, week of {date}" or "Planned, week of {date}", or "Next due" "{label}, {date}" | |
| Open | Button secondary s "Open {tail}" | |
| More menu (`ellipsis`) | Owner, non-demo: "Edit details" (`/details`), "Delete this aircraft" (`/details#delete`). Shared or demo: "Remove from my hangar" | Remove uses ConfirmDialog "Remove {tail} from your hangar? You can be invited again later." |

**Add and import cards.**
| Element | Copy |
|---|---|
| Add card | Title "Add an aircraft"; text "Type the tail number. The FAA registry fills in the rest and we set up its five logbooks."; whole card links to `/aircraft/new`. |
| Import card | Title "Import a backup"; text "Restore an aircraft from a MyTailLog .zip archive: scans, entries and status, as they were."; opens a file picker (`.zip`). |
| Import progress (inside the card) | "Reading the archive…", "Restoring scans, {n} of {N}…", "Restoring records…" |
| Import errors (inline in the card) | "This isn't a MyTailLog backup (no manifest).", "This isn't a MyTailLog backup file.", "This backup is from a newer version of MyTailLog. Update and try again.", "The import stopped. Nothing was added. Try again.", "Please sign in again." |
| Import result | Opens the new aircraft at `/aircraft/[newId]/status` with the toast "Restored {tail} from the backup." |

**"How did you hear" Well.** Heading "How did you hear about MyTailLog?"; helper "One tap. It tells us where to spend our time. Nothing else is tracked."; chips Reddit, Facebook group, Pilots of America or a forum, Type club, Search, App Store or Google Play, Friend or mechanic, MyFlightBook, Other; "Skip". Error "Couldn't save that. Try again." Writes `profile.heard_about` via `POST /api/growth/heard-about`.

**States.**
| State | Behaviour |
|---|---|
| Zero aircraft | Title "Welcome to MyTailLog"; lede "Add your aircraft to start. You need the tail number; everything else can come later."; the Add card is first and full width (primary); Import card below; the demo aircraft card, if present, sits after them under the heading "Look around first". |
| S-LOAD | Card skeletons. |
| S-ERR | "Your aircraft could not be loaded." If only status fails: cards render, verdict reads "Status unavailable", counts show "–". |
| One aircraft | Same layout; the hangar is still shown after sign-in (no auto-redirect), so the shelf is predictable. |
| S-OFF | Import disabled; cards from cache. |

**Spine.** None on the board; each card has its life strip.

**Acceptance criteria.**
- [ ] Every aircraft the user owns or is shared on shows, with its verdict computed from confirmed data only.
- [ ] The life strip shows the airframe gap for N734DM (1983 to 1991), the lapsed VOR ring and the suggested visit cap, and links to the map.
- [ ] Zero-aircraft state puts "Add an aircraft" first; the demo aircraft never pushes it down.
- [ ] Import creates a new aircraft and opens it; errors are inline in the card.
- [ ] Remove from my hangar and Delete both confirm with the tail number named.

### W-HANGAR-02 Add an aircraft

Mockup: b-w-add. Route: `/aircraft/new`. Hangar rail, board `color.section.setup`, title "Add an aircraft". Board action "Cancel" (to `/hangar`). Split `1.45fr 1fr` (692 / 478). Replaces `/aircraft/enroll`.

**Purpose.** Create an aircraft from its tail number, filled from the FAA registry, and show the five logbooks and four inspections it starts with. No meter readings here; they are asked once, in setup.

**Layout.** Left leaf: the form in three HungSections ("Tail number", "From the registry", "From you"), then the primary action. Right leaf (white, not a mat): "N734DM gets five logbooks" and "Tracked from day one".

**Elements.**
| Element | Binding | Copy / notes |
|---|---|---|
| Tail number | `aircraft.tail_number` | TextInput, placeholder "N12345", uppercase, required. Lookup runs on blur and on "Look up" (Button secondary s); after a result the button reads "Look up again". |
| Registry result line | `GET /api/registry?tail=` | "Found in the FAA aircraft registry. Registered to {registrant}, certificate valid to {date}. We filled in what the registry knows. Check it against the data plate." |
| Make, Model, Year, Airframe serial, Engine | `make`, `model`, `year`, `serial_number`, engine make and model | Each Field with a small "FAA registry" source tag while the value is the registry's; the tag disappears when the owner edits the field. |
| Engine serial, Propeller, Propeller serial | `engine_serials[]`, prop make and model, `prop_serials[]` | Optional. Helper "Comma-separated for more than one engine." |
| Home airport | `home_base` | Optional; tag "Private to you". |
| Submit | | Button primary "Add {tail}" (or "Add aircraft" before a tail is typed); "Adding…" while saving. |
| Next line | | "Next: today's tach and your last annual, on one screen." |
| Five logbooks (right leaf) | the logbooks that will be created | Airframe "Inspections, repairs, ADs and alterations to the airframe"; Engine "{engine make model}, S/N {serial}"; Propeller "{prop}, S/N {serial}"; Avionics "Radios, transponder, ELT and GPS work, if kept apart"; Other "W&B sheets, 8130-3 tags, AD reports. Filed and applied, not split into entries." Each with its LineChip ink. |
| Four inspections (right leaf) | the Part 91 items created | Annual inspection "91.409 · 12 calendar months"; Transponder "91.413 · 24 calendar months"; Pitot-static and altimeter "91.411 · 24 months · IFR only"; ELT inspection "91.207 · 12 months"; each StatusMark unknown "Needs a date". |

**States and errors.** Lookup: "Looking up…"; "No FAA registration found for {tail}. Fill in what you know."; "The registry lookup failed. Fill in what you know, or try again."; "Enter a tail number first." Validation inline: "Enter the tail number.", "Year must be a whole number, like 1978." Save errors: "Couldn't add the aircraft. Try again." / "The aircraft was added, but its logbooks were not. Open it and we'll finish setting it up." (with "Open {tail}"). S-OFF: submit disabled ("Adding an aircraft needs a connection.").

**Interactions.** Submit creates the aircraft, five logbooks and four Part 91 items, then navigates to `/aircraft/[id]/setup`.

**Acceptance criteria.**
- [ ] Copy says five logbooks and five are created.
- [ ] Registry values are marked as such until edited.
- [ ] No meter fields on this screen.
- [ ] Success lands on W-SETUP-01.

### W-SETUP-01 First-session setup

Mockup: b-w-setup. Route: `/aircraft/[id]/setup`. Board `color.section.status`, title "Set up {tail}", no sub-tab lit. Board action "Skip for now" (to `/status`). Split `1.4fr 1fr` (683 / 487). Spine: bracket today to +12 months, label "{year} to {year+1}". Replaces `/start`.

**Purpose.** Three answers on one screen (meters today, last annual, reminders), ending in the aircraft's first verdict. Every answer can be changed; there is no stepper and no dead end.

**Entry points.** Right after W-HANGAR-02; "Finish setup" on W-SETUP-02; a hangar card's verdict link when setup is incomplete.

**Layout.** Left leaf: lede, then four HungSections: "Meters today", "Last annual", "Reminders", "Your first status". Right leaf: SourceMat showing the photographed annual page when the owner chose "Find it on a scanned page"; otherwise a Well with "Where to find the last annual: usually the last inspection entry in the airframe logbook."

**Elements.**
| Section | Element | Binding | Copy |
|---|---|---|---|
| Lede | | | "Three answers and your status is ready. The rest of the logbooks can come later." |
| Meters today | Tach, Hobbs | writes `hours_reading` (source manual, date today) | Hung note "Hour items count down from these". Inputs are numeric TextInputs with one decimal. Helper "No hobbs? The tach is enough." Error "Enter the tach, the hobbs, or both." / "Readings are zero or more." |
| Last annual | Segmented "Type the date" / "Find it on a scanned page" | | Hung note "Usually the last inspection in the airframe logbook" |
| | Type the date | `maintenance_item(kind=annual).last_done_date`, optional hours | DateInput max today. Error "Pick a date on or before today." |
| | Find it on a scanned page | uploads a page (`POST …/capture`), extracts it, lists entries | Steps shown inline: "Uploading…", "Reading the page. This can take up to a minute…". Then "Which entry is the annual? Check the date against the page." radio list of entries (date, first 120 characters in type.paper), the first one mentioning "annual" preselected; result line "{date} at tach {tach}" + TrustMark read by AI + "Annual inspection on Airframe p. {n}, signed {name}. Check it against the page."; Button "That's right" (confirms that entry) and "None of these" (falls back to typing). Note: "Confirming marks this entry confirmed. The page's other entries wait in Review." Errors: "Use a photo (JPEG, PNG or HEIC) or a PDF.", "Couldn't read that file.", "The upload didn't go through. Check your connection and try again.", "No entries were found on that page. Try a sharper photo, or type the date." |
| Reminders | Toggle "Email me 30 days or 10 hours before anything comes due" (default on) | `profile.preferences` (09 §2.11) | Sub "To {email}. You can change the lead time for each item later." |
| Flying (optional) | "About how many hours a week do you fly?" numeric, 0 to 60 in 0.5 steps | `aircraft.expected_hours_per_week` | Helper "Used to turn hours into dates until there are enough readings." (07-flows.md first session, step 8) |
| Your first status | Verdict + 4 DueRows | DueItem for annual, transponder, pitot-static, ELT | Verdict e.g. "The annual is current until Jul 31, 2027. Three other inspections need their last date." Rows without a date show "Add date" (inline DateInput + "Save") and StatusMark no record "No record". |
| Finish | Button primary "Done, show my status" | | Helper "Leave the three dates blank and the scanned pages will find them." |

**States.** Sections fill independently; "Your first status" updates live as each answer saves (each saves on change, no global save). Meters already given: the section shows the values with "Change". Annual already known: shows the date and its source. S-VIEW: viewers are redirected to `/status`. S-OFF: the scanned-page path is disabled ("Reading a page needs a connection. Type the date instead.").

**Interactions.** "Done, show my status" goes to `/status` (W-SETUP-02 if no confirmed entries beyond the annual, else W-STATUS-01). "Skip for now" goes to `/status` without saving anything further.

**Acceptance criteria.**
- [ ] Meters are asked once in the whole onboarding (not on W-HANGAR-02).
- [ ] Each answer can be changed after it is saved; there is no step that cannot be revisited.
- [ ] The photographed annual counts only after "That's right"; until then the verdict does not use it.
- [ ] Reminders default on and the email address is shown.
- [ ] The verdict and four rows match what W-STATUS-01 will show.

### W-SETUP-02 New aircraft, nothing scanned

Mockups: d-w-new (D), b-w-new. Route: `/status` when the aircraft has no confirmed entries (03 §11.3). Board `color.section.status`, Status › What's due. Split `1.62fr 1fr` (723 / 447). Board head readout "Tach {tach}, entered today"; primary "Log a flight". Replaces `/aircraft/[id]` with an empty index.

**Purpose.** Status on day one: what is known and where it came from, the honest map, and the next step (scan the airframe logbook).

**Layout.** Left leaf: Verdict, line ahead, "Tracked" table, "What we know". Right leaf (white Leaf, not a mat): "Next, scan the airframe logbook", three routes in, "Pages in" coverage.

**Elements.**
| Element | Binding | Copy / notes |
|---|---|---|
| Verdict | due engine | "Your annual is current until {date}. Three inspections need a last date before they can be counted." |
| Line ahead (LineAhead) | 4 lines, today to +12 months | History drawn as four dashed lines labelled "no pages yet"; the annual's last done as a stop labelled "Last annual, {date}, your answer"; its due as a ring "Annual due {date}"; under the line "Not on the line: transponder, pitot-static and ELT inspection, need a date." (09 §3.4; d-w-new draws them as a dashed-ring column, which 09 replaces); a note on the engine line "Oil, ADs and engine time appear here as pages are read". Labels at 12 to 13px, never overlapping (10-line-map.md). |
| Tracked table | DueRows for the four Part 91 items | Columns: item (label + "Airframe · 91.409 · from your answer, no page yet"), due, left, StatusMark. Undated rows: "Add date" link opening an inline DateInput. |
| What we know | KeyValueList with a source column | "Aircraft" "1978 Cessna 172N, S/N 17269841" source "FAA registry"; "Meters" "Tach 4212.4, hobbs 4680.4" source "you, today"; "Last annual" "Jul 14, 2026 at 4168.3" source "you, until its page is scanned" (or the PageCite and "Confirmed by you" when found on a page). |
| Next step heading | | "Next, scan the airframe logbook" |
| Next step text | | "Start with the newest page and work back. Each page you confirm turns a stretch of dashed line solid and fills in more of what is due." |
| Route 1 | Button primary "Scan the airframe logbook with your phone" | Opens W-BOOKS-06 with the QR hand-off focused (`/logbooks/add?book=airframe`). |
| Route 2 | "Already scanned? Drop PDFs or photos. Long PDFs are split into pages." + Button secondary "Upload pages" | `/logbooks/add?book=airframe` |
| Route 3 | "Know the dates? Type the last transponder, pitot-static and ELT dates." + Button secondary "Add dates" | Scrolls to the first undated row and opens its DateInput. |
| Pages in | CoverageBar list, one per book | "Airframe none", "Engine none", … |
| Allowance line | ai allowance | "AI reads up to 50 pages a day for free. Nothing it reads counts until you confirm it, and the line stays dashed until then." |

**States.** Annual unknown too: verdict "Nothing can be counted yet. Add today's tach and the date of the last annual." with a Button "Finish setup" (to `/setup`). S-VIEW: routes 1 to 3 hidden; right leaf says "No pages are in yet. {owner name} can add them." Leaves this state automatically when the first entry is confirmed (no reload needed; refetch on focus).

**Spine.** Bracket today to +12 months; past drawn as four dashed lines; label "1978 to 2027".

**Acceptance criteria.**
- [ ] Nothing is guessed: items without a confirmed or owner-typed date show "No record".
- [ ] The map is drawn, with history dashed and labelled "no pages yet".
- [ ] All three routes in lead to working screens with the airframe book preselected.
- [ ] Viewers see no add controls.

---

## Status

### W-STATUS-01 What's due, the home

Mockups: d-web-status (d/index.html) for the head, verdict, line ahead and spread; b-w-due for the full table, legend chips and grouping;
b-w-home for the "Later" collapse. Route: `/aircraft/[id]/status` (`?visit=`, `?filter=`). Status › What's due. Board head min height 70px;
readout "Tach {tach}, read {date}"; More menu (`ellipsis`, owner and editors): "It's in the shop", "I'm selling {tail}", and "Not any more"
when either is set (writes `aircraft.situation_override`, 09 §2.14); primary "Log a flight" (owner and editors). Split `1.62fr 1fr` (723 / 447).
Replaces `/aircraft/[id]` (overview), `/aircraft/[id]/status`, and the table of `/aircraft/[id]/maintenance`.

**Purpose.** Answer "where do things stand" in one sentence, show the next twelve months on the books' lines, and hold the one due list with
both limits. The page behind the selected row is on the right leaf.

**Entry points.** Opening an aircraft (hangar, switcher, `/aircraft/[id]`); the Status tab; `g` `s`; reminders and inbox items (through §10.3 of 03).

**Data.** `GET /api/aircraft/{id}/status` → StatusSnapshot (09 §4.3): `verdict`, `items[]` (DueItem), `visits`, `lineAhead`, `counts`, `meters`, `rate`.

**Layout (left leaf, top to bottom).**
| Region | Size | Content |
|---|---|---|
| Notices (optional) | auto | At-risk notice, in-shop prompt, announcement (rules below). |
| Verdict | type.lede 22px, max 34ch, up to 3 lines | The sentence (02 §5.1). |
| Line ahead | full leaf width (667px inner), 226px tall (10 §8.3 viewBox 680 × 226) | LineAhead over 12 months; "Not on the line" line under it when items have no date. |
| Legend chips | 40px row | FilterChips with counts. |
| Due table | auto | DueTable (02 §5.8) grouped by horizon. |
| Footnote | auto | Counting note and reminders line. |

Right leaf: SourceMat for the selected row (default: the first row, in table order, that has a source page), or the VisitPanel when `?visit=` is set.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Verdict | `verdict.text`, `verdict.emphasis` | Composed by the server per 12-copy-and-voice.md. N734DM: "One check has lapsed, and it only matters for IFR. Three more come due before the new year, and two of them fit one visit." Emphasised ranges in type.body-strong; overdue wording in `color.alarm` with a StatusMark beside the sentence so it is not colour alone. An open squawk the owner marked Ground is named ("Left brake: you marked it Ground on Nov 8."), never as an aircraft verdict. |
| Line ahead | `lineAhead.rings`, `visits` | Books in the order Airframe, Engine, Propeller, Avionics with names at the left. Rings per StatusMark state on the item's `line` at `firstDate` (overdue at today); projected dates labelled with "≈" ("AD seat rails ≈ Mar 28"). Suggested visits as `cap plan` labelled "Suggested visit, week of {date}"; planned visits as solid caps labelled "Planned, week of {date}". Month ticks every two months; "Today" at the left. Labels follow 10 §7. |
| Not on the line | `lineAhead.undated` | "Not on the line: {label}, needs a date." (one line, comma-joined) |
| Legend chips | `counts`, item statuses | FilterChips (02 §7.11): "All {n}", "Overdue {n}", "Due soon {n}", "Current {n}", "No record {n}". Selecting filters the table and dims other rings; URL `?filter=`. |
| Table header | | "Item", "Calendar limit", "Hours limit", "Left" (right-aligned), "State", action column. |
| Groups | horizon from `firstDate` | "Overdue · {n}"; "Next 60 days · {n}" (calendar within 60 days, hours within 25 h, or projected within 60 days); "Within a year · {n}"; "Further out · {n}"; "No record · {n}" (`no_record`). Overdue and Next 60 days are open; the other three sit under one toggle row "Later · {n} items" (state remembered per browser). A filter opens every group it matches. |
| DueRow item cell | `label`, `rule`, `line`, `lastDone.pageLabel` | Name in type.body-strong (a link to W-STATUS-04); line 2 type.small: LineChip · rule · PageCite. "VOR check" / "Avionics · 91.171 · every 30 days · IFR only · Airframe p. 61". A row in a planned visit adds "In the {Mon D} visit". |
| Calendar limit | `calendar.dueDate` | "Nov 11, 2026" or "none". |
| Hours limit | `hours.dueAt`, `hours.projectedDate`, `first` | "tach 4222.1" over "about Dec 12"; the earlier limit carries FirstBadge (02 §5.6). "none" when absent. With projection basis `none`: "{n} h left, no recent flying to date it". |
| Left | days left or hours remaining | type.numeric, right-aligned, bold: "lapsed 7 days ago", "43 days", "9.7 h", "590.6 h". |
| State | `status`, `advisory` | StatusMark: Overdue, Due soon, Current, No record (`no_record`), Advisory variant. |
| Action | per key | `mx:` "Mark done" (VOR item: "Log a VOR check"); `ad:` "Record"; `doc:` with a date "Renewed", without "Add the date" (opens Documents). Owner and editors. Opens W-STATUS-04 with its drawer (`?panel=done`), as 07-flows.md describes. |
| Footnote | `counts.pagesToReview`, `rate` | "Counted from entries you confirmed. Pages waiting for review do not move any date. Hours become dates at {rate phrase}." Rate phrases from `rate.basis`: "your recent flying, about {h} hours a week", "your recent hobbs time, about {h} hours a week", "your flying over the past year, about {h} hours a week", "your estimate of {h} hours a week". With pages waiting: "Review {n} pages" link (owner and editors). |
| Reminders line | preferences | "Reminders: email and phone before each item, at your lead times." + "Change lead times" (`/account/settings#reminders`); when off: "Reminders are off." + "Turn them on". |

**Notices** (Wells above the verdict, at most two, in this order).
| Notice | When | Copy and actions |
|---|---|---|
| At risk | a planned visit has `atRisk` items (09 §4.3) | "The {label} now falls {n} days before the {Mon D} visit." + "Move the visit to the week of {date}" (owner and editors) + "Leave it". |
| In the shop? | a planned visit's week has started and its status is still `planned` | "Is {tail} at the shop this week?" + "Yes, it's in the shop" (sets the visit `in_shop`) / "Not yet". |
| Did it happen? | a visit is `awaiting_records` | "Did the {Mon D} visit happen? Mark what was done and add its pages." + "Open the visit" (`?visit=`). |
| Announcement | admin announcement not dismissed | its title, text, optional link; "Dismiss". |

**VisitPanel** (right leaf with `?visit=`; same panel on W-STATUS-03 and W-MAINT-04): see W-STATUS-03.

**Interactions.**
| Action | Result |
|---|---|
| Click a row (not a control), or `j`/`k` | Selects it (selection on this screen is not routed); right leaf shows the page with the entry lit; its ring gets the selection outline. |
| Click a row name | `/status/item/[itemKey]` (push). |
| Click a ring | Selects that row and scrolls it into view (10 §9). |
| Click a visit cap | `?visit=` (replace); right leaf becomes the VisitPanel. Esc clears it. |
| PageCite | Shows that page on the right leaf. |
| Action button or `m` | Opens W-STATUS-04 for the row with the drawer open. |
| Log a flight | Log a flight dialog (W-ADD-01); after saving, the table and line ahead refresh and the toast names what moved ("Saved. Oil change now 7.3 h away."). |
| Right leaf "On the map" | `/logbooks/map?stop=[entryId]`. |
| More › "It's in the shop" / "I'm selling {tail}" | Sets the override; the home re-renders as that situation (W-STATUS-02). "Not any more" clears it. |

**States.**
| State | Behaviour |
|---|---|
| S-LOAD | Verdict skeleton (3 lines), four grey dotted lines, six row skeletons. |
| S-ERR | "Tracked status could not be loaded. Nothing is assessed until it loads." + "Try again". No verdict is shown; never a stale one. |
| No items | Verdict "Nothing is tracked yet." Table replaced by "Add the standard Part 91 items" (owner and editors) and "Track an item" (`/maintenance/items?panel=new`). |
| Situations | `situation` other than `attention` renders W-STATUS-02 or W-SETUP-02. |
| S-UNCONF | Footnote names the waiting pages; nothing moves until they are confirmed. |
| S-VIEW | No actions, notices' buttons, More menu or Log a flight; text remains. |
| S-OFF | Readable from loaded data; actions disabled with the offline tooltip. |
| Row without a page | Right leaf Well: "No page behind this yet. {Reason}." Reasons: "You marked it done on {date}; the page will replace your note when it is scanned." / "This comes from the {document} in Documents." (link) / "No record of this item has been found." |

**Spine.** Window today to +12 months; label "{start} to {end year}"; overdue and soon rings; visit caps; "Open the map".

**Acceptance criteria.**
- [ ] The verdict, the rail's Status line, the hangar card and the table agree at all times (one StatusSnapshot).
- [ ] Every row shows both limits when the item has both, marks the first, and converts hours to "about {date}" with the granularity of 09 §3.3; an hours date never replaces an earlier calendar date.
- [ ] Calendar-month items are due on the last day of the month.
- [ ] Legend chips filter the table and the line ahead; their counts sum to "All".
- [ ] Every row's action opens W-STATUS-04's drawer for that item.
- [ ] Unconfirmed readings never change a value on the screen.
- [ ] The selected row's page is on the right leaf with the entry lit; rows without a page say why.
- [ ] Line-ahead labels never overlap at 1280, 1440 and 1920.

### W-STATUS-02 Home situations

Mockups: d-w-annual (annual month, D), b-w-clear (all clear), b-w-annual. "In the shop" and "Preparing a sale" are not drawn; they use the
same anatomy. Route: `/status`, chosen by `StatusSnapshot.situation` (09 §3.6; precedence setup, in_shop, preparing_sale, annual_month,
attention, all_clear). Overdue and due-soon items are always listed, whatever the situation; the situation changes the verdict, the order
of sections, the horizon and the right leaf. Everything not listed here is as W-STATUS-01.

| Situation | Trigger (09 §3.6) | Verdict example (08 C-HOME-01) | Line ahead | Left leaf after the line | Right leaf | Spine window |
|---|---|---|---|---|---|---|
| annual_month | annual not overdue, due ≤ 60 days | "The annual is due this month, by Jul 31. Four items can ride along with it in one visit on Jul 14." | 60 days; the annual drawn as its visit cap with every item that rides along; items not yet due but within the visit window labelled "{label}, {left}, about {date}" | "Rides along at the {date} visit": the visit's items with early cost ("early by choice", "about 51 h before it is due"); then the normal table under "Everything else · {n}" | "Getting ready for the annual": who signed last year's ("D. Alvarez, A&P 3105582 IA, signed last year's on Jul 14."); "Booking the visit adds it to the map as a planned stop, and reminders follow it."; open squawks + "See them"; the longest open gap + "Your IA may ask about the gap" + "Show on the map"; early-AD line + "Add to the visit"; "Share with your IA" (secondary, owner, `/share?audience=ia`) and "Book this visit" (primary, owner and editors) | today to +60 days |
| in_shop | `situation_override = in_shop` or a visit `in_shop` | "N734DM is in the shop for the week of Dec 7. Four items are in this visit." | 60 days; the visit cap solid | "In this visit": each item with its state and "Mark done" (W-STATUS-04 drawer, which asks for the page or "add it later"); then the normal table collapsed | "While it's in the shop": open squawks with "Send to mechanic" (W-MAINT-03); "When the work is signed": "Add pages" (primary) and "Write an entry"; "Close this visit" (items not done return to suggestions); "Not in the shop any more" | today to +60 days |
| preparing_sale | override `preparing_sale` or a live buyer record room | "The records are ready to share with a buyer. 6 pages are waiting for review and one gap is unexplained." | 12 months | The normal table | "Before a buyer looks": checklist with counts and links: pages waiting for review (W-BOOKS-08), gaps without a status (W-BOOKS-04), written-versus-calculated disagreements (W-AIRCRAFT-01), W&B stale (W-AIRCRAFT-04), documents present (W-DOCS-01); then "Open the dossier" (W-SHARE-03) and, when a buyer room is live, "{recipient}'s room, opened {n} times" + "See it as {recipient}" | as W-STATUS-01 |
| all_clear | nothing overdue or due soon | "Nothing tracked is due in the next 90 days. Next is the annual, by Jul 31, 2027." | 12 months | "Next three" (the three earliest items), then "Everything else · {n}" collapsed | "What {Month}'s entries moved": entries confirmed in the last 30 days that changed a due date, each "{label}, {date} · next due {date}" with PageCite; "Counted from entries you confirmed on {date}."; then a quiet suggestion "Next, scan the {book} logbook" when a book has no pages. Empty: "No entries in the last 30 days moved a date." | as W-STATUS-01 |
| setup | not status-ready | see W-SETUP-02 | | | | |

Viewers see the situation but no override, booking, closing, sharing or mark-done controls (08 C-HOME-01).

**Acceptance criteria.**
- [ ] Exactly one situation renders, chosen by the precedence above, and changes without reload when the snapshot changes.
- [ ] A live buyer room switches the home to preparing_sale within one snapshot recompute; revoking it switches back.
- [ ] The annual-month line ahead covers 60 days and shows the annual visit with what rides along.
- [ ] Overdue items are listed first in every situation.

### W-STATUS-03 Plan ahead

Mockup: d-w-plan (D). Route: `/aircraft/[id]/status/plan` (`?date=YYYY-MM-DD&rate=3&visit=`). Status › Plan ahead. Readout "Tach {tach}, read
{date}". Split `2.05fr 1fr` (786 / 384). Replaces `/aircraft/[id]/maintenance` as a forecast, and B's Pick a date. Rules: 08 C-PLAN-01 to 04; computation 09 §3.3 to §3.5 and §4.4 (computed in the browser while scrubbing, 09 §3.12).

**Purpose.** See the next 24 months on the books' lines, move a date to see what will have lapsed by then at a stated flying rate, and book the visits that would prevent it.

**Layout.**
| Region | Size | Content |
|---|---|---|
| Left: heading row | 32px | "The next 24 months" (type.heading) + MapLegend "due", "current", "due soon", "suggested visit". |
| Left: line ahead with DateScrubber | full leaf width (730px inner), 300px tall | LineAhead over 24 months, the first 6 at double scale; DateScrubber (02 §4.6) with its pill ("Mar 1, 2027") and the tinted window from today to the marker; rings that lapse by the date drawn as overdue (10 §8.3). |
| Left: visits | auto | "Suggested visits" + "bundled by date": up to 6 VisitCapsule rows; then "Planned visits". |
| Right leaf (white) | 384px | Date, flying rate, the answer, the lists. |

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Rings | DueItems over 24 months | As W-STATUS-01, plus each recurring item's following occurrence ("Annual, Jul 2028"); far advisory items clamped at the right edge with "about 2030". |
| DateScrubber | `date` | Default today + 90 days rounded to the 1st of the following month (Mar 1, 2027 at the reference); otherwise the last date chosen for this aircraft on this browser. Drag by pointer; with focus on the handle: Left/Right ±1 day, Page Up/Page Down ±1 month, Home today, End the window end. `role="slider"` with `aria-valuetext="March 1, 2027, five items lapse"`. The URL updates (replace) on release. |
| VisitCapsule row | `visits.suggested` | "Visit {n}, week of {date}" (type.body-strong); a line listing items with their providers ("Oil and filter (M. Torres) · transponder and pitot-static (AeroCheck Instruments, same field) · VOR check, log it yourself · clears 3 items before they lapse"); early costs ("ELT battery, 13 days before it expires · seat-rail AD, about 10 h early, saves a separate trip"); "Book this visit" (owner and editors); "Dismiss" (quiet; stores the `suggestion_key`; returns only if its items or week change). Clicking the row or its cap selects it (`?visit=sugg:{key}`). |
| Planned visit row | `visits.planned` | "Planned, week of {date}" + place + items; status words "Planned", "In the shop", "Awaiting records". |
| Date | `date` | DateInput "Date"; typing moves the marker. |
| Flying until then | `rate` | Numeric field "{h} h a week", 0 to 60 in 0.5 steps, default `rate.hoursPerWeek` rounded to 0.5. Helper "About {h} hours, so the tach reads about {tach} that day." + "Drag the marker on the map or type a date." Changing it applies to this screen only; link "Use as my usual flying" saves it to `aircraft.expected_hours_per_week` (owner and editors). Basis note when not from recent flying: "No recent flying, so this uses your estimate." / "From the past year." |
| Answer | | "By {Mon D}, {n} items will have lapsed unless they are done first." / "By {Mon D}, nothing tracked will have lapsed." (plurals per 12-copy-and-voice.md). |
| Lapsing list | `lapsed[]`, `lapses[]` (09 §4.4) | Row: name, "{limit} · {PageCite}" ("tach 4222.1, about Dec 12 · Engine p. 38"), StatusMark word "Lapsed" (already overdue) or "Lapses", and the covering visit ("Dec 7 visit") when there is one. Each name links to W-STATUS-04. |
| Still in date | `stillInDate[]` | "Still in date on {Mon D}: the seat-rail AD, with about 12 h to spare, and the annual and ELT inspection, with 152 days." |
| Cannot be checked | `cannotCheck[]` | "The insurance policy has no date on file, so it cannot be checked." / "{label}: no recent flying, so its hours can't be dated." |

**VisitPanel** (right leaf when `?visit=` is set; also on W-STATUS-01 and W-MAINT-04).
| Element | Copy / binding |
|---|---|
| Title | "Suggested visit, week of {date}" / "Planned visit, week of {date}" / "In the shop, week of {date}" / "Awaiting records, week of {date}" |
| Why | "{n} items fall due within {d} days of each other at {place}. One visit covers them." (from the VisitView) |
| Items | Rows: StatusMark, label, left, early cost, provider; before booking each has a Checkbox to drop it. |
| Last done | "{provider} did the last {items}, on {PageCite}." |
| Suggested actions | Primary "Book this visit" (owner and editors) opens BookVisitDialog; quiet "Dismiss". |
| Planned actions | "It's in the shop" (sets `in_shop`); "Send to {provider}" (creates a mechanic link of kind visit, 30 days, and opens the owner's mail app with the list and link, 09 §4.5; MyTailLog never sends it); "Move" (week picker); "Cancel visit" (ConfirmDialog "Cancel the visit for the week of {date}? Its items go back to the suggestions."). |
| In the shop or awaiting records | Each item "Mark done" (W-STATUS-04 drawer, with "Add the page later"); "Close this visit" (items not done return to suggestions). |

**BookVisitDialog.** Fields: "Week of" (Monday picker, default the suggestion's week), "Day" (optional DateInput within that week), "Shop or mechanic" (Select of `service_provider` rows, default the items' provider; "Add one" opens the provider form of W-MAINT-06), "Items" (checkbox list), "Notes". Primary "Book visit", quiet "Cancel". Result: a `planned_visit` with its items (works offline on the phone; online on the web); its cap turns solid on Status, Plan ahead, Annual prep and the spine; one reminder 7 days before the week (09 §3.11); Toast "Visit booked for the week of {date}." with "Undo".

**States.** S-LOAD; S-ERR "The plan could not be worked out." + "Try again". Rate 0: only calendar items can lapse; hours items say "no flying, never reached". Chosen date today: today's state. No items: "Nothing is tracked yet, so there is nothing to plan." Two people booking the same item: "This item is already in the visit for the week of {date}." S-VIEW: suggestions and planned visits visible, no Book, Dismiss, Send, Move or Cancel; scrubber and rate work. S-OFF: scrubbing works on loaded data; booking disabled.

**Spine.** Range to +24 months ("1978 to 2028"); window today to the marker, moving live.

**Acceptance criteria.**
- [ ] Mar 1, 2027 at 3 h a week shows about 44 hours and tach about 4256; Lapsed: VOR; Lapses: oil, transponder, pitot-static, ELT battery; Still in date: seat-rail AD (about 12 h), annual and ELT inspection (152 days); cannot be checked: insurance (08 C-PLAN-01).
- [ ] Marker, date field, right leaf and URL agree after every drag, key press or typed date; the list updates within 50 ms.
- [ ] Changing the rate moves rings and the answer at once; "Use as my usual flying" saves it.
- [ ] Booking draws a solid cap everywhere the line ahead appears and schedules the visit reminder.
- [ ] Every item of today's forecast table is visible here or on W-STATUS-01.

### W-STATUS-04 Item detail with mark-done drawer

Mockups: d-w-item (D, history as stops), b-w-item (drawer, rule, history flags). Route: `/aircraft/[id]/status/item/[itemKey]` (`?stop=<completionId>`,
`?panel=done`). Status, no sub-tab lit (d-w-item's Maintenance board is overridden, 03 §4). Board action primary "Mark done" (owner and editors;
"Log a VOR check", "Record compliance" or "Renewed" by item). Split `1.5fr 1fr` (702 / 468). Replaces the inline Done form and the item
pages reached from `/maintenance#item-{id}` and the status cards. Rules: 08 C-STATUS-06 to 08, C-ITEM-01.

**Purpose.** Everything about one tracked item: both limits and which comes first, the meter it counts on, its reminder, and its history as
stops on the line where its entries are written, each with its page, so a late renewal or a repeated reading is visible; and the one place to mark it done.

**Layout (left leaf).**
| Region | Size | Content |
|---|---|---|
| BackLink | 20px | Per 03 §12. |
| Title row | 40px | Label (type.heading 26px) + StatusMark. |
| Rule line | 20px | `rule`, e.g. "91.413 · every 24 calendar months · no hours limit". |
| Next due (HungSection) | auto | "Calendar" "{date} · {left}"; "Hours" "tach {value}, about {date} · {left}" with FirstBadge on the earlier; or "none". |
| Rule (HungSection) | auto | "Hours on" Segmented Tach / Hobbs / Airframe (hours items; owner and editors); "Tach reads {value}, {date}"; "Done by" provider; link "Edit the rule" (`/maintenance/items?item={id}&panel=edit`). |
| Remind me (HungSection) | auto | "{lead} before" + "Change" (Select: 7, 14, 30, 60, 90 days; 5, 10, 25 hours where the item has hours). Writes `maintenance_item.remind_lead_days` / `remind_lead_hours` (09 §2.3). Snoozed: "Snoozed until {date}" + "Stop snoozing". |
| History map | full width, 150px | RouteMap at entry-context size (10 §8.2): the item's completions as stops on the book where they are written (transponder: Airframe) from the first shown to the next due ring; interval labels between stops ("24 mo", "23 mo"); an interval longer than the rule labelled in alarm text "Lapsed {d} days, {Mon YYYY} to {Mon YYYY}"; the due ring "Due {date}, {left}"; "Today". |
| Done before | auto | "Done before" + "{n} times since {year}"; table Date · Tach · Shop · Page · Trust (from `item_completion` joined to the entry); late rows show "{d} days late" under the date in alarm text; hours items add "After" (hours since the previous), "?" when two completions share a tach, with the note "Same tach as {date}. Check the page."; "Show all {n}". |

Right leaf: SourceMat with the selected completion's page (default the latest), caption "{Book} logbook, page {n}" / "{date} · {trust}"; quote under it.

**Mark-done drawer** (`?panel=done`; Drawer 02 §3.15 over the right leaf, same width). Fields by item:
| Item | Fields | Preview |
|---|---|---|
| Calendar or hours item | "Date done" (default today, not in the future); "{Meter}" (default the latest reading, helper "Last reading {value} on {date}"); "Notes"; "The page" Segmented: "Link an entry" (Select of confirmed entries in the item's book from the last 60 days) / "Write the entry now" (after saving opens W-BOOKS-11 with the item's template) / "Add the page later" (default; the owner's note is replaced by the page when it is scanned and confirmed, 08 C-REVIEW-05) | "Next due {date}" and/or "at {meter} {value}", calendar-month rule applied. |
| VOR check (91.171(d)) | "Date checked", "Kind of check" (VOT, ground checkpoint, airborne checkpoint, dual VOR), "Place" (e.g. "KBDN VOT"), "Bearing error" (± degrees), "Signed" (default the user's name) | "Next check due {date + 30 days}". Note "These are the four things 91.171(d) asks for. Saving writes them as an entry in the airframe logbook index; write the same in your paper logbook." |
| AD | "Date complied", "Tach", "Method of compliance", "The page" as above | "Next due {…}" for recurring ADs; one-time ADs "Complied once". |
| Document | "New expiry date", "Upload the new document" (optional) | "Next due {date}". |
Primary "Mark done" (or "Log the check", "Record compliance", "Save"); quiet "Cancel". Saving creates an `item_completion` (09 §2.2; `source` `mark_done` or `vor_check`) and closes the drawer; the new completion appears as the newest stop with TrustMark "confirmed by you"; Toast "Marked {label} done. Next due {date}." with "Undo". Validation: "Pick a date on or before today."; a reading below the latest shows a warning, not a block: "That's lower than the last reading, {value} on {date}. Check the meter." + "Save anyway".

**Item kinds.** `ad:` keys: title "AD {reference}", rule from the AD, history from its completions, link "Open in ADs and SBs". `doc:` keys: title the document's title, "Expires {date}", no history map, link "Open in Documents".

**States.** No completions: the map shows the due ring and the line dashed back to the start of records; the table is replaced by "No completion found in the confirmed entries. If it was done, mark it done with the date, or review the pages that may hold it." (+ "Review {n} pages"). Completions read but unconfirmed: hollow stops with "Read by AI, not counted" and "Review it". S-VIEW: no drawer, no Change controls. Deleted item: 03 §11.5. S-ERR.

**Interactions.** Click a stop or a table row: `?stop=` (replace), page on the right. PageCite: page on the right. "On the map": `/logbooks/map?stop=[entryId]`. `m` or the board action opens the drawer.

**Spine.** Window from the first drawn completion to the next due (transponder: 2008 to 2026); label "{first year} to {due year}".

**Acceptance criteria.**
- [ ] Every completion shows its page and trust; the latest is selected by default.
- [ ] A late interval is named in words, not only coloured.
- [ ] A tach that repeats an earlier reading is flagged in the table.
- [ ] The drawer previews the next due before saving; the saved completion appears at once as a stop.
- [ ] The VOR drawer records the four 91.171(d) fields and writes an entry.
- [ ] `ad:` and `doc:` keys render their variants with links to their home screens.

---

## Maintenance

### W-MAINT-01 ADs and SBs

Mockups: d-w-ads (D, per-AD compliance lines), b-w-ads. Route: `/aircraft/[id]/maintenance/ads` (`?ad=[adId]`, `?panel=new|edit|record`). Maintenance › ADs and SBs. Board actions "Find ADs" (editors), primary "Track an AD or SB" (editors). Split `1.7fr 1fr`
(737 / 433). Replaces `/aircraft/[id]/compliance`.

**Purpose.** The register of every AD and SB the aircraft carries, in four plain states, each recurring AD with its own small line of
compliance stops, its compliance history with pages, and "Record compliance" that adds to the history instead of overwriting it.

**Layout (left leaf).**
| Region | Size | Content |
|---|---|---|
| Register table | auto | Columns: "AD" (number + subject), "Applies" (state + rule), "Compliance on the {book} line, {from} to {to}" (a 200px mini line per row, shared axis with decade ticks under the table), "Next due", "Source". |
| Referenced, not tracked | auto | One line per reference found in confirmed entries but not tracked. |
| Selected AD (HungSection "Compliance history") | auto | History table and actions. |

Right leaf: SourceMat with the selected compliance's page; quote ("AD 2011-10-09 c/w.") under it.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| AD cell | `ad_compliance.kind`, `reference`, `title` | "2011-10-09" (type.body-strong, tabular) over "Seat rails and holes"; SB rows prefixed "SB". |
| Applies cell | `status`, `recurring`, `interval_hours`, `interval_months`, `reason` | Four plain states: "Recurring" + "every 100 hours" / "Complied once" + "one-time AD" / "Not applicable" + `reason` ("Different pump P/N") / "Open" + "no compliance recorded" (StatusMark unknown). "Superseded" + "by {ref} on {date}". Status values map: open, complied, previously_complied (shown "Complied once, before these records" ), not_applicable, superseded. |
| Mini line | compliance events | Stops on the AD's book line (default airframe, or the related component's book) from the axis start to +2 years; the next due as a ring (state-coloured); not-applicable ADs show no line and the text "No line: never applied to this aircraft" or "No line: not applicable since {date}". Recurring ADs show a count label "{n} since {Mon YYYY}". |
| Next due | derived `next_due_date` / `next_due_hours` | "tach 4268.3" over "about Apr 2027"; "none". |
| Source | latest compliance's PageCite, or "your note" | |
| Referenced, not tracked | `ad_refs`/`sb_refs` in confirmed entries minus tracked | "{Lycoming SB 388C}, {subject when known}, is mentioned on {Engine p. 37} but not tracked." + link "Track it" (editors; creates an Open record and selects it with the editor open). |
| History table | `item_completion` rows with this `ad_compliance_id` (09 §2.2) | Columns Date · Tach · What was done · Trust · Page. "Show the {n} in between" collapses the middle. Line under it: "Every interval on the line is under {interval}. The longest was {h} h, from {year} to {year}." or, when one was exceeded, an alarm line "{n} intervals ran over {interval}: {list}." |
| Official reference | `ad_reference` | "FAA document": "Federal Register", "Official PDF", "FAA DRS document" links (open in a new tab, `external-link` icon); "effective {date}". Missing: "Look up the FAA record" (Button quiet s; runs `enrichViaDRS`). Miss: "Couldn't find this AD in the Federal Register or FAA DRS. Check the number; very old ADs are sometimes indexed differently." |
| A&P report tag | `verified_report_page_id` | Tag "A&P report on file" linking the report page on the right leaf. |
| Record compliance | Button primary s (editors) | Opens `?panel=record`: "Date complied", "Tach", "Method" ("e.g. Inspected per paragraph (f), no cracks"), "Which entry records it?" (Select of confirmed entries mentioning the AD, "The page isn't scanned yet"). Preview "Next due {…}". Primary "Record compliance". Adds an `item_completion`; the previous ones stay. |
| Edit | Button quiet s "Edit" (editors) | Opens the AD editor on the right leaf (`?panel=edit`). |
| Delete | Button quiet s "Stop tracking" (editors) | ConfirmDialog "Stop tracking AD {ref}? Its compliance history is deleted from the index. The logbook entries stay." Primary alarm "Stop tracking". |

**AD editor** (right leaf, white, replaces the mat while open; title "Track an AD or SB" or "Edit AD {ref}").
| Field | Binding | Rules |
|---|---|---|
| Kind | `kind` | Segmented "AD (mandatory)" / "SB (advisory)". Required: "Pick AD or SB." |
| Number | `reference` | Placeholder "2015-19-07". Required: "Enter the AD or SB number." |
| Title | `title` | Optional. |
| Status | `status` | Select: "Open", "Complied", "Complied before these records", "Does not apply", "Superseded". Required: "Pick a status." |
| Recurring | `recurring` | Checkbox; reveals "Every (hours)" `interval_hours` and "Every (months)" `interval_months`. A recurring AD needs one of them: "A recurring AD needs an interval: hours, months, or both." |
| Last complied | first event's date, hours, method | Only when creating; later compliances use Record compliance. |
| Related equipment | `component_id` | Select of installed equipment. Helper "Removing this part marks the AD not applicable from that date." |
| Applicability and notes | `applicability`, `notes` | Textarea. |
| Not applicable since / Superseded on | `status_changed_on` | DateInput; shown for those two statuses. |
| Reason | `reason` | Placeholder "e.g. vacuum pump removed"; required for Does not apply: "Say why it does not apply." |
| Next due | derived | Read-only line "Next due: {derived}" or "Next due is worked out once a compliance is recorded." |
| Actions | | Primary "Save", quiet "Cancel". Dirty form + Esc or navigation triggers the leave-without-saving ConfirmDialog. Values must be zero or more: "Intervals and hours are zero or more." |

**States.** Empty: "No ADs or SBs are tracked yet." + "Find ADs for {make} {model}" (primary, to W-MAINT-02) + "Track one by number". S-UNCONF: references found only in unconfirmed entries are not listed; footnote "References on {n} pages waiting for review will appear once confirmed." S-VIEW: no Track, Edit, Record or Stop tracking. S-ERR. Toasts: "AD {ref} tracked.", "Compliance recorded. Next due {…}.", "Stopped tracking AD {ref}."

**Spine.** Bracket the selected AD's compliance span ("2011 to 2027"); label "{from} to {to}".

**Acceptance criteria.**
- [ ] Recording compliance adds a history row; it never overwrites the previous compliance.
- [ ] Next due is never typed; it is derived from the latest compliance and the interval.
- [ ] Every compliance row and every next-due value carries its page or "your note".
- [ ] The four states read in words; not-applicable ADs show their reason and no line.
- [ ] Every field of today's AD editor (web-inventory §3.8) exists in the editor.

### W-MAINT-02 Find ADs

Mockup: b-w-findad. Route: `/aircraft/[id]/maintenance/ads/find` (`?q=keywords`, `?sel={candidateRef}`). Maintenance › ADs and SBs. BackLink "ADs and SBs". Split `1.55fr 1fr` (711 / 459). Editors and owner only. Replaces `/aircraft/[id]/compliance/explore`.

**Purpose.** Search FAA sources for ADs that name this aircraft or any installed part, sorted by how closely they match, and track the ones that apply with their interval.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Heading | | "Find ADs for {tail}" |
| Search terms | aircraft make and model + installed equipment makes and models | "Search the FAA for ADs that name" then removable chips: "Cessna 172N", "Lycoming O-320-H2AD", "McCauley 1C160", "Garmin GTN 650", "Rapco RA215CC", "ACK E-04"; chip "Add a part or keyword" (TextInput; comma-separated keywords, placeholder "fuel selector, Hartzell, seat rail"). Button secondary "Search again". |
| Summary | | "{n} candidates. {m} name this aircraft or a part on it. {k} you already track are hidden." |
| Results table | candidates | Columns AD · Subject · Why it came up · Effective. "Why it came up": "Names your {part}" / "Names {engine family} engines" + "Check your engine serial" / "Names {model}" / "Names Cessna single-engine models" / "Names Cessna, not {model}"; superseded ones: "Superseded by {ref}, which you track". Sorted by match strength (part, model, engine family, make). "Show {n} more that only name the make" expands. |
| Right leaf: candidate | selected candidate | "AD {ref} · FAA, effective {Mon YYYY}"; subject; abstract (3 to 6 lines); "On {tail}: {part}, installed {year}, {PageCite}." + the check to make ("Check its serial against the affected range before you track this."). |
| How it repeats | | Segmented "One time" / "Recurring"; for recurring: "Every" (hours and/or months inputs); "Next due" (Select: "At the next annual", "On a date" with DateInput, "At tach" with number). |
| Actions | | Primary "Track this AD" (becomes "Tracking" with a check, disabled); secondary "Doesn't apply" (opens a Reason field and tracks it as Does not apply, so it stops appearing); link "Read the AD on the Federal Register" (new tab) and "PDF". |
| Boundary line | | "A candidate is a lead to check with your A&P, not a finding that it applies." |

**States.** Searching: "Searching FAA sources…" (results area skeleton). Nothing to search: "Set the aircraft's make or model on Details, or add equipment, or type a keyword." No results: "No ADs found for these terms. Try a part name or keyword." Source down: "Couldn't reach the Federal Register or FAA DRS just now. Try again in a minute." S-OFF: "Finding ADs needs a connection." Viewers: redirected to W-MAINT-01.

**Interactions.** Selecting a row (or `J`/`K`) shows it on the right leaf (`?sel=`, replace). "Track this AD" creates `ad_compliance` (status open, or complied when a next-due choice implies a known compliance) with the interval and links the related component; toast "AD {ref} tracked." with "Open it" (to `/maintenance/ads?ad=[adId]`). The next-due chosen here is stored as a first planned due and is not wiped by a later edit (fixes the inferred bug in web-inventory §4.5).

**Spine.** None (label "whole life").

**Acceptance criteria.**
- [ ] Search uses the aircraft's make and model and every installed part, plus keywords.
- [ ] Already tracked ADs are hidden; superseded ones say what supersedes them.
- [ ] Track with an interval works for one-time and recurring, with next due by annual, date or tach.
- [ ] There is always a way back to the register (BackLink, sub-tab).

### W-MAINT-03 Squawks

Mockups: d-w-squawks (D), b-w-squawks. Route: `/aircraft/[id]/maintenance/squawks` (`?squawk=[squawkId]`, `?panel=new|send|resolve`). Maintenance › Squawks `{n}`. Board action primary "Report a squawk" (all roles). Split `1fr 1.15fr` (544 / 626).
Replaces `/aircraft/[id]/squawks`.

**Purpose.** Note something wrong, keep an eye on it, show its history on the airframe line, and hand it to a mechanic; once fixed, link the entry that cleared it.

**Layout.** Left leaf: "Open {n}" list, "Resolved {n}" list, "Severity" legend, "Next visit" note. Right leaf (white Leaf, not a mat): the selected squawk's detail.

**Elements, left leaf.**
| Element | Binding | Copy |
|---|---|---|
| Open list row | `squawk` where status open | Description (type.body-strong), "Reported {Mon D} by {first name} · {n} photos · {Book}", severity tag "Low" / "Watch" / "Ground" (Ground uses the alarm slip). Sorted Ground, Watch, Low, then newest. |
| Resolved list row | status resolved | Description, "Cleared by {entry summary}, {date}: "{quote}"" in type.paper for the quote, PageCite. Struck-through is not used; resolved rows are ink-2. |
| Severity legend | | "Low" "Fix at the next convenient visit." / "Watch" "Check it before each flight." / "Ground" "You have chosen not to fly until it is looked at." |
| Next visit note | next Visit | "Next visit: week of {date}, suggested on the line ahead. Both open squawks can be shown to {mechanic} at the {visit purpose}." + "Add to the visit" (editors; adds the squawks to the visit's notes). |

**Elements, right leaf (selected squawk).**
| Element | Binding | Copy / rule |
|---|---|---|
| Title | `description` | type.heading; editable inline by the reporter or editors ("Edit"). |
| Meta | `reporter_name`, `reported_at`, tach at report | "Reported {Mon D, YYYY} by {name} at tach {value}" |
| Severity | `squawk.severity` | Segmented Low / Watch / Ground (editors and the reporter); stored as `low`, `medium`, `high` (12-copy-and-voice.md labels). |
| Photos | `squawk_photo` (09 §2.8) | Thumbnails 120 × 90; click opens the ScanViewer lightbox; "Add a photo" (file input, JPEG, PNG, HEIC). Caption under the first: "{caption or date}. Click to enlarge." |
| Notes | `notes` | Text in type.body. |
| History on its line | entries matching the squawk's component and keywords (08-capabilities.md "related entries") | Heading "The {part} on the {book} line" + PageCite of the latest; a 120px line with stops for related entries and this squawk as a diamond, intervals labelled in years ("2.2 years", "5.7 years"). None found: "No earlier entries about this were found in the confirmed pages." |
| Mechanic | last mechanic who signed related work, or chosen | "{name}, A&P {cert}" + "Change". |
| Send to mechanic | Button secondary (owner and editors) | Opens `?panel=send` (creates a `mechanic_link` of kind squawk, 09 §4.12): "For" (TextInput, default the mechanic's name), "Shop or mechanic" (Select of providers, optional), "Squawks" (checkboxes, this one ticked; other open squawks offered), "Ends in" Segmented 7 / 30 / 90 days (default 30), Checkboxes "Include photos" (on) and "Show who reported it" (off); note "The link shows these squawks, their photos and related confirmed entries. No account needed. MyTailLog doesn't send it; you do." Primary "Make the link". Result: the URL with "Copy link", "Open in your email" (the returned `mailto`), a QRCode, "Ends {date}", and the link's opens; "Revoke" (ConfirmDialog). Online only. |
| Resolve with an entry | Button primary (editors) | Opens `?panel=resolve`: "Which entry cleared it?" Select of confirmed entries since the report (default the newest in the squawk's book), or "Write the entry now" (to W-BOOKS-11 with `closes=[squawkId]`), or "No entry, explain" (TextInput "What was done"); "Date resolved" (default the entry's date). Writes `resolved_at`, `resolved_by`, `resolved_log_entry_id`, `resolution_notes`. |
| Reopen | Button quiet (editors), resolved squawks | Reopens; toast with Undo. |
| Delete | Button quiet (editors) | ConfirmDialog "Delete this squawk and its photos? This can't be undone." |

**Report a squawk** (`?panel=new`, right leaf): Photo first ("Add photos", drop zone 120px tall), "What's wrong?" Textarea (required: "Describe what you noticed."; placeholder "e.g. Left brake feels soft on taxi"), Severity Segmented (no default; the owner must choose), "Tach now" (optional, default latest reading), primary "Report squawk". Toast "Squawk reported." The new squawk is selected. All roles may report.

**States.** No open squawks: "No open squawks." (no emoji) and the resolved list. No squawks at all: "Nothing reported yet. Report anything you notice in flight or on the ramp; it stays open until it's cleared by an entry." S-VIEW: viewers report; no resolve, reopen, delete, send, severity change on others' squawks. S-OFF: report disabled (web is online-only for writes). S-ERR.

**Mechanic link page** (`/m/[token]`, public, no rail, `noindex`; 09 §4.12). A light leaf at max width 760px: "{tail}, {year make model}",
"Shared by {owner} for {recipient}" + "Read-only · open until {date}"; one block per squawk: description, severity word, "Reported {date}"
(and by whom only when included), photos (click to enlarge), "Related entries" with page crops and PageCites when the owner included them;
for a visit link: "Week of {date} at {place}", items with their limits and last-done page crops. Footer: "The paper logbooks are the legal
record. This page shows what the owner chose to share." Ended or revoked: "This link has ended. Ask the owner for a new one." Each open is counted.

**Spine.** No window; squawks drawn as diamonds at their dates (filled open, hollow resolved); label "squawks marked"; clicking a diamond selects that squawk.

**Acceptance criteria.**
- [ ] Any role can report; only editors and the owner resolve, reopen, delete or send.
- [ ] Resolving asks for the entry that cleared it (or a written explanation) and stores the date and person.
- [ ] Resolved squawks show the clearing entry's quote and page.
- [ ] Send to mechanic makes a link (7, 30 or 90 days) that shows only the chosen squawks, their photos and related entries; MyTailLog never sends it itself.
- [ ] The Squawks sub-tab and the Maintenance rail line show the open count.

### W-MAINT-04 Annual prep

Mockups: d-w-annualprep (D), b-w-annual. Route: `/aircraft/[id]/maintenance/annual`. Maintenance › Annual prep. Readout "Last annual
{date}"; primary "Share with your IA" (owner). Split `2fr 1fr` (780 / 390). Replaces `/aircraft/[id]/annual`.

**Purpose.** Everything to settle before handing the aircraft and the books to the IA: what falls due on the way, what rides along with
the annual, the squawks for the shop, the loose ends in the records, each with its next step, and a read-only room for the IA.

**Layout (left leaf).** Verdict; line ahead from today to the annual (240px); "Falls due before the annual"; "Rides along at the {date} visit"; "Recurring ADs"; "For the shop"; "Loose ends in the records". Right leaf: "For your IA" (white Leaf top part) and the last annual's page (SourceMat bottom part, 320px).

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Verdict | | "The next annual is due {date}, in {d} days. On the way: {n} items fall due, {q} squawks for the shop and {l} loose ends in the records." |
| Line ahead | today to the annual's due + 14 days (09 §3.4) | Visits (suggested and booked), the annual visit cap, open squawks as diamonds on the airframe line labelled "{q} open squawks", recurring AD rings, due rings. |
| Falls due before the annual | DueItems due before the annual | DueRows as W-STATUS-01, with "Mark done" (editors). Empty: "Nothing else falls due before the annual." |
| Rides along | items due with the annual (same month) | DueRows: annual inspection, ELT inspection. |
| Recurring ADs | recurring ADs | Row: "AD {ref} {subject}" + "every {interval} · do it at the {visit} visit, about {h} h early · {PageCite}" + next due + left + StatusMark. |
| For the shop | open squawks | Row: description, "reported {date} by {name} · photo attached · {history note}", severity, Button "Send to mechanic" (editors). A squawk with a draft entry shows "fix written up, not yet signed" + "Open draft" (to W-BOOKS-11). Empty: "No open squawks." |
| Loose ends | records-check findings + review queue + W&B stale + written-versus-calculated disagreements | Each row: what, why it matters ("the IA will ask where those annuals are"), and one action: "Show the gap" (W-BOOKS-04), "See the check" (W-AIRCRAFT-01 anchor), "Open W&B" (W-AIRCRAFT-04), "Review {n} pages" (W-BOOKS-08), "All {n} records findings" (W-MAINT-05). Pages not yet read: "{n} pages not read yet" + "See the queue". |
| For your IA | record room preset `audience = ia` | "A read-only record room for {IA name, cert}. Its cover is this line ahead and the whole-life map." Contents (checkbox list, editable before sharing): "This checklist and the line ahead", "All {n} logbooks, {m} confirmed entries", "Page scans, {p} pages", "Documents, {d}". "Open until {annual due + 1 month}". Primary "Share with {IA}" (owner; creates the room and opens W-SHARE-01 with it selected). Secondary "Print the summary for your IA" (to `/share/summary`). IA unknown: "Share with your IA" with a Name field. |
| Last annual page | the last annual entry | Caption "Last annual, {PageCite}" / "{date} at tach {value}". |

**States.** Annual date unknown: notice "The date of the last annual isn't known yet, so this page looks 90 days ahead." + "Set the annual date" (editors; to `/setup`). Annual overdue: verdict "The annual was due {date}. It has lapsed by {d} days." S-VIEW: no share, mark done, send. S-ERR per section (each section loads independently and fails alone with "{Section} could not be loaded.").

**Spine.** Bracket today to the annual due; label "to the annual".

**Acceptance criteria.**
- [ ] Every row on this screen has an action that settles it here or opens the exact object (not the top of another page).
- [ ] The IA room is created from the preset in one press and lands in the Share hub selected.
- [ ] Unknown annual date falls back to a 90-day look-ahead with the notice.

### W-MAINT-05 Records check

Mockup: b-w-audit. Route: `/aircraft/[id]/maintenance/records-check` (`?finding=[findingId]`, `?panel=explain`). Maintenance › Records check `{n}`. Readout "Checked after every review · last {date}". Split `1.9fr 1fr` (766 / 404). Replaces `/aircraft/[id]/audit` and `/aircraft/[id]/duplicates`.

**Purpose.** Every place the records look missing or mistyped, each with its fix: scan or explain a gap, delete a duplicate scan (asks first), accept a corrected reading. Nothing here changes what is due until the owner decides.

**Elements.**
| Group | Finding row | Actions (editors) |
|---|---|---|
| Lede | "{n} things in the records look missing or mistyped. Nothing here changes what is due until you decide." | |
| Gaps | "No airframe pages for 1983 to 1991" + "Nine years with no annual found. Engine and prop entries exist for most of those years, so pages may be missing rather than the aircraft stored." / "No annual found for {year}" + "The engine log has entries that year · {PageCite}" / "~{n}-year gap in records ({a} to {b})" | "Scan these pages" (W-BOOKS-06 with `book` and the span), "Show on the map" (`/logbooks/map?gap=[gapId]`), "Explain the gap" (`?panel=explain`: Radio "No pages exist for these years" (`no_pages_exist`), "I've asked the previous owner" (`asked_previous_owner`), "It isn't a real gap" (`dismissed`), plus "Note" Textarea; writes `logbook_gap.status` and `note`, 09 §2.6). An explained gap stays on the map: dashed while asked, thin solid with "no pages exist", not drawn when dismissed (10, 08 C-BOOKS-02) |
| AD compliance | "AD {ref}: recurring, no compliance recorded" / "AD {ref}: past its next due with no newer compliance" | "Open the AD" (W-MAINT-01), "Search {year}" (W-ASK-01 with the query) |
| Duplicate scans | "Engine p. 22 and p. 23 look like the same page" + "Photographed twice on {date} · p. 23 has {n} entries that repeat p. 22" | "Keep both" (dismisses), "Delete p. 23 and its {n} entries" (ConfirmDialog naming what goes; the suggested keep is the page with more confirmed entries) |
| Duplicate entries | "{n} entries look like the same logged event" + dates and pages | "Keep both", "Delete the copy" |
| Mis-keyed readings | table Entry · Reads · Suggested: "{date} {kind}" + reason ("lower than {date} ({value}) and identical to {date}", "MyFlightBook · hobbs is the same value as tach", "unusually large jump") · "tach 4131.5" · "4151.5 read again from the page" | "Use {value}", "Keep", "Clear {field}" |
| Footnote | "These checks are rules of thumb over the confirmed entries. They catch a lot, not everything; the paper books stay the record." | |

Right leaf: for duplicates, both pages side by side ("Engine p. 22 and p. 23, side by side" / "Same entries, same ink, photographed twice") with a line on what deleting loses ("Page 22 was confirmed by you on Oct 4. Page 23 is still waiting for review, so deleting it loses nothing confirmed."); for gaps, the pages either side; for readings, the page with the value lit.

**States.** Nothing found: "Nothing looks missing or mistyped. The checks are rules of thumb; give the pages a look too." Dismissed and explained findings: under a collapsed "Settled · {n}" group with "Undo" per row. S-VIEW: findings read-only. S-UNCONF: checks run on confirmed entries only; line "{n} pages waiting for review were not checked."

**Spine.** Bracket the selected finding's span; action "Show on the map".

**Acceptance criteria.**
- [ ] Every finding type of today's audit and duplicates screens appears here with at least one action.
- [ ] Deleting a duplicate names the page and entry counts and asks first.
- [ ] An explained gap shows its status and note on the map, the room and the dossier (dismissed gaps excepted).
- [ ] A count of open findings shows on the sub-tab.

### W-MAINT-06 Tracked items setup

Not drawn in B or D; built from B's table anatomy (b-w-due) and today's item form (web-inventory §3.7). Route:
`/aircraft/[id]/maintenance/items` (`?item=[itemId]`, `?panel=new|edit`, `?provider=[providerId]`). Maintenance › Tracked items. Primary "Track an item" (editors). Split `1.6fr 1fr` (720 / 450). Replaces the item form, seeding, and "Update from logs" of `/aircraft/[id]/maintenance`.

**Purpose.** Set the rule for each tracked item (interval, meter, regulatory or advisory, reminder lead) and add custom items. Reading what is due happens on Status; this is the rule book.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Lede | | "The rules MyTailLog counts by. What is due is on Status." + link "What's due". |
| Items table | `maintenance_item` | Columns: "Item" (label + LineChip of its line), "Every" ("12 calendar months", "50 hours or 4 months", "30 days"), "Counted on" ("Tach", "Hobbs", "Airframe", "Calendar"), "Kind" ("Required" for regulatory, "Advisory"), "Last done" (date and tach + PageCite or "you typed it"), "Remind" ("30 days", "10 hours"), actions "Edit" (selects the row, form on the right leaf) and "Open its history" (W-STATUS-04). |
| Recurring ADs rows | `ad_compliance` recurring | Shown read-only at the foot under "Recurring ADs" with "Edit in ADs and SBs". |
| Documents with expiry | documents with an expiry | Under "Papers with an expiry": registration, insurance, with "Edit in Documents". |
| Seed | when no maintenance items | Button primary "Add the standard Part 91 items" (annual, transponder, pitot-static, ELT); toast "Added the standard Part 91 items." |
| Find completions | Button secondary "Find completions in the logs" (editors; needs AI allowance) | Runs `POST …/maintenance/scan` over confirmed entries; result inline: "Updated {n} items from {m} entries." / "Checked {m} entries. No completions found." / allowance errors verbatim from 09-data-and-api.md. Helper "Last-done dates update by themselves as pages are confirmed. Use this to check the whole history again." |

**Item form** (right leaf; title "Track an item" or "{label}").
| Field | Binding | Rules |
|---|---|---|
| Type | `kind` | Select: "Annual inspection (91.409)", "100-hour inspection (91.409)", "Transponder (91.413)", "Pitot-static and altimeter (91.411)", "ELT inspection (91.207)", "VOR check (91.171)", "Oil and filter change", "Engine TBO", "Propeller overhaul", "Custom". Choosing a standard type prefills interval, meter, regulatory and line (defaults from web-inventory §3.7). |
| Name | `label` | Required: "Give the item a name." |
| Every (months) | `interval_months` | Calendar-month rule applies to 91.409, 91.411, 91.413, 91.207 (helper "Due at the end of the month."). |
| Every (hours) | `interval_hours` | |
| Hours counted on | `meter` | Segmented Tach / Hobbs / Airframe. Helper "Oil changes usually count hobbs time; inspections count tach." |
| Book | `maintenance_item.line` | Select Airframe / Engine / Propeller / Avionics: "Which logbook its entries are written in." |
| Expires on | `maintenance_item.expires_on` | For expiry items (ELT battery): a date instead of an interval. |
| Done by | `shop_kind`, `provider_id` | Select of kinds (Mechanic, Avionics shop, Prop shop, Engine shop, "I do it myself") then provider (Select of this aircraft's shops and mechanics, "Default for the kind"). |
| Rides along within | `visit_window_days`, `visit_window_hours` | Two numbers, defaults 60 days and 25 hours; helper "How early this item may be done to share a shop visit." |
| Last done | `last_done_date`, `last_done_hours` | DateInput and number; or "Find it in the logs" (links to Ask with a prefilled question). |
| Required by regulation | `regulatory` | Checkbox "Required under Part 91. Untick for advisory items like TBO." |
| Remind me | `remind_lead_days`, `remind_lead_hours` | Selects; default from the account's category leads. |
| IFR only | `ifr_only` | Checkbox. |
| Notes | `notes` | Textarea. |
| Actions | | Primary "Save" (toast "Item saved."), quiet "Cancel", quiet alarm "Stop tracking" (ConfirmDialog "Stop tracking {label}? Its history stays in the logbooks; it just won't be counted."). |

**Shops and mechanics** (section under the items table; `service_provider`, 09 §2.4; 08 C-PLAN-04). Rows: name, kind, certificate,
airport, "Default for {kind}" tag, email and phone; "Edit", "Remove" (ConfirmDialog "Remove {name}? Items that use it fall back to the
default for their kind."). "Add a shop or mechanic" opens the provider form on the right leaf (`?provider=new`): Name (required), Kind
(Mechanic, Avionics shop, Prop shop, Engine shop), Certificate number, Airport, Email, Phone, "Default for this kind" Checkbox. Proposals:
"Found in the logs: {name}, {cert}, signed {n} confirmed entries." + "Add" / "Not now" (never created by itself).

Validation: "Give it an interval in months, hours, or both.", "Intervals and readings are zero or more." S-VIEW: tables read-only, no forms. S-ERR. Empty: seed button plus "Track an item".

**Spine.** None (label "whole life").

**Acceptance criteria.**
- [ ] Every field and standard type from today's item form exists.
- [ ] Editing a rule updates What's due at once.
- [ ] Rows link to the item's history (W-STATUS-04) and back.

---

## Logbooks

### W-BOOKS-01 Map

Mockup: d-web-map (d/index.html). Route: `/aircraft/[id]/logbooks/map` (`?stop=[entryId]`, `?visit=[interchangeId]&book=`, `?gap=`, `?book=`, `?from=&to=`). Logbooks › Map. Data: `GET /api/aircraft/{id}/map` (09 §4.6); rules 09 §3.7, 08 C-BOOKS-02; drawing and keyboard 10 §8.2, §9, §10.
Primary "Add pages" (editors). Split `1.62fr 1fr` (723 / 447). Replaces `/aircraft/[id]/timeline` and the overview's coverage and recent-activity panels.

**Purpose.** The aircraft's whole life as a route map: each book a line, each confirmed entry a stop, each visit that signed several books an
interchange, gaps dashed, the engine's time since overhaul shaded, the road ahead dotted. Any stop puts its page on the right leaf.

**Layout (left leaf).**
| Region | Size | Content |
|---|---|---|
| Controls row | 40px | FilterChips "All books", "Airframe", "Engine", "Propeller", "Avionics" (each with its LineChip ink); Segmented "Map" / "List" at the right. |
| Heading row | 28px | "{years} years, {n} confirmed entries" (type.heading 18px) + MapLegend: "pages", "no pages yet", "ahead", "one visit, several books". |
| RouteMap | 667px wide (viewBox 820 × (lanes × 80 + 72), 10 §8.2) | The map. |
| Decade axis | 24px | Ticks every 10 years, "Nov 2025" at the scale break, "Today", final year. |
| Under the map | 20px | "{n} entries without a date" + "Review" when there are any (08 C-BOOKS-02). |
| Selection detail | auto | The selected stop, interchange or range (below). Nothing selected: "Click any stop to open its page. Drag across the axis or the spine to pick a stretch of years." |

**RouteMap content.**
| Mark | Binding | Rule |
|---|---|---|
| Lines | logbooks airframe, engine, prop, avionics | Horizontal, fixed y per book, 6px; name at the left edge. Other is not a line. |
| Stops | `stops` (one per book and date, 09 §3.7) | Small circle on the book's line. Every stop has a leaf fill and an ink stroke; `ai_read` stops (read, not confirmed) have a dotted stroke (`stop unconf`, 10 §6). More than 200 stops in view aggregate to one marker per book per month with a count until zoomed (08 C-BOOKS-02). |
| Interchanges | `interchanges` (same date on two or more books, shared certificate or tach within 0.5 h) | `cap` spanning the lines; labelled for annuals ("1998 annual", "2011 annual", "Jul 14"). |
| Gap | `gaps` (`logbook_gap`) | `open` and `asked_previous_owner`: dashed, labelled "no pages, {from} to {to}" (plus "asked previous owner"); `no_pages_exist`: thin solid labelled "no pages exist"; `dismissed` and `filled`: not drawn. |
| Eras | last overhaul per engine and prop | Light band behind the line from the overhaul to today, labelled "{h} h since overhaul"; the overhaul stop labelled "Overhauled {year}". |
| Installs | equipment installs with an STC or 337 | Labelled ("GTN 650, 2019"). |
| Ahead | DueItems | Dotted line to the end of the window; due rings as on Status ("VOR lapsed", "Jul 31"). |
| Today | | Vertical rule. |
| Labels | | 12 to 13px, horizontal, never overlapping a cap, stop or another label; when two collide the less important drops (priority: gap, overhaul, annual interchange, install, other). |

**Selection detail.**
| Selected | Left leaf shows | Right leaf shows |
|---|---|---|
| Stop (`?stop=[entryId]`) | Date and kind ("Sep 14, 2005 · Engine overhaul"), the entry text in type.paper (first 400 characters, "Open entry" for the rest), TrustMark, meters, "Before it on this line: {date} · after it: {date}" with links. A stop holding several entries of one book lists each. A read-but-unconfirmed stop adds "Read by AI, not yet confirmed" and "Review this page" (owner and editors). | SourceMat with the page, the entry lit; caption "{Book} logbook, page {n}" / "{date} · {trust}"; "Open entry" (on-mat Button) to W-BOOKS-10. |
| Interchange (`?visit=[interchangeId]`) | "{date}" + "{kind}, {n} books"; one block per book: book name, the entry text in type.paper (2 lines), TrustMark. | SourceMat with BookTabs (02 §4.10), one per book ("Airframe p. 41", "Engine p. 14", "Propeller p. 6"); caption "{visit name}, one visit" / "{signer, cert} · tach {value}". `?book=` picks the tab. |
| Range (dragged on the axis) | "{from} to {to}, {n} entries" and the entry list of that range (EntryRows); Button "Zoom to this range" (sets `from`/`to`). | The first entry's page. |
| Gap (`?gap=`) | see W-BOOKS-04 | |

**Interactions.**
Interactions follow 10-line-map.md §9 (mouse) and §10 (keyboard: arrows, Home/End, Page Up/Down, Enter selects, Shift+Enter opens, `+`/`−`/`0`, `l` list view, Esc). In summary:

| Input | Result |
|---|---|
| Hover a mark | MapTooltip (02 §4.11). |
| Click a stop, interchange or gap | Select (query parameter, replace). |
| Double-click a stop | Open W-BOOKS-10 (push). Double-click an interchange: zoom to ±1 year. Double-click a gap: zoom to the gap. |
| Drag on the axis | Selects a range; the detail lists its entries and offers "Zoom to this range". |
| Ctrl or Cmd with wheel, or pinch | Zoom time around the pointer; updates `from`/`to`. |
| FilterChip | `?book=` (replace); one book gives W-BOOKS-02. "All books" clears. |
| Segmented "List" or `l` | `/logbooks/list` with the same parameters (W-BOOKS-12). |

**States.** S-LOAD (lines drawn grey, no stops). No entries: renders the lines dashed with "No confirmed entries yet. Add pages and confirm them to draw the map." + "Add pages" (editors). One book only: other lines drawn dashed with "no pages yet". S-ERR: "The map could not be drawn." + "Try again" + link "Use the list" (the list may still load). Selected entry deleted: notice (03 §11.5). Only the Other book has pages: EmptyState "Add pages to a logbook to see the map." S-VIEW: no Add pages, no review links. S-OFF: readable from loaded data.

**Spine.** Window = the visible range (whole life unless zoomed), label "whole life", link hidden; spine drags drive this map in place.

**Accessibility.** The List view is the text equivalent (10 §10 "Show as list"); the map is a `role="group"` named "Route map of {tail}'s logbooks, {start} to {end}" with the keyboard model of 10 §10.

**Acceptance criteria.**
- [ ] Every dated, non-replaced entry is in exactly one stop on its book's line; unconfirmed stops are hollow and never change rings, visits or the verdict.
- [ ] Multi-book visits are interchanges; selecting one shows every page of the visit as tabs.
- [ ] Gaps are dashed and labelled; selecting one gives W-BOOKS-04.
- [ ] Labels never overlap (check at 1280, 1440, 1920 and with each single-book filter).
- [ ] Every selection is a URL; reloading restores it; Back leaves the map in one press.
- [ ] Keyboard-only users can reach every stop and open its entry.

### W-BOOKS-02 Map, one book

Mockup: d-w-map-engine (D). Route: `/logbooks/map?book=engine` (with any `stop`). As W-BOOKS-01 except:

| Element | Rule |
|---|---|
| Heading | "{Book} logbook, {n} entries" + "{component}, S/N {serial}" ("Lycoming O-320-H2AD, S/N L-14238-27A") + "{k} other books shown faint". The other lines stay at 25% opacity so interchanges still read (10 §8.2; d-w-map-engine removes them, 10 overrides). |
| Map | One line (6px stroke) with the map's full height given to its labels; eras shaded and labelled: engine "Factory engine, 0 to {h} h" and "Since overhaul, {h} h" + "{h} h to TBO"; prop likewise; airframe and avionics have no eras. All stops labelled where space allows. |
| Selection detail for an overhaul stop | Entry text (paper), TrustMark with confirm date ("Confirmed by you, Apr 2, 2026"), "Tach {value} · {signer}". HungSection "Counts from here": "Time since overhaul" "tach {now} less {at overhaul}" = "{h} h" StatusMark "Counted"; "Engine TBO" "{tbo} h, advisory for Part 91" "{left} h left" "Advisory"; "Written versus calculated" "{PageCite} says {x} SMOH at the {date} annual; the meters say {y}" + "Match" or "{d} h apart" (link to W-AIRCRAFT-01's check). |
| Right leaf | The overhaul page; caption "Before it on this line: {date} · after it: {date}". |

Spine: bracket the book's era (for engine, overhaul to today); label "whole life". Acceptance: [ ] era bands match W-AIRCRAFT-01's figures exactly; [ ] the time-since-overhaul figure uses confirmed entries and the latest meter reading only.

### W-BOOKS-03 Map, decade zoom

Mockup: d-w-map-decade (D). Route: `/logbooks/map?from=2005&to=2015` (with any selection). As W-BOOKS-01 except: heading "{from} to {to}, {n} entries";
legend "entry", "one visit, several books"; when the range is 12 years or less every stop carries its date label (two lines when needed: "Nov 12" / "2008"); off-window books
say so ("No avionics book before 2019"). Spine bracket = the window; spine action "Whole life" clears the zoom. Zooming below 1 year
snaps to 1 year; a window wider than the life clears the zoom. Acceptance: [ ] dragging the spine or the map, or typing the URL, all give the same window; [ ] every stop in the window is labelled without overlap, or the map grows taller (up to 520px) to make room.

### W-BOOKS-04 Gap selected

Mockup: d-w-map-gap (D). Route: `/logbooks/map?gap=[logbook_gap.id]`. As W-BOOKS-01 with the gap selected. Data: `GET /api/aircraft/{id}/gaps/{gapId}/evidence` (09 §4.7; rules 09 §3.8). Replaces the gap list of `/aircraft/[id]/audit`.

| Region | Content |
|---|---|
| Map | The gap's years tinted across every line ("Selected: {n} years"); entries of other books in those years labelled with counts ("11 entries", "3 entries"). |
| Left leaf heading | "No {book} pages, {Mon YYYY} to {Mon YYYY}" + legend "no pages yet". |
| What the other books show | `otherBooks[]`: one row per other book with entries in the span: "{Book}" "{n} entries: {summary}" ("11 entries: 7 annuals, a #3 cylinder in 1987"), "tach {a} to {b}" and the page range ("Engine p. 6 to 11"); then "about {hoursFlownApprox} hours flown". Books with nothing: "No {book} entries either." Unconfirmed pages of this book inside the gap: "{n} pages read, not yet confirmed" + "Review them". |
| Reading | `verdict` (09 §3.8): "The aircraft flew and was inspected. The {book} pages for those years are what is missing." or "The other books show {n} entries in those years." |
| Actions (owner and editors) | Primary "Scan the missing pages" (W-BOOKS-06 with `book` and span); secondary "Mark "no pages exist"" (`no_pages_exist`) and "Note: asked the previous owner" (`asked_previous_owner`), each with an optional note; quiet "It isn't a real gap" (`dismissed`). Toast "Noted. The gap stays on the map with your note." (or, dismissed, "Removed from the map. Undo"). A set status shows with "Change". |
| Right leaf | "Either side of the gap" / "The last {book} page before it and the first after"; two ScanViewers stacked, captions "{Book} vol. {v}, page {n} · {date}". |

Spine: bracket the gap; label "{from year} to {to year}"; action "Whole life". Acceptance: [ ] the other books' counts and tach span come from confirmed entries; [ ] a note never hides the gap; [ ] viewers see the explanation but no actions.

### W-BOOKS-05 Pages library

Mockup: b-w-pages. Route: `/aircraft/[id]/logbooks/pages` (`?page=[pageId]`, `?book=&vol=&state=`). Logbooks › Pages. Primary "Add pages" (editors). Split `250px 1fr` (250 / 910). Replaces `/aircraft/[id]/pages`.

**Purpose.** Every page by book and volume, each marked with its state in the trust vocabulary; select many to move misfiled pages, read them again or delete them; reorder to the paper's order.

**Left leaf (250px): books.**
| Element | Binding | Copy |
|---|---|---|
| Book rows | `logbook` + page counts | "Airframe 198" with nested volumes "Vol. 1, 1978 to 1997 · 102", "Vol. 2, 1997 to 2026 · 96" (volumes as in the map model's `lines[].volumes`, 09 §4.6); "Engine 118", "Propeller 41", "Avionics 38", "Other 17". Selecting sets `?book=&vol=`. |
| Summary | | "{n} pages in all." + gap note "{Book} volume {v} has no pages for {from} to {to}." |
| First read link | | "First read of {book}" for each book whose first read exists (W-BOOKS-09). |

**Right leaf: page grid.**
| Element | Binding | Copy / rule |
|---|---|---|
| Heading | | "{Book} logbook, volume {v}" + "{n} pages · {from} to {to} · showing pages {a} to {b}". |
| State filter | `state` | FilterChips "All", "To review {n}", "Confirmed", "Being read {n}", "Couldn't be read {n}". |
| Sort | | Select "Paper order" (default, `page_sequence`), "Entry date", "Tach", "Upload order"; direction toggle. Remembered per browser. |
| Reorder | Button quiet "Reorder" (editors; only in Paper order with one volume) | Thumbnails become draggable (grip handle; keyboard: Space to lift, arrows to move, Space to drop); "Done reordering" saves (`reorderPages`); toast "Saved the order of {n} pages." |
| Thumbnails | PageThumb (02 §6.3), `page.thumbnail_path` | 120 × 160px, 6 per row at 1440, `page_sequence` under it ("p. 30"), state mark: TrustMark read by AI for extracted pages with unconfirmed entries, "Needs a look" (alarm ring) when `page.needs_look`, confirmed (filled), "Waiting to be read" (`queued`), "Waiting for tomorrow's allowance" (`waiting_allowance`), "Being read" (`processing`), "Couldn't be read" (`failed`, alarm slip). Two-page spreads show "2 pages" tag. Rotated content flagged with an `info` tag "Sideways text". |
| Selection | checkbox on hover/focus (editors) | Selection bar: "{n} pages selected" + "pp. {a} to {b}, {m} entries"; "Move to another book" (Select of books and volumes; entries move with the page; the scan stays one image), "Read again" (re-extract; ConfirmDialog "Read {n} pages again? Their unconfirmed entries are replaced. Confirmed entries are kept."), "Delete" (ConfirmDialog "Delete {n} pages and their {m} entries? This can't be undone. Confirmed entries on them are deleted too."), "Clear". |
| Smart hint | heuristics (08-capabilities.md) | "Pages {a} to {b} look like {book} logbook pages filed here by mistake." + "Move them". |

**Page selected** (`?page=`): a Drawer (02 §3.15) with mat fill slides over the grid's right 480px: the page in a ScanViewer, "{Book} vol. {v}, page {n}", state, "{n} entries · {m} confirmed", extraction error text if any ("The reader stopped: {reason}"), Buttons "Open in the review desk" (editors, W-BOOKS-07), "Read again" (editors), "Crop and read again" (editors, opens W-BOOKS-07 with the crop tool), "Delete page" (editors). Viewers see "Open entry" links per entry instead.

**States.** No pages: "No pages yet." + "Add pages" (editors) / "{owner} hasn't added pages yet." (viewers). Empty filter: "Nothing to review here." / "Nothing being read." / "No pages in {book} yet." AI unavailable: "Reading is paused: {reason from allowance rules}. Pages wait and are read when it resumes." S-VIEW: no checkboxes, reorder or actions. S-OFF.

**Spine.** Bracket the selected volume's span; label "{from} to {to}".

**Acceptance criteria.**
- [ ] Every page shows its state with a mark and a word (not colour alone).
- [ ] Reorder, move, read again and delete work on many pages at once and name what they affect before acting.
- [ ] Reading starts by itself after upload; no "Extract pending" button is needed (it remains only as "Read again").
- [ ] Viewers can browse pages read-only.

### W-BOOKS-06 Add pages and the reading queue

Mockups: d-w-queue (D), b-w-addpages. Route: `/aircraft/[id]/logbooks/add` (`?book=&vol=&capture=1`). Logbooks › Pages lit. Split `1.25fr 1fr` (650 / 520). Editors and owner. Replaces `/aircraft/[id]/upload`, `/aircraft/[id]/capture`, and the "Extract pending" step of `/pages`.

**Purpose.** Put pages in (files, the phone, or this device's camera), see where they will land on the map, and watch one queue from upload to reading to review, with today's reading allowance in plain numbers. Reading continues after the owner leaves the page and announces itself when done.

**Left leaf.**
| Element | Binding | Copy / rule |
|---|---|---|
| Landing map | lines for the target book and its neighbours over the span the pages land in | "Where the new pages land" + "{from} to {to}"; incoming pages as hollow stops (`stop unconf`) on their line, a bracket labelled "{source}: {n} landed, {m} being read"; waiting pages labelled "{n} from {day}, to review"; a gap that the pages fall into keeps its dashed label until pages are confirmed ("gap, still no confirmed pages"). Legend "read, not confirmed". |
| Into | `logbook`, volume | Select "Into {Book}, {volume label}" (default from `?book=`, else Airframe newest volume); "New volume" option. |
| Place them | | Segmented "In date order" (default when the volume has dated pages; pages are placed by the dates the reader finds) / "After page {n}" (Select) / "At the end". |
| Drop zone | | 180px tall dashed Well: "Drop PDFs or photos here or choose files." (the link opens the picker) + "Long PDFs are split into pages, in order." + "PDF, JPEG, PNG and iPhone HEIC". Drag-over state: "Drop to add {n} files". |
| Handwritten | `page.is_handwritten` | Toggle "Handwritten pages" (default on) + "Read by the handwriting model. Turn off for typed or printed pages." |
| Phone hand-off | | "Or scan with your phone" + QR (160px) + "Point your phone's camera at this code. It opens the scanner on this logbook, and every page you photograph joins the queue and lands on the map." + "Works without signal. Pages wait on the phone and upload later." The QR encodes `https://{host}/aircraft/{id}/logbooks/add?book={type}&vol={v}&capture=1` (universal link: opens the phone app's M-SCAN-02 when installed, otherwise this page's camera mode). |
| Camera (camera-capable devices, or `capture=1`) | | Button secondary "Take photos with this device". Opens the CameraCapture view inside the left leaf: live preview 3:4, "Page {n}", shutter, "Done". Each shot gets the quality check (short edge 1000px or more, sharpness 80 or more, glare 4.5% or less); a failed check shows the shot with the reason ("Too small to read. Move closer.", "Looks blurry. Hold steady and let the camera focus.", "Glare on the page. Tilt it or move away from the light.") and "Retake" (primary) / "Keep it anyway". Shots queue on the device (IndexedDB) and upload when online (service worker), as today. |

**Right leaf: the queue** (white Leaf; heading "The queue" + "Carries on if you leave this page").
| Stage | Binding | Copy |
|---|---|---|
| On this device | IndexedDB queue | "On this device · {n} pages" + "They upload when you're online." (only when non-empty) |
| Uploading / Uploaded | `scan_batch` (09 §4.8) | "Uploading · {i} of {n}" + "{file} · splitting into pages" → "Uploaded · {n} of {n}" + "{file} split into {n} pages". Per-file errors: "{file}: not a PDF, JPEG, PNG or HEIC.", "{file}: couldn't be read." Low-quality pages: "{n} pages look low quality. They'll still be read." |
| Already have it? | `duplicate_of_page_id` (09 §3.9.3) | "{n} pages look like pages you already have." Per page: both thumbnails side by side, "{Book} p. {n}, scanned {date}", Buttons "Keep both" and "Skip this one". Until answered, the page waits and uses no allowance. |
| Waiting to be read | `queued` | "Waiting to be read · {n} pages". |
| Being read | `processing` | "Being read · {n} pages" + a small strip of thumbnails; live region "Reading page {i} of {n}" (11 §5, at most every 5 s). |
| Waiting for tomorrow's allowance | `waiting_allowance` | "{n} pages wait for tomorrow's allowance, from about {time}." + "Add your own key" (`/account/settings#ai`). |
| Waiting for you | pages needing review | "Waiting for you · {n} pages" + "Scanned {day}, {date}. {c} read cleanly, {d} have a doubtful date or tach." + Button primary "Review {n} pages" (W-BOOKS-08). |
| Couldn't be read | `extraction_status = failed` | "{n} pages couldn't be read" + reason + "Read again". |
| Reading today | `ai_usage` rolling 24 h | "Reading today · {used} of {cap} pages used" + "shared allowance" or "your own key"; CoverageBar. Then: "The {n} pages left fit." / "{k} of these fit today. The rest wait their turn tomorrow, or add your own key." (link to `/account/settings#ai`). Allowance messages verbatim per 09-data-and-api.md. |
| Announce | | "We'll tell you here and by email when these are read." When the batch completes (one notification per batch, 09 §3.9.1) a Toast appears on whichever screen is open: "{n} pages are read. {d} need a look." with "Review" (`/logbooks/review?batch=`); the same item lands in the inbox. |

**Behaviour.** Upload creates a `scan_batch` and pages with `extraction_status = queued`; a server worker reads them (no open tab needed; 09 §3.9.1). The queue polls `GET /api/aircraft/{id}/reading-queue` every 5 s while anything is in flight. Allowance is shown in pages (`pagesUsedApprox` of `pagesCapApprox`).

**States.** Nothing in the queue: right leaf shows "Nothing in the queue." + today's allowance. Offline: drop zone and camera still queue to the device; banner "You're offline. Pages are kept on this device and upload when you reconnect." AI unavailable: "Reading is paused today. Pages upload now and are read when it resumes." Viewers: route redirects to `/logbooks/pages`.

**Spine.** Bracket the span the incoming pages land in; hollow stops for unconfirmed pages; label "{from} to {to}".

**Acceptance criteria.**
- [ ] Files, phone hand-off and in-browser camera all feed the same queue.
- [ ] Camera shots get the blur, glare and size check with the three reasons.
- [ ] Pages queue on the device offline and upload later.
- [ ] Reading needs no manual step and continues with the tab closed; completion is announced.
- [ ] The allowance shows used and cap in pages, and what happens past the cap.
- [ ] Incoming pages are drawn as hollow stops on the landing map.

### W-BOOKS-07 Review desk

Mockups: d-w-review (D), b-w-review. Route: `/aircraft/[id]/logbooks/review/[pageId]` (`?entry=[entryId]&field={name}`, `?panel=crop`).
Logbooks › Review `{n}`. BackLink "All {n} waiting". Split `1fr 1.08fr` (562 / 608). Editors and owner. Replaces
`/aircraft/[id]/pages/[pageId]/review` and the editing half of `/aircraft/[id]/review`.

**Purpose.** The core screen: check what the reader found on one page against the page itself, least-certain field first, with three
outcomes per field, and move to the next page without ever being sent back to a list.

**Layout.**
| Region | Size | Content |
|---|---|---|
| Left: page context line | 24px | "{Book}, {volume or source}, page {n} of {m} read" (e.g. "Found book, page 3 of 5 read"), "Previous page" / "Next page" quiet buttons. |
| Left: landing note | auto, shown when the page fills a gap or extends a line | "This page fills {year} in the {book} gap. Confirmed, that stretch turns solid." |
| Left: entry strip | 40px | The entries on this page as stops on a short line with their dates ("Feb 3", "Jun 12", "Sep 28"); the current one selected. |
| Left: entry card | auto | "Entry {i} of {n} on this page", title "{kind}, {date}", TrustMark, the guidance line, the doubtful field card, the other fields, entry actions. |
| Left: page actions | 56px, sticky at the leaf bottom | "Confirm page and next" + KeyHint Shift Enter; status line "Entries {list} are accepted"; key legend. |
| Right: SourceMat | 608px | Caption "{Book}, {volume}, page {n}" / "From {source} · uploaded {when}"; Zoom; "Crop and read again"; the page in a ScanViewer with the selected field's ink box lit and the rest dimmed; under it "Close-up of the {field}" (the box enlarged 4×) + "Enlarged four times from the scan. If the paper is clearer, check it there." |

**Fields** (per entry; binding `log_entry.*`, confidence from `field_confidence`, boxes from `field_boxes`).
| Field label | Binding | Input |
|---|---|---|
| Book | `logbook_id` | Select; helper "The scanned page stays in its book." |
| Date | `entry_date` | DateInput |
| Tach | `tach` | numeric |
| Hobbs | `hobbs` | numeric |
| Airframe | `airframe` | numeric (owner-entered; never read by AI) |
| Kind of work | derived kind / `description` | Select (Annual inspection, 100-hour inspection, Oil change, Repair, Install, AD compliance, Other) |
| What was done | `description`, `work_performed` | PaperInput (Literata, since it is transcribed text), multi-line |
| Parts | `parts` | PaperInput |
| Signed | `signature_name`, `mechanic_cert_number` | TextInputs "Name", "Certificate" |
| ADs, SBs | `ad_refs[]`, `sb_refs[]` | token inputs |

**Field outcomes.** ReviewField (02 §6.7). Fields are ordered by doubt (09 §3.9.2): plausibility failures first (a tach lower than the previous entry, a jump over 300 h, a date out of order, alternatives returned), then ascending confidence. Each field row shows its value, a state word ("Clear", "Unsure" when doubtful, "Accepted", "Edited", "Not on this page") and, when focused, three Buttons: "Confirm {value}" (KeyHint A), "Edit" (E), "Not on this page" (X). The least-certain field is first and expanded into the doubtful card: value with the alternatives the reader considered ("1178.2 or 1198.2"), the reason in words ("The third digit is smudged. 1178.2 is 99.8 hours after the last 100-hour inspection at 1078.4 on p. 2; 1198.2 would be 119.8, over the limit."), and the three outcomes. Guidance line: "Least certain first. {k} field(s) to check, {c} read clearly."

**Entry actions.** Toggle "Carries on to page {n+1}" (`continues_next`); on the next page a continuation entry shows "This looks like the rest of an entry from page {n}." + "Join them" (`mergeContinuation`). "Add an entry the AI missed" (adds a blank entry card; fields start empty, no confidence). "Attachments and links" disclosure: attached Vault documents ("Unlink"), "Add a file", "Link from Documents" (Select), reference links (Label + URL, "Add", "Remove"). "Delete this entry" (quiet alarm; ConfirmDialog "Delete this entry? It is removed from the index. The page stays."). "Unconfirm" on confirmed entries.

**Page notices** (Wells at the top of the left leaf, when they apply): "Read as a two-page spread. Entries from both pages are listed; check that none were missed." / "There is sideways text on this page, often a sticker, that couldn't be read in full. If an entry is missing, add it." / "Filed as a {weight and balance document | AD compliance report | document} dated {date}: {summary}." + "Open it" (classified Other pages) / "This page carries a MyTailLog sticker matched to the entry signed on {date}. No duplicate was added."

**Page-level actions** (More menu `ellipsis` in the left leaf head): "Show the text as read" (raw OCR in a monospace-free type.small block), "Read this page again" (ConfirmDialog "Read page {n} again? Unconfirmed entries on it are replaced; confirmed ones are kept."), "Flag this page" (`review_status = disputed`; Textarea "What's wrong with it?"), "Delete page" (ConfirmDialog naming entry count).

**Crop and read again** (`?panel=crop`). Replaces the ScanViewer with the crop tool: four corner handles, "Rotate", Toggle "Scan look" (grayscale and contrast), "Reset", "Cancel", primary "Save and read again". Warning: "This replaces the stored scan. The paper page stays the record, and you can photograph it again. Entries already read came from the old image, so the page is read again after saving." Keyboard: handles focusable, arrows move 1px (Shift 10px).

**Confirm page and next** (Shift+Enter, works in inputs). Confirms every entry on the page (`owner_confirmed = true`), sets `page.review_status = confirmed`, then opens the next page waiting for review (same book by `page_sequence`, then other books in book order). Blocked while a field is "Unsure": the button stays enabled but pressing it moves focus to the first unsure field and announces "1 field to check on entry 2 first." After the last waiting page: Toast "That was the last page waiting. {n} entries confirmed today." and navigate to W-BOOKS-08's empty state.

**Keyboard** (11 §4 plus the mockup's keys). `j`/`k` next/previous field; `a` accept, `e` edit, `x` not on this page; Enter accepts the focused field (or the edit in progress) and moves to the next; Ctrl/Cmd+Enter confirms the current entry; Shift+Enter confirms the page and opens the next (works in inputs); `[`/`]` previous/next page; Tab moves through controls in order; `+`/`−`/`0` zoom the page; Esc leaves an edit without saving.

**States.** Not yet read: "This page hasn't been read yet." + "Read it now" (allowance permitting) or "Add entries by hand" (adds a blank entry). Being read: "Being read. This usually takes under a minute." (auto refresh). Read failed: reason + "Read again". No entries found: "The reader found no entries on this page." + "Add an entry the AI missed". S-OFF: editing and confirming disabled ("Review needs a connection."). Concurrent change: S-WRITE-ERR "Someone else changed this page just now. Reload to see their changes." Viewers: redirect to `/logbooks/pages/[pageId]`.

**Spine.** Bracket the page's date as one hollow stop; label "{Mon YYYY}"; action "See it on the map".

**Acceptance criteria.**
- [ ] The least-certain field is first; selecting any field lights its ink box on the page and shows the close-up.
- [ ] Every field has exactly three outcomes, with A, E, X keys.
- [ ] "Confirm page and next" never ejects to a list while pages wait, and cannot skip an unsure field.
- [ ] Crop, read again, add a missed entry, join a continuation, attachments, flag, delete and raw text are all on this one screen.
- [ ] Deleting an entry or a page asks first and names what goes.
- [ ] Confirming turns the page's stops solid on the map and spine without reload.

### W-BOOKS-08 Review all

Mockup: b-w-reviewall. Route: `/aircraft/[id]/logbooks/review` (`?batch=`, `?filter=waiting|all`). Logbooks › Review `{n}`. Split `1.4fr 1fr` (683 / 487). Editors and owner. Replaces `/aircraft/[id]/review`.

**Purpose.** See every page waiting in one list, the doubtful ones first with exactly what the reader was unsure of, and confirm the clean ones in one press after a spot check.

**Elements.**
| Element | Binding | Copy |
|---|---|---|
| Lede | | "{c} pages read cleanly. {d} need your eyes." |
| Context | | "{Book} vol. {v}, pages {a} to {b}, scanned {day}, {date}. Nothing on them counts toward what is due until you confirm it." (one line per batch) |
| Filter | | FilterChips "Waiting {n}" (default) / "All pages". |
| Need your eyes | pages with `needs_look` (09 §3.9.2), a continuation, or notices; with `?batch=`, that batch first | Row: thumbnail 64 × 86, "{Book} vol. {v}, page {n}", the doubt in words ("Tach on entry 2: 1178.2 or 1198.2", "Date on entry 1 is smudged"), Button secondary s "Open in the desk". |
| Read cleanly | pages whose every entry is clean (overall 0.75 or more, no field under 0.75, not a continuation) | Row: thumbnail, "{Book} vol. {v}, page {n}", "Read by AI · {n} entries, every field clear"; selecting shows it on the right leaf. Primary "Confirm {c} clean pages" (ConfirmDialog not required; Toast "Confirmed {c} pages, {e} entries. {d} still need your eyes." with "Undo"). |
| Imported, no page | CSV-imported unconfirmed entries | "Imported from {file}, no page · {n} entries" + rows with date and text + "Confirm" per row and "Confirm all {n}" + "Open in the list". |
| Right leaf | selected page | SourceMat with the page and the first entry's text quoted; Button on-mat "Open in the desk". |

**States.** Nothing waiting: "Nothing is waiting for review. Every entry read so far is confirmed." + "Add pages". Nothing clean: "Nothing clean to confirm in one go. The rest need your eyes." Pages still being read: line "{r} more pages are being read and will join this list." S-OFF, S-ERR. Viewers: redirect.

**Spine.** Bracket the waiting pages' span with hollow stops; label "{from} to {to}".

**Acceptance criteria.**
- [ ] Doubtful pages come first and say what is doubtful in words.
- [ ] One press confirms all clean pages, with Undo.
- [ ] CSV-imported entries without pages can be confirmed here.

### W-BOOKS-09 First read

Mockups: d-w-firstread (D), b-w-firstread. Route: `/aircraft/[id]/logbooks/first-read` (`?book=airframe`). Logbooks › Pages lit. BackLink "Pages". Board actions "Share with your IA" (owner). Split `1.62fr 1fr` (723 / 447). New; no current equivalent.

**Purpose.** After the first book is in, a short account of what it revealed (gaps, repairs that recur, big changes, figures that disagree), each finding pinned to its page and drawn on the book's line.

**Data and trigger.** `GET /api/aircraft/{id}/first-read?logbookId=` (09 §4.7): `ready`, `pages`, `from`, `to`, `findings[]` (kinds `gap`, `recurring_repair`, `big_change`, `annual_chain`, `untracked_ad`, each with citations), `nextBook`, `aiPartial`. When it becomes ready (rule in 08-capabilities.md) a notification lands in the inbox, "What the {book} logbook told us is ready." (07-flows.md), and a Toast with "Open" shows if the owner is in the app.

**Elements.**
| Element | Binding | Copy |
|---|---|---|
| Lede | | "What the {book} logbook told us." + "{n} pages from {from} to {to}, read and confirmed. {k} things stand out." |
| Line | the book's line with findings pinned | Labels: "No pages, {from} to {to}", "Engine changed, 2005", "Vacuum pump, 2009 and 2021", "Left brake relined 3 times", "GTN 650 installed, 2019", "Delivered". Clicking a label selects its finding. |
| Findings by group | `findings[]` by kind | HungSections "Gaps" (`gap`), "Repairs that recur" (`recurring_repair`), "Big changes" (`big_change`), "Annuals" (`annual_chain`, e.g. a missing year), "ADs mentioned, not tracked" (`untracked_ad`, with "Track it"). Each finding is its `text` plus PageCites from `citations`; quotes in type.paper. Example: "Left brake relined in 2016, 2018 and 2021, and an open squawk says it feels soft again." + "Airframe p. 56". `aiPartial`: line "Some findings couldn't be written today; the rest follow when reading resumes." |
| Boundary | | "Built only from entries you confirmed. A summary of the index, not of the aircraft; the logbooks remain the record." |
| Next (right leaf) | | "Next, the {next book} logbook" + why ("The airframe book mentions the 2005 overhaul, but the hours since it, the TBO count and the oil changes live in the engine book.") + primary "Scan the {book} logbook with your phone" + "Pages in" CoverageBars + links "Look for the {gap} pages" (Add pages), "Show the brake history to your mechanic" (Squawks), "Ask the {book} book a question" (Search or ask). |

**States.** Not enough confirmed: "The first read needs more confirmed entries. {n} of {m} are confirmed." + "Review {k} pages". AI unavailable: "The first read is written by the AI reader, which is paused today." S-VIEW: read-only; no share or scan actions.

**Spine.** Bracket the book's span; books not yet in dashed; label "1 book in".

**Acceptance criteria.** [ ] Every finding links to at least one page. [ ] Only confirmed entries are used. [ ] The screen can be reopened later from the Pages library.

### W-BOOKS-10 Entry detail

Mockups: d-w-entry (D), b-w-entry. Route: `/aircraft/[id]/logbooks/entries/[entryId]` (`?panel=sticker`). Logbooks › Map lit. Board actions "Print sticker" (entries signed in MyTailLog), "Write a correction" (editors, signed entries). Split `1.6fr 1fr` (720 / 450). Replaces `/aircraft/[id]/entries/[entryId]` and the expanded timeline row.

**Purpose.** One entry: the words as written, its meters, how far it is trusted, what it satisfied, what is attached, its corrections, and its page; plus a control to walk the book in time order.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| BackLink | referrer | "Back to the map" etc. (03 §12). |
| Step control | StopStepper (02 §4.9), neighbours on the line | "{previous stop summary}" (link) · "Stop {i} of {n}" · "Next: {next stop summary}" (link; the next can be a due ring: "Next: oil due about Dec 12"). Keys `[` and `]` (replace the URL). `?line=` picks which book is walked when the entry is part of an interchange. |
| Title | kind or first words | type.heading, e.g. "Oil and filter change". |
| Meta | `entry_date`, `logbook`, page, origin | "{date} · {Book} logbook, page {n} · {origin}" where origin is "read from a scan" / "written in MyTailLog, sticker pasted in the book" / "imported from {file}". |
| Mini line | the book's line around the entry | Previous and next two stops labelled ("May 9, oil", "Jul 14, annual", "Sep 3, this entry", "Oil due about Dec 12"). |
| Trust | Trust | All three TrustMarks shown in order with the reached ones filled: "Read by AI", "Confirmed by you" (+ date), "Signed by {name}, {role}, {date}". |
| In the book | `description`, `work_performed`, `parts` | Literata (type.paper), exactly as transcribed. |
| Meters | `tach`, `hobbs`, `airframe`, derived since-overhaul | KeyValueList "Tach", "Hobbs", "Airframe", "Since overhaul". Mis-keyed flag when Records check has a finding: "Tach looks mis-keyed" + "See the check". |
| What it satisfied | links to items, ADs, squawks | Rows: item name, "{rule} · next at {…}" + StatusMark; "Oil analysis sample" + "{lab}, sampled {date} · lab says {assessment}" + link "Oil and engine". |
| Attached | `document.log_entry_id`, reference links | Rows with title, "{type}, {pages} pages · in Documents" or "photo from {name}'s phone"; editors: "Unlink", "Add a file", "Link from Documents", "Add a link". |
| Corrections | `supersedes_entry_id`, `authored_superseded_by` | "None. A signed entry stays as written; a correction is a new signed entry that points back here." + "Write a correction" (signed entries, editors). Superseded: "Superseded by the correction signed {date}." + link. Extracted (not authored) entries: "Fix the reading" (opens W-BOOKS-07 at this entry, editors) and "Unconfirm". |
| Right leaf | the page | SourceMat; caption "{Book} logbook, page {n}" / "Scanned {date} · {sticker matched by its entry ID}"; note "The sticker carries the entry ID, so the scan of this page was linked to the entry without a second confirmation." when applicable. No page: Well "No page is linked yet." + (authored entries) "When the page with this sticker is scanned, it links here by itself." / (imported) "Imported without a page." |

**Sticker panel** (`?panel=sticker`, authored signed entries): drawer over the right leaf: "Sticker width" Select 2 to 7 in (default 4), "Paper" Segmented US Letter / A4, preview at scale, "Print at 100% scale on full-sheet adhesive paper and trim to fit. Try plain paper first.", primary "Print or save PDF". The sticker content follows today's (web-inventory §3.20), set in font.app, black on white.

**States.** Unconfirmed entry: TrustMark read by AI, banner "Read by AI, not yet confirmed. It doesn't count toward anything." + "Review it" (editors). Deleted: notice. S-VIEW: no edit, correction, attach controls; print sticker allowed. S-ERR.

**Spine.** Window the stop ±1 month (10 §8.1); label "{Mon D, YYYY}"; link "Back to the map".

**Acceptance criteria.** [ ] Previous/next walk the book in date order and update the URL by replace. [ ] Trust shows all three levels with the reached ones filled. [ ] Signed entries cannot be edited; corrections link both ways. [ ] Sticker printing works with width and paper options.

### W-BOOKS-11 Write a logbook entry

Mockup: b-w-write. Route: `/aircraft/[id]/logbooks/entries/new` (`?book=&template=&corrects=[entryId]&closes=[squawkId]`). Logbooks (none lit), board title "Write an entry" (or "Correct a signed entry"). Board action "Discard draft". Split `1.55fr 1fr` (711 / 459). Editors and owner. Replaces `/aircraft/[id]/entries/new`.

**Purpose.** Compose an entry from a template with today's meters filled in, review the wording, sign it with an emailed code, and print the sticker, all on one leaf with the sticker building on the right.

**Left leaf.**
| Element | Binding | Copy / rule |
|---|---|---|
| Draft line | localStorage draft | "Draft kept on this device, saved {time}" |
| Logbook | `logbook_id` | Select. |
| Template | `authored_template` | Select: "Oil and filter service", "Tire replacement", "Spark-plug service", "Battery service", "General maintenance". Source note under it, e.g. "Preventive maintenance a pilot-owner may sign under 14 CFR Part 43, Appendix A. Annual and 100-hour inspections need the mechanic's own record." |
| Completed | `entry_date` | DateInput, default today. |
| Tach, Hobbs, Airframe | meters | Prefilled from the latest reading; editable. |
| Template fields | `authored_answers` | Per template (oil: "Oil brand and type", "Oil quantity and unit", "Filter brand, model and part number", "What the removed filter showed", "Instructions followed", "Checks performed"; other templates equivalent, per today). |
| Work performed | generated text | Textarea in type.paper, label "Work performed" + "Reset to template wording". |
| Work done by | | TextInput, default the user's name. |
| Closes squawk | `closes` | Select of open squawks (`?closes=` preselects). Signing resolves the squawk with this entry. |
| Sign it (HungSection) | `signing_credential` | "Sign with" Select of the user's certificates + "Manage certificates" (`/account/settings#signing`); attestation Checkbox "I performed only the work described, I am allowed to sign it, and I mean this as my signature returning it to service."; Button secondary "Email me a signing code". After sending: "Signing code" (8-digit input, 4+4 groups), "Code sent to {email} at {time}. It expires in 10 minutes." + "Send a new code"; primary "Sign this entry"; note "Once signed it can't be edited. Mistakes are fixed with a correcting entry." |
| Correction mode | `?corrects=` | Banner "Correcting the entry signed {date}: "{first words}"." The new entry stores `supersedes_entry_id`. |

**Right leaf.** "Sticker preview" + "Paste it in the {book} logbook after page {n}"; Segmented sticker width (2 to 7 in, default 4); Segmented US Letter / A4; live sticker (tail · book, date, meters, work text, "Work performed by", "Electronically signed by {name} · {certificate}", the return-to-service line, "Entry ID and digest are added when you sign.", "Physical signature" rule); "Print at 100% scale on full-sheet adhesive paper and trim. Try plain paper first." + "When the page is scanned later, the ID links it back to this entry."

**Validation and errors.** Missing required template fields name the field ("Enter the oil quantity."); "Choose a certificate to sign with." / "Add a certificate first." (link); "That certificate can't sign this kind of work." ; "Tick the statement to sign."; code: "That code doesn't match. Check the email and try again.", "That code has expired. Send a new one.", "Too many codes asked for. Try again in 15 minutes." S-OFF: draft edits allowed and saved locally; send code and sign disabled ("Signing needs a connection. Your draft is kept on this device.").

**Result.** On sign: navigate to W-BOOKS-10 for the new entry with `?panel=sticker`; Toast "Signed. Print the sticker and paste it in the {book} logbook."; the squawk closes if chosen.

**Spine.** Bracket today; label "today".

**Acceptance criteria.** [ ] Draft survives a reload on the same device. [ ] Signing requires certificate, attestation and a valid code. [ ] Corrections and squawk closing link both records. [ ] The sticker preview matches the printed sticker.

### W-BOOKS-12 List view of entries

Mockup: b-w-timeline (as a list, without its density strip; the spine and the map replace it). Route: `/aircraft/[id]/logbooks/list` (`?stop=[entryId]`, `?book=&from=&to=&q=`). Logbooks › Map with the Segmented on "List". Primary "Add pages"; secondary "Write an entry" (editors). Split `1.9fr 1fr` (766 / 404). Replaces the list half of `/aircraft/[id]/timeline`.

**Purpose.** Every confirmed entry as a list, newest first, filterable by book, years and words; the accessible equivalent of the map.

**Elements.**
| Element | Binding | Copy |
|---|---|---|
| Controls | | Same FilterChips and Segmented as the map, plus a TextInput "Search these entries" (`q`, 300 ms debounce, full-text) and the window label "{from} to {to}" or "Whole life" with "Clear". |
| Book counts | | "Airframe 98 · Engine 61 · Propeller 22 · Avionics 19 · Other 12". |
| Summary | | "{n} entries, newest first" / "{n} results for "{q}"". |
| Year groups | `entry_date` year | Year heading with count; the newest year open; all open while searching; "Undated" group last. |
| Entry row | `log_entry` | Date (type.body-strong) + PageCite; text (type.paper, 2 lines; search terms highlighted); tach right-aligned (type.numeric); TrustMark word ("Confirmed by you", "Signed by D. Alvarez, IA", "Signed in MyTailLog", "Superseded by a correction"); chips "AD {ref}", "SB {ref}", "{n} attachment(s)"; "Also in Engine p. 37, Propeller p. 12" for visits; flag "Tach looks mis-keyed" (link to Records check). Click selects (page on the right); Enter or double-click opens W-BOOKS-10. |
| Right leaf | selected entry's page | As the map's stop selection. |

**States.** No entries: as the map. No matches: "No entries match "{q}"." + "Clear the search". No book selected: "Pick at least one book." S-VIEW: no write action.

**Spine.** As the map (bracket = window); spine drags set the window.

**Acceptance criteria.** [ ] The list and the map always show the same set for the same parameters. [ ] Search covers every text field of confirmed entries. [ ] It is fully usable with a keyboard and a screen reader (a real list of rows with headings per year).

---

## Global

### W-ASK-01 Search and Ask

Mockups: d-w-ask (D), b-w-ask. Route: `/aircraft/[id]/ask` (`?q=`). Board `color.section.books`, title "Search or ask", Logbooks tab lit, no sub-tab. Split `1.6fr 1fr` (720 / 450). Replaces the timeline's search panel and `/aircraft/[id]/ask`.

**Purpose.** One field. Words list matching entries as you type; a question returns a short answer drawn only from confirmed entries, with a page crop for every claim, and the matching entries lit as stops on the map.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Field | `q` | SearchField (02 §7.4), 52px tall, `search` icon, placeholder "Search the logbooks, or ask a question"; KeyHint "Enter to ask" appears when the text reads as a question (ends with "?" or starts with who, what, when, where, why, how, which, did, has, is, was, were, does). |
| Recent | per-user recent queries (proposed `ask_history`, last 10) | "Recent:" + up to 5 links. |
| Suggestions (empty field) | | "When was the last annual inspection?", "When was the engine last overhauled?", "What ADs have been complied with?", "When was the transponder last certified?", "What avionics have been installed?" |
| Boundary | | "Answers come only from your {n} confirmed entries. Check the page before you rely on a date or an hour." |
| Answer | AI answer | Short paragraph; dates, tachs and names in type.body-strong; each claim followed by its PageCite ("Engine p. 19"). |
| Crops | cited `field_boxes` | Up to 3 page crops 200px tall with caption "{Book} p. {n} · {date}" and the quote in type.paper; derived figures explained ("Plus 44.1 h logged since."). |
| Map of matches | matching entries | A RouteMap 667px wide, 180px tall: matching stops labelled ("Sep 14, 2005: overhauled") with a selection ring; other stops at 40% opacity (10 §8.2; d-w-ask hides them, 10 overrides). "Open on the map" opens `/logbooks/map?q=` with the same highlighting. |
| Entries | full-text search | "Entries" + "{n} mention {term}"; rows: date, PageCite, text with the term in bold, tach. |
| Right leaf | the selected citation's page | SourceMat; caption "Cited for {what} · {trust}"; "Open entry". |

**Behaviour.** Typing (300 ms debounce) runs search only; the answer area shows "Press Enter to ask." when the text is a question. Enter on a question asks (one AI call; counts against the allowance); Enter on words runs search and selects the first result. A new question replaces the answer; the previous question goes into Recent.

**States.** Asking: "Reading for "{question}"…" with the entries list already filled. No confirmed entries: "Ask works once some entries are confirmed." AI unavailable or allowance used: the allowance message (09-data-and-api.md) and "Search still works." Too long: "Questions can be up to 2,000 characters." Network: "Couldn't reach the reader. Try again." No answer found: "The confirmed entries don't say. Here are the closest matches." S-OFF: search only. All roles may ask.

**Spine.** No window; matching stops drawn, others hidden; label "{n} matches"; link "Open on the map".

**Acceptance criteria.** [ ] Every claim in an answer carries a page; a claim without one is not shown. [ ] Only confirmed entries are searched or cited. [ ] `/` and Ctrl/Cmd+K focus the field from anywhere. [ ] Search works offline from loaded data and with AI unavailable.

### W-ADD-01 Add menu and Log a flight

No mockup for the web menu; anatomy from b-m-add (phone Add sheet). Not a route. The AddMenu component, its six items, letter keys and
copy are in 02-components.md §3.7; destinations and roles in 03 §5.2 (no Add button for viewers).

**Log a flight dialog** (Dialog 520px, centred over the board).
| Element | Binding | Copy / rule |
|---|---|---|
| Title | | "Log a flight" (or "Add oil" when opened from that item; only the oil fields show). |
| Date | `hours_reading.reading_date` | default today. |
| Read from a photo | `hours_reading.photo_path`, `ocr_value`, `ocr_confidence`, `ocr_candidates` (09 §2.10) | Button secondary "Read the tach from a photo" (file input; camera on capable devices). The value read fills Tach with the helper "Read from your photo. Check it against the photo." and the photo beside the field (120px); other candidates as ChoiceChips. Editing it sets `owner_edited`. New. |
| Tach | `tach` | Numeric with stepper buttons (−0.1, +0.1); default the last reading; helper "Last {value} on {date}". |
| Hobbs | `hobbs` | Same. Optional. |
| Oil added | `oil_addition.quarts` | Segmented 0 / 1 / 2 / Other (number). |
| What moves | live preview | "Oil change: {before} h away, now {after} h away", "AD 2011-10-09: …" (only items whose left value changes). |
| Actions | | Primary "Save", quiet "Cancel". |

Validation: "Enter the tach, the hobbs, or both."; lower than the last reading: warning "That's lower than the last reading, {value} on {date}. Was a meter replaced?" + "Save anyway" / "Record a replacement" (W-AIRCRAFT-01). Result: writes `hours_reading` (source manual or photo) and `oil_addition`; Toast "Saved. {Item} now {left} away." Errors S-WRITE-ERR. S-OFF: disabled.

**Acceptance criteria.** [ ] `N` opens the menu from any screen and each item lands where its colour says. [ ] Viewers have no Add button and report squawks from Maintenance › Squawks. [ ] Logging a flight updates the rail, Status and the line ahead without reload; a planned visit that becomes at risk shows its notice on Status.

### W-SWITCH-01 Aircraft switcher

No mockup; component in 02-components.md §3.3, navigation rules in 03 §6. Popover 280px under the RailPlate. Rows: tail, type, role line, verdict sentence (type.small, 2 lines max). Current aircraft first with a check. Filter field when more than 6. Footer "Hangar", "Add an aircraft". Keyboard: Up/Down, Enter, Esc. States: loading (rows skeleton), error ("Your other aircraft could not be loaded." + "Go to the hangar"). Acceptance: [ ] switching keeps the section and sub-tab and drops the selection (03 §6); [ ] the verdict shown matches each aircraft's Status.

---

## Aircraft

### W-AIRCRAFT-01 Hours and engine

Mockups: d-w-engine (D), b-w-hours. Route: `/aircraft/[id]/hours` (anchors `#check`, `#readings`, `#replaced`, `#starting`, `#adsb`). Aircraft › Hours and engine. Primary "Add a reading" (editors). Split `1.5fr 1fr` (702 / 468). Replaces `/aircraft/[id]/meters`, the oil-change and engine-time half of `/aircraft/[id]/oil-analysis`, and the MyFlightBook "Sync hours" of `/maintenance`.

**Purpose.** The meters behind every countdown and the engine's life since overhaul: where each reading came from, the ADS-B suggestion as one decision, the written-versus-calculated check, and meter replacements.

**Left leaf, top to bottom.**
| Element | Binding | Copy / rule |
|---|---|---|
| Verdict | last overhaul, current tach, TBO, rate | "The engine has run {h} hours since its {year} overhaul. At about {rate} hours a week, the {tbo}-hour TBO comes about {year}." |
| Engine line | engine entries since the overhaul | 646 × 120px: overhaul stop "Overhauled {date}: 0 h", band "{h} h since overhaul", TBO marker "TBO {tbo} h, about {year}" (dotted beyond today), oil changes as stops "{n} oil changes, every {min} to {max} h", next oil ring "Oil, {left}". Year ticks. |
| ADS-B suggestion (when present) | `adsb_flight` since last reading | Well: "Tach read {value} on {date}. ADS-B has seen {n} flights since, about {h} h." + flights line "Nov 15 KBED to KORH 1.3 h · …" + "Airborne time, not tach time." + Buttons primary "Enter the real tach" (opens the reading form prefilled with the date), quiet "Dismiss". Line: "Until you do, hour items show as up to {h} h closer." (only in this Well; Status never uses ADS-B estimates as compliance). |
| Now | latest readings | KeyValueList "Tach" "{value}" + "{date} · {source}"; "Hobbs"; "Airframe total" + "counted on tach" or its own source. Sources in words: "photo of the tach", "entered by hand", "MyFlightBook", "{Book} p. {n}", "the starting reading", "an ADS-B estimate you accepted". "estimated, no {meter} reading on record" when estimated. Note: "Airframe time is never estimated from the other two." |
| Written against calculated | since-overhaul written in entries vs computed | Table: "Since overhaul" · "Written" (+ PageCite) · "Calculated" · result ("Agree" / "{d} h apart" alarm text). Explanation for a disagreement: "Calculated from the prop overhaul at tach {a} to the annual at {b}. The written figure looks like two digits swapped. Mention it to your IA; only a new entry can correct the book." Buttons "Add to annual prep" (adds a loose end), "They agree, dismiss". |
| Oil changes | oil-change entries | "Oil changes" + "last three" table Date · Tach · After (hours since previous) · Page; "Show all {n}" expands to the full interval table (From · To · Interval). |
| Readings | `hours_reading` | "Readings" + "{n} on record"; table Date · Tach · Hobbs · Airframe · From; manual rows have "Remove" (editors, ConfirmDialog). "Show all". |
| Usual flying | `aircraft.expected_hours_per_week` | "Usual flying: {h} h a week" + "Change" (owner and editors); helper "Used to turn hours into dates when there aren't enough recent readings." Empty: "Not set". |
| MyFlightBook | `mfb_connection` | When connected: "From MyFlightBook as {username} · last sync {date}, {n} flights brought in as readings" + "Sync now". Not connected: "Connect MyFlightBook in Settings" link. |
| Replaced meters | `meter_reset` | Explainer "If a tach or hobbs is ever swapped, record it here so every countdown keeps counting." Rows "{Meter} replaced {date}" + "{prior} to {new}" or "inferred to {new}" + "Remove". Button "Record a replacement" opens form: Meter (Tach / Hobbs / Airframe), "First date on the new meter", "Old meter's final reading" (blank: inferred), "New meter started at" (default 0), Notes. Empty: "None recorded." |
| Starting readings | `aircraft.enrollment_*` | "What each meter read when you added {tail} on {date}. Every hours countdown starts from here, so a wrong figure shifts all of them. Clear a meter to stop tracking it." + values + "Edit" (form with three numbers, placeholder "not tracked"). |
| ADS-B checks | `aircraft.adsb_enabled`, `icao24` | Off: explainer (OpenSky asked once a day with the public ICAO address only; nothing about you leaves the app; no track is stored) and the limits list (airborne time is neither tach nor hobbs; coverage gaps; not every aircraft broadcasts; nothing is written for you and an accepted estimate never counts as compliance evidence). "Mode S address" (optional, placeholder "looked up from the registry") + "Turn on ADS-B checks". On: "Watching {HEX} via OpenSky, once a day." + "Turn off". |

**Add a reading** (board action; right leaf form, replacing the mat while open): Date (default today), Tach, Hobbs, Airframe, "Read from a photo" (as W-ADD-01). Validation as W-ADD-01. Toast "Reading saved."

**Right leaf.** SourceMat with the page behind the selected row (the written figure's page for the check; the oil change's page); default the check's page when a disagreement exists, else the last oil change.

**States.** No readings: "No readings yet. Add today's tach to start the countdowns." No engine overhaul found: the line starts at the first engine entry with "No overhaul found in the confirmed entries. Time since overhaul can't be counted yet." S-VIEW: no forms, no Remove, no ADS-B toggle. S-ERR per section.

**Spine.** Bracket last overhaul to today; label "since overhaul".

**Acceptance criteria.** [ ] Every reading shows its source. [ ] Every capability of today's Meters page (five sections) is here. [ ] ADS-B estimates are only suggestions and never move a due date until the owner enters a real reading. [ ] Written-versus-calculated disagreements show both pages and can be dismissed or sent to annual prep.

### W-AIRCRAFT-02 Oil analysis

Mockup: b-w-oil (D renames the sub-tab "Oil analysis" and moves oil changes to Hours and engine). Route: `/aircraft/[id]/oil` (`?sample=[sampleId]`). Aircraft › Oil analysis. Board actions "Add oil" (editors), primary "Import a lab report" (editors). Split `1.6fr 1fr` (720 / 450). Replaces the lab-report, top-off and compression parts of `/aircraft/[id]/oil-analysis`.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Verdict | samples, top-offs | "The lab called all {n} samples normal. Oil use holds at 1 quart every {x} hours." (variants: "The lab flagged the {date} sample: "{lab comment}"."; no samples: "No lab reports yet.") |
| Wear metals chart | `oil_analysis_sample.elements_ppm`, `universal_averages` | Line chart 664 × 220, one line per element (Iron, Copper, Aluminum, Chromium by default; Nickel, Silicon, Lead toggled by chips), dashed universal average, x = samples with "{h} h on oil" under each date; values above average labelled; at twice the average the point gets an alarm ring and a word label. Axis "parts per million". Accessible table equivalent below (collapsed "Show as a table"). |
| Samples | samples | Table Sampled · Hours on oil · Iron · Copper · Silicon · Lab says; click selects (report on the right). |
| Latest sample detail | latest sample | Collapsible "All elements and oil properties, {date}": elements (ppm) and properties (viscosity, flashpoint, fuel %, antifreeze %, water %, insolubles %, TBN, TAN), "Lab assessment: {text}". |
| Oil added | `oil_addition` | "Oil added" + "last 3 of {n}"; rows "{date} · {q} qt at tach {value}"; "Show all"; per row "Remove" (editors, ConfirmDialog); burn rate readout "{x} hrs per quart · average on {meter}" with notes when top-offs were excluded or estimated. "Add oil" opens W-ADD-01 in oil mode. |
| Compressions | compression readings found in entries | Table Date · #1 · #2 · #3 · #4 · Page; header "over 80 psi"; rows from unconfirmed entries show "Confirm source" (to W-BOOKS-07). A small line chart per cylinder in the collapsed "Show the trend". |
| Import | `POST …/oil-analysis/import` | File picker (PDF, JPEG, PNG, WebP). Progress "Reading the report…". Result Toast "Imported {n} samples from {lab}." + warning when the report's unit differs from the tail: "The report names {unit}, not {tail}. Check it's the right report." Errors: allowance messages; "Couldn't read that report." |
| Right leaf | selected sample's report | SourceMat holding the PDF page; caption "{lab} report, {date} sample" / "Imported {date} · values read by AI, confirmed by you"; "Open PDF". |

States: no samples: chart replaced by "No oil analysis yet. Import a lab report to start the trend." S-VIEW. S-ERR. Spine: bracket first sample to today. Acceptance: [ ] the lab's words are shown and outrank the chart (stated once: "The lab's own assessment is what counts."); [ ] every value has its report; [ ] top-offs, burn rate and compressions from today's page are present.

### W-AIRCRAFT-03 Equipment

Mockup: b-w-equip. Route: `/aircraft/[id]/equipment` (`?part=[componentId]`, `?proposal=[proposalId]`, `?panel=new|edit|remove`). Aircraft › Equipment. Primary "Add equipment" (editors). Split `2.1fr 1fr` (793 / 377). Replaces `/aircraft/[id]/equipment`.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Verdict | `component` counts, `equipment_proposal` | "{n} parts installed, {m} removed. {k} more turned up in the logbooks and need your answer." |
| Found in the logs | proposals | "Found in the logs" + TrustMark legend "read by AI"; rows: name and make, "installed {date} · {PageCite}", TrustMark, Buttons "Add it" and "Not equipment"; with several: "Select all", "Add {n} selected", "Dismiss {n} selected". The selected proposal's page is on the right leaf with its quote. |
| Scan the logs | Button secondary "Find equipment in the logs" (editors, AI) | Result inline: "Found {n} new suggestions from {m} entries." / "No new equipment found in {m} entries." |
| Installed table | `component` where installed | Part · Make and part number · Installed (date + PageCite) · ADs ("AD {ref} every {interval}", "AD {ref} not applicable", "None"). Row actions (editors, `ellipsis`): "Edit", "Mark removed", "Delete". |
| Removed | `component` removed | Rows dimmed: "{name}, {make} removed {date} for {reason or replacement} · its ADs marked not applicable from that date" + "Reinstall". |
| Equipment form (right leaf) | | Name (required, "e.g. Vacuum pump"), Manufacturer, Category (Airframe, Engine, Propeller, Avionics, Other), Part number, Serial number, Installed on (DateInput), Install entry (Select of entries), Life limit + unit (hours, months, cycles), Notes. Save / Cancel. |
| Mark removed (dialog) | | "Removed on" DateInput (required), "Removal entry" Select, note "{n} ADs linked to this part will be marked not applicable from {date}." Primary "Mark removed". Toast "Removed. {n} ADs marked not applicable." |
| Delete | | ConfirmDialog "Delete {name} from the equipment list? Use Mark removed if it came out of the aircraft." |

States: empty "No equipment tracked yet. Find it in the logs, or add parts by hand. Installed parts decide which ADs apply." S-VIEW: no forms or answers. Spine: bracket the selected part's install to removal (or today). Acceptance: [ ] removal asks for a date in a proper field and updates linked ADs; [ ] suggestions show their page; [ ] every field of today's form exists.

### W-AIRCRAFT-04 Weight and balance

Mockup: b-w-wb. Route: `/aircraft/[id]/weight-balance` (`?revision=[revisionId]`, `?panel=new|edit`). Aircraft › W&B. Primary "Add a revision" (editors). Split `1.6fr 1fr` (720 / 450). Replaces `/aircraft/[id]/weight-balance`.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Stale notice | equipment changes after the latest `revision_date` | Well (not alarm): "These figures may be stale. {Part} went in during {Mon YYYY}, after the last revision. If the weight changed, add a revision from the new paperwork." + PageCite; with several, a list of up to 8 "{date}, installed or removed {name}" + "See equipment". |
| Current figures | latest `weight_balance` | KeyValueList in type.numeric: "Empty weight {x} lb", "CG arm {x} in", "Moment {x} lb-in", "Useful load {x} lb" (max gross − empty). Line: "As of {date} · {method} · max gross {x} lb · {reference}". |
| Envelope chart | optional envelope points (proposed `wb_envelope`) | When envelope points are on file: chart 664 × 240 with the normal-category envelope, max gross line, empty-weight points for each revision ("Empty, {year}: {lb} at {arm} in"). Without: "Add the envelope from the POH to see revisions against it." + "Add envelope points" (editors). |
| Revisions | `weight_balance` | Table Date · Method · Empty wt · Arm · Moment · Why · Source (PageCite or document); "Current" tag on the newest; row actions "Edit", "Delete" (ConfirmDialog). |
| Revision form | | Revision date (required), Method (Weighed / Computed), Empty weight, Max gross weight, CG arm, Moment, Reason ("e.g. Installed GTN 650, removed KX-155"), Reference ("Form 337 or document"), Source document (Select from Documents), Notes. Helper "Enter any two of weight, arm and moment; the third is worked out (moment = weight × arm)." |
| Boundary | | "An index of the W&B paperwork, not a loading calculator. The signed report kept with the aircraft is the one that counts." |
| Right leaf | the selected revision's document or page | SourceMat. |

States: none recorded "No weight and balance revision recorded yet. Add the current figures from the aircraft's paperwork." S-VIEW. Spine: bracket last revision to today. Acceptance: [ ] stale notice appears whenever equipment changed after the latest revision; [ ] any two of weight, arm, moment compute the third.

### W-AIRCRAFT-05 Aircraft details and danger zone

Mockup: b-w-details. Route: `/aircraft/[id]/details` (`#delete`, `#transfer`). Aircraft › Details. Split `1.6fr 1fr` (720 / 450). Owner edits; editors and viewers read-only. Replaces `/aircraft/[id]/details` and the transfer and delete panels of `/aircraft/[id]/share`.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| The aircraft | `tail_number` (read-only, helper "The tail number can't be changed. Transfer or add a new aircraft instead."), `make`, `model`, `year`, `serial_number`, `home_base` ("Private to you") | Fields; primary "Save details" (toast "Details saved."). |
| Engine and prop | engine make and model, `engine_serials[]`, prop make and model, `prop_serials[]` | Fields. |
| Meters note | | "Meters are set on Hours and engine." (link) |
| Transfer to a new owner | owner; `POST /api/aircraft/{id}/transfer` (09 §4.13) | "Moves {tail} and all its records to another MyTailLog account. They must already have an account. Live record room and mechanic links are revoked." Email; Checkbox "Keep view access for me" (`keepAccessAs`: viewer or none, default off); "Transfer {tail}" → ConfirmDialog "Transfer {tail} to {email}? You can't undo this yourself." Online only. |
| Delete | owner | "This removes {p} page scans, {e} entries, {d} documents, {i} tracked items and {l} live record room links. It can't be undone." + link "Download a backup first" (to `/account/data?aircraft={id}#export`). "Type the tail number to confirm" TextInput; alarm Button "Delete {tail} and its records" enabled only when the input equals the tail; "Cancel". |
| Right leaf (white) | FAA registry | "FAA aircraft registry, {tail}" + "Checked {date} · agrees with your details on {k} of {n} fields" + "Check again"; KeyValueList Serial number, Manufacturer, Model, Year, Engine, Type, Mode S code ("{code} (hex)"), Registered to, Status, Expires; fields that disagree carry "Differs from your details" + "Use the registry's". Note "The Mode S code lets MyTailLog look for ADS-B flights on Hours and engine. Registry data is public; nothing about you is sent to look it up." |

States: registry unreachable "The FAA registry couldn't be reached. Try again later." S-VIEW and editors: read-only fields, no danger zone. Spine: none ("whole life"). Acceptance: [ ] delete requires the typed tail and names the counts; [ ] transfer confirms with the recipient named; [ ] only the owner sees the danger zone.

---

## Documents

### W-DOCS-01 Documents vault and carry-aboard card

Mockup: b-w-docs. Route: `/aircraft/[id]/documents` (`?doc=[documentId]`, `?panel=new|edit`). Documents (no sub-tabs). Primary "Add a document" (editors). Split `2fr 1fr` (780 / 390). Replaces `/aircraft/[id]/documents`.

**Elements.**
| Element | Binding | Copy / rule |
|---|---|---|
| Verdict | `document` | "{n} documents." + the most useful gap: "The insurance policy has no expiry date on file yet." |
| Carry aboard | AROW categories | Heading "Carry aboard" + "the AROW papers"; four rows: Airworthiness ("On file" / "Not on file"), Registration ("To {date}"), Operating handbook, Weight and balance ("May be stale" linking W-AIRCRAFT-04 when stale). Button secondary "Print the carry-aboard list". |
| Expiries | documents with `track_expiry` (09 §2.7) | "Expiry dates also on the due list" + rows with date, left, StatusMark; a tracked document without `expires_on` shows "Add the date" (owner and editors). These rows are the `doc:` DueItems of Status. |
| Everything | all documents by category | Table Category · Document · Date · Linked to (PageCite of the linked entry, or blank). Categories in `document_type` order: Airworthiness certificate, Registration, Radio station licence, POH or AFM, Weight and balance, STCs, Form 337, Form 8130-3, ICA, Maintenance manuals, Insurance, Other. Click selects (document on the right). |
| Add a document (right leaf form) | | Category (required), File (PDF or image up to 25 MB; DropZone or choose), Title (defaults to the file name), Reference number ("STC, form or tag number"), Document date, "Track its expiry" Checkbox (`track_expiry`; on by default for Registration and Insurance) revealing Expires on (`expires_on`), Renews every (months, `renews_every_months`) and Remind me (`remind_lead_days`, default 60), Link to an entry (Select, optional), Notes. Primary "Add document". Errors "That file is over 25 MB.", "Upload failed. Try again." Toast "Document added." |
| Selected document (right leaf) | | SourceMat with the document (PDF first page or image, ScanViewer), caption "{title}" / "{how added} · {type}, {pages} pages", "Download", "Open in a new tab"; under it "Category: {c} · {expiry or "no expiry"} · {linked entry or "not linked to a logbook entry"}" + editors: "Edit details" (same form), "Unlink" (toast "Unlinked. It's still in Documents."), "Delete" (ConfirmDialog "Delete {title}? It is removed from Documents and from any entry it's attached to."). |

States: empty "No documents yet. Add the airworthiness certificate and registration first; they're two of the four papers you carry aboard." S-VIEW: no add, edit, unlink, delete. S-ERR. Spine: bracket the selected document's date or none. Acceptance: [ ] documents' details can be edited after upload; [ ] expiries feed the due list on Status; [ ] the carry-aboard card is printable.

---

## Share

### W-SHARE-01 Share hub

Mockups: d-w-share (D), b-w-share. Route: `/aircraft/[id]/share` (`?room=[roomId]`, `?audience=`). Data: record rooms 09 §4.11. Share › Links and people. Owner only. Split `1.5fr 1fr` (702 / 468). Replaces `/aircraft/[id]/share` (links and people).

**Left leaf.**
| Element | Binding | Copy / rule |
|---|---|---|
| Who is it for? | presets | Four rows, each a large selectable row with title and line: "Your IA, for the annual" / "Annual checklist, summary, all {n} logbooks with scans · opens on the line ahead to the annual · open until the annual"; "A buyer" / "Pre-buy dossier, confirmed entries, documents · opens on the whole-life map · 30 days"; "An insurer" / "Maintenance summary, registration, airworthiness and W&B · opens on the last five years · 14 days"; "A co-owner or your mechanic" / "An invitation to an account that can view or edit, instead of a link". Selecting one of the first three opens the create form on the right leaf (`?audience=`); the fourth scrolls to People and focuses the email field. |
| Record room links | `record_room` | Heading + "{n} live"; table For · Open until · Opens: label + contents line ("Dossier, 5 logbooks, 12 documents, no scans"); "Dec 18" + "30 days left" / "Revoked by you" + date / "Expired" + date; opens count + "last {date}". Click selects (`?room=`). Inactive rows dimmed with "Ended". |
| People with an account | owner + `aircraft_share` | Rows: initials, name or email, note (role in words, e.g. "co-owner", "A&P 3105582 IA"), owner row "Owner"; others Segmented "Can edit" / "Can view" (changes at once; toast "{name} can now {edit or view}."), "Remove" (ConfirmDialog "Remove {name}'s access to {tail}?"). Invite row: Email, Segmented "Can view" (default) / "Can edit", Button "Invite". Helper "We email them an invitation. They get access when they sign in with this email." Result notices: "Invitation sent to {email}." / "Access added, but the email didn't send. Tell them to sign in with {email}." |

**Right leaf: selected link.**
| Element | Copy / rule |
|---|---|
| Header | "{label}" + "Made {date}". |
| Cover preview | The room's first view as the recipient sees it, scaled: tail, "Shared by {owner} for {recipient}", the map with its gap and overhauls labelled. "Opens on this map, then Summary, Logbooks, Documents." |
| Link | QR (120px), URL "mytaillog.com/r/{token prefix}…", Buttons "Copy link" (toast "Link copied."), "See it as {recipient}" (opens the room in a new tab in preview mode; not counted as a view). Note "MyTailLog doesn't send the link. Paste it into your own email or text." |
| Shows | Contents list: summary and dossier, logbooks ("All {n} logbooks, confirmed entries only"), page scans ("no scans" or "with scans"), documents ("{k} of {n} documents"), squawks and whether reporters are named; the cover ("Opens on the whole-life map"). Contents can't be changed after the link is made: "To change what it shows, make a new link and revoke this one." "Rename" edits the label. |
| Ends | "Ends {date}" + "Extend 30 days" (PATCH `extendDays`). |
| Opened | Sessions from `/opens`: "{Mon D, time} · {sections opened}" ("the map, Engine logbook", "summary, Documents"). |
| Revoke | Quiet alarm "Revoke this link" → ConfirmDialog "Revoke this link? {recipient} won't be able to open it again." Inactive links: "Delete this link". |

**Create form** (right leaf when an audience is chosen; `POST …/record-rooms`): For (`label`, TextInput, "e.g. J. Okafor"), Opens on (`map_window`: "The line ahead to the annual" `line_ahead`, "The whole-life map" `whole_life`, "The last five years" `last_5_years`), Includes (checkboxes prefilled by the preset: Summary, Pre-buy dossier, each logbook with "{n} confirmed", "Page scans" with the warning "Page scans can show entries you haven't confirmed yet.", each document, "Open squawks", "Who reported them"), Ends (Select 7, 30, 90, 180 days, or "On a date"; presets: IA until the annual's due date, buyer 30 days, insurer 14 days as a date), primary "Make the link". Result: the new link selected with "Link made. Copy it and send it yourself." Owner only (403 `not_owner` otherwise).

States: no links "No links yet. Pick who it's for to make one." No people "Not shared with anyone yet." S-OFF. Non-owners: redirected to `/share/dossier`. Spine: whole life, label "whole record". Acceptance: [ ] every link shows contents, expiry, opens and a revoke; [ ] links can be extended by 30 days and renamed; [ ] preview does not count as a view; [ ] role changes do not require re-inviting.

### W-SHARE-02 Record room, recipient view

Mockups: d-w-room (D), b-w-room. Route: `/r/[token]` (`?tab=map|summary|logbooks|documents`, `&stop=`, `&book=`, `&q=`). No rail, no account, `noindex`. Replaces `/r/[token]`.

**Layout.** A light binder at max width 1280px, centred: header strip (tail, type and serial; tabs across the top in the owner's order: "Map {years}", "Summary as of {date}", "Logbooks {n} entries", "Documents {n}"); a share line "Shared by {owner} for {recipient}" + "Read-only · open until {date}"; then two leaves (split `1.75fr 1fr`).

**Map tab.** Left: "The aircraft's life, from its logbooks" + legend; the RouteMap (whole life, confirmed entries only); "Due as of {date}" table (overdue and due-soon items with PageCites); "Click any stop to open its page. Only entries the owner has confirmed are shown. The paper logbooks are the legal record (14 CFR 91.417); check the originals before you rely on this index." Right: the as-of sentence ("As of Nov 18, 2026, one IFR-only check has lapsed. Three more items come due by Dec 31."), "Missing" (gaps in words with their explanations), "Overhauls" (engine and prop with hours since and pages), "In this room" (dossier "Open", summary, logbooks, documents), Button "Search all {n} entries". A selected stop shows its entry text and, when scans are included, its page.
**Summary tab.** The W-SHARE-04 article. **Logbooks tab.** Book chips, search ("Search entries"), list rows (date, text, tach, PageCite, "Open the page" when scans are included); paged 100 at a time, no cap. **Documents tab.** Title, date, "Open".
**Inactive link.** "This link is no longer active." + "Ask the owner for a new one." (identical for revoked, expired, unknown). **Footer.** "Kept with MyTailLog, a free and open-source logbook index for aircraft owners." + "Track your own aircraft".

Rules: only confirmed, non-superseded entries in scope; every load and document open counted (hashed IP); owner preview not counted. Acceptance: [ ] nothing unconfirmed is ever shown, except inside page images when the owner included scans with the warning; [ ] the map is the first tab; [ ] inactive links reveal nothing about why.

### W-SHARE-03 Pre-buy dossier

Mockups: d-w-dossier (D), b-w-dossier. Route: `/aircraft/[id]/share/dossier`. Share › Pre-buy dossier. Print preview on light paper regardless of theme. Board actions "Share with a buyer" (owner, to `/share?audience=buyer`), primary "Print or save PDF". BackLink "Back to Share". Replaces `/aircraft/[id]/prebuy`.

**Content** (US Letter, 4 pages at the reference data). Page 1: header block (tail, type, serials of airframe, engine and prop, "Prepared {date} by {owner} for {recipient}", tach and hobbs with read date); "The aircraft's life, from its logbooks": the line map in printer's ink with numbered footnote markers on every gap, overhaul and signed annual; legend "Solid line: pages in the index. Dashed: no pages. Capsule: one visit signed in several books. As of {date}."; footnotes quoting the page in type.paper ("Airframe p. 31, Apr 18, 1998, R. Mitchell, A&P 2214467 IA: "Annual inspection … AD 76-07-12 complied with.""). Footer "{tail} pre-buy dossier · {date}" + "Page 1 of 4". Page 2: boundary ("The paper logbooks are the legal record (14 CFR 91.417). This dossier indexes them and lists what they show; it does not establish airworthiness or completeness."), "Items to investigate" (numbered, each with footnotes), "What is due" table, "Records coverage" table (Logbook · Pages · Entries · Span; "{n} pages scanned {date} not yet confirmed, not included"). Pages 3 to 4: Engine (last overhaul, since overhaul and TBO advisory, compressions, oil analysis, oil-change intervals), Propeller, Airworthiness directives table, Major alterations and equipment, "What this does not cover". Empty investigate: "No issue was flagged by the confirmed records. This does not establish completeness."

States: nothing confirmed: "The dossier needs confirmed entries. Review pages first." S-VIEW: no Share with a buyer. Acceptance: [ ] page 1 is the map with every footnote resolving to a quoted page; [ ] prints on light paper with screen chrome hidden; [ ] only confirmed entries are used.

### W-SHARE-04 Maintenance summary

Mockup: b-w-summary. Route: `/aircraft/[id]/share/summary`. Share › Maintenance summary. Board actions "Copy as text" (plain-text summary to the clipboard; toast "Summary copied as text."), primary "Print or save PDF". Replaces `/aircraft/[id]/summary`.

**Content** (1 page, US Letter): title "{tail} maintenance summary", "Generated {date}"; identity line (type, serials, tach, hobbs, airframe); the verdict sentence; "Inspections, items and recurring ADs ({n})" table Item · Last done · Next due · Left · Status · Page (page column codes "AF 61", "EN 38", "Docs"); "Open squawks ({n})" Reported · Severity · Discrepancy; "ADs ({n})" AD · Status · Complied; "Installed equipment"; "Weight and balance" (with "may be stale" when so); key "Page column: AF Airframe, EN Engine logbook page."; footer "Generated by MyTailLog from an index of {tail}'s paper logbooks, which remain the legal record under 14 CFR 91.417. This is not an airworthiness determination; check the originals before relying on any value." The same article is the record room's Summary tab. Acceptance: [ ] fits one page at the reference data; [ ] every row carries its page.

---

## Account

### W-ACCOUNT-01 Import and export, backups

Mockup: b-w-data. Route: `/account/data` (`?aircraft=[id]`, `#import`, `#export`, `#backups`). Account › Import and export (grey board). Split `1.4fr 1fr` (683 / 487). Replaces `/aircraft/[id]/import`, `/aircraft/[id]/export`, the cloud backup card of `/profile`.

**Aircraft selector** (top of the left leaf): Select "Aircraft" listing every aircraft the user can open; import controls only when the user is owner or editor of the selected one.

**Left leaf: Import a CSV into {tail}** (Stepper "File", "Columns", "Create").
| Step | Content |
|---|---|
| File | "Which logbook do these entries belong to?" Select; file picker; "CSV only, up to 5 MB and 5,000 rows. Any spreadsheet saves as CSV." Button "Read the columns". |
| Columns | "{file} · {rows} rows · {cols} columns · {separator}-separated · into the {book} logbook"; table Column · First value · Import as (Select: Date, Description, Work performed, Parts, Hobbs, Tach, Airframe time, Signature or mechanic, Certificate number, AD references, SB references, Don't import); a doubtful mapping shows the reason ("Could also be tach. Same as the Tach column in 171 of 184 rows."). Date order: "Dates read as month, day, year. Settled by {examples}, where the middle number is past 12. Not guessed." or the question "Which way round are these dates?" with "Month/day/year (US)" and "Day/month/year". Buttons "Check what will be created", "Back". |
| Create | "{n} entries will be created"; "{k} rows can't be read and will be skipped" (expandable with reasons); duplicate warning "{d} rows look like entries you already have."; primary "Import {n} entries". Done: "Imported {n} entries. They're waiting for review, so nothing changes what is due until you confirm them." + "Review them" (W-BOOKS-08), "Check for duplicates" (W-MAINT-05), "Import another file". |
| Note | "Imported entries arrive as read, not confirmed, so nothing changes what is due until you review them." |

**Right leaf: Take it with you.**
| Element | Copy |
|---|---|
| Full backup | "Everything" / "Full backup, .zip" / "{p} scans, every entry, {d} documents, with a README describing each file. Re-imports in one step. About {size}." / "Download backup" (progress "Reading records…", "Packing scans, {i} of {n}…", "Compressing…"). |
| Spreadsheets | links "Entries", "ADs and SBs", "Equipment", "Due list" (CSV downloads). |
| Printouts | "Maintenance summary" (W-SHARE-04), "Every entry" (full records report print view). |
| Restore | "Restore from a backup" (same importer as the hangar card; creates a new aircraft). |
| Automatic backups | Per provider (Dropbox, Google Drive): status "monthly to MyTailLog/{tail} · next {date}" or "not connected"; "Last run {date} · {size} · {result}"; Frequency Select Off / Monthly / Quarterly; "Connect", "Reconnect", "Disconnect"; "Back up now" (new on the web). Note "Backups only ever add files; nothing in your {provider} is deleted." |
| Leaving | "You can leave whenever you like. Open formats, no reader required, MIT licensed and self-hostable." |

States: CSV errors as today (size, rows, unmapped date or description, inconsistent dates), named in words. Viewers of the selected aircraft: import hidden; export shown. Acceptance: [ ] import, export, scheduled backups and restore are on one screen; [ ] the CSV wizard keeps every step and check of today's.

### W-ACCOUNT-02 Settings

Mockup: b-w-settings. Route: `/account/settings` (anchors in 03 §9.2). Account › Settings. Readout "Changes save as you make them". Split `1.2fr 1fr` (638 / 532). Replaces `/profile` and `/profile/credentials`.

**Left leaf.**
| Section | Elements |
|---|---|
| You | Name (TextInput, saves on blur; toast "Saved."), Email + "Change" (sends a confirmation to the new address: "We sent a link to {email}. The change happens when you open it."). |
| Signing in | "Email link always works for {email}" (On); Password "set {date}" + "Change" / "Set a password"; Google "Connected" or "Connect"; Apple likewise. |
| Signing entries | "self-declared" tag; list "{Kind}, certificate ending {last4}" + "Remove" (ConfirmDialog); "Add a certificate": Certificate kind (Private pilot, Commercial pilot, Airline transport pilot, Mechanic (A&P)), Certificate number, Ratings, "Save certificate". Note "These details are self-declared; MyTailLog does not check FAA privileges." |
| Reminders | `profile.preferences` (09 §2.11, §4.9). Toggle "Email and phone reminders before items come due" (default on for new accounts; existing accounts keep their setting). Toggle "Weekly while something is lapsed" (`weekly_while_lapsed`, at most 8). Table Kind of item · Days ahead · Hours ahead: Annual inspection 90; Oil change · 10; ADs and SBs 30 · 25; Registration, insurance 60; Everything else 30 · 25. Channels per kind (email, phone, in the inbox), including "Pages are read" and "A record room was opened" (off by default). Quiet hours for the phone (default 21:00 to 07:00). Toggle "Setup tips by email while I add my aircraft" (default on). "Send a test" + result "Reached {n} devices and your email." or the failure reason. Per-item overrides live on W-STATUS-04. The inbox itself is in the account menu (03 §5.4). |
| Accessibility | Toggle "Single-key shortcuts" (default on; WCAG 2.1.4) + "Show shortcuts" (opens the ShortcutSheet); further display options per 11-accessibility-and-motion.md. |

**Right leaf.**
| Section | Elements |
|---|---|
| AI reading | "logbook pages and Ask"; "{used} of {cap} pages today" + "shared allowance" + CoverageBar; "Each page frees up 24 hours after it was read, not all at midnight." Own key: "none" / "Using your {provider} key ending {last4}" + stats (cost so far, AI calls, input tokens, output tokens); form Provider (Anthropic, OpenAI), API key, "Save key", "Remove key". Helper "Add an Anthropic or OpenAI key to read without the daily limit. You pay the provider directly." |
| MyFlightBook | Status "Connected as {username}" (On) / "Not connected"; last sync line; "Sync now", "Disconnect"; setup fields Client ID, Client secret, MyFlightBook username, "Save credentials", "Connect MyFlightBook" / "Reconnect"; the info note about pushing via Connected apps. |
| Apps you let in | Rows "{app}" + "reads {scopes in words} for {aircraft}" + "since {date}" + "Revoke" (ConfirmDialog). Empty: "No apps have access." Link "Developer API" for building one. |
| Offline copy | "Everything can be edited offline in the phone app and uploads when you reconnect. Reading pages, Ask and adding an aircraft need a connection." |
| Sign out | Button secondary "Sign out". Account deletion: link "Delete my account" (to `/account-deletion`). |

Acceptance: [ ] no Save buttons except where a group must be submitted together (password, own key, MyFlightBook credentials, certificate); [ ] every setting of today's Profile and Signing credentials pages is present; [ ] the allowance is shown in pages.

---

## Kept from today, restyle only

These keep their current behaviour and routes (03 §9.1) and take the new tokens (01-design-tokens.md), type (Libre Franklin) and controls (02-components.md) only: the marketing site (`/`, `/demo`, `/faq`, `/compare`, `/switch/myfbo`, `/guides/[slug]`, `/ads`, `/ads/[make]/[model]`, `/privacy`, `/account-deletion`), Help (`/help`), What's new (`/whats-new`), Developer API (`/developers`, `/developers/docs`), OAuth consent (`/oauth/consent/[uid]`), Admin (`/admin`), and the sticker print page (`/print/entry/[entryId]`). Signed-in pages among them use the hangar rail. Required fixes while restyling: `/demo` links to `/login?mode=create`; consent and admin ConfirmButtons become ConfirmDialog; Developer API "Rotate secret" and "Delete" ask first.

---

## Coverage: every current web capability and where it lives now

Rows follow web-inventory.md §3 (screens) and §4 (workflows). "Kept" means the capability is unchanged in behaviour; "changed" says how.
No row is "dropped" unless stated with the replacement.

### Screens (web-inventory §3)

| § | Today (route) | Capability | New home | Notes |
|---|---|---|---|---|
| 3.1 | `/dashboard` | List aircraft with status, review count, tach, entries, records span | W-HANGAR-01 | Changed: verdict sentence and life strip per card. |
| 3.1 | `/dashboard` | Fleet tiles (aircraft, overdue fleet-wide, due soon, pages to review) | W-HANGAR-01 cards | Changed: counts per card instead of fleet tiles; the switcher shows each verdict too. |
| 3.1 | `/dashboard` | "How did you hear" card | W-HANGAR-01 | Kept. |
| 3.1 | `/dashboard` | Disclaimer banner | W-HANGAR-01 boundary line | Changed: one calm line. |
| 3.1 | `/dashboard` | Demo / shared chips | W-HANGAR-01 tags | Kept. |
| 3.1 | `/dashboard` | Manage / delete aircraft link | W-HANGAR-01 More menu to W-AIRCRAFT-05 | |
| 3.1 | `/dashboard` | Remove shared aircraft from dashboard | W-HANGAR-01 More menu | Kept, now with ConfirmDialog. |
| 3.1 | `/dashboard` | Enroll card | W-HANGAR-01 Add card | |
| 3.1 | `/dashboard` | Import from backup (.zip) with progress and errors | W-HANGAR-01 Import card; W-ACCOUNT-01 Restore | Kept. |
| 3.2 | `/aircraft/enroll` | Tail number, FAA registry lookup filling make, model, serial, year | W-HANGAR-02 | Kept; source tags added. |
| 3.2 | `/aircraft/enroll` | Engine and prop serials, home base | W-HANGAR-02 | Kept. |
| 3.2 | `/aircraft/enroll` | Hobbs, tach, airframe at enrollment | W-SETUP-01 (meters today); W-AIRCRAFT-01 Starting readings | Changed: asked once, in setup. |
| 3.2 | `/aircraft/enroll` | Creates 5 logbooks and 4 Part 91 items | W-HANGAR-02 | Kept; copy now says five. |
| 3.3 | `/start` | Current hours step | W-SETUP-01 Meters today | |
| 3.3 | `/start` | Last annual: photograph or upload, AI read, pick entry, confirm | W-SETUP-01 Last annual | Kept. |
| 3.3 | `/start` | Last annual: type the date | W-SETUP-01 | Kept. |
| 3.3 | `/start` | Status headline and four items with inline dates | W-SETUP-01 Your first status; W-SETUP-02 | Kept. |
| 3.3 | `/start` | Reminders mention | W-SETUP-01 Reminders toggle | Changed: an actual toggle, on. |
| 3.3 | `/start` | Skip for now | W-SETUP-01 board action | Kept. |
| 3.4 | `/aircraft/[id]` | Status gauge and legend | W-STATUS-01 verdict and legend chips | Changed: sentence, not gauge. |
| 3.4 | `/aircraft/[id]` | Next due (4 items) | W-STATUS-01 table and line ahead | |
| 3.4 | `/aircraft/[id]` | Most urgent banner | W-STATUS-01 verdict | |
| 3.4 | `/aircraft/[id]` | Recent activity (3 entries) | W-BOOKS-12 list (newest first); W-STATUS-02 all clear "what moved" | |
| 3.4 | `/aircraft/[id]` | Records coverage bars, gap note, pending review CTA | W-BOOKS-01 map; W-BOOKS-05 books column; rail Logbooks flag | |
| 3.4 | `/aircraft/[id]` | Ask teaser | Rail Search or ask; W-ASK-01 suggestions | |
| 3.4 | `/aircraft/[id]` | Finish setup chip; Edit details; Capture; Export | W-SETUP-02 "Finish setup"; W-AIRCRAFT-05; Add menu; W-ACCOUNT-01 | |
| 3.4 | top bar | Tach, hobbs, airframe readouts | Status board head readout; W-AIRCRAFT-01 Now | Changed: visible at every width on Status. |
| 3.4 | top bar | Annunciator (only at 1536px and up) | Rail Status tab line at every width | Changed. |
| 3.5 | `/details` | Edit make, model, year, serials, home base | W-AIRCRAFT-05 | Kept; registry comparison added. |
| 3.6 | `/status` | Urgency-grouped status of all items and recurring ADs, counts | W-STATUS-01 | Changed: one table with both limits and actions. |
| 3.6 | `/status` | Estimates of tach and hobbs with tooltips | W-AIRCRAFT-01 Now (source words); Status readout | |
| 3.6 | `/status` | Projection "hours run out ≈ {date}" with confidence | W-STATUS-01 Hours limit "about {date}"; W-STATUS-03 | |
| 3.6 | `/status` | A&P report corroboration chip | W-MAINT-01 "A&P report on file" tag; TrustMark signed | |
| 3.6 | `/status` | Interval-elapsed bar | W-STATUS-04 history map | Changed: drawn as stops and intervals. |
| 3.7 | `/maintenance` | Recurring items table sorted by urgency | W-STATUS-01 | |
| 3.7 | `/maintenance` | Add item, edit item (type, label, intervals, meter, last done, regulatory, notes) | W-MAINT-06 item form | Kept; book, IFR only and reminder lead added. |
| 3.7 | `/maintenance` | Standard types and defaults | W-MAINT-06 Type select | Kept. |
| 3.7 | `/maintenance` | Done inline form | W-STATUS-04 drawer, opened from every W-STATUS-01 row | Kept; entry link, notes and preview added. |
| 3.7 | `/maintenance` | Delete item | W-MAINT-06 "Stop tracking" | Kept with ConfirmDialog. |
| 3.7 | `/maintenance` | Seed standard Part 91 items | W-MAINT-06; W-STATUS-01 empty state | Kept. |
| 3.7 | `/maintenance` | Update from logs (AI rescan) | W-MAINT-06 "Find completions in the logs" | Kept. |
| 3.7 | `/maintenance` | Sync hours (MyFlightBook) | W-AIRCRAFT-01 MyFlightBook "Sync now"; W-ACCOUNT-02 | Moved. |
| 3.7 | `/maintenance` | AD rows "Compliance" link | W-STATUS-01 AD rows "Record"; W-STATUS-04 `ad-` variant | |
| 3.8 | `/compliance` | Register with sorting by state | W-MAINT-01 | Kept; four plain states. |
| 3.8 | `/compliance` | Referenced in your logs, not tracked, one-click track | W-MAINT-01 "Referenced, not tracked" | Kept. |
| 3.8 | `/compliance` | AD editor with every field (type, number, title, status, recurring, intervals, complied date and hours, method, related equipment, applicability, N/A or superseded date, reason) | W-MAINT-01 AD editor | Kept; compliance now a history. |
| 3.8 | `/compliance` | Official reference links, effective date; look up FAA record (DRS) | W-MAINT-01 Official reference | Kept. |
| 3.8 | `/compliance` | Delete AD (native confirm) | W-MAINT-01 "Stop tracking" ConfirmDialog | |
| 3.9 | `/compliance/explore` | FAA search by makes, model, keywords | W-MAINT-02 | Kept; installed parts added as terms. |
| 3.9 | `/compliance/explore` | Candidate cards (models named, effective, abstract, DRS status) | W-MAINT-02 table and right leaf | |
| 3.9 | `/compliance/explore` | Track this AD; track with an interval (one-time or recurring, next due) | W-MAINT-02 How it repeats | Kept; next due no longer wiped. |
| 3.9 | `/compliance/explore` | Federal Register, DRS, PDF links | W-MAINT-02 | Kept. |
| 3.10 | `/squawks` | Report (description, severity) by any role | W-MAINT-03 Report a squawk; Add menu | Kept; photos and tach added. |
| 3.10 | `/squawks` | Open and resolved lists | W-MAINT-03 | Kept. |
| 3.10 | `/squawks` | Resolve | W-MAINT-03 Resolve with an entry | Changed: asks entry or explanation and date. |
| 3.10 | `/squawks` | Reopen, delete | W-MAINT-03 | Kept; delete confirms. |
| 3.11 | `/meters` | ADS-B passive hours: explainer, enable, Mode S, suggestion, record a reading, dismiss | W-AIRCRAFT-01 ADS-B checks and suggestion | Kept. |
| 3.11 | `/meters` | Current readings with source | W-AIRCRAFT-01 Now | Kept. |
| 3.11 | `/meters` | Starting readings, edit, clear to stop tracking | W-AIRCRAFT-01 Starting readings | Kept. |
| 3.11 | `/meters` | Replaced meters: record, list, remove | W-AIRCRAFT-01 Replaced meters | Kept. |
| 3.11 | `/meters` | Readings entered by hand: add, list, remove | W-AIRCRAFT-01 Readings; Add a reading; W-ADD-01 Log a flight | Kept and promoted. |
| 3.12 | `/oil-analysis` | Import lab report (PDF, images) with tail-mismatch warning | W-AIRCRAFT-02 Import | Kept. |
| 3.12 | `/oil-analysis` | Latest sample panel, wear-metal trend, elements, oil properties, all samples | W-AIRCRAFT-02 chart, samples, latest sample detail | Kept. |
| 3.12 | `/oil-analysis` | Oil consumption: top-offs, burn rate, delete | W-AIRCRAFT-02 Oil added; W-ADD-01 Add oil | Kept. |
| 3.12 | `/oil-analysis` | Cylinder compression chart and table with source review | W-AIRCRAFT-02 Compressions | Kept. |
| 3.12 | `/oil-analysis` | Oil-change intervals table | W-AIRCRAFT-01 Oil changes (show all) | Moved. |
| 3.13 | pipeline | AI allowance with verbatim limit messages | W-BOOKS-06 Reading today; W-ACCOUNT-02 AI reading | Changed: shown in pages, in the pipeline. |
| 3.13 | pipeline | Confidence threshold 0.75, clean-entry rule | W-BOOKS-07 field states; W-BOOKS-08 clean pages | Kept. |
| 3.13 | pipeline | Lightbox zoom | ScanViewer zoom on every SourceMat | Kept. |
| 3.14 | `/capture` | Camera capture with quality check (resolution, blur, glare) | W-BOOKS-06 camera; phone app M-SCAN-02 | Kept. |
| 3.14 | `/capture` | Offline queue on device, upload later, service worker | W-BOOKS-06 queue "On this device" | Kept. |
| 3.14 | `/capture` | Logbook preselect, handwritten toggle | W-BOOKS-06 Into, Handwritten | Kept. |
| 3.15 | `/upload` | Upload PDFs and images, split PDFs in browser, quality report | W-BOOKS-06 drop zone and queue | Kept; drag and drop added. |
| 3.16 | `/pages` | Pages by logbook, filter by book | W-BOOKS-05 books column | Kept; volumes added. |
| 3.16 | `/pages` | Needs review / processing filters with counts | W-BOOKS-05 state filter | Kept. |
| 3.16 | `/pages` | Extract pending / per-row Extract, Re-extract | W-BOOKS-06 automatic reading; W-BOOKS-05 "Read again" | Changed: automatic; read again stays. |
| 3.16 | `/pages` | Thumbnails backfill | automatic (server) | Changed: no button; thumbnails are made on upload. |
| 3.16 | `/pages` | Reorder, sort (upload order, entry date, tach, airframe), direction | W-BOOKS-05 Reorder and Sort | Kept (airframe sort folded into Tach and Paper order; add back if wanted). |
| 3.16 | `/pages` | Select many, delete many with entry counts | W-BOOKS-05 selection bar | Kept; move and read again added. |
| 3.16 | `/pages` | Row: thumbnail, entries count, spread note, extraction error, review badge | W-BOOKS-05 thumbnails and selected-page panel | Kept. |
| 3.17 | `/pages/[pageId]/review` | Scan beside entries; spotlight a field's source box | W-BOOKS-07 | Kept; close-up added. |
| 3.17 | `/pages/[pageId]/review` | Previous / next page | W-BOOKS-07 page context line; Confirm page and next | Kept. |
| 3.17 | `/pages/[pageId]/review` | Re-extract page | W-BOOKS-07 More "Read this page again" | Kept with ConfirmDialog. |
| 3.17 | `/pages/[pageId]/review` | Classification banners (W&B, AD report, sticker matched) | W-BOOKS-07 page notices | Kept. |
| 3.17 | `/pages/[pageId]/review` | Spread and rotated-content notes | W-BOOKS-07 page notices | Kept. |
| 3.17 | `/pages/[pageId]/review` | Show extracted text | W-BOOKS-07 More "Show the text as read" | Kept. |
| 3.17 | `/pages/[pageId]/review` | Crop and clean up (corners, rotate, scan look, reset, save) | W-BOOKS-07 Crop and read again | Kept; reads again after saving. |
| 3.17 | `/pages/[pageId]/review` | Entry fields (category, date, hobbs, tach, airframe, description, work, parts, signature, cert, AD refs, SB refs) with confidence | W-BOOKS-07 Fields | Kept. |
| 3.17 | `/pages/[pageId]/review` | Save and confirm; confirm as-is; unconfirm | W-BOOKS-07 outcomes and Confirm page; Unconfirm | Changed: per-field outcomes. |
| 3.17 | `/pages/[pageId]/review` | Merge continuation into previous page | W-BOOKS-07 "Join them"; "Carries on to page" toggle | Kept. |
| 3.17 | `/pages/[pageId]/review` | Delete entry (no confirm today) | W-BOOKS-07 Delete this entry with ConfirmDialog | Changed. |
| 3.17 | `/pages/[pageId]/review` | Add an entry the extractor missed | W-BOOKS-07 | Kept. |
| 3.17 | `/pages/[pageId]/review` | Mark page reviewed; flag as disputed | W-BOOKS-07 Confirm page and next; More "Flag this page" | Kept. |
| 3.17 | `/pages/[pageId]/review` | Attachments (vault link, add file, unlink) and reference links | W-BOOKS-07 Attachments and links; W-BOOKS-10 Attached | Kept. |
| 3.18 | `/review` | All entries grouped by page, needs review / all filter | W-BOOKS-08 | Changed: pages listed, doubtful first. |
| 3.18 | `/review` | Confirm N clean | W-BOOKS-08 "Confirm {c} clean pages" | Kept with Undo. |
| 3.18 | `/review` | Imported entries without scan | W-BOOKS-08 "Imported, no page" | Kept. |
| 3.18 | `/review` | Inline editing in the bulk list | W-BOOKS-07 (opened from W-BOOKS-08) | Changed: one review surface for editing. |
| 3.19 | `/entries/new` | Templates, meters, template fields, work text, reset wording, performer | W-BOOKS-11 | Kept. |
| 3.19 | `/entries/new` | Sign with certificate, attestation, emailed 8-digit code, rate limit, errors | W-BOOKS-11 Sign it | Kept. |
| 3.19 | `/entries/new` | Corrections (`?corrects=`) | W-BOOKS-11 correction mode; W-BOOKS-10 Write a correction | Kept. |
| 3.19 | `/entries/new` | Draft autosave on device | W-BOOKS-11 draft line | Kept. |
| 3.20 | `/entries/[entryId]` | Locked signed entry, superseded notice, scan link, create correction | W-BOOKS-10 | Kept. |
| 3.20 | `/entries/[entryId]` | Sticker controls (width 2 to 7 in, Letter or A4, print) and sticker content | W-BOOKS-10 sticker panel; W-BOOKS-11 preview | Kept. |
| 3.20 | `/print/entry/[entryId]` | Token-gated sticker print for the phone app | kept as is | |
| 3.21 | `/timeline` | Entries merged by date, year groups, undated group | W-BOOKS-12 | Kept. |
| 3.21 | `/timeline` | Full-text search, logbook filter | W-BOOKS-12 search and chips; W-ASK-01 | Kept. |
| 3.21 | `/timeline` | Entry row details (thumbnail, status, hobbs, ADs, SBs, attachments, parts, source link, signed-entry link) | W-BOOKS-12 rows; W-BOOKS-10 | Kept. |
| 3.21 | `/timeline` | At a glance (total, span, logbooks) | W-BOOKS-01 heading; W-BOOKS-12 book counts | |
| 3.21 | `/timeline` | `?entry=` deep link | `/logbooks/map?stop=[entryId]` | Redirect in 03 §10. |
| 3.21 | `/timeline` | New logbook entry button | W-BOOKS-12 "Write an entry"; Add menu | Changed: editors only (today shown to all). |
| 3.22 | `/ask` | Question, suggestion chips, cited answer, cited entries with page links | W-ASK-01 | Kept; crops and map added; recent questions. |
| 3.22 | `/ask` | Why it's trustworthy sidebar | W-ASK-01 boundary line | Changed: one line. |
| 3.22 | `/ask` | Errors (no key, too long, allowance, network) | W-ASK-01 states | Kept. |
| 3.23 | `/import` | CSV wizard: logbook, file, column mapping with confidence, date order, preview, skipped rows, duplicates, import | W-ACCOUNT-01 Import | Kept. |
| 3.23 | `/import` | Done: review, fix duplicates, import another | W-ACCOUNT-01 Done step | Kept. |
| 3.24 | `/duplicates` | Mis-keyed readings: accept fix, clear field, keep | W-MAINT-05 Mis-keyed readings | Kept. |
| 3.24 | `/duplicates` | Duplicate scans and entries with suggested keep, delete | W-MAINT-05 | Kept with ConfirmDialog. |
| 3.25 | `/audit` | Findings: missing annuals, timeline gaps, AD compliance gaps, summary counts | W-MAINT-05; W-BOOKS-04 | Changed: every finding has an action; gaps can be explained. |
| 3.26 | `/documents` | Upload with category, title, reference, date, notes | W-DOCS-01 Add a document | Kept; expiry and entry link added. |
| 3.26 | `/documents` | List by category, open, download, delete | W-DOCS-01 | Kept; edit details added. |
| 3.26 | `/documents` | Linked record and unlink | W-DOCS-01 selected document; W-BOOKS-10 | Kept. |
| 3.27 | `/equipment` | Installed and removed lists with AD counts | W-AIRCRAFT-03 | Kept. |
| 3.27 | `/equipment` | Scan logs for equipment, suggestions with select all/none, import, dismiss | W-AIRCRAFT-03 Found in the logs | Kept. |
| 3.27 | `/equipment` | Add, edit (all fields incl. life limit), delete | W-AIRCRAFT-03 form | Kept. |
| 3.27 | `/equipment` | Mark removed (native prompt), reinstall, ADs marked not applicable | W-AIRCRAFT-03 Mark removed dialog | Changed: proper date field. |
| 3.28 | `/weight-balance` | Current W&B, revision history, add, edit, delete, compute third value | W-AIRCRAFT-04 | Kept. |
| 3.28 | `/weight-balance` | May be out of date sidebar with equipment changes | W-AIRCRAFT-04 stale notice | Kept. |
| 3.29 | `/annual` | Due by the annual, open squawks, before you hand over the books, 90-day fallback | W-MAINT-04 | Changed: every row actionable. |
| 3.29 | `/annual` | Print summary for your IA | W-MAINT-04 "Print the summary for your IA" | Kept. |
| 3.30 | `/summary` | One-page summary article, share as text, print | W-SHARE-04 | Kept ("Copy as text" replaces Web Share). |
| 3.31 | `/prebuy` | Printable dossier with sections and source links; share with a buyer | W-SHARE-03 | Kept; map page added. |
| 3.32 | `/export` | PDF reports (summary, full records report) | W-ACCOUNT-01 Printouts | Kept. |
| 3.32 | `/export` | CSV exports (entries, AD/SB, equipment, maintenance) | W-ACCOUNT-01 Spreadsheets | Kept. |
| 3.32 | `/export` | Full backup .zip with progress | W-ACCOUNT-01 Full backup | Kept. |
| 3.32 | `/export` | "You can leave whenever you like" | W-ACCOUNT-01 | Kept. |
| 3.33 | `/share` | Record room links: create (who, includes, scans warning, expiry), copy, preview, revoke, delete, views | W-SHARE-01 | Kept; audience presets, cover map, extend, rename, QR and view sessions added. |
| 3.33 | `/share` | People: invite by email with role, remove, owner row | W-SHARE-01 People | Kept; role change in place. |
| 3.33 | `/share` | Transfer at sale | W-AIRCRAFT-05 | Moved. |
| 3.33 | `/share` | Delete aircraft with typed confirm | W-AIRCRAFT-05 | Moved; types the tail. |
| 3.34 | `/r/[token]` | Recipient view: header, disclaimer, summary, logbooks with search, documents, inactive page, view counting | W-SHARE-02 | Kept; map tab first; 500 cap replaced by paging. |
| 3.35 | `/profile` | Details (name) | W-ACCOUNT-02 You | Kept. |
| 3.35 | `/profile` | Notifications: master switch, setup tips, test push, per-category lead times | W-ACCOUNT-02 Reminders | Kept; per-item override on W-STATUS-04. |
| 3.35 | `/profile` | Sign-in methods: magic link, Google, Apple, password, change email | W-ACCOUNT-02 Signing in | Kept. |
| 3.35 | `/profile` | MyFlightBook credentials, connect, sync, disconnect | W-ACCOUNT-02 MyFlightBook; W-AIRCRAFT-01 | Kept. |
| 3.35 | `/profile` | AI key, provider, allowance bar, own-key stats | W-ACCOUNT-02 AI reading | Kept; shown in pages. |
| 3.35 | `/profile` | Automatic cloud backups (Dropbox, Drive), frequency, stats | W-ACCOUNT-01 Automatic backups | Moved; "Back up now" added. |
| 3.35 | `/profile` | Connected apps, revoke | W-ACCOUNT-02 Apps you let in | Kept. |
| 3.35 | `/profile` | Sign out; admin link | W-ACCOUNT-02; AccountMenu | Kept. |
| 3.35 | `/profile/credentials` | Signing credentials: list, add, remove | W-ACCOUNT-02 Signing entries | Kept. |
| 3.36 | `/developers`, consent | Register apps, scopes, secrets; consent card | Kept (restyle) | |
| 3.37 | `/admin` | Admin stats, funnel, announcements, shared AI provider, users | Kept (restyle) | Announcements render on Status and the hangar. |
| 3.38 | `/login` | Google, Apple, magic link, password, create account, forgot password | W-AUTH-01 | Kept. |
| 3.39 | email, push | Daily reminder emails and push | unchanged backend; settings in W-ACCOUNT-02 | Planned visits add a reminder (W-STATUS-03). |
| 3.39 | nav badges | Status, review, equipment badges | Rail lines and Logbooks flag (03 §13) | Kept as counts. |
| 2.x | shell | Help, What's new, version chip | AccountMenu | Version shown in What's new. |
| 2.x | shell | Announcement banner | W-STATUS-01 and W-HANGAR-01 leaf top | Changed: two places, not every page. |
| 2.x | shell | Toasts | Toast with Undo; errors inline | Changed. |

### Workflows (web-inventory §4)

| § | Workflow today | New path | Screens |
|---|---|---|---|
| 4.1 | Sign in, enroll, start (3 screens, meters twice) | Sign in, Add an aircraft, Setup (one screen), Status | W-AUTH-01, W-HANGAR-02, W-SETUP-01, W-SETUP-02 |
| 4.2 | Capture or upload, then Pages, then Extract, then Review page or Review all | Add pages (reading starts by itself, queue visible, allowance shown), toast when read, Review all, Review desk with Confirm page and next | W-BOOKS-06, W-BOOKS-08, W-BOOKS-07 |
| 4.3 | Hours on Meters §5; top-off on Oil; oil change done on Forecast | Add › Log a flight (tach, hobbs, oil, photo of the tach) from anywhere; Mark done in the due row | W-ADD-01, W-STATUS-01 |
| 4.4 | Squawk add and one-click resolve | Report from Add or Squawks with photos; resolve with the entry that cleared it; send to mechanic | W-MAINT-03 |
| 4.5 | Discover (chips, explore, public catalog), track, record compliance by editing | Find ADs or "Track it" chips; Record compliance adds history; next due derived | W-MAINT-02, W-MAINT-01 |
| 4.6 | Annual prep read-only, links to tops of pages | Annual prep with actions in place, IA room in one press | W-MAINT-04, W-SHARE-01 |
| 4.7 | Dossier print; record room from the share page | Share hub presets; dossier with map page; room with map | W-SHARE-01, W-SHARE-03, W-SHARE-02 |
| 4.8 | Share with co-owner or mechanic via People | Share hub People, role change in place | W-SHARE-01 |
| 4.9 | Export on aircraft page, backups in Profile, restore on hangar | One screen for import, export, backups, restore (restore also on the hangar) | W-ACCOUNT-01, W-HANGAR-01 |
| 4.10 | Duplicated entry points, inconsistent confirmation, feedback and role gating, forms above lists, read-only dashboards | One Add; ConfirmDialog everywhere; Toast plus inline errors; controls hidden by role; forms on the right leaf; every dashboard row actionable | all |

---

## Open questions

1. Item detail is placed under Status (03 §4), not Maintenance as d-w-item draws it. Confirm (the phone's M-STATUS-05 is under Status).
2. d-web-status merges "Transponder and static" into one row; this file keeps one row per tracked item (11 rows) so each can be marked done separately.
3. The horizon "Next 60 days" replaces the mockup's "Before the new year" group label for determinism.
4. Data this file needs that 09-data-and-api.md does not yet define: recent Ask questions per user (`ask_history`, W-ASK-01 "Recent"), W&B envelope points (`wb_envelope`, optional chart on W-AIRCRAFT-04), a rail counts call (03 §13), and the in-shop and awaiting-records prompts' dismissal state (W-STATUS-01 notices).
5. Mockup overrides taken from 09 and 10: the second suggested visit's week follows 09 §3.5 (week of Feb 22 at the reference data, not Feb 15); a one-book map keeps the other books faint (10 §8.2) where d-w-map-engine removes them; Ask's map dims non-matching stops (10 §8.2) where d-w-ask hides them; undated due items are listed under the line ahead (09 §3.4) where d-w-new draws a "Needs a date" column.
6. Viewers may see Pages read-only and the dossier and summary in the Share tab (03 §14). This widens today's access.
7. Record room contents cannot be changed after creation (09 §4.11 has no contents patch); B's "Choose" is dropped in favour of "make a new link and revoke this one".

## Components to add

| Component | Used on | Purpose |
|---|---|---|
Components 02-components.md already defines are used by name (AddMenu, AircraftSwitcher, RailAircraftLink, Drawer, LifeStrip, StopStepper,
BookTabs, MapTooltip, FilterChip, ChoiceChip, PageThumb, SelectionBar, DropZone, QRCode, SearchField, ConfirmDialog, PrintSheet, Sticker).
These are new here:

| Component | Used on | Purpose |
|---|---|---|
| HangarCard | W-HANGAR-01 | Aircraft binder card: LifeStrip header, verdict, counts, facts, More menu. |
| VisitPanel | W-STATUS-01, 03, W-MAINT-04 | Right-leaf panel for a suggested, planned, in-shop or awaiting-records visit. |
| BookVisitDialog | wherever "Book this visit" appears | Dialog to book a visit (week, day, provider, items, notes). |
| Dialog | W-ADD-01, W-AIRCRAFT-03 | Modal dialog; ConfirmDialog is its destructive variant. |
| DateInput | many | Date field with typed entry and a calendar picker. |
| CameraCapture | W-BOOKS-06 | In-browser camera with the quality check. |
| CropTool | W-BOOKS-07 | Corner crop, rotate and scan look. |
| LineChart | W-AIRCRAFT-02 | Wear-metal and compression charts (dataviz rules in 01-design-tokens.md). |
| From 03 §18 | | AccountMenu, NotificationInbox, BackLink, ShortcutSheet, OfflineStrip, IconRail. |
