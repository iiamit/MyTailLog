# 08 · Capabilities

This is the catalogue of every capability in the redesigned MyTailLog (direction D), on the web, iOS and Android. Each capability has an ID (`C-AREA-nn`), a status (**Existing**: kept with the same behaviour, restyled; **Changed**: kept with behaviour changes listed; **New**: not in today's product), the screens where it lives (IDs from the writers' brief), and its rules. Section 2 is the full catalogue in one table per area. Section 3 specifies every New capability in depth: user value, precise rules and calculations, edge cases, settings and acceptance criteria. Section 4 lists the behaviour changes of Changed capabilities. Section 5 indexes every setting with its default. Existing behaviour is grounded in `apps/web/src/lib` and `docs/redesign/research/docs-digest.md`; data and algorithms are defined in 09-data-and-api.md (cited as "09 §x"), workflows in 07-flows.md, map drawing in 10-line-map.md, copy in 12-copy-and-voice.md.

## Contents
1. [Rules that apply to every capability](#1-rules-that-apply-to-every-capability)
2. [Catalogue](#2-catalogue)
3. [New capabilities in detail](#3-new-capabilities-in-detail)
4. [Changed capabilities: what changes](#4-changed-capabilities-what-changes)
5. [Settings index](#5-settings-index)
6. [Components to add](#6-components-to-add)
7. [Open questions](#7-open-questions)

---

## 1. Rules that apply to every capability
1. **Review gate.** Only entries with trust `confirmed` or `signed` (09 §3.1) move due status, projections, the line ahead, suggested visits, reminders, widgets, record rooms, dossiers, summaries and status exports. `ai_read` entries appear with their TrustMark and an offer to review.
2. **Trust shown wherever a record value appears** (C-TRUST-01).
3. **Every derived value carries a PageCite** to the page it rests on, or says where it came from ("you, today", "FAA registry", "MyFlightBook, Nov 2").
4. **Never a verdict of airworthiness.** No "airworthy", "legal to fly", "grounded", "compliant" as app conclusions.
5. **Roles.** Owner: everything. Editor: everything except record rooms, transfer, delete aircraft, sharing people. Viewer: read everything, report squawks (with photos), snooze own reminders, use Ask and Search. Record room and mechanic-link recipients: read-only through the link, no account.
6. **Offline (phone).** Everything works offline except: AI reading, Ask, enrolling an aircraft, backups, first-read generation, Find ADs, making record room or mechanic links, inviting people, transfer, delete aircraft, CSV import. These say "Needs a connection" and do not queue (09 §5.3). Everything else saves on the device and syncs; conflicts go to M-SYS-01.
7. **Allowance.** AI reading uses the rolling 24-hour allowance: 100 calls on the shared key (about 50 pages), 1000 on the owner's own key. When spent, pages wait ("Waiting for tomorrow's allowance") and everything else keeps working.

---

## 2. Catalogue

### 2.1 Account and access
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-ACCT-01 | Sign in and sign up (Google, Apple, email link, password; one account across web and apps) | Existing | W-AUTH-01, M-AUTH-01 | Android adds Apple sign-in only if available; unchanged otherwise |
| C-ACCT-02 | Profile, email change, sign-in methods, password | Existing | W-ACCOUNT-02, M-SYS-02 | |
| C-ACCT-03 | Signing credentials (A&P, IA, pilot certificate) for authored entries | Existing | W-ACCOUNT-02 | |
| C-ACCT-04 | AI reading allowance display and own API key (Anthropic or OpenAI) | Changed | W-ACCOUNT-02, W-BOOKS-06, M-SCAN-01, M-SCAN-03 | Allowance shown in pages ("31 of 50 pages today") wherever reading starts; "Each page frees up 24 hours after it was read" |
| C-ACCT-05 | Account deletion (phone, App Store rule) | Existing | M-SYS-02 | Verify server side exists (open question in docs-digest) |
| C-ACCT-06 | Appearance: light, dark, match system | Changed | W-ACCOUNT-02, M-SYS-02 | Web gains light theme (today dark only); default follows system |
| C-ACCT-07 | Announcements (admin) | Existing | all boards | Shown as a Well at the top of the Status board, dismissible |

### 2.2 Hangar and aircraft setup
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-HANGAR-01 | Hangar: every aircraft with verdict, counts, and a life strip | Changed | W-HANGAR-01, M-HANGAR-01 | Adds the life strip (small spine) per aircraft; strip links to its map |
| C-HANGAR-02 | Demo aircraft N734DM auto-shared read-only; "Remove from my hangar" | Existing | W-HANGAR-01 | |
| C-HANGAR-03 | Enroll an aircraft with FAA registry lookup; five logbooks; seeded Part 91 items | Changed | W-HANGAR-02, M-HANGAR-02 | Seeds also ELT battery (no date), line and shop kind per item (09 §2.3) |
| C-HANGAR-04 | First-session setup: meters, last annual (type or find on a page, owner confirms), reminders, first status | Changed | W-SETUP-01, M-HANGAR-02 then M-STATUS-01 | Adds optional "About how many hours a week do you fly?"; ends in the map with dashed past (W-SETUP-02) |
| C-HANGAR-05 | Aircraft switcher | Changed | W-SWITCH-01, RailPlate, PhoneHeader | One control on every screen; keeps the current section |
| C-HANGAR-06 | Import a backup (.zip) as a new aircraft | Existing | W-HANGAR-01, W-ACCOUNT-01 | |
| C-HANGAR-07 | Records coverage per book | Changed | W-SETUP-02, W-BOOKS-01 | Replaced by the map's lines and gaps; CoverageBar kept in Pages library |

### 2.3 Status and what is due
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-STATUS-01 | Verdict sentence | Changed | W-STATUS-01, M-STATUS-01, widget | Composed by the server per situation (C-HOME-01) |
| C-STATUS-02 | Due list: one list, both limits, "first" named, hours as "about <date>" | Changed | W-STATUS-01, M-STATUS-01, T-STATUS-01 | Grouped by horizon (Overdue, Before <month>, Later); documents included |
| C-STATUS-03 | Due status rules (overdue, due soon 90 days or 10 h, VOR 5 days, needs information) | Existing | everywhere | 09 §3.2; documents use their lead (60 days) |
| C-STATUS-04 | Calendar-month rule (91.409, 91.411, 91.413, 91.207) | Existing | everywhere | |
| C-STATUS-05 | Projection of hours to dates | Changed | everywhere hours appear | 90-day rate with fallbacks (C-PLAN-01 rules) |
| C-STATUS-06 | Item detail with history, rule, meter, reminders, mark done | Changed | W-STATUS-04, M-STATUS-05 | History drawn as stops on the item's line, late renewals flagged (C-ITEM-01) |
| C-STATUS-07 | Mark done (date, meter, notes, link the entry now or later, write the entry) | Changed | W-STATUS-04 drawer, M-STATUS-06 | Creates an item completion; owner note replaced later by the page (C-REVIEW-05) |
| C-STATUS-08 | VOR check log (91.171(d): date, kind, place, bearing error, signature) writes an entry | Existing | M-STATUS-07, W-STATUS-04 | Restyled; next due 30 days |
| C-STATUS-09 | Tracked items setup: seed standard set, add custom, edit interval, meter, provider, lead | Changed | W-MAINT-06, M-STATUS-05 | Adds line, shop kind, provider, IFR only, visit window |
| C-STATUS-10 | Line ahead | New | W-STATUS-01, W-STATUS-02, M-STATUS-01, T-STATUS-01 | §3.1 |
| C-STATUS-11 | Document expiries on the due list | New | W-STATUS-01, W-DOCS-01, M-DOCS-01 | §3.9 |
| C-HOME-01 | Situation-aware home | New | W-STATUS-01, W-STATUS-02, M-STATUS-01, M-STATUS-02 | §3.6 |

### 2.4 Planning and visits
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-PLAN-01 | Plan ahead with date scrubber (replaces Forecast and Pick a date) | New | W-STATUS-03, M-STATUS-03, T-STATUS-02 | §3.2 |
| C-PLAN-02 | Suggested shop visits | New | W-STATUS-01, W-STATUS-03, M-STATUS-04 | §3.3 |
| C-PLAN-03 | Planned visits (book, send to shop, in the shop, close with pages) | New | W-STATUS-03, M-STATUS-04 | §3.3 |
| C-PLAN-04 | Service providers (shops and mechanics per aircraft) | New | W-MAINT-06, M-STATUS-04 | §3.3 |
| C-PLAN-05 | Maintenance forecast table | Changed | W-STATUS-03 | Absorbed into Plan ahead's list |

### 2.5 Maintenance: ADs, squawks, annual, records check
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-AD-01 | AD and SB register (complied, previously complied, not applicable with reason, superseded; recurring next due; proving entry) | Changed | W-MAINT-01, M-MAINT-01 | Each AD shows its own compliance stops; compliance history from item completions |
| C-AD-02 | Record AD compliance (date, hours, method, proving entry) | Existing | W-MAINT-01, M-MAINT-01 | Writes an item completion |
| C-AD-03 | Find ADs (FAA Federal Register and DRS by make, model, equipment, keyword; track one-time or with interval) | Existing | W-MAINT-02, phone screen to add | Online only; "a lead to check with your A&P" |
| C-AD-04 | Component-conditional ADs | Existing | W-AIRCRAFT-03 | |
| C-AD-05 | AD compliance report from "Other" book as ground truth ("A&P report" badge) | Existing | W-MAINT-01 | |
| C-AD-06 | Public AD lists by model (no account) | Existing | marketing | restyle only |
| C-SQ-01 | Squawks: report (any role), severity Low / Watch / Ground, resolve with clearing entry, reopen, edit, delete | Changed | W-MAINT-03, M-MAINT-02, M-MAINT-03 | Dictation on phone; squawk diamond on the spine |
| C-SQ-02 | Squawk photos | New | M-MAINT-03, M-MAINT-02, W-MAINT-03 | §3.8 |
| C-SQ-03 | Send to mechanic link | New | M-MAINT-02, W-MAINT-03 | §3.8 |
| C-SQ-04 | Squawk resolution history (who, when, which entry) | Changed | M-MAINT-02, W-MAINT-03 | Audit trail shown as a short history list |
| C-ANNUAL-01 | Annual prep: what falls due first, rides-along items, open squawks, loose ends, share with IA | Changed | W-MAINT-04, W-STATUS-02 (annual month) | Line ahead to the annual; visits that clear it; time-check findings |
| C-AUDIT-01 | Records check: gaps, duplicate scans, mis-keyed meter readings with suggested fix | Changed | W-MAINT-05 | Gaps link to the map and gain actions (C-GAP-01) |

### 2.6 Logbooks: capture, reading, review, the map, search
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-CAP-01 | Upload PDFs and images (PDF split client-side) | Existing | W-BOOKS-06 | Creates a scan batch |
| C-CAP-02 | Phone scanner (VisionKit on iOS, ML Kit document scanner on Android), choose book, "adds to the end", handwritten toggle | Changed | M-SCAN-01, M-SCAN-02 | Native scanners; "Lands in 1984" line once a date is legible |
| C-CAP-03 | Scan with your phone from the web (QR hand-off) | Changed | W-BOOKS-06 | QR opens the app's scan sheet on that aircraft and book (deep link) |
| C-CAP-04 | Quality check (blur, glare) before keeping | Existing | M-SCAN-02, W-BOOKS-06 | |
| C-CAP-05 | Crop and clean up, scan look; replaces stored scan; re-read | Existing | W-BOOKS-07, W-BOOKS-05 | |
| C-CAP-06 | Duplicate page at upload | New | M-SCAN-03, W-BOOKS-06 | §3.13 |
| C-READ-01 | AI extraction with per-field confidence, rotated stickers, missed-entry add | Existing | W-BOOKS-07, M-REVIEW-01 | |
| C-READ-02 | Reading in the background with completion notice | New | W-BOOKS-06, M-SCAN-03, M-SCAN-04 | §3.11 |
| C-READ-03 | "Other" book documents applied (W&B revision, AD report) | Existing | W-BOOKS-07 | |
| C-REVIEW-01 | Review desk: scan beside fields, ink highlight, least-certain first, accept / edit / not on this page, confirm page and next, keyboard and swipe | Changed | W-BOOKS-07, M-REVIEW-01..03, T-REVIEW-01 | One desk on every platform; doubtful fields explained with neighbours |
| C-REVIEW-02 | Review all, "Confirm N clean" | Existing | W-BOOKS-08 | Clean = overall ≥ 0.75, no field < 0.75, no plausibility flag, not a fragment |
| C-REVIEW-03 | Merge page-spanning entry | Existing | W-BOOKS-07, M-REVIEW-01 | |
| C-REVIEW-04 | Attach Vault documents to an entry | Existing | W-BOOKS-07, W-BOOKS-10 | |
| C-REVIEW-05 | Page replaces an owner's note as source | New | W-BOOKS-07, M-REVIEW-01 | §3.14 |
| C-BOOKS-01 | Pages library: by book and volume, states, sort, reorder, select many, delete with entries named | Existing | W-BOOKS-05, M-BOOKS-06 | |
| C-BOOKS-02 | Route map with stops, interchanges, gaps, eras | New | W-BOOKS-01..04, M-BOOKS-01..05, T-BOOKS-01 | §3.5 |
| C-BOOKS-03 | The spine | New | every board | §3.4 |
| C-BOOKS-04 | Entry detail: words as written, meters, trust, what it satisfied, attachments, corrections, previous/next stop on this line | Changed | W-BOOKS-10, M-BOOKS-07 | Adds stop stepping and "what it satisfied" from item completions |
| C-BOOKS-05 | List view of entries (filter by book, search) | Changed | W-BOOKS-12 | B's timeline as a list; the map is the default |
| C-BOOKS-06 | First read | New | W-BOOKS-09 | §3.7 |
| C-BOOKS-07 | Write and sign a logbook entry (four templates, email code, locked, correcting entry), print sticker, rescan links | Changed | W-BOOKS-11, phone screen to add | Can close a squawk; draft saved on device |
| C-GAP-01 | Gap actions: scan, "no pages exist", "asked the previous owner" | New | W-BOOKS-04, M-BOOKS-04, W-MAINT-05 | §3.10 |
| C-ASK-01 | Search and Ask in one field; cited answer with page crops; matching stops lit on the map | Changed | W-ASK-01, M-ASK-01 | Ask online only; search works offline on phone over the local mirror |

### 2.7 The aircraft
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-HOURS-01 | Meters (tach, hobbs, airframe), as-of and source, meter replacement stitching | Existing | W-AIRCRAFT-01, M-AIRCRAFT-01 | |
| C-HOURS-02 | Log a flight (steppers, delta, oil added, one save, warn on lower value) | Changed | M-FLIGHT-01, M-FLIGHT-03, M-FLIGHT-04 | Saved screen lists what moved and the line ahead redraw |
| C-HOURS-03 | Photograph the tach | New | M-FLIGHT-02 | §3.12 |
| C-HOURS-04 | ADS-B suggested hours | Existing | W-AIRCRAFT-01, M-AIRCRAFT-01 | Restyled; "Airborne time, not tach time" |
| C-HOURS-05 | MyFlightBook hours | Changed | W-ACCOUNT-02, W-AIRCRAFT-01 | One connection card with five states (docs-digest backlog); readings show source |
| C-HOURS-06 | Written versus calculated time check | New | W-AIRCRAFT-01, W-BOOKS-02, W-MAINT-04 | §3.15 |
| C-OIL-01 | Add oil (top-off) | Existing | M-FLIGHT-01 add sheet, W-AIRCRAFT-02 | |
| C-OIL-02 | Burn rate chart, oil analysis import and trends | Existing | W-AIRCRAFT-02 | |
| C-EQUIP-01 | Installed equipment with AI proposals to confirm or reject | Existing | W-AIRCRAFT-03 | |
| C-WB-01 | Weight and balance revisions, stale notice | Existing | W-AIRCRAFT-04 | |
| C-DETAILS-01 | Aircraft details, registry check | Existing | W-AIRCRAFT-05 | |
| C-DETAILS-02 | Transfer ownership (revokes record rooms and mechanic links) | Changed | W-AIRCRAFT-05 | Option to keep viewer access; also revokes mechanic links |
| C-DETAILS-03 | Delete aircraft (type the tail number) | Existing | W-AIRCRAFT-05 | Offers a backup download first |

### 2.8 Documents
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-DOCS-01 | Records Vault (typed documents, ≤ 25 MB, search) | Changed | W-DOCS-01, M-DOCS-01 | Adds insurance type and expiry tracking |
| C-DOCS-02 | Carry-aboard card (AROW), offline | Existing | M-DOCS-01, W-DOCS-01 | |

### 2.9 Sharing and hand-offs
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-SHARE-01 | People with an account: invite as viewer or editor, remove, leave | Existing | W-SHARE-01, M-SHARE-01 | |
| C-SHARE-02 | Share hub starts from the audience (IA, buyer, insurer, co-owner or mechanic) | Changed | W-SHARE-01, M-SHARE-01 | Presets set contents, expiry and map window |
| C-SHARE-03 | Record room links (no account, read-only, confirmed only, expiry, revoke, opens) | Changed | W-SHARE-01, W-SHARE-02, M-SHARE-02 | Map cover, audience, QR, view log by session (§3.16) |
| C-SHARE-04 | Pre-buy dossier (print, light paper, footnotes) | Changed | W-SHARE-03 | Page 1 is the life map with footnoted gaps and overhauls |
| C-SHARE-05 | Maintenance summary (print) and full records report | Existing | W-SHARE-04 | |
| C-SHARE-06 | Share summary text snapshot (phone share sheet) | Existing | M-SHARE-01 | |

### 2.10 Notifications and glanceable surfaces
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-NOTIFY-01 | Reminders that carry the whole answer (email and push) | New | M-SYS-03, email | §3.17 |
| C-NOTIFY-02 | In-app notification inbox | New | RailFoot Account menu, M-SYS-02 | §3.17 |
| C-NOTIFY-03 | Widgets (home and lock screen) | New | M-SYS-03 | §3.18 |
| C-NOTIFY-04 | Onboarding emails, backup failure email, invitation email, signing-code email | Existing | email | |

### 2.11 Data, integrations, offline
| ID | Capability | Status | Screens | Notes |
|---|---|---|---|---|
| C-DATA-01 | CSV import with AI column mapping, dates never guessed, lands unconfirmed | Existing | W-ACCOUNT-01 | |
| C-DATA-02 | Export: .zip with README, CSVs (entries, ADs, equipment, due list), printouts | Changed | W-ACCOUNT-01 | Due list CSV from the snapshot; new files in the zip (09 §6) |
| C-DATA-03 | Scheduled backups to Dropbox and Google Drive, last-run status | Existing | W-ACCOUNT-01, M-SYS-02 (request a run) | |
| C-DATA-04 | OAuth 2.1 API, developer portal, connected apps | Existing | W-ACCOUNT-02, developer portal | restyle only |
| C-SYNC-01 | Offline mirror, outbox, waiting to upload, conflicts yours/theirs | Changed | M-SYS-01, M-STATUS-02 | Native SQLite; header sync state; conflicts block only their row |
| C-SYNC-02 | Offline cache of scans (Download all, 1 GB default cap, owner adjustable, documents never purged) | Existing | M-SYS-02 | |
| C-TRUST-01 | Trust levels shown everywhere | New | everywhere | §3.19 |
| C-ADMIN-01 | Admin, growth funnel, storage check | Existing | admin | restyle only |

---

## 3. New capabilities in detail

### 3.1 C-STATUS-10 Line ahead
**User value:** the owner sees when each due item falls, on the book it belongs to, and which items could share one trip, without reading a table.

**Rules**
- Content: one ring per due item whose "first" date falls in the horizon (09 §3.4): Status 12 months; annual-month situation and widget 60 days; in-shop situation 60 days; Plan ahead 24 months; annual prep from today to the annual + 14 days.
- Position: on the item's book line (`maintenance_item.line`; ADs by their proving entry's book; documents are not drawn on a line). Date = calendar due date, or the projected date when hours come first (drawn as a projected ring, per 10-line-map.md).
- Overdue items are drawn at today as `ring bad`; due soon `ring soon`; current `ring`; items without a date are not drawn and are listed under the line as "Not on the line: Insurance policy, no date on file".
- Suggested visits are drawn as `cap plan` labelled "Suggested"; planned as `cap plan` labelled "Planned".
- Selecting a ring selects its due row and puts the last-done page on the right leaf (web, tablet) or opens M-STATUS-05 (phone).
- The line ahead uses only confirmed data. When unconfirmed pages might change it, a quiet line under it reads "6 pages waiting for review could change this."

**Edge cases:** two rings on the same book within 3 days are drawn as one ring with a count ("2"); an item whose projection basis is `owner_estimate` is drawn with the projected style and its row says "from your estimate"; no tracked items at all: the line ahead is replaced by EmptyState "Nothing is tracked yet. Add the annual date to start."

**Settings:** none (horizons fixed).

**Acceptance criteria**
- [ ] For N734DM on Nov 18, 2026 the Status line ahead shows rings for VOR (at today, overdue), oil (about Dec 12, engine), transponder and pitot-static (Dec 31, avionics), ELT battery (Feb 28), seat-rail AD (about Mar 2027 at 3 h a week, airframe; the mockups say Apr), annual and ELT inspection (Jul 31, 2027), and one suggested visit, week of Dec 7.
- [ ] Logging a flight that moves the oil change updates the ring before the save is synced (phone, "On this phone").
- [ ] Marking an unconfirmed entry as confirmed that completes an item moves its ring within 5 seconds of sync (snapshot recompute).
- [ ] No ring is ever derived from an `ai_read` entry.

### 3.2 C-PLAN-01 Plan ahead with date scrubber
**User value:** "If I fly 3 hours a week, what will have lapsed by March 1, and which trips fix it?" answered in one place, replacing Forecast and Pick a date.

**Rules**
- Range: today to today + 24 months; the first 6 months at double scale.
- Date scrubber: a draggable marker on the line ahead plus a date field. Default date: today + 90 days (rounded to the 1st of the following month); the last chosen date is remembered per aircraft on the device. Step: 1 day by drag; arrow keys ±1 day, Page Up/Down ±1 month (web).
- Hours per week: defaults to the rate in use (09 §3.3), rounded to 0.5 h; editable 0 to 60 in 0.5 h steps; the edited value applies to this screen only and is not saved. A link "Use as my usual flying" saves it to `aircraft.expected_hours_per_week` (owner and editor).
- Calculation (09 §3.3, 4.4): `hours_until = hours_per_week / 7 × days_until`; `meter_on_date = current + hours_until`. An item is **Lapsed** (already overdue today), **Lapses** (calendar due date before the chosen date, or hours due ≤ meter on the date), or **Still in date** (with spare days or hours). Items with no date are "cannot be checked" with the reason.
- The list beside the scrubber names, for each lapsing item, the suggested or planned visit that covers it ("Dec 7 visit").
- The verdict for the chosen date: "By Mar 1, five items will have lapsed unless they are done first." (count, plural rules in 12-copy-and-voice.md).
- Calendar items never get an hours-based date and vice versa; an item with both limits lapses on whichever comes first by the chosen date.

**Edge cases:** chosen date today → shows today's state; hours per week 0 → only calendar items can lapse, hours items show "no flying, never reached"; meter replacement in the future is not modelled; the rate basis `none` and no estimate → hours items are listed "cannot be checked: no recent flying" until the owner types hours per week.

**Settings:** `expected_hours_per_week` (aircraft).

**Acceptance criteria**
- [ ] Mar 1, 2027 at 3 h a week shows: about 44 hours, tach about 4256; Lapsed: VOR; Lapses: oil, transponder, pitot-static, ELT battery; Still in date: seat-rail AD (about 12 h spare), annual and ELT inspection (152 days); cannot be checked: insurance.
- [ ] Dragging the marker updates the list within 50 ms on a mid-range phone (local computation, no network).
- [ ] Works offline on the phone from the last snapshot plus local changes.
- [ ] Screen-reader users can set the date with the date field and hear the count of lapsing items.

### 3.3 C-PLAN-02, C-PLAN-03, C-PLAN-04 Suggested and planned visits, service providers
**User value:** one shop trip instead of three; the app names what rides along and what doing it early costs.

**Suggestion rules** (full algorithm 09 §3.5):
- Candidates: confirmed due items due within the horizon, not advisory overhauls, not documents, not already in a visit; open Watch and Ground squawks ride along.
- Same place: items share a visit only if their providers are at the same airport (provider airport, else home base). Different kinds of shop at one field may share; self items (VOR check) join any visit.
- Window: an item rides along when it is due within **60 days** of the earliest item, or has **≤ 25 hours** left at the visit; per-item override (0 to 180 days, 0 to 200 h).
- Visit week: the latest Monday whose Friday is before the earliest due date, not before next Monday; overdue shop items pull it to the next Monday ≥ 2 days away.
- Shown only with ≥ 2 items. Status shows 2 visits within 12 months; Plan ahead up to 6 within 24 months.
- Each item shows its early cost: "about 12 h early", "13 days before it expires".
- Dismissing a suggestion hides that exact set and week; it may return when items change.

**Planned visit rules:**
- "Book this visit" creates a planned visit (week, items, provider) offline-capable. The ring row shows "In the Dec 7 visit".
- Reminders follow the visit: one reminder 7 days before the week; item lead reminders are suppressed while the visit is before their due date.
- **At risk:** when a recompute (for example after a flight) makes an item due before the visit's Monday, the owner sees "The oil change now falls two days before the Dec 7 visit." with "Move the visit to the week of Nov 30" (web and phone) and gets one `visit_risk` reminder.
- "It's in the shop" sets status in_shop (home situation in_shop). After the week ends the visit becomes "awaiting records": the home shows "Did the Dec 7 visit happen? Mark what was done and add its pages." Each item can be marked done with its page; "Close this visit" ends it; items not done return to suggestions.
- "Send to AeroCheck": makes a mechanic link (kind visit, 30 days) and opens the owner's mail app or share sheet prefilled with the list and link; MyTailLog never sends it.

**Providers:** name, kind (mechanic, avionics shop, prop shop, engine shop), certificate number, airport, email, phone, default per kind. Proposed from confirmed entries when a signer and certificate appear on ≥ 2 confirmed entries; never auto-created.

**Edge cases:** a provider deleted → items fall back to the kind's default or home base; an item in a cancelled visit returns to suggestions; two co-owners book overlapping visits offline → the second `visit.create` that includes an item already in a visit fails with "This item is already in the visit for the week of Dec 7." and the outbox shows it with "Remove from this phone".

**Settings:** per-item visit window; default provider per kind; visit reminder lead (7 days).

**Acceptance criteria**
- [ ] N734DM Nov 18, 2026: suggestion 1 week of Dec 7 with oil (M. Torres), transponder and pitot-static (AeroCheck Instruments), VOR (log it yourself); suggestion 2 with ELT battery and the seat-rail AD.
- [ ] Booking works offline and survives an app restart; it syncs as `visit.create`.
- [ ] After logging 2.4 h, the oil projection moves to about Dec 5 and the at-risk notice offers the week of Nov 30.
- [ ] A suggestion with one item is never shown.
- [ ] Viewer sees suggestions and planned visits but no Book, Send or Move controls.

### 3.4 C-BOOKS-03 The spine
**User value:** every screen shows where in the aircraft's life the owner is looking.

**Rules**
- One strip under every BoardHead on web and tablet (not on the phone except M-REVIEW-01 and M-BOOKS-05 mini strips, per 06-mobile-screens.md).
- Range: the aircraft's year (or first entry, if earlier) to today + 12 months, with a scale break 12 months before today so the recent year and the year ahead get 30 % of the width (drawing in 10-line-map.md §Scales).
- Lines: the four books as thin lines; gaps dashed; stops as dots only at the decade zoom; today marked; open squawks as filled diamonds, resolved as hollow; planned visits as small caps.
- Bracket (`win`): what the current screen covers. Status: today to the line-ahead horizon. Item detail: the item's history range. Entry detail: that one stop. Map: the visible range. Review: the page's landing date. Plan ahead: today to the chosen date.
- Interaction: click a point → opens Logbooks › Map centred there; drag across → zooms the map to that range (W-BOOKS-03). Keyboard: the spine is one focusable control; Left/Right move a cursor by one year, Enter opens the map there.

**Edge cases:** an aircraft with no confirmed entries draws the past as one dashed span "no pages yet"; aircraft older than 1940 still fits (scale compresses the past).

**Acceptance criteria**
- [ ] Present on every web board (W-STATUS-*, W-MAINT-*, W-BOOKS-*, W-AIRCRAFT-*, W-DOCS-01, W-SHARE-01) with the correct bracket.
- [ ] Never shows `ai_read` stops as solid.
- [ ] Opening the map from the spine preserves the aircraft and lands on the clicked year.

### 3.5 C-BOOKS-02 Route map with stops, interchanges, gaps
**User value:** fifty years of logbooks become a picture: when work happened, which visits signed several books, where pages are missing, and how long since an overhaul.

**Rules** (grouping 09 §3.7):
- One horizontal line per book on the web and tablet (fixed order airframe, engine, propeller, avionics; Other is not a line); one vertical column per book on the phone, newest at the top.
- Stop = one book and one date. Interchange = stops on ≥ 2 books on the same date sharing a certificate number or tach within 0.5 h.
- Trust on the map: every stop has a leaf fill and ink stroke; `ai_read` stops have a dotted stroke; signed stops look like confirmed ones, with the signed mark in its sheet (the map does not draw diamonds on stops).
- Gaps: open and "asked previous owner" dashed; "no pages exist" drawn as a thin solid stretch with that label; dismissed and filled not drawn.
- Eras: time since the latest engine and prop overhaul shaded on their lines, labelled "1409.4 h since overhaul".
- Selecting a stop: web/tablet right leaf shows its page (ScanViewer, ink highlight on the entry); phone opens M-BOOKS-02 sheet. Selecting an interchange: right leaf with one tab per book (web); swipeable cards (phone M-BOOKS-03). Selecting a gap: W-BOOKS-04 / M-BOOKS-04.
- Filters: All books or one book (W-BOOKS-02, M-BOOKS-05); zoom by dragging on the spine or pinch (phone), with dates labelled on every stop when the visible range is ≤ 12 years.
- Line ahead continues dotted to the right of today with rings.

**Edge cases:** entries without a date are listed under the map ("3 entries without a date, Review"); a page whose entries span two dates produces two stops; more than 200 stops in view are aggregated to one marker per book per month with a count until zoomed; an aircraft with only the Other book shows EmptyState "Add pages to a logbook to see the map."

**Acceptance criteria**
- [ ] N734DM map shows the Feb 1983 to Mar 1991 airframe gap dashed, the 2005 engine overhaul era, and the Jul 14, 2026 annual as an interchange of airframe, engine and propeller.
- [ ] Phone and web produce identical stop and interchange sets for the fixture `map-grouping.json`.
- [ ] Map renders 2,000 entries in under 300 ms on a mid-range phone.
- [ ] Every stop and interchange is reachable by keyboard (web) and by VoiceOver/TalkBack as a list in date order ("Annual, Jul 14, 2026, three books, signed").

### 3.6 C-HOME-01 Situation-aware home
**User value:** the home answers the question the owner has right now: setting up, nothing due, something coming up, annual month, in the shop, or selling.

**Rules** (09 §3.6): precedence setup, in_shop, preparing_sale, annual_month (annual due ≤ 60 days and not overdue), attention (anything overdue or due soon), all_clear.

| Situation | Verdict example | What changes |
|---|---|---|
| setup | "Your annual is current until Jul 31, 2027. Three inspections need a last date before they can be counted." | W-SETUP-02: map with dashed past, "Next, scan the airframe logbook" |
| attention | "One check has lapsed, and it only matters for IFR. Three more come due before the new year, and two of them fit one visit." | Standard home |
| annual_month | "The annual is due this month, by Jul 31. Four items can ride along with it in one visit on Jul 14." | Line ahead 60 days; "Getting ready for the annual" leaf with open squawks, gap note, AD rides along, Share with your IA |
| in_shop | "N734DM is in the shop for the week of Dec 7. Four items are in this visit." | Visit checklist first; mark done with pages as they come back |
| preparing_sale | "The records are ready to share with a buyer. 6 pages are waiting for review and one gap is unexplained." | Sale checklist: unconfirmed pages, gaps without status, dossier, record room links and opens |
| all_clear | "Nothing tracked is due in the next 90 days. Next is the annual, by Jul 31, 2027." | Line ahead and quiet suggestions (scan the next book) |

- The owner can set "I'm selling N734DM" and "It's in the shop" from the home's More menu; each has "Not any more".
- Overdue items are always listed first, whatever the situation.

**Acceptance criteria**
- [ ] Each situation renders from the fixture snapshots `snapshot-situation-*.json` with the right verdict and section order on web and phone.
- [ ] A live buyer record room switches to preparing_sale within one snapshot recompute; revoking it switches back.
- [ ] Viewers see the situation but not the override controls.

### 3.7 C-BOOKS-06 First read
**User value:** after the first logbook is in, the owner gets a short account of what the book revealed, each point linked to a page, and what to do next.

**Rules**
- Becomes available for a logbook when it has ≥ 10 pages, every page is extracted, and no page is unreviewed. Shown automatically (W-BOOKS-09, with a notification "What the airframe logbook told us is ready") for the first logbook of the aircraft to qualify; for later books it is reachable from the map's book menu ("What this book told us").
- Findings (at most 5, in this order): gaps (09 §3.8), untracked ADs referenced in the book, recurring repairs (the same component or system repaired ≥ 2 times within 10 years), big changes (equipment installed or removed with an STC or Form 337; engine or prop removed, overhauled or replaced), breaks in the annual chain. Each finding carries 1 to 3 PageCites.
- Recurring repairs are grouped by one AI call over the confirmed entries' text (counts toward the allowance, 1 call); all other findings are rule-based. If the allowance is spent or the device is offline, the page shows the rule-based findings and "Recurring repairs will be added when reading resumes."
- Built only from confirmed entries; footer: "Built only from entries you confirmed. A summary of the index, not of the aircraft; the logbooks remain the record."
- "Next" block: the book that would add most (engine if the airframe mentions an overhaul and the engine book has no pages, else the book with fewest pages), plus actions: scan the gap pages, show a repair history to the mechanic (Squawks), ask the book a question.

**Acceptance criteria**
- [ ] With the demo airframe book confirmed, first read lists the 1983 to 1991 gap, left brake relined 2016, 2018, 2021, vacuum pump replaced 2009 and 2021, GTN 650 replacing the KX-155, the 2005 engine removal; each with its page.
- [ ] No finding cites an `ai_read` entry.
- [ ] First read is generated once per qualifying book and refreshed when more pages of that book are confirmed (the notification fires once).

### 3.8 C-SQ-02, C-SQ-03 Squawk photos and send to mechanic
**User value:** show the mechanic what is wrong without a phone call, and keep the photo with the record.

**Photo rules**
- New squawk on the phone opens the camera first (M-MAINT-03 "Photograph it first. You can skip this."); up to 6 photos per squawk; JPEG long edge ≤ 2048 px, ≤ 6 MB; EXIF location stripped; taken time kept.
- Anyone with access (viewer included) can add photos to squawks they reported; owner and editors to any squawk. Photos are saved on the device and upload on the next sync.
- Words: typed or dictated (platform speech recognition, on-device where available); severity Low ("Fix at the next convenient visit"), Watch ("Look at it before each flight"), Ground ("You won't fly until it is looked at"). Ground is the owner's choice, not an app verdict.

**Mechanic link rules**
- "Send to mechanic" (owner, editor; online only): pick recipient (provider list or a name), expiry 7, 30 (default) or 90 days, include photos (on), include who reported (off). Creates a link `https://mytaillog.com/m/<token>`; opens the share sheet (phone) or a dialog with Copy and "Open in mail" (web).
- The recipient page (no account, read-only): tail, make and model, squawk words in the app's voice, severity label, date reported, photos, and if the owner ticked "Related entries", confirmed entries linked to the squawk with page crops. No other records, no owner email.
- Opens are logged; the squawk detail shows "Sent to M. Torres Nov 18 · opened twice". Revoke from the squawk detail or the Share hub.
- Transferring the aircraft revokes all mechanic links.

**Edge cases:** squawk resolved while a link is live → the link page shows "Resolved Nov 30" with the clearing entry's date (not its text unless related entries were included); squawk deleted → link shows "This squawk was removed by the owner."; photo upload fails → the squawk saves without it and M-SYS-01 lists the photo with "Try again".

**Acceptance criteria**
- [ ] A viewer can report a squawk with 2 photos offline; both appear on the web after sync with the viewer's name.
- [ ] The mechanic page loads without cookies or sign-in, shows the photos, and returns 410 after revoke or expiry.
- [ ] Creating a link offline shows "Making a link needs a connection." and keeps the squawk.

### 3.9 C-STATUS-11 Document expiries on the due list
**User value:** registration and insurance lapse quietly; now they sit on the same list as the annual.

**Rules**
- Any Vault document can be tracked ("Track expiry" toggle on the document); defaults on for registration and insurance when they are added.
- Due item `doc:<id>`: due on `expires_on`; due soon within the document lead (default 60 days, per-document override 0 to 365); overdue the day after. No date → "No date on file" with status no record and action "Add the expiry date".
- Renewal: "Renewed" asks for the new expiry date (suggested: old expiry + `renews_every_months`, registration 84, insurance 12, radio licence 120) and optionally the new document file; the old file stays in the Vault, marked "Superseded".
- Documents are listed in the due list's own group "Documents" after the maintenance groups; they are not drawn on book lines and never join visits.
- Reminders use the `document` category.

**Acceptance criteria**
- [ ] N734DM shows Registration Mar 31, 2029 current and Insurance policy "No date on file", needs information.
- [ ] Renewing registration offers Mar 31, 2036 and keeps the old certificate as superseded.
- [ ] Document expiries appear in the record room summary only for documents the owner included.

### 3.10 C-GAP-01 Gap actions
**User value:** a gap in the records is explained, worked on, or recorded as a fact, instead of an alarm that never goes away.

**Rules** (detection and evidence 09 §3.8)
- Gap view shows: the span, what the other books show (entries, annuals, tach range, page range), the last page before and the first after, and unconfirmed pages already inside it.
- Actions:
  - **Scan the missing pages** → scan flow preselects the book (M-SCAN-01) or Add pages (W-BOOKS-06) with "Lands in 1983 to 1991".
  - **Mark "no pages exist"** → asks for an optional note ("Previous owner's logbook lost in 1991, per new log opened Mar 14, 1991"); gap drawn as "no pages exist"; Records check no longer counts it as an open finding; the record room and dossier say "The owner records that no airframe pages exist for Feb 1983 to Mar 1991."
  - **Note: asked the previous owner** → note with date; gap stays dashed with the label "asked previous owner, Nov 18"; reminder none.
  - **Not a gap** (quiet, in a menu) → dismissed; hidden from map and Records check; reversible in Records check › Dismissed.
- All statuses can be changed back to Open. Changes are owner or editor; viewers see the gap and its status.
- When confirmed pages fill the span (no remaining stretch > 24 months), the gap becomes Filled automatically and the map shows the solid line.

**Acceptance criteria**
- [ ] Marking the 1983 to 1991 gap "no pages exist" updates the map, Records check, annual prep and the record room text after sync.
- [ ] Confirming entries that split the gap below 24 months marks it filled within one recompute.
- [ ] Owner statuses survive re-detection when the span shifts.

### 3.11 C-READ-02 Reading in the background with completion notice
**User value:** scan 30 pages at the hangar, put the phone away, and be told when they are ready to review.

**Rules** (09 §3.9.1)
- Every upload belongs to a scan batch (one camera session, one upload drop, one PDF). Reading runs on the server; the phone and browser can close.
- Queue states per page: on this phone (not uploaded), uploading, waiting to be read, being read, waiting for tomorrow's allowance (with the time it frees: "about 9:14 tomorrow"), read, needs a look, could not read.
- Completion notice: one per batch when every page is read or failed: push and in-app by default, email opt-in: "6 pages are read. 2 need a look." with actions Review and Later. Body names the book, pages and date range ("Airframe p. 14 to 19, from 1984 to 1988").
- Pages appear on the map as hollow stops as soon as they are read.
- Failed pages: "Could not read page 17. Retake it or try again." with Retry (re-queues, uses allowance) and Retake.

**Edge cases:** allowance runs out mid-batch → the notice waits until the batch completes; meanwhile the queue shows "4 of 6 read. 2 wait for tomorrow's allowance, about 9:14."; own key rejected → pages fail with "Your API key was rejected. Check it in Settings." and never fall back to the shared key; global budget spent → "Reading is paused for everyone until tomorrow."

**Acceptance criteria**
- [ ] Closing the app after upload still produces the notification when reading completes.
- [ ] Exactly one notification per batch.
- [ ] Queue counts on web and phone match `GET /reading-queue` within 5 seconds.

### 3.12 C-HOURS-03 Photograph the tach
**User value:** after a flight, one photo instead of typing a number with cold hands; the owner reviews, never retypes.

**Rules**
- Entry: Add (M-FLIGHT-01) › Log a flight opens the camera (M-FLIGHT-02) framed for the hour meter, with "Type it" as an equal alternative.
- Reading is on the device (Apple Vision text recognition, ML Kit text recognition), offline, and does not use the AI allowance.
- Candidate selection: numbers matching up to 5 digits with an optional tenths digit; if the tenths digit is missing and the integer has one more digit than the last reading's integer part, the last digit is taken as tenths. Choose the candidate ≥ last reading and ≤ last reading + 24 h; if several, the closest to the last reading. Confidence: high when one candidate qualifies with recognition confidence ≥ 0.8.
- Result: the confirm screen (M-FLIGHT-03) shows "Read from your photo. Check it against the meter." with the value in a stepper, the delta ("+2.4 hours this flight"), hobbs next (photo or type, or "Not this time"), oil added presets (None, 1 qt, 2 qt, Other), date (today, changeable). One Save.
- No candidate in range: "Couldn't read a number between 4212.4 and 4236.4. Type it." with the keypad open. Candidate more than 24 h above the last: shown with the warning "That's 31.0 hours since Nov 14. Check it." Lower than the last: "Lower than the last reading (4212.4). Is this a new meter?" with "Record a meter replacement".
- Saved reading: source `tach_photo`, the read value, candidates and whether the owner changed it; the photo kept if "Keep meter photos" is on.
- After save (M-FLIGHT-04): what moved (items whose hours remaining changed, with was/now), the line ahead redrawn, the visit at-risk notice if any, Undo for 10 seconds (deletes the reading and oil addition from the outbox if unsynced, else queues deletes).

**Acceptance criteria**
- [ ] Offline, a photo of 4214.8 after 4212.4 pre-fills 4214.8 and saves to the outbox with source `tach_photo`.
- [ ] VoiceOver and TalkBack announce the read value and the delta; "Type it" is reachable without the camera.
- [ ] The photo is never uploaded when "Keep meter photos" is off.

### 3.13 C-CAP-06 Duplicate page at upload
**Rules** (09 §3.9.3): perceptual hash on the device or browser; Hamming distance ≤ 6 to any page of the same aircraft → the queue row shows "This looks like Engine p. 22, scanned Sep 20." with "Keep both" and "Skip this one" and the two thumbnails. The page is not read (no allowance spent) until the owner chooses. Undecided after 7 days → stays waiting; the queue keeps it.

**Acceptance criteria**
- [ ] Photographing the same page twice in one session flags the second shot before upload; skipping it deletes it from the phone.
- [ ] A rescan after "Crop and clean up" of the same page is not flagged (the original is replaced, not duplicated).

### 3.14 C-REVIEW-05 Page replaces an owner's note
**Rules:** when the owner confirms an extracted entry that matches an owner note (same book, date within 3 days, same item kind, meter within 0.5 h), the review desk shows "This page records the oil change you noted on Nov 18." with "Use this page as the source" (default) and "Keep both". Using the page sets the note's `replaced_by_entry_id`, moves the item completion to the page entry, and the trust becomes the page's (confirmed or signed). The note stays visible in the entry's history ("Replaced by Engine p. 39").

**Acceptance criteria**
- [ ] After replacement, the item's last done cites Engine p. 39 and shows "signed by M. Torres" when the page has a signature and certificate.
- [ ] Hours and status do not double-count.

### 3.15 C-HOURS-06 Written versus calculated time check
**User value:** catch a mistyped "time since overhaul" before an IA or buyer does.

**Rules** (09 §3.10): calculated = tach at the entry minus tach at the overhaul; agree within 1.0 h; else "<n> h apart" with a digit-swap hint when two adjacent digits are swapped. Actions: "Add to annual prep" (adds a loose end to W-MAINT-04) and "They agree, dismiss". Copy always ends: "Mention it to your IA; only a new entry can correct the book."

**Edge cases:** no overhaul anchor → "Add the engine overhaul date and tach to compare"; meter replacement between anchor and entry → stitched; entry without a tach → not checked.

**Acceptance criteria**
- [ ] Demo: engine 1365.3 written and calculated agree; propeller 936.5 written, 963.5 calculated, 27.0 h apart, digit-swap hint shown, citing Propeller p. 12.
- [ ] A dismissed check reappears only if either value changes.

### 3.16 C-SHARE-03 Record room QR and view log (changes to an existing capability, specified fully)
**Rules**
- Creation (owner only, online): audience preset sets contents, expiry and map window:

| Audience | Contents | Expiry | Opens on |
|---|---|---|---|
| My IA, for the annual | annual checklist, summary, all 5 logbooks with scans, open squawks | until the annual's due date + 14 days (max 180 days) | line ahead to the annual |
| A buyer, for a pre-buy | pre-buy dossier, summary, all logbooks (confirmed), documents chosen, scans off unless added | 30 days | whole life |
| My insurer | summary, registration, airworthiness, W&B | 14 days (7/30/90/180 allowed) | last 5 years |
| Something else | owner's choice | 30 days | whole life |

- QR: generated on the client from the URL; shown on the link screen (M-SHARE-02, W-SHARE-01) at ≥ 160 px with the URL beneath; "Show QR full screen" for showing in person.
- View log: an "open" is one browser within 30 minutes; the hub lists opens with time and what was viewed ("Nov 17, 7:42 pm · pre-buy dossier, Engine logbook"); total opens and last opened on each link.
- Recipient view (W-SHARE-02): no rail, light binder, map tab first, then the owner's tabs; as-of sentence; plain statement of gaps including owner gap statuses; confirmed entries only; read-only.
- Extend by 30 days (max 180 from creation), revoke any time; transfer revokes all.

**Acceptance criteria**
- [ ] The QR scanned by a phone opens the room without sign-in.
- [ ] Opens counted by session; legacy rows count one each.
- [ ] An editor sees live links but cannot create, extend or revoke (owner only).

### 3.17 C-NOTIFY-01, C-NOTIFY-02 Reminders that carry the whole answer; inbox
**User value:** the notification itself says what is due, when, by which limit, who did it last and on which page, and what one trip would cover, so the owner rarely needs to open the app.

**Rules** (09 §3.11)
- Kinds: lead (at the category lead), lapse (the day it becomes overdue), weekly while lapsed (max 8), visit (7 days before), visit at risk, document, reading done, gap (none by default).
- Content: item label, first limit with date or hours and projection, the other limit, last done provider and page, the covering visit. Several items for one aircraft in one day → one notification listing up to 3 and "and 2 more".
- Actions on push: "Plan the visit" (opens M-STATUS-04), "Remind me Friday" (snooze to the coming Friday 09:00 local), "Review" (reading done).
- One push and one email digest per user per day; quiet hours (default 21:00 to 07:00 local) delay pushes.
- In-app inbox: every notification also lands in the inbox (Account menu on web, Settings › Notifications on phone) for 90 days, with read state across devices.
- Lead defaults: annual 90 days; oil 10 h; ADs 30 days or 25 h; documents 60 days; everything else 30 days or 25 h; per-item override.

**Acceptance criteria**
- [ ] The Nov 18 push for N734DM reads as in 09 §3.11 and opens the suggested visit.
- [ ] No item is notified twice in one due cycle except lapse and weekly.
- [ ] Reminders never cite unconfirmed entries.

### 3.18 C-NOTIFY-03 Widgets
**User value:** the line ahead on the lock screen.

**Rules**
- iOS WidgetKit: lock screen `accessoryRectangular` (verdict short + alarm line), home `systemSmall` (verdict short, next item), `systemMedium` (60-day line ahead strip on a white leaf, next visit). Android Glance: 2×2 and 4×2 equivalents.
- One aircraft per widget instance (configurable; default the last opened).
- Data from the shared container written by the app after every sync and local recompute; background refresh from `GET /widget` at most every 4 hours when the container is older than 4 hours (09 §4.10). Shows "as of {time or day}" when older than 24 hours (14-decisions.md D15).
- Tapping opens Status (deep link). Viewer role widgets work the same.
- Signed out or no aircraft: "Open MyTailLog to choose an aircraft."

**Acceptance criteria**
- [ ] Widget content matches the Status verdict and rings for the same snapshot.
- [ ] Works with no network using the last container data.
- [ ] Text in the widget is ≥ 13 pt and status is never colour alone.

### 3.19 C-TRUST-01 Trust levels shown everywhere
**Rules**
- Levels (09 §2.1): read by AI (dotted mark, "Read by AI, not yet confirmed"), confirmed by you (filled dot), signed (diamond, "Signed by M. Torres, A&P 3667012" or "Signed by you in MyTailLog").
- Shown on: entry rows and details, review fields' page header, due rows' last-done line, item history stops (sheet), map sheets, Ask citations, record room and dossier footnotes (only confirmed and signed appear there), widgets (none: they show only confirmed data), exports (column `trust` in entries CSV and JSON).
- Owner-entered values show "you, <date>" as their source with the confirmed mark.

**Acceptance criteria**
- [ ] Every PageCite shows the TrustMark of the entry it cites.
- [ ] Entries CSV has a `trust` column with `ai_read`, `confirmed`, `signed`.

### 3.20 C-ITEM-01 Item history as stops (part of C-STATUS-06)
**Rules:** item detail draws every completion (09 §2.2) as a stop on the item's line, intervals labelled between stops ("24 mo", "27 mo"), and flags an interval longer than the rule (calendar items: the next completion after the calendar-month due date; hours items: hours between completions > interval) as "late, lapsed 83 days". Selecting a stop shows its page on the right leaf (web) or opens it (phone).

**Acceptance criteria**
- [ ] Transponder history shows stops every 24 months back to 2008 with the one late renewal flagged.

---

## 4. Changed capabilities: what changes
| ID | Change from today |
|---|---|
| C-ACCT-04 | Allowance shown in pages wherever reading starts, with "frees up 24 hours after" timing; own key rejection never falls back. |
| C-ACCT-06 | Web gets a light theme; default follows system on all platforms. |
| C-HANGAR-01 | Life strip per aircraft; verdict from the snapshot; counts: overdue, due soon, pages waiting. |
| C-HANGAR-03 | Seeds ELT battery item without a date; sets line, shop kind and IFR-only defaults; five logbooks unchanged. |
| C-HANGAR-04 | Setup is one screen (W-SETUP-01): meters, last annual (type or find on a scanned page; read by AI until the owner taps "That's right"), reminders, optional hours a week; result shown as the first status and W-SETUP-02. `status_ready_at` recorded. |
| C-STATUS-01/02 | Server-composed verdict; due rows show both limits with "first"; documents included; grouped by horizon. |
| C-STATUS-05 | Rate uses the trailing 90 days first, then 365 days, then the owner's estimate (09 §3.3); date granularity by distance. |
| C-STATUS-06/07 | Mark done creates an item completion; link the entry now or later; write the entry now; owner note replaced by the page later. |
| C-STATUS-09 | Items gain line, shop kind, provider, IFR only, visit window, per-item reminder lead. |
| C-PLAN-05 | Forecast and Pick a date are removed as separate screens; their content is Plan ahead. |
| C-AD-01 | AD rows show compliance stops; history from completions. |
| C-SQ-01 | Phone composer photo first, dictation; spine diamonds; history of the related part on its line. |
| C-SQ-04 | Discovery to resolution audit trail shown. |
| C-ANNUAL-01 | Line ahead to the annual; visits that clear it; time-check findings; gap statuses; Share with your IA builds the IA record room. |
| C-AUDIT-01 | Gaps link to the map and carry status; mis-keyed readings and duplicates unchanged. |
| C-CAP-02 | Native scanners; landing line in camera; batches. |
| C-CAP-03 | QR hand-off deep-links into the native app's scan sheet. |
| C-REVIEW-01 | One desk; doubtful fields explained using neighbouring entries; three outcomes; delete asks first. |
| C-BOOKS-04 | Previous and next stop on this line; "what it satisfied" from completions. |
| C-BOOKS-05 | The timeline becomes the list view; the map is the default. |
| C-BOOKS-07 | Entry can close a squawk; draft kept on the device; sticker preview names the page to paste after. |
| C-ASK-01 | Matching entries lit as stops on the map (web) or a mini strip (phone); Search offline on phone. |
| C-HOURS-02 | Saved screen shows what moved and the line ahead redraw; Undo. |
| C-HOURS-05 | One MyFlightBook card with states; readings show their source. |
| C-DETAILS-02 | Optional "Keep me as a viewer"; mechanic links revoked too. |
| C-DOCS-01 | Insurance type; expiry tracking; superseded documents. |
| C-SHARE-02/03/04 | Audience presets; map cover and window; QR; view log by session; dossier page 1 is the map. |
| C-DATA-02 | Due list CSV; new files in the zip. |
| C-SYNC-01 | Native SQLite mirror; header sync state; conflicts block only their row; 410 resync keeps the outbox. |

---

## 5. Settings index
| Setting | Scope | Default | Where |
|---|---|---|---|
| Reminder master switch, channels (email, push) | user | on, both | W-ACCOUNT-02, M-SYS-02 |
| Annual lead | user | 90 days | W-ACCOUNT-02 |
| Oil change lead | user | 10 h | W-ACCOUNT-02 |
| ADs and SBs lead | user | 30 days or 25 h | W-ACCOUNT-02 |
| Documents lead | user | 60 days | W-ACCOUNT-02 |
| Everything else lead | user | 30 days or 25 h | W-ACCOUNT-02 |
| Weekly reminders while lapsed | user | on (max 8) | W-ACCOUNT-02 |
| Visit reminder lead | user | 7 days | W-ACCOUNT-02 |
| Quiet hours (push) | user | 21:00 to 07:00 local | M-SYS-02 |
| Reading done: push / email | user | push on, email off | W-ACCOUNT-02, M-SYS-02 |
| Per-item reminder lead | item | category default | W-STATUS-04, M-STATUS-05 |
| Per-document lead | document | 60 days | W-DOCS-01 |
| Visit window per item | item | 60 days / 25 h | W-MAINT-06 |
| Default provider per shop kind | aircraft | none | W-MAINT-06 |
| Usual hours a week | aircraft | none | W-SETUP-01, W-STATUS-03 |
| Situation override (selling, in the shop) | aircraft | none | W-STATUS-01 More menu, M-STATUS-01 |
| Keep meter photos | user | on | M-SYS-02 |
| Handwritten pages (per scan) | batch | on | M-SCAN-01, W-BOOKS-06 |
| Own AI key | user | none | W-ACCOUNT-02 |
| Appearance | device | match system | W-ACCOUNT-02, M-SYS-02 |
| Offline copy, Download all, Clear scans | device | full copy on | M-SYS-02 |
| Widget aircraft | widget | last opened | system widget editor |
| Backups (Dropbox, Drive; off, monthly, quarterly) | user per aircraft | off | W-ACCOUNT-01 |
| ADS-B hours | aircraft | off | W-AIRCRAFT-01 |
| MyFlightBook connection | user | not connected | W-ACCOUNT-02 |

## 6. Components to add
- **TimeCheckRow**: written value, calculated value, result ("Agree" / "27.0 h apart"), digit-swap hint, PageCite, two actions.
- **GapPanel**: span, evidence per other book, unconfirmed count, three actions and a quiet "Not a gap".
- **FindingList**: first-read findings with grouped headings and PageCites.
- **QueueBatch**: one scan batch with per-state counts, allowance line and a duplicate decision row.
- **VisitChecklist**: items of a planned or in-shop visit with Mark done per item and "Close this visit".
- **NotificationInbox**: list of notifications with read state and actions.

## 7. Open questions
1. Ground severity uses the owner's word "Ground"; principle 1 forbids "grounded" as an app verdict. Confirm the label stays as the owner's choice.
2. Whether Find ADs, write an entry and add oil need their own phone screen IDs (they are reachable today from the phone); 06-mobile-screens.md should assign them.
3. Whether suggested visits should ever include advisory overhauls (TBO) when they fall inside the window; this spec excludes them.
4. First read's recurring-repair grouping uses one AI call; if the owner prefers zero AI for summaries, a keyword rule (same part number or same noun phrase ≥ 2 times) can replace it with less recall.
5. "Remind me Friday" picks the coming Friday 09:00 local; on a Friday it means next Friday. Confirm.
6. Whether record rooms for an IA should be creatable by an editor (a co-owner preparing the annual); today only the owner can.
