# 07 · Flows

This file walks every end-to-end workflow of the redesigned MyTailLog, step by step on the web and on the phone, with the screen ID at each step, what the system does between steps, every branch and failure, and what the map, the spine and the line ahead show before and after. Section 1 sets the conventions. Section 2 defines the branches that recur across flows (offline, AI allowance exhausted, upload failure, low-confidence reading, duplicate page, conflicting edit, viewer role, server error) once, so each flow can cite them by code. Section 3 holds the 25 flows. Data and rules are defined in 09-data-and-api.md ("09 §x") and 08-capabilities.md ("C-…"); screen layouts in 04-web-screens.md and 06-mobile-screens.md; map drawing in 10-line-map.md; exact copy in 12-copy-and-voice.md (strings quoted here are the intended wording and must match that file). All examples use the demo aircraft N734DM on Wednesday, Nov 18, 2026.

## Contents
1. [Conventions](#1-conventions)
2. [Shared branches](#2-shared-branches)
3. Flows
   - [F01 First session to "status ready"](#f01-first-session-to-status-ready)
   - [F02 Adding a second aircraft](#f02-adding-a-second-aircraft)
   - [F03 Scanning a logbook at the hangar, reviewing at the desk](#f03-scanning-a-logbook-at-the-hangar-reviewing-at-the-desk)
   - [F04 First read](#f04-first-read)
   - [F05 Reviewing a doubtful field](#f05-reviewing-a-doubtful-field)
   - [F06 Filling a records gap](#f06-filling-a-records-gap)
   - [F07 Logging a flight by photographing the tach](#f07-logging-a-flight-by-photographing-the-tach)
   - [F08 Adding oil](#f08-adding-oil)
   - [F09 Logging a VOR check](#f09-logging-a-vor-check)
   - [F10 Marking an item done with its page](#f10-marking-an-item-done-with-its-page)
   - [F11 Recording AD compliance](#f11-recording-ad-compliance)
   - [F12 Tracking a new AD from Find ADs](#f12-tracking-a-new-ad-from-find-ads)
   - [F13 Filing a squawk with a photo and sending it to the mechanic](#f13-filing-a-squawk-with-a-photo-and-sending-it-to-the-mechanic)
   - [F14 Resolving a squawk from a logbook entry](#f14-resolving-a-squawk-from-a-logbook-entry)
   - [F15 Planning ahead and booking a suggested visit](#f15-planning-ahead-and-booking-a-suggested-visit)
   - [F16 Preparing for the annual with an IA](#f16-preparing-for-the-annual-with-an-ia)
   - [F17 Pre-buy dossier and a record room for a buyer](#f17-pre-buy-dossier-and-a-record-room-for-a-buyer)
   - [F18 Sharing with a co-owner (roles)](#f18-sharing-with-a-co-owner-roles)
   - [F19 Answering a question with Ask](#f19-answering-a-question-with-ask)
   - [F20 Writing and signing a logbook entry, printing the sticker](#f20-writing-and-signing-a-logbook-entry-printing-the-sticker)
   - [F21 Document expiry reminder](#f21-document-expiry-reminder)
   - [F22 Import (CSV), export and scheduled backups](#f22-import-csv-export-and-scheduled-backups)
   - [F23 MyFlightBook and ADS-B hours suggestions](#f23-myflightbook-and-ads-b-hours-suggestions)
   - [F24 Transferring ownership](#f24-transferring-ownership)
   - [F25 Deleting an aircraft](#f25-deleting-an-aircraft)
4. [Open questions](#4-open-questions)

---

## 1. Conventions
- **Step tables** have four columns: step number, what the owner does and sees on the web (screen ID), on the phone (screen ID), and what the system does. "Same" means the phone step matches the web step on the phone screen named. "Web only" or "Phone only" marks steps one platform does not have; the other platform's column then says how to get there or what the owner sees instead.
- **System column** names the write (sync mutation type from 09 §5.3 or endpoint from 09 §4), recomputes (snapshot, gaps, first read), notifications and timings.
- **Before and after** lists what the map (route map in Logbooks), the spine (strip under every web board) and the line ahead (Status) show at the start and the end. "Unchanged" is stated when nothing moves.
- **Roles** are owner (O), editor (E), viewer (V). Each flow names who can run it.
- **Branches** cite the shared codes in section 2 and add anything flow-specific.
- Every flow ends with acceptance criteria as a checklist.

## 2. Shared branches

### B-OFFLINE: no connection (phone)
- The header shows "Offline · <n> changes on this phone" (M-STATUS-02).
- Writes save to the device outbox and apply locally at once; values they change carry the "On this phone" marker until the next pull replaces the snapshot (09 §3.12).
- Online-only actions (AI reading, Ask, enroll, backups, first read generation, Find ADs, record room and mechanic links, inviting people, transfer, delete, CSV import) show a Toast "Needs a connection. <What happens instead>." and do nothing else. Example: Ask → "Needs a connection. Search still works on this phone." Scanned pages are not an online-only action: they are saved on the phone and upload on the next sync.
- On reconnect: blobs upload first, then the outbox drains in order (09 §5.6); the header moves to "Uploading 2 of 6", then "Synced 9:42". Refusals and conflicts stay listed in M-SYS-01.
- The web has no general offline queue: when the browser loses its connection the OfflineStrip shows, write controls are disabled with their reason, forms keep their values, and pages added on W-BOOKS-06 stay in the browser until they upload (03 §16, 14-decisions.md D10).

### B-ALLOWANCE: AI reading allowance used up
- Allowance is rolling 24 hours: 100 calls on the shared key (about 50 pages), 1000 on the owner's own key.
- Before starting a scan or upload, M-SCAN-01 and W-BOOKS-06 show "Reading allowance today: 31 of 50 pages used." When fewer pages remain than the batch, the line adds "Pages past it wait for tomorrow."
- Pages beyond the allowance upload normally and sit as "Waiting for tomorrow's allowance, about 9:14" (`waiting_allowance`). Nothing else stops working.
- When the global shared budget is spent: "Reading is paused for everyone until tomorrow. Everything else keeps working."
- Own key rejected: the batch fails with "Your API key was rejected. Check it in Settings." and never falls back to the shared key.
- Ask uses the same allowance: "You've used today's answers. Search still works."

### B-UPLOAD: upload failure
- Each page or photo retries with back-off (30 s, 2 min, 10 min, 1 h, then every 6 h). After 5 failures the item shows in M-SYS-01 (phone) or the queue (W-BOOKS-06) with the server's reason and "Try again" / "Remove from this phone" (phone) or "Remove" (web).
- Too large: "Too large to upload. Retake at a lower size or upload from a computer."
- Storage refused (quota or permission): the reason from the server, verbatim, after "Not uploaded:".
- A batch with failed uploads still completes reading for the pages that arrived; the completion notice counts only those, and adds "1 page did not upload."

### B-LOWCONF: low-confidence reading
- A field is doubtful when its confidence is below 0.75 or it fails a plausibility check (09 §3.9.2). Pages with any doubtful field are "needs a look".
- The review desk opens on the most doubtful field, lights its ink on the page, zooms to it on the phone, and explains the doubt using neighbouring entries ("The entry above it on this page reads 1861.2 on Apr 18, 1992, so 1874.6 fits and 1814.6 would run backwards.").
- Three outcomes per field: "Looks right", "Edit", "Not on this page". Bulk "Confirm N clean" never includes a doubtful page.
- Unconfirmed values are shown with the "read by AI" mark and change nothing derived (C-TRUST-01).

### B-DUP: duplicate page
- At capture or upload, a page whose image hash is within distance 6 of an existing page of the aircraft is flagged before reading (09 §3.9.3): "This looks like Engine p. 22, scanned Sep 20." with both thumbnails and "Keep both" / "Skip this one". No allowance is spent until the owner chooses.
- After reading, duplicate entries are found by Records check (W-MAINT-05) as today.

### B-CONFLICT: conflicting edit
- A phone change to a row that someone else changed since the phone last synced returns `conflict` (09 §5.5). The outbox item stays with the server's row.
- The header shows "1 change needs a decision"; M-SYS-01 shows the row title ("Squawk: Left brake feels soft"), who changed it and when ("Sam Reyes resolved it on the web at 9:12"), and a Field / Yours / Theirs table with differing lines marked.
- Actions: "Keep mine" (re-sent against the new version), "Take <name>'s" (drops the change), "Decide later". Nothing is overwritten silently. Later changes to the same row wait behind the conflict; changes to other rows continue.
- On the web, a stale form that conflicts shows an AlarmSlip on the screen: "Sam Reyes changed this at 9:12. Theirs: Resolved Nov 17. Yours: Open." with "Keep mine" and "Use theirs".

### B-VIEWER: viewer role
- Viewers see everything the aircraft holds (including unconfirmed entries, marked) and can Search, Ask, report squawks with photos, and snooze their own reminders.
- Edit controls are not rendered for viewers. Where a viewer would expect one, a quiet line says "You can view N4321J. Ask Dana Morgan for edit access." (once per screen, never per row).
- A viewer's write that reaches the server anyway returns "You don't have edit access to this aircraft." (phone outbox shows it in M-SYS-01 with "Remove from this phone").
- Owner-only actions (record rooms, inviting people, transfer, delete) are hidden from editors too; editors see "Only the owner can <action>."

### B-ERROR: server error
- Any 5xx: AlarmSlip "Something went wrong on our side. Your change is <saved on this phone | not saved>. Try again." with "Try again". The phone treats 5xx on push as retryable.
- 503 from the AI provider during reading: pages return to `queued` and retry; the queue says "Reading is slow right now. Pages will be read when it recovers."

---

## 3. Flows

### F01 First session to "status ready"
**Who:** a new owner (becomes O). **Trigger:** first sign-in. **Goal:** the success metric: a known annual date and current meters in the first session (`aircraft.status_ready_at` set).

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-AUTH-01: "Create a free account" with Google, Apple, email link or password. | M-AUTH-01, same methods (Android: Google and email; Apple where available). | Account created; demo aircraft N734DM shared read-only (viewer). |
| 2 | W-HANGAR-01 shows the demo N734DM (marked "Demo aircraft") and the empty slot "Add an aircraft". One-tap "How did you hear about MyTailLog?" card. | M-HANGAR-01 same. | `growth_event` for heard-about if answered. |
| 3 | "Add an aircraft" → W-HANGAR-02: type the tail number, "Look up". | M-HANGAR-02 (BottomSheet) same. | `GET /api/registry`; on match fills make, model, year, serial, engine, registrant. |
| 4 | Check the registry fields against the data plate; optional engine and prop serials, home airport; "Add <tail>". | Same; "Add <tail>". | `POST /api/aircraft/enroll` (online only): aircraft, five logbooks, items annual, transponder, pitot-static, ELT, ELT battery, all "needs a date". |
| 5 | W-SETUP-01 opens: three answers on one screen. Meters today: tach, hobbs ("No hobbs? The tach is enough."). | Phone continues in the setup sheet (part of M-HANGAR-02, then M-STATUS-01). | Nothing saved until each field is committed. |
| 6 | Last annual: "Type the date" or "Find it on a scanned page". | Same; "Find it on a scanned page" opens the camera (M-SCAN-02) on the Airframe book. | Typed: saved as an owner fact (confirmed). Photographed: page uploaded, read at once (uses about 2 calls), the annual entry shown as "Read by AI, not yet confirmed" with the page beside. |
| 7 | If photographed: check the reading against the page, "That's right" (or edit date and tach). | Same. | Entry confirmed; `item_completion` for annual; annual due = end of month 12 months after (Jul 14, 2026 → Jul 31, 2027). |
| 8 | Reminders: "Email me 30 days or 10 hours before anything comes due" (on by default). Optional: "About how many hours a week do you fly?" | Same; push permission asked here on phone with the platform dialog after an in-app explanation. | `profile.preferences.alerts`; `aircraft.expected_hours_per_week`; device token registered. |
| 9 | "Done, show my status" → W-SETUP-02 (New aircraft, nothing scanned) with the verdict. | M-STATUS-01 with the setup situation. | Snapshot computed; `status_ready_at` set; situation `setup` ends when annual date and meters exist, so the home shows `attention` or `all_clear` with the remaining three items as "Unknown". |
| 10 | Next step offered: "Scan the airframe logbook with your phone" (QR), "Upload pages", "Add dates" for transponder, pitot-static and ELT. | "Scan the airframe logbook" button. | Onboarding email nudges start per existing rules. |

**Branches**
- Registry has no match: "The FAA registry doesn't know <tail>. Add it by hand." Fields become editable empty inputs; enrollment proceeds.
- Tail already in the user's hangar: "N734DM is already in your hangar." with "Open it".
- B-OFFLINE at step 3 or 4 (phone): "Adding an aircraft needs a connection." The sheet keeps the typed tail.
- B-ALLOWANCE at step 6: "Reading is paused until tomorrow. Type the date instead, or we'll read the page when the allowance frees up." The page waits; the annual stays unknown until confirmed.
- Low confidence on the annual date or tach (B-LOWCONF): the setup row shows the doubtful field highlighted; "That's right" is replaced by "Check the date" until the owner accepts or edits it.
- Photo shows no annual: "We couldn't find an annual on this page. Try the page before, or type the date."
- Skip for now: the board shows "Finish setup" on Status until both answers exist; reminders do not start.

**Map, spine, line ahead**
- Before: no aircraft.
- After: W-SETUP-02 map draws the past as four dashed lines "no pages yet", today marked, the line ahead with one ring (annual, Jul 31, 2027) and the three undated items listed under the line "Not on the line: Transponder, Pitot-static, ELT inspection, need a date". Spine: dashed from 1978 to today, bracket on the next 12 months.

**Acceptance criteria**
- [ ] A new account reaches a status with a dated annual and a current tach in ≤ 4 minutes in a usability test, on web and phone.
- [ ] A read-by-AI annual never sets the due date until "That's right".
- [ ] `status_ready_at` is set once, at the first moment both facts exist.
- [ ] Enrollment refuses offline with the exact message and keeps input.

### F02 Adding a second aircraft
**Who:** O (any signed-in user). **Trigger:** owner of N734DM buys or co-owns another aircraft.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Rail plate (aircraft switcher W-SWITCH-01) › "Add an aircraft", or W-HANGAR-01 › "Add an aircraft". | PhoneHeader tail › switcher sheet › "Add an aircraft", or M-HANGAR-01. | |
| 2 | W-HANGAR-02 as F01 steps 3 and 4. | M-HANGAR-02. | Enroll (online). |
| 3 | W-SETUP-01 as F01 steps 5 to 9. | As F01. | Snapshot for the new aircraft. |
| 4 | Back in the hangar both aircraft show their verdict and life strip; the switcher lists both with their worst status. | M-HANGAR-01 same; switcher sheet. | Reminders group per aircraft in one daily digest. |

**Branches**
- The tail is shared with the user already (for example N4321J as editor): "You already have access to N4321J as an editor." with "Open it"; enrolling a duplicate is refused.
- The tail belongs to another MyTailLog owner: enrollment is allowed (records are per account) with a note "Another MyTailLog account also tracks N4321J. Ask its owner to share it if you co-own it." (no names disclosed).
- B-OFFLINE as F01.

**Map, spine, line ahead:** the new aircraft starts as in F01 after. The first aircraft is unchanged. The hangar life strips are independent.

**Acceptance criteria**
- [ ] Switching aircraft keeps the current section (Status stays Status).
- [ ] Each aircraft's widget and reminders are independent.

### F03 Scanning a logbook at the hangar, reviewing at the desk
**Who:** O or E. **Trigger:** Dana finds loose airframe sheets from 1984 to 1988 and scans them on Sunday Nov 15; reviews them at the desk on the web.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Web only alternative: W-BOOKS-06 "Scan with your phone" shows a QR that deep-links to the phone's scan sheet for this aircraft. | Add (AddButton) › "Scan logbook pages" → M-SCAN-01: choose the book (Airframe), "Adds to the end. 198 pages so far, so these start at page 199.", Handwritten toggle (on), allowance line "Reading allowance today: 31 of 50 pages used." "Open the camera". | `batch.create` (outbox; works offline). |
| 2 | (none) | M-SCAN-02: native document scanner finds page edges, takes the shot when steady, runs blur and glare checks; count "5 taken"; once a date is legible the line "Lands in 1984, inside the airframe gap". "Done". | Each page: JPEG, thumbnail, image hash; saved on the phone (capture queue). Landing hint computed on the device from on-device text recognition of the first date (no allowance). |
| 3 | (none) | M-SCAN-03 queue: "On this phone 2 · Uploading 1 of 2 · Being read 4". Mini map: hollow stops landing in the airframe column inside the dashed gap. | Upload with `batchId`, `phash`; server dedupe; pages `queued`; reader worker claims them; `extracted` with `needs_look` per page. |
| 4 | (none) | Owner leaves. Notification (M-SCAN-04): "6 pages are read. 2 need a look." Body "Airframe p. 14 to 19, from 1984 to 1988: the first pages found for the gap. Four read cleanly and can be confirmed together." Actions "Review the 2", "Later". | When the batch is complete: one `notification` (reading_done), push per preferences. |
| 5 | At the desk: rail Logbooks tab shows "6 to review"; W-BOOKS-06 queue row "Read: 6 · Needs a look: 2"; "Review" → W-BOOKS-08 Review all: "4 pages read cleanly. 2 need your eyes." | (Or on the phone: "Review the 2" → M-REVIEW-01.) | |
| 6 | "Confirm 4 clean pages" (each page can be unticked first). | Phone: M-REVIEW-03 "Confirm page and next" per page, or "Confirm 4 clean" from the queue. | `entries.confirmClean` / `entry.confirm` + `page.review`; entries become confirmed; completions proposed from `entry_kind` (for example an annual) become `item_completion` rows. |
| 7 | Open a "needs a look" page → W-BOOKS-07 review desk; see F05. | M-REVIEW-01/02; see F05. | |
| 8 | After the last page: "All 6 pages confirmed. 11 entries added." with "Open the map at 1984". | Same Toast; "On the map". | Snapshot recompute; gap detection reruns (the 1983 to 1991 gap shrinks to the stretch still missing). |

**Branches**
- B-ALLOWANCE: pages beyond the allowance show "Waiting for tomorrow's allowance, about 9:14"; the notification waits for the batch to finish.
- B-UPLOAD: listed in M-SYS-01 with retry.
- B-DUP at step 2 or 3: "This looks like Airframe p. 16, scanned just now." Keep both / Skip this one.
- B-OFFLINE at the hangar: pages stay "On this phone" and the count shows in the header; they upload on reconnect. No reading happens offline.
- Blurry page: "Blurry. Retake?" with "Retake" (default) and "Keep anyway" before it is kept.
- Two-page spread detected after reading: page flagged "Two pages in one photo. Split it?" in the review desk (existing).
- Scanned into the wrong book: in W-BOOKS-05 or M-BOOKS-06, select the pages › "Move to another book" (moves pages and their entries; the map updates).
- Out of order: Pages library › sort by entry date › "Save this order" (existing).
- B-VIEWER: Add › Scan is not offered to viewers.
- Reading fails for a page: "Could not read page 17. Retake it or try again."

**Map, spine, line ahead**
- Before: airframe line dashed Feb 1983 to Mar 1991; 412 pages, 6 to review = 0.
- During: six pages land as hollow stops on the airframe line inside the gap (web W-BOOKS-06 map, phone M-SCAN-03 mini map); the spine shows hollow stops at 1984 to 1988.
- After confirming: stops turn solid; the gap now runs from the last confirmed 1988 entry to Mar 1991 (if more than 24 months remain) or is filled; the spine's dashed span shortens. Line ahead unchanged unless a confirmed entry completes a tracked item more recently than the current last-done (not the case for 1984 to 1988 pages).

**Acceptance criteria**
- [ ] Pages scanned offline upload and read with no further action after reconnecting.
- [ ] One notification per batch, sent only after every page is read or failed.
- [ ] Hollow stops appear on the map within 10 seconds of each page being read.
- [ ] "Confirm 4 clean" never confirms a page with a doubtful field.

### F04 First read
**Who:** O or E (V can read it). **Trigger:** the airframe book (198 pages) has every page read and reviewed for the first time.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Notification in the inbox and push: "What the airframe logbook told us is ready." | Push opens the in-app first read screen (pushed from Logbooks; proposed ID M-BOOKS-08, see Open questions), same content as the web. | `first-read` generated: rule findings plus one AI call for recurring repairs (09 §4.7). |
| 2 | W-BOOKS-09: line of the airframe book with findings pinned; "What the airframe logbook told us. 198 pages from 1978 to 2026, read and confirmed. Five things stand out." | Same content as a list with a mini line. | |
| 3 | Findings: Gaps (1983 to 1991, vol. 2 p. 1), Repairs that recur (left brake 2016, 2018, 2021; vacuum pump 2009, 2021), Big changes (GTN 650 for KX-155, 2019; engine removed for overhaul 2005). Each PageCite opens the page on the right leaf. | Each PageCite opens the page viewer. | |
| 4 | "Next, the engine logbook": "Scan the engine logbook with your phone" (QR), "Add pages"; and "Look for the 1983 to 1991 airframe pages", "Show the brake history to your mechanic" (opens Squawks with the history), "Ask the airframe book a question". | Same actions; scan opens M-SCAN-01 with Engine preselected. | |

**Branches**
- B-ALLOWANCE or offline at generation: rule-based findings only and "Recurring repairs will be added when reading resumes."; the AI pass runs automatically later and updates the page (no second notification).
- Fewer than 10 pages: first read is not offered; the map's book menu says "First read needs at least 10 pages of a book."
- Unreviewed pages remaining: "3 pages of the airframe book still need review. First read starts when they're done." with "Review".
- No findings: "Nothing stood out in 198 pages: no gaps over two years, no repeated repairs." (still shown, with the Next block).
- B-VIEWER: viewers see first read; actions that write (scan) are hidden.

**Map, spine, line ahead:** unchanged by first read itself (it reads confirmed data). The W-BOOKS-09 line is a view of the airframe line with finding markers.

**Acceptance criteria**
- [ ] Generated once per qualifying book; refreshed silently when more pages of the book are confirmed.
- [ ] Every finding has at least one PageCite and none cites an unconfirmed entry.

### F05 Reviewing a doubtful field
**Who:** O or E. **Trigger:** a page "needs a look" (F03).

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-BOOKS-07 opens the page: SourceMat on the right with the page, fields on the left; the most doubtful field selected (Tach on entry 2), its ink lit on the scan; the spine brackets 1992 and the left leaf says "This page fills 1992 in the airframe gap" when it lands in a gap. | M-REVIEW-01: the page fills the screen, entry in a bottom drawer; M-REVIEW-02 zooms to the doubtful field: "Tach. Read with doubt 1874.6. The second digit could be a 1, which would make it 1814.6. The entry above it on this page reads 1861.2 on Apr 18, 1992, so 1874.6 fits and 1814.6 would run backwards." | Doubt reasons from 09 §3.9.2. |
| 2 | "Confirm {value}" (key A), "Edit" (E), "Not on this page" (X). Tab moves to the next doubtful field. | Swipe right: looks right; swipe left: edit; buttons "Looks right", "Edit", "Not on this page". | Field accepted: confidence override recorded; edited: value saved, entry marked edited. |
| 3 | When no doubtful fields remain: "Confirm page and next" (Shift+Enter). | M-REVIEW-03: "Page 199 confirmed, 2 entries" with Undo; next page loaded "2 of 6 to review". | `entry.confirm` for each entry; `page.review` confirmed; completions; snapshot recompute. |
| 4 | Optional tools: "Crop and re-read" (re-queues, uses allowance), "Add an entry the reader missed", "This entry continues on the next page" (merge), "Link from Vault". | Same tools in the drawer's More menu. | |

**Branches**
- "Not on this page": the field becomes empty and is marked "Not on this page"; the entry can still be confirmed if date and work text exist; an entry with no date is confirmed only with "Keep without a date" (it will not appear on the map).
- Edit to a value that fails plausibility again: inline note "Still lower than the entry before it (1861.2). Keep it?" with "Keep" and "Change".
- Owner note match (C-REVIEW-05): "This page records the oil change you noted on Nov 18." "Use this page as the source" / "Keep both".
- Delete an entry: "Delete this entry? It is removed from the index; the page stays." Confirm required.
- B-CONFLICT: a co-owner confirmed the same page meanwhile: phone shows the conflict in M-SYS-01; web desk shows "Sam Reyes confirmed this page at 10:02." and reloads the page's entries.
- B-ALLOWANCE on "Crop and re-read": "Re-reading needs today's allowance. The cropped scan is saved; re-read tomorrow, or confirm what was read."
- B-OFFLINE (phone): review works fully offline; confirms queue.
- B-VIEWER: the desk opens read-only ("You can view this page. Ask Dana Morgan for edit access."); no outcomes.

**Map, spine, line ahead**
- Before: the page's entries are hollow stops.
- After confirm: solid stops; if an entry completes a tracked item more recently than the current last done, that item's ring moves on the line ahead and its due row cites the new page.

**Acceptance criteria**
- [ ] The first selected field is the most doubtful by the 09 §3.9.2 ordering.
- [ ] The ink highlight matches the field's box on web and phone at every zoom.
- [ ] Keyboard path A, E, N, Tab, Enter completes a page without the mouse.
- [ ] Undo after "Confirm page and next" restores the page to unconfirmed within 10 seconds.

### F06 Filling a records gap
**Who:** O or E (V reads). **Trigger:** the map shows the airframe gap Feb 1983 to Mar 1991, or Records check lists it.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-BOOKS-01 map › click the dashed stretch → W-BOOKS-04: the column tinted across every book; left leaf "No airframe pages, Feb 1983 to Mar 1991"; "What the other books show": Engine 11 entries, 7 annuals, tach 1046.8 to 1598.3; Propeller 3 entries. Verdict "The aircraft flew and was inspected. The airframe book for those years is what is missing." Right leaf: last airframe page before and first after. | M-BOOKS-01 map › tap the dashed stretch → M-BOOKS-04 sheet with the same evidence and counts "Airframe 6 pages read 1984 to 1988 · not yet confirmed" with "Review 6". | `GET /gaps/{id}/evidence` (web); phone computes from local rows. |
| 2a | "Scan the missing pages" → W-BOOKS-06 with Airframe preselected and the landing hint "Lands in 1983 to 1991". | "Scan these pages" → M-SCAN-01 with Airframe. | Continue as F03. |
| 2b | "Mark 'no pages exist'" → optional note → "Save". | "No pages exist" → note sheet → "Save". | `gap.setStatus no_pages_exist`. |
| 2c | "Note: asked the previous owner" → date (today) and note. | "I asked the previous owner". | `gap.setStatus asked_previous_owner`. |
| 3 | The gap leaf shows the status, who set it and when, and "Change". | Same. | Records check (W-MAINT-05) and annual prep no longer count a `no_pages_exist` gap as open; record room and dossier text updated. |

**Branches**
- Pages arrive that fill part of the span: the gap shrinks; if what remains is under 24 months it becomes Filled ("Filled by pages you confirmed" in Records check › Resolved).
- Owner statuses survive a shrink (09 §2.6).
- "Not a gap" (quiet menu): dismissed; reversible from Records check › Dismissed.
- The other books also have no entries in the span: verdict "No book has entries for these years. The aircraft may have been stored." (still a gap; the owner chooses the status).
- B-VIEWER: evidence visible; the three actions hidden.
- B-OFFLINE: status changes queue; evidence uses the local mirror.

**Map, spine, line ahead**
- Before: dashed airframe gap 1983 to 1991 on the map and spine.
- After 2a (pages confirmed): the dashed span shortens or disappears. After 2b: drawn as a thin solid "no pages exist" stretch (10-line-map.md). After 2c: still dashed with the label "asked previous owner, Nov 18". Line ahead unchanged.

**Acceptance criteria**
- [ ] Evidence counts match on web and phone for the demo data.
- [ ] A `no_pages_exist` gap appears in the record room as the owner's statement with its date.
- [ ] Gap status changes sync and appear on the other platform within one pull.

### F07 Logging a flight by photographing the tach
**Who:** O or E. **Trigger:** back at the tie-down after a 2.4 h flight.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Web alternative: Status BoardHead "Log a flight" → W-AIRCRAFT-01 "Add a reading" form (tach, hobbs, date, oil added). | Add › "Log a flight" (M-FLIGHT-01) → M-FLIGHT-02 camera framed for the hour meter; "Type it" equally prominent. | |
| 2 | (none) | Take the photo. "Hour meter found. Last reading was 4212.4." | On-device text recognition, candidate selection (C-HOURS-03); no network, no allowance. |
| 3 | Enter tach 4214.8 (stepper), hobbs 4683.1 or leave blank. | M-FLIGHT-03: "Read from your photo. Check it against the meter." Tach 4214.8 "+2.4 hours this flight"; hobbs next (photo, type, or "Not this time"); oil added presets None, 1 qt, 2 qt, Other; date Today. Mini engine line: the oil ring slides from about Dec 12 to about Dec 5 as the value changes. | Local recompute (09 §3.12). |
| 4 | "Save reading". | "Save flight". | `reading.create` (source `tach_photo`, OCR fields, photo blob if kept) and `oil.create` if oil added. |
| 5 | Toast "Reading saved. Oil change now 7.3 h away, about Dec 5." and the due list updates. | M-FLIGHT-04: "Flight saved. Oil change now 7.3 h away, about Dec 5. Logged 2.4 h, tach 4214.8, with 1 qt of oil." What it moved: Oil and filter was 9.7 h → 7.3 h; seat-rail AD 55.9 h → 53.5 h; engine since overhaul 1411.8 h. "Calendar items did not change." Line ahead redrawn. Visit at risk: "The oil change now falls two days before the Dec 7 visit." "Move the visit to the week of Nov 30". "Undo", "Done". | Snapshot recompute after sync; `visit_risk` notification if the owner does not move the visit. |

**Branches**
- No number read: "Couldn't read a number between 4212.4 and 4236.4. Type it." Keypad opens.
- Implausible jump (> 24 h): warning "That's 31.0 hours since Nov 14. Check it." Save allowed.
- Lower than the last reading: "Lower than the last reading (4212.4). Is this a new meter?" with "Record a meter replacement" (opens the meter replacement sheet) or "Fix the number".
- Photo permission denied: "MyTailLog can't use the camera. Type the reading, or allow the camera in Settings." with "Type it".
- B-OFFLINE: everything works; M-FLIGHT-04 marks the moved values "On this phone"; the visit move is queued as `visit.update`.
- B-CONFLICT: a co-owner logged a reading for the same date: no conflict (readings are inserts); both readings exist; Records check flags identical or out-of-order readings for review.
- Undo within 10 seconds: removes the reading and oil from the outbox (or queues deletes if already synced).
- B-VIEWER: Add › Log a flight not offered.

**Map, spine, line ahead**
- Before: oil ring on the engine line about Dec 12; the suggested visit cap in the week of Dec 7 sits before it, so the visit clears it in time.
- After: oil ring about Dec 5, now before the Dec 7 visit cap; if the owner taps "Move the visit", the planned or suggested visit cap moves to the week of Nov 30. Map unchanged (readings are not stops). Spine unchanged.

**Acceptance criteria**
- [ ] From camera open to saved in ≤ 3 taps when the reading is correct.
- [ ] The saved screen's "was" and "now" values equal the snapshot before and the local recompute after.
- [ ] Works in airplane mode end to end.

### F08 Adding oil
**Who:** O or E. **Trigger:** a top-off at the aircraft without a flight log.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-AIRCRAFT-02 "Add oil": quarts, date (today), tach and hobbs prefilled from the latest reading (editable). | Add › "Add oil" → BottomSheet: quarts presets (1, 2, Other), date, tach prefilled. | |
| 2 | "Save". | "Save". | `oil.create`. |
| 3 | Toast "1 qt added. Burn rate about 11 h per quart over the last 10 top-offs." | Toast same; returns to where Add was opened. | Burn rate recalculated (existing). |

**Branches:** tach missing and no reading: the top-off is saved and counted as "not measurable" (existing rule, explained on W-AIRCRAFT-02); B-OFFLINE queues; B-VIEWER not offered.

**Map, spine, line ahead:** unchanged (oil top-offs are not stops and do not change due items).

**Acceptance criteria**
- [ ] Saving offline and syncing produces exactly one `oil_addition`.

### F09 Logging a VOR check
**Who:** O or E (a pilot logs it). **Trigger:** the VOR check lapsed Nov 11 (IFR only).

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Status due row "VOR check, lapsed 7 days ago" › W-STATUS-04 item detail › "Log a VOR check". | M-STATUS-01 row › M-STATUS-05 › "Log a VOR check" → M-STATUS-07. | |
| 2 | Fields per 91.171(d): date (today), kind (VOT, Ground, Airborne, Dual), place ("Home field VOT, 108.0 MHz"), bearing error stepper with the allowed limit shown ("within 4° for a VOT"), signature (typed name, prefilled with the owner's name). | Same on M-STATUS-07; signature by typing or drawing. | |
| 3 | "Save VOR check". | "Save VOR check". | `mx.complete` with a written entry in Airframe (owner note, `page_id` null, confirmed); `item_completion` source `vor_check`; next due today + 30 days (Dec 18, 2026). |
| 4 | Due row now "VOR check, Dec 18, 30 days, Current". | Same. | Snapshot recompute; the reminder cycle resets. |

**Branches**
- Bearing error outside the limit for the kind: warning "Outside ±4° for a VOT. The check did not pass." Save is still allowed so the record is kept: the entry is written with "outside tolerance", but no completion is created, so the counter does not reset; the due row keeps its overdue state and adds "Last check Nov 18 did not pass".
- Date in the past: allowed back to the last check's date; next due counts from it.
- B-OFFLINE queues; B-VIEWER not offered.

**Map, spine, line ahead**
- Before: VOR ring overdue at today (avionics line).
- After: ring at Dec 18 as current; a new stop (owner note, confirmed) on the airframe line at Nov 18; the suggested visit that included the VOR check drops it (and if fewer than 2 items remain, the visit disappears).

**Acceptance criteria**
- [ ] The saved entry text contains date, place, bearing error and signature (91.171(d)).
- [ ] A failed-tolerance check never shows the item as current.

### F10 Marking an item done with its page
**Who:** O or E. **Trigger:** the oil change was done Nov 18 by M. Torres; the signed engine page will be scanned later.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-STATUS-01 row "Oil and filter" › "Mark done" opens the drawer on W-STATUS-04. | M-STATUS-05 › "Mark done" → M-STATUS-06 sheet. | |
| 2 | Date (today), counted on (tach), tach at the change (prefilled 4212.4), oil added, oil type, "Oil sample sent for analysis" checkbox, notes. | Same fields (date, counted on, tach stepper, notes). | |
| 3 | The logbook entry: "Link the page now" (pick a confirmed entry), "Link the page later" (default), or "Write the entry now" (F20). | "Link the logbook entry: pick it now, or after you scan the page". | |
| 4 | Preview: "Next due at tach 4262.4, about Mar 15, or Mar 18, 2027 by the calendar, whichever comes first." (50 h at 3 h a week is 117 days) and "Saved as your note, confirmed by you. When the signed engine logbook page is scanned, it replaces the note as the source." "Mark done". | Preview "Next due at tach 4262.4, about mid-March." "Mark done". | `mx.complete` → owner note entry (Engine, confirmed) + `item_completion`; if a planned visit holds the item, `planned_visit_item.done_completion_id` set. |
| 5 | Later: the signed Engine p. 39 is scanned and reviewed (F03, F05). On confirm: "This page records the oil change you noted on Nov 18." "Use this page as the source". | Same in M-REVIEW-01. | `entry.replaceNote`; completion re-pointed; trust becomes signed if the page has the mechanic's signature and certificate. |
| 6 | Item detail history shows the stop citing Engine p. 39 "Signed by M. Torres". | M-STATUS-05 same. | |

**Branches**
- Pick an entry now: only confirmed or signed entries in the item's book within ±30 days are offered, nearest first; "None of these" falls back to "later".
- Date older than the current last done: "This is earlier than the last oil change (Sep 3, 2026). Add it to the history without changing what's due?" with "Add to history" and "Cancel".
- B-CONFLICT: a co-owner marked it done meanwhile → M-SYS-01 shows both completions; "Keep mine" adds the second completion; "Take Sam's" drops mine.
- B-OFFLINE queues; B-VIEWER not offered.

**Map, spine, line ahead**
- Before: oil ring due soon about Dec 12 (or Dec 5 after F07).
- After: oil ring at about Mar 15, 2027 (hours first) and the calendar limit Mar 18 shown in the row; a confirmed stop at Nov 18 on the engine line (owner note), replaced later by the signed page's stop (diamond trust in its sheet). The suggested Dec 7 visit loses the oil change; it remains if ≥ 2 items are left (transponder and pitot-static).

**Acceptance criteria**
- [ ] Next due is calculated from the done tach (hours) and done date (calendar), earlier named "first".
- [ ] Replacing the note never creates a second completion.

### F11 Recording AD compliance
**Who:** O or E. **Trigger:** the recurring seat-rail AD 2011-10-09 was inspected at the visit.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-MAINT-01 register › AD 2011-10-09 › "Record compliance". | M-MAINT-01 › the AD › "Record compliance" sheet. | |
| 2 | Date, hours (tach prefilled), method ("Inspected IAW AD para (g); no wear beyond limits"), proving entry (pick a confirmed entry, or "Link the page later"), status Complied. | Same. | |
| 3 | "Save". The row shows next due at tach +100 h with projection; its compliance stops line gains a stop. | Same. | `ad.upsert` + `item_completion` (ad); next due recomputed; snapshot. |

**Branches**
- One-time AD: status Complied, no next due; the line shows a single stop.
- "Doesn't apply": requires a reason ("Engine model not affected"); status not_applicable; no line drawn.
- An A&P AD compliance report scanned into Other later corroborates it: "A&P report" badge; if the report's date is older than the logbook-derived compliance, the report does not overwrite it (existing rule).
- B-OFFLINE queues; B-VIEWER not offered; B-CONFLICT as usual.

**Map, spine, line ahead**
- Before: seat-rail ring on the airframe line about Mar 2027.
- After: ring at the new projected date about 100 h later; a stop on the AD's compliance line (W-MAINT-01) and, once the proving page is confirmed, on the route map.

**Acceptance criteria**
- [ ] Recurring next due = complied hours + interval hours and/or complied date + interval months, earlier named first.

### F12 Tracking a new AD from Find ADs
**Who:** O or E. **Trigger:** owner checks for ADs naming the aircraft or its equipment.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-MAINT-01 › "Find ADs" → W-MAINT-02: chips for Cessna 172N, Lycoming O-320-H2AD, McCauley 1C160, Garmin GTN 650, Rapco RA215CC, ACK E-04, plus "Add a part or keyword". | M-MAINT-01 › "Find ADs" (pushed screen; online only). | Federal Register and DRS search (existing). |
| 2 | Result: "11 candidates. 4 name this aircraft or a part on it. 3 you already track are hidden." Rows: AD, subject, why it came up, effective. | Same as a list. | |
| 3 | Select AD 2021-07-14 (dry vacuum pumps): detail with "On N734DM: Rapco RA215CC vacuum pump, installed 2021, Airframe p. 57. Check its serial against the affected range before you track this." | Same. | |
| 4 | "How it repeats": One time or Recurring (every N hours and/or months), next due ("At the next annual" or a date/hours). "Track this AD". | Same. | `ad.track` (status open, recurring fields). |
| 5 | Register shows the AD as open with its next due; Status gains a due row if recurring or open with a due date. | Same. | Snapshot recompute. |

**Branches**
- "Doesn't apply" from the detail: asks a reason; recorded as not_applicable and hidden from future candidate lists.
- Search fails (Federal Register down): "The FAA search isn't answering right now. Try again in a few minutes." DRS fallback attempted first.
- B-OFFLINE: "Finding ADs needs a connection." (phone).
- B-VIEWER: viewers can search but not track ("Ask Dana Morgan to track it").
- Copy rule on every result screen: "A candidate is a lead to check with your A&P, not a finding of applicability."

**Map, spine, line ahead:** a recurring AD with a due date in the horizon adds a ring on its line; one-time open ADs with no date are listed "Not on the line: AD 2021-07-14, needs a due date".

**Acceptance criteria**
- [ ] Tracked ADs are hidden from later searches and counted ("3 you already track are hidden").

### F13 Filing a squawk with a photo and sending it to the mechanic
**Who:** any role can file; O or E can send. **Trigger:** the nav light lens is cracked.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-MAINT-03 › "Report a squawk" (form: photos by drop or file, words, severity). | Add › "Report a squawk" → M-MAINT-03 camera: "Photograph it first. You can skip this." Library, Skip photo. | |
| 2 | (none) | Photo taken → words screen: "What did you notice?" typed or dictated ("Listening. Tap to stop."); "How serious is it?" Low / Watch / Ground with their one-line meanings. | Photo saved on the phone (blob queue), EXIF location stripped. |
| 3 | "Add squawk". | "Add squawk". | `squawk.create` (reporter = self) + `squawkPhoto.create` after the blob uploads. |
| 4 | Squawk list shows it Open · Low with the photo; spine diamond at Nov 18. | M-MAINT-02 detail: "Open · Low", photo, "Reported Nov 18 by Dana · 1 photo". | Snapshot recompute (open squawk count; Watch and Ground squawks ride along to suggested visits). |
| 5 | "Send to mechanic" → dialog: recipient (providers list or a name), expiry 30 days, include photos (on), related entries (off), include who reported (off). "Make the link". | M-MAINT-02 "Send to mechanic": "Sending makes a link with the photo and these words. M. Torres can open it without an account; it expires in 30 days." | `POST /mechanic-links` (online). |
| 6 | Link shown with Copy and "Open in mail" (prefilled mailto). | Platform share sheet opens with the text and link. | MyTailLog sends nothing itself. |
| 7 | Later: detail shows "Sent to M. Torres Nov 18 · opened twice", with "Revoke". | Same. | `mechanic_link_view` rows. |

**Branches**
- Skip photo: words screen without the photo; photos can be added later from the detail ("Add a photo").
- Dictation unavailable or denied: keyboard only; mic button hidden.
- B-OFFLINE: the squawk and photos save and sync later; step 5 shows "Making a link needs a connection." and keeps the squawk.
- B-UPLOAD for the photo: the squawk syncs without it; the photo stays in M-SYS-01 with "Try again".
- B-VIEWER: viewer can do steps 1 to 4 (as themselves); "Send to mechanic" is hidden; the owner gets the squawk in the next daily digest ("Sam Reyes reported a squawk: Nav light lens cracked").
- Link expired or revoked: the mechanic sees "This link has ended. Ask the owner for a new one."
- Ground severity: the home verdict names it ("Left brake: you marked it Ground on Nov 8.") without saying the aircraft is grounded.

**Map, spine, line ahead**
- Before: no diamond.
- After: filled diamond on the spine at Nov 18 (airframe line); on the squawk detail (web), the history of related entries on its line (for example left brake relines). If Watch or Ground: the squawk joins the first suggested visit ("rides along").

**Acceptance criteria**
- [ ] A squawk with a photo filed offline appears on the web with the photo after sync.
- [ ] The mechanic page shows only the squawk(s) on the link and never the owner's email or other records.
- [ ] Revoking makes the link return "ended" within 1 minute.

### F14 Resolving a squawk from a logbook entry
**Who:** O or E. **Trigger:** M. Torres replaced the lens; the entry is on Airframe p. 62.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Path A: in the review desk (W-BOOKS-07) for p. 62, the entry "Replaced right wing position light lens…" shows "This may clear: Nav light lens cracked (Oct 21)." with "Clear it". | Path A in M-REVIEW-01 same suggestion. | Suggestion when an open squawk's description and the entry share ≥ 2 significant words (existing similarity helper). |
| 2 | Path B: W-MAINT-03 squawk › "Mark resolved" → pick the clearing entry (confirmed entries after the report date, nearest first) or "No entry yet". | M-MAINT-02 › "Mark resolved" or swipe right in the list → pick entry. | |
| 3 | "Resolve". Squawk moves to Resolved with "Cleared by Airframe p. 62, Nov 25". | Same. | `squawk.resolve` with `resolvedEntryId`; history line "Resolved by Dana Morgan, Nov 25". |
| 4 | (none) | (none) | If the squawk was in a planned visit: `planned_visit_item` done. Live mechanic links show "Resolved Nov 25". |

**Branches**
- Path A when the entry is still unconfirmed: "Clear it" is offered only after the entry is confirmed (review gate).
- Reopen: "Reopen" on a resolved squawk; history keeps both.
- B-CONFLICT (the M-SYS-01 example): Sam resolved it on the web at 9:12 while Dana added a photo offline; M-SYS-01 shows Field / Yours / Theirs (Status Open / Resolved Nov 17; Note; Photo 1 added / None); "Keep mine", "Take Sam's", "Decide later". The photo insert itself never conflicts and is kept either way.
- B-VIEWER: viewers cannot resolve ("Only editors can resolve squawks.").

**Map, spine, line ahead:** the spine diamond turns hollow at the resolve date; the related line shows the clearing entry as a stop.

**Acceptance criteria**
- [ ] A resolved squawk always shows the clearing entry or "Resolved without an entry".

### F15 Planning ahead and booking a suggested visit
**Who:** O or E (V views). **Trigger:** owner wants to know what lapses by Mar 1 and book one trip.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-STATUS-01 › SubTabs "Plan ahead" → W-STATUS-03: 24 months on four lines, first 6 at double scale; date marker; "Flying until then 3 h a week". | M-STATUS-01 › "Plan ahead" → M-STATUS-03 with the date scrubber on the horizontal line ahead and 6 / 12 / 24 month segmented control. | Local computation from the snapshot (09 §3.12). |
| 2 | Drag the marker or type Mar 1, 2027: "About 44 hours, so the tach reads about 4256 that day." "By Mar 1, five items will have lapsed unless they are done first." List: VOR Lapsed; Oil, Transponder, Pitot-static, ELT battery Lapses; each with its page and covering visit. "Still in date on Mar 1: the seat-rail AD, with about 12 h to spare, and the annual and ELT inspection, with 152 days. The insurance policy has no date on file, so it cannot be checked." | Same content; rings inside the bracket turn solid where the item will have lapsed. | |
| 3 | Suggested visits beside: "Visit 1, week of Dec 7: Oil and filter (M. Torres) · transponder and pitot-static (AeroCheck Instruments, same field) · clears 3 items before they lapse." "Book this visit". | "Open the Dec 7 visit" → M-STATUS-04: "One visit, four items: three before they come due, and the VOR check that has lapsed." Items with provider and time left, "AeroCheck Instruments did both tests last time, on Dec 3, 2024. Airframe p. 58." "Send to AeroCheck", "Book this visit". | |
| 4 | "Book this visit" → confirm week (Dec 7), optional exact day, provider per item, notes. "Book". | Same sheet. | `visit.create` with `fromSuggestionKey` and item keys (works offline). |
| 5 | The visit shows as Planned on the line ahead; due rows say "In the Dec 7 visit". | Same. | Reminders follow the visit: one reminder Nov 30 ("Your Dec 7 visit: oil, transponder, pitot-static, VOR check"); item lead reminders suppressed. |
| 6 | Optional "Send to AeroCheck": makes a visit link and opens mail prefilled with the list and link. | Share sheet. | `POST /visits/{id}/send` (online). |
| 7 | Visit week: home "In the shop?" prompt on Monday Dec 7: "Is N734DM at the shop this week?" "Yes, it's in the shop" / "Not yet". | Same on M-STATUS-01. | `visit.setStatus in_shop` → situation in_shop. |
| 8 | After the week: "Did the Dec 7 visit happen? Mark what was done and add its pages." VisitChecklist with Mark done per item (F10) and "Close this visit". | Same. | Visit `awaiting_records` the day after the week; `done` when closed; items not done return to suggestions. |

**Branches**
- At risk after a flight (F07): "The oil change now falls two days before the Dec 7 visit." "Move the visit to the week of Nov 30" → `visit.update`.
- Dismiss a suggestion: "Not this one" → hidden until its items or week change.
- Cancel a planned visit: "Cancel this visit" (asks first) → items return to suggestions and reminders resume.
- Item added to two visits (co-owners offline): the second fails "This item is already in the visit for the week of Dec 7." (M-SYS-01).
- Change hours per week to 6: list recomputes; "Use as my usual flying" saves it.
- B-OFFLINE: everything except Send works offline.
- B-VIEWER: sees plans and visits; Book, Send, Move, Cancel hidden.

**Map, spine, line ahead**
- Before: line ahead with rings and two dashed suggested caps; spine bracket today to the horizon.
- During: Plan ahead's tinted bracket from today to Mar 1; spine bracket to Mar 1.
- After booking: the Dec 7 cap is labelled "Planned" (drawing per 10-line-map.md); after closing the visit, each done item's completion appears as a stop (owner note or page) and rings move to their next due; the visit cap disappears.

**Acceptance criteria**
- [ ] Plan ahead numbers for Mar 1 at 3 h a week equal 08-capabilities.md C-PLAN-01 acceptance values.
- [ ] Booking offline then syncing produces one planned visit with the same items on the web.
- [ ] Reminder rules switch from item leads to the visit reminder after booking.

### F16 Preparing for the annual with an IA
**Who:** O (record room is owner-only); E prepares everything else. **Trigger:** annual due Jul 31, 2027; today Jul 2, 2027 (annual-month situation).

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-STATUS-02 (annual month): "The annual is due this month, by Jul 31. Four items can ride along with it in one visit on Jul 14." Line ahead 60 days; "Rides along" list; "Getting ready for the annual" leaf. | M-STATUS-01 in annual-month situation (verdict and rides-along list); "Book this visit". | Situation `annual_month` (09 §3.6). |
| 2 | Maintenance › W-MAINT-04 Annual prep: line ahead to the annual with everything due on the way, the visits that clear it, open squawks as diamonds, recurring AD rings; loose ends: 2 open squawks, airframe pages missing 1983 to 1991 ("Your IA may ask about the gap", "Show on the map"), pages waiting for review, time check "Propeller time since overhaul: written 936.5, calculated 963.5". | Phone: not a separate screen; the annual-month home lists the same loose ends with links. | |
| 3 | Resolve loose ends: review waiting pages (F05), set gap statuses (F06), "Add to the visit" for the seat-rail AD ("saves a second visit, about 51 h before it is due"). | Same actions where available. | |
| 4 | "Book this visit" (as F15) with D. Alvarez, A&P 3105582 IA. | Same. | |
| 5 | "Share with your IA" → W-SHARE-01 with preset "My IA, for the annual": annual checklist, summary, all 5 logbooks with scans, open squawks; expires Aug 14, 2027 (annual + 14 days); opens on the line ahead to the annual. "Make the link". | M-SHARE-01 "My IA, for the annual" → M-SHARE-02 link made with QR. | `POST /record-rooms` (online, owner only). |
| 6 | Print the maintenance summary (W-SHARE-04) for the shop. | Phone: "Share summary" text snapshot. | |
| 7 | After the annual: scan the signed pages (F03) and any AD compliance report into Other; confirm; the annual completes from the confirmed entry. | Same. | Completions from confirmed entries; counters reset; situation returns to attention or all_clear. |

**Branches**
- Annual overdue: situation is attention; verdict leads with the lapsed annual ("The annual lapsed on Jul 31. …") without "grounded".
- No IA provider: "Who does your annual?" asks for a name and certificate (creates a provider).
- Editor at step 5: "Only the owner can make record room links. Ask Dana Morgan." The rest works.
- B-OFFLINE: link creation needs a connection; everything else works.
- Unconfirmed pages at step 5: the room shows confirmed entries only; the hub warns "6 pages are waiting for review and won't appear in the room until you confirm them."

**Map, spine, line ahead**
- Before: line ahead 60 days with the annual interchange proposed on Jul 14 (cap plan) and the rides-along rings.
- After the visit and confirmation: a solid interchange on Jul 14 across airframe, engine and propeller; rings move to next year; spine bracket returns to the 12-month horizon.

**Acceptance criteria**
- [ ] The IA room expires at the annual's due date + 14 days, max 180 days.
- [ ] Annual prep lists every open squawk, every open gap, every pending page and every time check that is "apart".

### F17 Pre-buy dossier and a record room for a buyer
**Who:** O. **Trigger:** selling N734DM; buyer J. Okafor.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Status More menu › "I'm selling N734DM" (optional; the buyer room also triggers the situation). | M-STATUS-01 More › same. | `aircraft.setSituation preparing_sale`. |
| 2 | Home (preparing a sale): "The records are ready to share with a buyer. 6 pages are waiting for review and one gap is unexplained." Checklist: review pages, gap statuses, time checks, documents present. | Same on M-STATUS-01. | |
| 3 | Share › "Pre-buy dossier" → W-SHARE-03: print preview on light paper; page 1 the life map with every gap and overhaul footnoted to pages; then what to investigate, gap audit, squawk record, AD status and equipment, engine history, scope. Banner if unconfirmed entries exist: "Review unconfirmed entries before using this report." | Phone: not offered as a screen; "A buyer, for a pre-buy" builds a room that includes the dossier. | Dossier built from confirmed data only. |
| 4 | "Print or save as PDF" (browser print, light paper whatever the theme). | (none) | |
| 5 | "Share with a buyer" → W-SHARE-01 preset "A buyer": dossier, summary, all logbooks (confirmed entries), documents (choose; default all except insurance), scans off unless added, 30 days, opens on the whole-life map. Label "Pre-buy for J. Okafor". "Make the link". | M-SHARE-01 "A buyer, for a pre-buy" (preview of the room's map cover) → "Make the link" → M-SHARE-02: QR, URL, "Expires Dec 18, 2026, in 30 days · Change", "Opens on: The map of 48 years, then the tabs", "Holds 5 logbooks, 412 pages, 14 documents, and a plain note of the 1983 to 1991 gap". "Send the link" (share sheet). | `POST /record-rooms` audience buyer. |
| 6 | Hub shows the link: opens 3, last Nov 17; view log "Nov 17, 7:42 pm · pre-buy dossier, Engine logbook". "Extend 30 days", "Revoke this link", "See it as J. Okafor". | M-SHARE-01 lists live links with opens; revoke. | Views logged per session. |
| 7 | Recipient: W-SHARE-02 (no account): light binder, map first, then tabs; as-of sentence; gaps stated plainly. | Same page in a phone browser (responsive). | |
| 8 | Sale closes: transfer (F24). | (none) | Transfer revokes all rooms and mechanic links. |

**Branches**
- Editor tries: owner-only message.
- Room for an aircraft with unconfirmed pages: those entries are not in the room; the hub says how many are excluded.
- Link expired: recipient sees "This record room has ended. Ask the owner for a new link."
- Owner revokes after a viewing: immediate.
- B-OFFLINE: link creation and revoke need a connection.

**Map, spine, line ahead**
- The room's cover is the whole-life map in light ink with gaps (and owner gap statuses), overhaul eras and annuals labelled; the dossier page 1 is the same map in print with footnote numbers. The owner's map and line ahead are unchanged.

**Acceptance criteria**
- [ ] The buyer page never shows an `ai_read` entry, scans unless included, squawk reporters unless included, or owner contact details.
- [ ] The dossier prints on light paper in both themes with footnotes quoting the page in Literata.

### F18 Sharing with a co-owner (roles)
**Who:** O invites. **Trigger:** co-owner Sam Reyes needs edit access; IA D. Alvarez needs view access.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-SHARE-01 › "A co-owner or your mechanic" → People: email, role "Can edit" or "Can view", "Invite". | M-SHARE-01 › "A co-owner or mechanic" → invite sheet. | `aircraft_share` insert (online); invitation email (send failure reported, access kept). |
| 2 | Row shows "Invited, not signed in yet" until the invitee signs in with that email. | Same. | Access starts at first sign-in with that address. |
| 3 | Invitee: hangar shows "N734DM · Shared with you, editor". Editor can do everything except record rooms, inviting, transfer, delete. Viewer reads and reports squawks. | Same; the phone mirror syncs the aircraft. | `GET /api/sync/access` adds the aircraft. |
| 4 | Change role: Can edit / Can view toggle on the row. | Same. | Effective on the invitee's next request; phone pull re-evaluates. |
| 5 | Remove: "Remove" (asks first: "Sam Reyes will lose access to N734DM."). | Same. | Share row deleted; the invitee's phone drops the aircraft at next sync: "You no longer have access to N734DM." |
| 6 | Invitee leaves: "Remove from my hangar" (asks first). | Same. | Own share removed. |

**Branches**
- Invitee's offline changes after removal: on reconnect the push returns errors; M-SYS-01 lists them "You no longer have access to N734DM. These changes can't be uploaded." with "Remove from this phone". Never silently dropped.
- Role downgraded to viewer with queued edits: same error per item ("You don't have edit access to this aircraft.").
- Invite to an address with no account: allowed; access begins when they sign up with it.
- B-OFFLINE: invite, role change and remove need a connection.

**Map, spine, line ahead:** unchanged; for the invitee, the aircraft's map and line ahead appear after the first pull.

**Acceptance criteria**
- [ ] RLS, not the UI, enforces roles (tests with a viewer token).
- [ ] Removal is reflected on the invitee's phone without data loss of unsent changes (they are listed, not deleted).

### F19 Answering a question with Ask
**Who:** any role. **Trigger:** "When was the engine last overhauled?"

| # | Web | Phone | System |
|---|---|---|---|
| 1 | RailFoot "Search or ask" (shortcut /) → W-ASK-01; type the question. | M-ASK-01 (header search or Add sheet) → type or dictate. | |
| 2 | While typing: search results (entries matching words) appear at once. | Same; works offline over the local mirror. | Local or server full-text search (existing `search_log_entries`). |
| 3 | Press Enter or "Ask": cited answer in a few sentences with page crops; the matching entries lit as stops on the map (all others hidden): 2004 top overhaul, 2005 major overhaul, 2010 prop overhaul, this year's annual. | Answer with crops; a strip of the whole life with matching stops lit; "On the map" opens M-BOOKS-01 at those years. | `POST /ask` (online, allowance). Answers use confirmed entries; if unconfirmed entries match, the answer says "2 more entries match but aren't confirmed yet." |
| 4 | Click a citation → right leaf shows the page with the quoted ink highlighted. | Tap → page viewer. | |

**Branches**
- B-OFFLINE: "Asking needs a connection. Search still works on this phone." Search results remain.
- B-ALLOWANCE: "You've used today's answers. Search still works."
- No answer in the records: "The confirmed entries don't say. The closest is …" with the nearest results; never invents.
- Question outside the records ("Is it airworthy?"): answers what the records show and states that the app does not decide airworthiness (copy in 12-copy-and-voice.md).

**Map, spine, line ahead:** temporary highlight of matching stops on W-ASK-01 and M-ASK-01 strip; nothing stored.

**Acceptance criteria**
- [ ] Every sentence of an answer that states a fact has a citation.
- [ ] Search returns results offline on the phone.

### F20 Writing and signing a logbook entry, printing the sticker
**Who:** O or E with a signing credential (pilot-owner preventive maintenance, Part 43 App. A). **Trigger:** Dana replaced the cracked nav light lens.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | Add › "Write a logbook entry" (or from Mark done "Write the entry now", or from a squawk) → W-BOOKS-11. | Add › "Write a logbook entry" → phone screen to add (06-mobile-screens.md); same steps. | Draft kept on the device ("Draft kept on this device, saved 2:14 pm"). |
| 2 | Logbook (Airframe), template (one of four: oil and filter, tires, spark plugs, battery; or general preventive maintenance), completed date, tach, hobbs, airframe (prefilled). | Same. | |
| 3 | Work performed generated from the template; editable; "Reset to template wording". Work done by. "Closes squawk: Nav light lens cracked, Oct 21" (optional). | Same. | |
| 4 | Sign: choose credential ("Private pilot, certificate ending 4417"), attestation checkbox, "Send code". | Same. | `POST /signed-entries/challenge`: 8-digit code emailed, 10-minute expiry, bound to the entry values. |
| 5 | Enter the code, "Sign this entry". "Once signed it can't be edited. Mistakes are fixed with a correcting entry." | Same. | Entry stored signed, locked, digest; trust `signed`; squawk resolved with this entry if chosen. |
| 6 | Sticker preview: "Paste it in the Airframe logbook after page 61"; size 3, 4 or 5 in; US Letter or A4; "Print sticker" (print at 100 %). | Phone: "Print sticker" uses the system print dialog (AirPrint / Android print). | Print link `GET /signed-entries/{id}/print-link`. |
| 7 | Stick it in the paper book and sign it by hand. Later, scanning that page links the scan to the signed entry instead of creating a duplicate. | Same. | `signed_entry_scan` link on extraction. |

**Branches**
- Code expired or wrong: "That code has expired. Send a new code." / "That code doesn't match. 2 tries left."; 5 failed attempts block for 10 minutes.
- Values changed after sending the code: the code is invalidated: "You changed the entry. Send a new code to sign this version."
- No signing credential: "Add a certificate to sign entries" → W-ACCOUNT-02.
- Annual or 100-hour selected: not offered ("Annual and 100-hour inspections need the mechanic's own record.").
- B-OFFLINE: drafting works; sending the code and signing need a connection.
- B-VIEWER: not offered.
- Correcting a signed entry: entry detail › "Write a correcting entry" → same flow; original shows "Superseded by a signed correction".

**Map, spine, line ahead**
- After signing: a signed stop on the airframe line at the completed date (diamond trust in its sheet); the squawk diamond turns hollow; if the template completes a tracked item (oil and filter), its ring moves.

**Acceptance criteria**
- [ ] A signed entry cannot be edited or deleted by any role (database trigger).
- [ ] The sticker carries entry ID and digest prefix, a physical signature line, and the return-to-service sentence.

### F21 Document expiry reminder
**Who:** O or E set it up; reminders go to every user with access who has reminders on. **Trigger:** insurance renews annually.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-DOCS-01 › Add a document (insurance policy PDF), type Insurance; "Track expiry" on by default; expiry date (typed); lead 60 days. | M-DOCS-01 › Add (Files, camera) → same fields. | Upload (blob) + `document.setExpiry`; due item `doc:<id>`. |
| 2 | Status due list group "Documents": "Insurance policy, Mar 1, 2027, 103 days, Current". | Same on M-STATUS-01 (Documents group). | Snapshot. |
| 3 | Dec 31, 2026 (60 days before): push and email "N734DM: insurance policy expires Mar 1, 2027, in 60 days. Renew it and add the new policy." Actions "Open", "Remind me Friday". | Lock screen notification (M-SYS-03). | `reminder_log` kind document. |
| 4 | Renew: document › "Renewed" → new expiry (suggested Mar 1, 2028) and new file. | Same. | Old document marked superseded; new due cycle. |

**Branches**
- No date on file: due row "Insurance policy, No date on file, No record" with "Add the expiry date"; no reminder.
- Lapsed: lapse notice on the day after expiry; weekly while lapsed (max 8) if enabled.
- B-OFFLINE: everything except upload of the file (queued as a blob).
- B-VIEWER: sees the item; cannot edit.

**Map, spine, line ahead:** documents are not drawn on book lines (09 §3.4); they appear in the due list only. Unchanged.

**Acceptance criteria**
- [ ] Registration and insurance appear on the due list with the right status from their dates.

### F22 Import (CSV), export and scheduled backups
**Who:** O or E (import, export); backups are per user. **Trigger:** migrating from a spreadsheet; keeping copies.

**Import (web only)**
| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-ACCOUNT-01 › Import a CSV into N734DM: choose file, target logbook (required). | Not available; Settings says "Import a spreadsheet on the web." | `POST /import/csv` (online). |
| 2 | Column mapping proposed ("TT" → Airframe time, "Could also be tach. Same as the Tach column in 171 of 184 rows."); "Dates read as month, day, year. Settled by 03/14/1992 and 07/22/2003." | (none) | AI proposes mapping from header and 5 rows (1 call). |
| 3 | "Check what will be created": count and per-row failures with reasons; "Import". | (none) | Rows converted in code; entries land unconfirmed (no scan). |
| 4 | "184 entries imported. Review them in Review all; they don't change what is due until you do." with "Review" and "Fix duplicates". | (none) | Gap detection waits for confirmation (imported entries are `ai_read`). |

**Export**
| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-ACCOUNT-01 › "Download backup" (.zip, about 1.8 GB), spreadsheets (entries, ADs, equipment, due list), printouts. | Not on phone. | Zip built in the browser (existing). |

**Scheduled backups**
| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-ACCOUNT-01 › Automatic: Dropbox "Connect" (OAuth), cadence monthly; Google Drive likewise. | M-SYS-02 shows status and "Request a backup now" (online). | `backup_schedule`; `POST /backup/run` → "Backup scheduled". |
| 2 | Shows "Last run Nov 1, 2026 · 1.81 GB · finished", next run. | Same status line. | |

**Branches**
- Import refusals: not CSV, header only, over 5 MB or 5,000 rows, no date column, viewer (403): each with its message (existing).
- Every row's date ambiguous: asks once showing both readings.
- B-ALLOWANCE at mapping: "Mapping needs today's allowance. Map the columns yourself." (manual mapping offered).
- Backup failure twice in a row: email; status "Failed Nov 1: <reason>". "Too large to upload" (over 400 MB) points to manual download.
- B-OFFLINE (phone): request a backup needs a connection.

**Map, spine, line ahead:** imported entries appear as hollow stops (unconfirmed) until reviewed; nothing else moves until then.

**Acceptance criteria**
- [ ] Imported entries never change due status before confirmation.
- [ ] Re-importing the .zip creates a new aircraft with completions, providers, visits, gaps and photos.

### F23 MyFlightBook and ADS-B hours suggestions
**Who:** O or E (ADS-B opt-in is editor or owner). **Trigger:** keep hours current without typing.

**MyFlightBook**
| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-ACCOUNT-02 › MyFlightBook card › "Connect" (authorize in MyFlightBook). | M-SYS-02 shows the card status; connect on the web. | OAuth grant; card state "Granted, no readings yet". |
| 2 | Readings arrive nightly; card "Connected as dmorgan · Last sync Nov 2, 2026 · 3 flights brought in as hour readings". | Same status. | `hours_reading` source `myflightbook`; snapshot. |
| 3 | A lower candidate reading: hold for review "MyFlightBook sent tach 421.2, lower than 4212.4. A missing digit, a correction, or a new meter?" with "Use 4212.4 (ignore)", "It's a correction", "Record a meter replacement". | Same prompt in M-AIRCRAFT-01. | Held reading not applied until decided. |

**ADS-B**
| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-AIRCRAFT-01 › "Look for my flights in ADS-B data" (off by default; Mode S code from the registry). | M-AIRCRAFT-01 same toggle. | `aircraft.adsb_enabled`. |
| 2 | Next day: "Tach read 4212.4 on Nov 14. ADS-B has seen 3 flights since, about 4.2 h. Nov 15 KBED to KORH 1.3 h · Nov 16 KORH to KBED 1.2 h · Nov 17 local 1.7 h. Airborne time, not tach time." "Enter the real tach", "Dismiss". | Same card on M-AIRCRAFT-01 and a quiet line on M-STATUS-01. | Daily check 17:30 UTC; never written automatically. |
| 3 | "Enter the real tach" → reading form prefilled with the suggestion (editable) → save. | Opens M-FLIGHT-03 prefilled; or photograph the tach (F07). | `reading.create` source manual (the suggestion itself stays `adsb_estimate`, never counted). |

**Branches:** MyFlightBook revoked: card "Revoked in MyFlightBook. Connect again."; ADS-B no Mode S code: "Add the Mode S code from your registration to look for flights."; B-VIEWER: sees suggestions, cannot record.

**Map, spine, line ahead:** readings move hours rings (line ahead); ADS-B suggestions move nothing until a real reading is saved.

**Acceptance criteria**
- [ ] ADS-B estimates never change status, projections or reminders.
- [ ] A MyFlightBook reading lower than the current one is never applied without the owner's choice.

### F24 Transferring ownership
**Who:** O only. **Trigger:** sale closed.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-AIRCRAFT-05 › "Transfer to a new owner": new owner's email; "Keep me as a viewer" checkbox (off). | Phone: M-AIRCRAFT-01 shows "Transfer or delete on the web." | |
| 2 | Summary: "N734DM and all its records move to buyer@example.com. 1 record room link and 0 mechanic links will be revoked. You lose access unless you keep viewer access." Suggest "Download a backup first". "Transfer N734DM". | (none) | |
| 3 | Confirm dialog repeats the email; "Transfer". | (none) | `POST /transfer` → `transfer_aircraft()`; rooms and links revoked by trigger; optional viewer share for the old owner. |
| 4 | Hangar no longer lists it (or lists it as "Shared with you, viewer"). | The old owner's phone drops the aircraft at next sync (or keeps it read-only). | New owner's reminders begin; old owner's reminders stop. |

**Branches**
- No account for the email: "No MyTailLog account uses buyer@example.com. Ask them to sign up first, then try again." (existing rule).
- Own email: "You already own this aircraft."
- Editors and viewers of the aircraft keep their shares (the new owner can remove them); the screen says so.
- B-OFFLINE: web only; needs a connection.
- Old owner's unsent phone changes: listed in M-SYS-01 with "You no longer have access to N734DM." (if not kept as viewer).

**Map, spine, line ahead:** unchanged for the records; the new owner sees the same map and line ahead.

**Acceptance criteria**
- [ ] All record rooms and mechanic links of the aircraft are revoked at transfer.
- [ ] Planned visits, gaps, providers and completions move with the aircraft.

### F25 Deleting an aircraft
**Who:** O only. **Trigger:** the owner removes an aircraft they no longer want in MyTailLog.

| # | Web | Phone | System |
|---|---|---|---|
| 1 | W-AIRCRAFT-05 › "Delete N734DM": "This removes 412 page scans, 212 entries, 14 documents, 11 tracked items and the live record room link. It can't be undone. Download a backup first." | Phone: "Transfer or delete on the web." | Counts from the server. |
| 2 | Type the tail number; the button "Delete N734DM and its records" enables only on an exact match (case-insensitive). | (none) | |
| 3 | Click; progress "Deleting scans…"; then the hangar. | (none) | `DELETE /api/aircraft/{id}` with `confirmTail`; storage objects removed, then the row (cascade); change_log D rows. |
| 4 | Toast "N734DM and its records were deleted." | Phones of every user with access drop it on next sync: "N734DM was deleted by its owner." | |

**Branches**
- Demo aircraft: not deletable; "Remove from my hangar" instead.
- Shared aircraft (you are editor or viewer): only "Remove from my hangar".
- Storage deletion partly fails: the row is still deleted; orphaned objects are removed by the storage health job; the owner sees success (no records remain reachable).
- Co-owners' unsent phone changes: M-SYS-01 "N734DM was deleted. These changes can't be uploaded." with "Remove from this phone".
- B-OFFLINE: web only.

**Map, spine, line ahead:** the aircraft and all its drawings are gone.

**Acceptance criteria**
- [ ] Deletion requires the typed tail and is owner-only (RLS and route check).
- [ ] No scan, photo or document of the aircraft remains readable after deletion (signed URLs expire; storage objects removed).

---

## 4. Open questions
1. F09: a VOR check logged outside tolerance is recorded as done but kept in alarm until a passing check. Confirm this is the wanted behaviour (alternative: refuse to reset the counter).
2. F04 and F20 on the phone: first read and "Write a logbook entry" need phone screen IDs; 06-mobile-screens.md should assign them (proposed M-BOOKS-08 First read, M-BOOKS-09 Write an entry, M-FLIGHT-05 Add oil, M-MAINT-04 Find ADs).
3. F24 and F25 are web-only in this spec; App Store rules require account deletion in the app, not aircraft deletion, so this is allowed. Confirm owners accept it.
4. F13: whether a viewer's squawk should notify the owner immediately (push) rather than in the daily digest.
5. F15 step 7: the "Is N734DM at the shop this week?" prompt is a decision made here; it could be noisy for owners who never use visits (shown only for booked visits).
6. F17: whether "I'm selling" should also be offered from the Share hub, not only the home's More menu.
