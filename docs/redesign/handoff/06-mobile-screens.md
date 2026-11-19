# 06 · Mobile screens

Every phone and tablet screen of the native MyTailLog apps (SwiftUI on iOS and iPadOS, Jetpack Compose on Android), specified screen by screen: purpose, how you get there, layout from top to bottom with sizes in pt (iOS) and dp (Android; the numbers are the same), the data each region shows, every state (loading, empty, offline, syncing, conflict, viewer role, unconfirmed data), gestures and interactions, exact copy, and where iOS and Android should differ while keeping D's visual language (coloured section tabs, white leaves, the ink map, Literata for paper text, vermilion status). Screens use the canonical ids from the writers' brief (M-… phone, T-… tablet) and reference their mockup figures in `docs/redesign/d/mobile.html` (d-m-…, d-t-…) and `docs/redesign/b/mobile.html` (b-m-…, b-t-…). Screens the native apps need that the mockups do not show are added with new ids (listed in §12 for the lead). Architecture, sync, notifications, widgets and platform services are in 05-mobile-architecture.md; components in 02-components.md; tokens in 01-design-tokens.md; map geometry in 10-line-map.md; copy rules in 12-copy-and-voice.md; flows in 07-flows.md. The document ends with a coverage table mapping every capability of today's mobile app to its new screen (§11).

Mock data throughout is the brief's: today Wednesday Nov 18, 2026; N734DM, 1978 Cessna 172N; owner Dana Morgan.

## Contents
1. Conventions shared by every screen
2. Navigation map
3. Getting in: M-AUTH-01, M-HANGAR-01, M-HANGAR-02, M-HANGAR-03, M-SWITCH-01
4. Status: M-STATUS-01 to M-STATUS-08
5. Maintenance: M-MAINT-01 to M-MAINT-07
6. Logbooks, scanning and review: M-BOOKS-01 to M-BOOKS-09, M-SCAN-01 to M-SCAN-04, M-REVIEW-01 to M-REVIEW-03
7. Add, flights and Ask: M-FLIGHT-01 to M-FLIGHT-05, M-ASK-01
8. Aircraft, documents and sharing: M-AIRCRAFT-01 to M-AIRCRAFT-06, M-DOCS-01 to M-DOCS-03, M-SHARE-01 to M-SHARE-03
9. Tablet: T-STATUS-01, T-STATUS-02, T-BOOKS-01, T-REVIEW-01 and the tablet mapping of every other screen
10. System and native-only: M-SYS-01 to M-SYS-09
11. Coverage: today's mobile app → new screens
12. Screens added to the canonical list
13. Open questions

---

## 1. Conventions shared by every screen

### 1.1 Anatomy of a top-level phone screen (reference width 390pt; every size scales with Dynamic Type / font scale where it holds text)
| Region | Size | Content | Component |
|---|---|---|---|
| Status bar | system | Over the board colour; light content on every board except Logbooks (dark content) | — |
| PhoneHeader | 96 expanded, 52 collapsed (iOS) / 64 collapsed (Android) | Row 1: SyncLine — tail number 14/600, chevron 16, then "· synced 9:38" 14/500, on-section-2, the whole line one button (min 44 tall). Row 2: board title, type.board-title 28/800, on-section. Right: search square 44×44, white at 20% over the board, radius.m, icon search 20. Padding 8 top, 16 sides, 16 bottom. Collapses on scroll: title moves inline beside the tail at 17/800. | PhoneHeader, SyncLine (05 §30) |
| SubTabs (when the tab has views) | 36 visual, 44 hit; 16 side margin; 10 below | A segmented control on the board in leaf colour: e.g. Map · Pages · Review 6; Items · ADs · Squawks 2 | SubTabs (phone) |
| OfflineBar / ConflictBar (conditional) | 36, full width, under the header | See §1.3 | OfflineBar (05 §30) |
| PhoneLeaf | fills to the tab bar; inset 8 from the screen edges; radius.s top corners; padding 20 top, 16 sides | The screen's content, scrolling inside the leaf. The board colour shows in the 8pt margins. | PhoneLeaf |
| AddButton | 60×60, radius 6, ink fill, icon plus 28 white; 16 from the leaf's right edge, 16 above the tab bar | Opens the Add sheet (M-FLIGHT-01). Shown on top-level screens of Status, Logbooks, Maint. and Aircraft; hidden on Share, on pushed screens and while the keyboard is up. Hidden for viewers except that Add then offers only "Report a squawk". | AddButton |
| PhoneTabBar | 50 tall + bottom safe area (≈84 total on Face ID iPhones; gesture inset on Android), cover ground | Five equal tabs with 4pt gaps and 8pt side padding: Status (list-checks), Logbooks (book-open), Maint. (wrench), Aircraft (plane), Share (share-2). Each tab is its section colour block, radius 0 0 5 5, icon 22 above label 12/700. The active tab is 58 tall, raised 8 into the leaf, radius.l on all corners. Inactive tabs at full colour with label in on-section-2. Counts (§1.3) sit as a 18pt alarm or ink badge at the icon's top right. | PhoneTabBar |

Icons: the Lucide glyphs shipped as vector assets on both platforms (01-design-tokens.md §8, 02-components.md §2.6); SF Symbols / Material Symbols only for chrome the OS draws (system back, share, menus). Never emoji, never glyph characters.

### 1.2 Pushed screens, sheets and full-screen covers
- **Pushed screens** (detail and task screens inside a tab) keep the tab bar visible unless the spec says "full screen". The bar is the board colour; iOS uses the system navigation bar tinted to the board (back button with the previous screen's title, interactive edge swipe); Android uses a Material 3 `TopAppBar` in the board colour with `arrow_back` and the previous title as the content description. The screen title is type.heading 18/800 inline (iOS `.navigationBarTitleDisplayMode(.inline)`; Android title style titleMedium in Libre Franklin 800). A right-side tail badge (the tail number in a 1pt on-section outline, 13/700) appears where the mockups show it (b-m-squawk-words).
- **Full-screen covers** hide the tab bar: cameras (M-SCAN-02, M-FLIGHT-02, squawk photo), Search and Ask (M-ASK-01), Review (M-REVIEW-01..03). Their header is the cover colour (setup section) with Cancel or back at top left.
- **Sheets**: iOS `.sheet` with the detents named in each spec, visible drag indicator, a Close button (44×44, top trailing) and leaf background; Android Material 3 `ModalBottomSheet` (task sheets) or `BottomSheetScaffold` (map sheets, non-modal), with the platform drag handle and corner radius, leaf container colour, and a Close icon button. A sheet with unsaved input asks before dismissing (iOS `confirmationDialog`; Android `AlertDialog`): "Discard this <thing>?" with **Discard** (alarm text) and **Keep editing**.
- **Destructive confirmation**: iOS `confirmationDialog` with a destructive button; Android `AlertDialog` with the confirm button in alarm text. Copy states what goes and whether it can be undone.
- **Toasts**: a 48pt ink bar with on-ink text above the tab bar for 6 s (10 s with an action, 20 s with a screen reader; 11 §11), with an optional action ("Undo"); announced to VoiceOver/TalkBack. iOS custom overlay; Android Material `Snackbar` restyled (ink container, leaf text).

### 1.3 Sync and offline state, everywhere inside an aircraft
**SyncLine** (second half of the tail line):
| State | Text | Colour |
|---|---|---|
| Synced within the last 24 h | "synced 9:38" (today) / "synced yesterday 18:02" | on-section-2 |
| Synced earlier | "synced Nov 16" | on-section-2 |
| Syncing | "syncing" with a 12pt activity indicator | on-section-2 |
| Offline, nothing waiting | "offline" with wifi-off 14 | on-section-2 |
| Changes waiting (online or offline) | "3 waiting" with cloud-upload 14 | on-section-2 |
| A conflict to decide | "1 to decide" | white text on a 3pt-radius alarm slip |
| Last sync failed (server or auth) | "sync failed" | white text on an alarm slip |
| Never synced | "not synced yet" | on-section-2 |
Tapping the SyncLine opens the AircraftSwitcher sheet (M-SWITCH-01), whose first row is the sync row with **Sync now**.

**OfflineBar** (36pt, cover ground, on-cover text 14/600, icon 16): shown under the PhoneHeader of top-level screens when offline **or** when anything waits. Copy: offline with changes "3 changes on this phone. They upload when you have signal." · offline without changes "Offline. Everything here works except reading pages and Ask." · online with changes "Uploading 3 changes" (with progress) · pages held "2 pages on this phone. They upload when you have signal." Tap opens M-SYS-01.

**ConflictBar** (36pt, alarm-bg ground, #7a1707 text 14/600; dark: alarm-bg dark with #ffb3a3): "1 change needs you to decide." + **Compare** (text button). Shown on every top-level screen of the aircraft while a conflict waits; replaces the OfflineBar.

**Tab badges**: Status shows an alarm badge with the overdue count (1); Logbooks an ink badge with pages waiting for review (6); Maint. an ink badge with open squawks marked Ground (only Ground; others are counted in the tab's own view); no badges on Aircraft or Share. Badges are read after the tab label ("Status, 1 overdue").

### 1.4 Row-level states
| State | Shown as |
|---|---|
| Value comes from a change on this phone not yet uploaded | PendingCaption under the row's meta line: cloud-upload 14 + "On this phone" (ink-3); for a derived change, the cause: "Moved by your flight, on this phone" (b-m-home-offline) |
| A conflict touches this row | PendingCaption in alarm: "Changed in two places" + chevron; tap opens the conflict (M-SYS-01) |
| A change to this row was refused | PendingCaption in alarm: "Not saved: <reason>" |
| Read by AI, not confirmed | TrustMark dotted "Read by AI"; the row never contributes to due, forecasts, widgets, notifications or shares (rule 2); stops on the map are hollow with a dotted outline (`stop unconf`) |
| Confirmed by you / signed by a mechanic | TrustMark filled dot / diamond, only where trust matters (entries, citations, review) |

### 1.5 Roles
- **Owner and editor**: everything in this document.
- **Viewer**: edit controls are **hidden**, not disabled: no AddButton menu items except "Report a squawk", no Mark done, no swipe actions that change data, no Edit buttons, no review outcomes (Review is read-only: the page and fields with their trust marks). One line at the end of each top-level leaf, type.small ink-3: "You can view N734DM. Dana Morgan can make changes." Share shows only "Share a summary" and the people list (read only). If a viewer reaches an edit route by deep link: "You don't have edit access to N734DM." with **Close**.
- **Demo aircraft** (N734DM for new accounts, `aircraft.is_demo`): read-only like a viewer, with the line "This is the demo aircraft. Add your own from the hangar." and the button **Add your aircraft**.

### 1.6 Standard states
- **Loading** from the mirror is effectively instant; screens never show spinners for local data. While the very first sync runs (no rows yet), screens show the shape of their content in leaf-2 blocks (no animation with Reduce Motion) and one line: "Getting N734DM's records onto this phone. 120 of 212 entries." 
- **Empty**: each screen defines its EmptyState: one sentence saying what is missing and one button to fix it.
- **Error** (a local read fails, which should never happen): "Something went wrong reading this phone's copy." + **Rebuild from the server** (opens Settings at that row). Logged.
- **Online-only control while offline**: shown, disabled, with a one-line reason under it (05 §6.5 has the copy).

### 1.7 Gestures (summary; each screen lists its own)
| Gesture | Where | iOS | Android |
|---|---|---|---|
| Pull to refresh | Every top-level leaf | `.refreshable`; runs push then pull; toast "Up to date. Synced 9:41." or "Offline. Showing what's on this phone." | `PullToRefreshBox`, same |
| Swipe a DueRow right | Status, All items | leading swipe action **Mark done** (ink) | AnchoredDraggable reveal, 96dp, same action |
| Swipe a row left | Squawks, readings, held pages | trailing actions (Resolve / Delete), destructive asks first | AnchoredDraggable reveal; Delete asks first |
| Long press a row | Every list | `.contextMenu` with the row's actions and a preview | `DropdownMenu` anchored at the row, with a LONG_PRESS haptic |
| Swipe back | Pushed screens | interactive edge swipe | system back gesture with predictive animation (M-SYS-07) |
| Swipe between pages | Review, visit cards, page viewer | horizontal paging | `HorizontalPager` |
| Pinch / double-tap | Scans, map | zoom (scan 1–5×; map time zoom) | same |
Every swipe action is also in the long-press menu and an accessibility action.

### 1.8 Controls by platform (D's look on both)
| Control | iOS | Android |
|---|---|---|
| Buttons | D Button (52 tall primary ink, secondary leaf with rule-2 border, hue, alarm) built as `ButtonStyle`s | D Button built on `Button`/`OutlinedButton` with D colours and radius.m; ripple in ink at 12% |
| Segmented | D SubTabs/Segmented (custom; system `Picker(.segmented)` cannot take D's colours) | D Segmented (custom on `SingleChoiceSegmentedButtonRow` restyled) |
| Toggle | `Toggle` with `.tint(ink)` | `Switch` with D colours (checked track ink) |
| Date | `DatePicker` `.compact` in forms (opens the graphical calendar) | Material 3 `DatePickerDialog` from a field |
| Choice lists | `Menu` / `Picker(.menu)` for short lists; a searchable pushed list for long ones (entries) | `ExposedDropdownMenuBox` for short; a searchable full-screen list for long ones |
| Text fields | D TextInput (16pt+, 44 tall min) | `OutlinedTextField` restyled (rule-2 border, ink focus) |
| Context menu | `.contextMenu` | `DropdownMenu` |
| Alerts | `alert` / `confirmationDialog` | `AlertDialog` |
| Progress | D progress bars (ink on leaf-2), no spinners for local work | same |

### 1.9 Notices (in-app announcements)
An admin announcement (`announcement` table: title ≤ 120, body ≤ 500, optional link) appears as the first row of the Status leaf and the Hangar: a leaf-2 Well with title 16/700, body 16, **Read the announcement** (if a link) and a Dismiss icon button (44×44, "Dismiss this notice"). Dismissal is stored per account (shared with the web). Never floats over content.

---

## 2. Navigation map

| Id | Screen | Tab / place | Presentation | Entry points |
|---|---|---|---|---|
| M-AUTH-01 | Sign in | — | root (signed out) | launch signed out; sign-out |
| M-HANGAR-01 | Hangar | — | root above the tabs (iOS: full-screen; Android: start destination when no aircraft) | M-SWITCH-01 "All aircraft"; launch with no aircraft |
| M-HANGAR-02 | Add an aircraft | — | sheet (large) | Hangar "Add an aircraft"; empty hangar |
| M-HANGAR-03 | First setup (added) | — | pushed, full screen | after M-HANGAR-02 |
| M-SWITCH-01 | Aircraft switcher (added) | global | sheet (medium, large) | tap the SyncLine on any screen |
| M-STATUS-01 | Status home | Status root | tab root | Status tab; launch; widget tap |
| M-STATUS-02 | Home situations | Status root | variants of M-STATUS-01 | — |
| M-STATUS-03 | Plan ahead | Status | pushed | line ahead tap; "Plan ahead" row; T-STATUS |
| M-STATUS-04 | Suggested visit | Status | pushed | visit cap; Plan ahead; VISIT notification |
| M-STATUS-05 | Item detail | Status | pushed | DueRow tap; Spotlight; DUE notification "Open" |
| M-STATUS-06 | Mark done | Status | sheet (large) | item detail; swipe; DUE notification "Mark done" |
| M-STATUS-07 | VOR check log | Status | pushed | VOR item "Log a VOR check"; Add sheet (if tracked) |
| M-STATUS-08 | All items (added) | Status | pushed | "See all 11 items"; deep link `/due` |
| M-MAINT-01 | ADs | Maint. › ADs | tab view | Maint. tab |
| M-MAINT-02 | Squawk detail | Maint. | pushed | squawk row; notification |
| M-MAINT-03 | New squawk | global | full-screen cover (photo) then pushed (words) | Add sheet; Maint. › Squawks "+"; intent |
| M-MAINT-04 | Tracked items (added) | Maint. › Items | tab view | Maint. tab |
| M-MAINT-05 | Squawks (added) | Maint. › Squawks | tab view | Maint. tab |
| M-MAINT-06 | AD detail and compliance (added) | Maint. | pushed | AD row; Find ADs result |
| M-MAINT-07 | Find ADs (added) | Maint. | pushed | ADs "Find ADs for this aircraft" |
| M-BOOKS-01 | Map | Logbooks › Map | tab root | Logbooks tab |
| M-BOOKS-02 | Stop sheet | Logbooks | map sheet | tap a stop |
| M-BOOKS-03 | Visit cards | Logbooks | map sheet | tap an interchange |
| M-BOOKS-04 | Gap | Logbooks | map sheet | tap a dashed gap |
| M-BOOKS-05 | One book | Logbooks › Map | filter state | book filter |
| M-BOOKS-06 | Books and pages | Logbooks › Pages | tab view | Pages segment |
| M-BOOKS-07 | Entry | Logbooks | pushed | stop sheet "Open"; search; citation |
| M-BOOKS-08 | Entries as a list (added) | Logbooks › Map | alternate view | "List" toggle on the map |
| M-BOOKS-09 | Write a logbook entry (added) | Logbooks | pushed | Add sheet; entry "Create correction" |
| M-SCAN-01 | Choose the logbook | global | sheet (medium) | Add sheet; Pages "Scan pages"; gap "Scan these pages"; intent |
| M-SCAN-02 | Camera | global | full-screen cover | M-SCAN-01 "Open the camera" |
| M-SCAN-03 | Queue (pages in progress) | Logbooks | pushed | camera "Done"; Live Activity; Pages banner |
| M-SCAN-04 | Pages-read notification | system | notification and Live Activity | — |
| M-REVIEW-01 | Review a page | Logbooks › Review | full-screen pushed | Review segment; PAGES_READ; queue |
| M-REVIEW-02 | Doubtful field | Review | state of M-REVIEW-01 | tap a field |
| M-REVIEW-03 | Next page | Review | state of M-REVIEW-01 | "Confirm page and next" |
| M-FLIGHT-01 | Add sheet | global | sheet (medium) | AddButton; ⌘N |
| M-FLIGHT-02 | Photograph the tach | global | full-screen cover | Add › Log a flight; Control; widget; intent |
| M-FLIGHT-03 | Confirm the flight | global | pushed in the cover | after the photo or "Type it" |
| M-FLIGHT-04 | Saved | global | replaces M-FLIGHT-03 | Save flight |
| M-FLIGHT-05 | Add oil (added) | global | sheet (medium) | Add › Add oil; intent |
| M-ASK-01 | Search and Ask | global | full-screen cover | search square; ⌘K |
| M-AIRCRAFT-01 | Aircraft | Aircraft root | tab root | Aircraft tab |
| M-AIRCRAFT-02 | Hours and readings (added) | Aircraft | pushed | "Hours" group |
| M-AIRCRAFT-03 | Equipment (added) | Aircraft | pushed | "Equipment" group |
| M-AIRCRAFT-04 | Weight and balance (added) | Aircraft | pushed | W&B row |
| M-AIRCRAFT-05 | Oil and engine (added) | Aircraft | pushed | "Oil" row |
| M-AIRCRAFT-06 | Aircraft details (added) | Aircraft | pushed | "Details" row |
| M-DOCS-01 | Documents and carry-aboard | Aircraft | pushed | Aircraft "Documents" row |
| M-DOCS-02 | Document viewer (added) | Aircraft | pushed | a document row |
| M-DOCS-03 | Add a document (added) | global | sheet (large) | Add sheet; Documents "Add a document"; share extension |
| M-SHARE-01 | Who is it for | Share root | tab root | Share tab |
| M-SHARE-02 | Link made | Share | pushed | "Make the link" |
| M-SHARE-03 | Links and people (added) | Share | pushed | Share "Live links", "People" |
| M-SYS-01 | Waiting to upload, conflict | global | pushed (from any tab) | SyncLine sheet; OfflineBar; ConflictBar; CONFLICT notification |
| M-SYS-02 | Settings | global | pushed | switcher sheet; Hangar avatar |
| M-SYS-03 | Lock screen, widget, notifications | system | — | — |
| M-SYS-04 | Permissions onboarding (added) | global | full-screen cover | first aircraft; first camera use |
| M-SYS-05 | Notification settings (added) | Settings | pushed | Settings › Reminders |
| M-SYS-06 | Widget configuration (added) | system | iOS widget edit / Android config activity | adding or editing a widget |
| M-SYS-07 | Android predictive back (added) | — | behaviour | — |
| M-SYS-08 | iPad and tablet keyboard and pointer (added) | — | behaviour | — |
| M-SYS-09 | Watch and Wear complication (optional, added) | — | — | — |

---

## 3. Getting in

### M-AUTH-01 Sign in
Mockup: b-m-signin.
**Purpose.** Sign in or create an account, Apple first, Google second, email link third, password one tap away.
**Entry.** Launch while signed out; after sign-out; after a session cannot be refreshed ("You've been signed out. Sign in again to keep syncing." shown as the first line).
**Layout** (setup section; the cover of the binder):
| Region | Size | Content |
|---|---|---|
| Board (setup #3a3f46) | top 46% of the screen | The six SectionTab colour blocks as a vertical stack at the right edge (decorative, 24 wide, hidden from accessibility); wordmark "MyTailLog" 34/800 on-section at 24 from the left, 120 from the top; below it type.lede 20/400 on-section-2, max 3 lines |
| Leaf | from 46% to the bottom, inset 8, radius.s top | padding 24 top, 16 sides |
| Apple button | 52, full width | **Continue with Apple** (iOS: `SignInWithAppleButton(.continue)`, style `.black`; Android: D primary button with the Apple logo, opens the OAuth Custom Tab) |
| Google button | 52, full width, 12 below | **Continue with Google** (secondary style with the Google "G" mark per Google's branding rules) |
| Divider | 20 above and below | "or with your email" type.caption ink-3 centred between two rules |
| Email field | 52 | label "Email", keyboard email, autofill `.username`/`emailAddress` |
| Primary | 52, 12 below | **Email me a sign-in link** (icon mail) |
| Quiet link | 44 | **Use a password instead** |
| Footer | type.small ink-3, centred | "Free and open source. The paper logbooks stay the record." |
**After "Email me a sign-in link"**: the leaf shows "Check your email" 18/800, "We sent a link and a 6-digit code to dana@example.com. Open the link on this phone, or type the code." a 6-box code field (`.oneTimeCode` autofill on iOS; SMS/email retriever not used), **Sign in**, quiet **Send it again** (enabled after 30 s, shows "Sent again at 9:41"), quiet **Use a different email**.
**Password mode**: Email, Password (`.password` / `.newPassword` content types), primary **Sign in**, quiet **Create an account**, quiet **Forgot your password?** (sends a reset code), quiet **Email me a link instead**. Create an account adds "Your name" and shows the password rule inline ("At least 8 characters").
**Copy** (exact): lede "Your aircraft's logbooks, photographed and read into an index you can search, with what is due worked out from them." Errors: offline "Signing in needs signal. Try again when you have it." · wrong code "That code didn't match. Check the newest email, or send it again." · expired code "That code has expired. Send a new one." · Apple/Google cancelled: no message · provider error "Apple sign-in didn't finish. Try again, or use your email." · account linked elsewhere "This sign-in belongs to another account. Sign in with your original email and connect it again."
**States.** Busy: the tapped button shows a 16pt progress indicator and "Signing in" and other buttons disable. Offline: the buttons stay enabled; the error above appears on tap. Passkeys (phase 2, 05 §8.2): a **Sign in with a passkey** button appears above Apple once the account has one, and the system passkey sheet is offered automatically on focus of the email field (iOS `ASAuthorizationController` with `performAutoFillAssistedRequests`, Android Credential Manager `GetCredentialRequest` with passkey and password options).
**iOS.** Keyboard avoidance scrolls the leaf so the primary stays visible. The board is hidden at AX sizes so the buttons start at the top.
**Android.** Sign in with Google uses Credential Manager's bottom sheet; if the user has no Google account on the device, it falls back to the OAuth Custom Tab. Apple uses a Custom Tab. Back from the code step returns to the email step (not out of the app).
**Accessibility.** Reading order: wordmark, lede, Apple, Google, email field, primary, password link, footer. The decorative tabs are hidden. Code boxes are one field to assistive tech ("6-digit code").
**Acceptance.**
- [ ] Apple, Google, email link, email code and password each sign in on both platforms.
- [ ] An email link opened on a different device is completed by typing the code.
- [ ] No error string from the auth service is shown raw.
- [ ] Info messages are never shown in the alarm colour.
- [ ] All targets ≥ 44pt / 48dp; email and code fields are 16pt or larger.

### M-HANGAR-01 Hangar
Mockup: b-m-hangar.
**Purpose.** Every aircraft the owner can open, each in one sentence, sorted by what needs attention; add an aircraft; import a backup; account.
**Entry.** M-SWITCH-01 "All aircraft"; launch when the user has no aircraft yet or chose "Open the hangar on launch" (Settings); M-AUTH-01 after first sign-in with no aircraft.
**Layout** (setup board):
| Region | Size | Content |
|---|---|---|
| Header | 96 | Row 1: SyncLine without a tail: refresh-cw 14 + "Synced 9:38" (tap = Sync now). Row 2: "Hangar" 28/800. Right: account square 44×44 with the initials "DM" 16/700 (opens M-SYS-02). |
| Leaf | rest | padding 20/16 |
| Notice | optional | §1.9 |
| Aircraft rows | min 116 each, 2pt ink rule between | Per aircraft: tail 22/800 + StatusMark word right-aligned ("1 lapsed" overdue slip / "2 coming due" due-soon ring / "Nothing due soon" current dot / "No record" dashed); make-model-year 14 ink-3 with "Demo" tag (13/700, rule-2 outline) when `is_demo`; the Verdict sentence 16; a meta line type.small ink-3 "6 pages to review · 2 open squawks"; for shared aircraft "Shared with you as an editor". A thin spine strip (24 tall) of the aircraft's whole life as the row's header (d-w-hangar idea; phone keeps it optional at compact sizes: shown when the width ≥ 375 and text size ≤ XL). |
| Import row | 64 | archive icon, "Import a backup" 16/700, "A MyTailLog export, or a CSV of entries" 14 ink-3, chevron. |
| Primary | 52, pinned 16 above the bottom safe area | **Add an aircraft** (icon plus) |
**Data.** `aircraft` (tail_number, make, model, year, is_demo), the user's role per aircraft, status summary per aircraft from `core:rules` (worst status, Verdict), counts: pages with `review_status` waiting, open squawks.
**Sort.** Overdue first, then due soon, then needs information, then current; ties by tail number.
**States.** Empty (signed in, no aircraft, after the first sync): leaf shows "No aircraft yet." 20/800, "Add yours by tail number. The FAA registry fills in the rest." and **Add an aircraft**; below, "The demo aircraft N734DM is here to look around." if the demo exists. First sync running: §1.6. Offline: "Synced Nov 16 · offline" in the header; Add an aircraft and Import disabled with "Adding an aircraft needs signal." Conflict: ConflictBar under the header.
**Interactions.** Tap a row → that aircraft's Status (tab state preserved per aircraft). Long press → menu: Open, Make this the widget's aircraft, "Remove from my hangar" (shared aircraft only: leaves the share after confirmation "Remove N4321J from your hangar? Sam Reyes can invite you again."). Pull to refresh = sync. Import a backup → file picker (zip, csv) (05 §17).
**iOS.** Presented as the root under the `TabView` when no aircraft is selected; otherwise pushed full screen from the switcher with a Close button (returns to the last aircraft).
**Android.** A destination outside the tab graph; system back from the hangar returns to the last aircraft, or leaves the app if none.
**Accessibility.** Each aircraft row is one element: "N734DM, 1978 Cessna 172N, demo. One check has lapsed, for IFR only. Next is an oil change, in 9.7 hours. 6 pages to review, 2 open squawks." Actions: Open, Remove (shared only).
**Acceptance.**
- [ ] The sync time is always stated; never a bare "Synced".
- [ ] Rows sort by worst status, then tail.
- [ ] A second aircraft can be added from the phone.
- [ ] Viewer and editor aircraft show the role line.

### M-HANGAR-02 Add an aircraft
Mockup: b-m-add-aircraft.
**Purpose.** Enrol an aircraft from its tail number with the FAA registry; name the five logbooks before committing.
**Entry.** Hangar "Add an aircraft"; empty hangar.
**Presentation.** Sheet, large detent; Close top trailing.
**Layout.**
| Region | Size | Content |
|---|---|---|
| Title | 18/800 | "Add an aircraft" |
| Tail field | 52, type 22/700 upper-cased, keyboard ASCII capable, autocapitalisation characters | label "Tail number"; leading "N" is added if missing for US marks; trailing **Look it up** (secondary s, 44 tall) |
| Result card (Well) | auto | badge-check icon + "Found in the FAA registry" 14/700; KeyValueList: Aircraft "1978 Cessna 172N", Serial "17269841", Engine "Lycoming O-320-H2AD", Registered to "Dana Morgan" |
| Logbooks note | type.small | "It starts with five logbooks: Airframe, Engine, Propeller, Avionics and Other. You can rename or add volumes later." |
| Buttons | 52 primary + 44 quiet | **That's my aircraft** · **Try another tail number** |
**States.** Looking up: button shows progress + "Looking it up". Not found: "The FAA registry has no match for N12345 right now. You can add it anyway and fill in the details." + **Add N12345 anyway** (then fields Make, Model, Year, Serial number, Engine as TextInputs). Already in the hangar: "N734DM is already in your hangar." + **Open it**. Offline: Look it up disabled, line "Adding an aircraft needs signal." Adding: "Adding N734DM" with progress; failure "Couldn't add it. Check your signal and try again."
**Data.** `POST /api/registry` then `POST /api/aircraft/enroll` (online only, never queued; 05 §6.5).
**After success.** The sheet closes and M-HANGAR-03 First setup opens for the new aircraft.
**iOS / Android.** Tail field uses `.textInputAutocapitalization(.characters)` / `KeyboardCapitalization.Characters`; Return/IME action "Search" runs the lookup.
**Acceptance.**
- [ ] Nothing is created until "That's my aircraft".
- [ ] A registry miss can still add the aircraft by hand.
- [ ] The control is disabled with a reason offline.

### M-HANGAR-03 First setup (added; the phone version of W-SETUP-01)
**Purpose.** Get the first verdict in under two minutes: today's meters, the last annual, then Status.
**Entry.** After M-HANGAR-02; Status "Finish setup" row while setup is incomplete.
**Layout** (pushed, setup board, title "Set up N734DM"; Stepper 1 of 3 at the top of the leaf, 3 dots + "Step 1 of 3"):
1. **Today's meters**: "What do the meters read today?" MeterStepper for Tach and Hobbs (M-FLIGHT-03's control, starting empty with the keypad up), quiet **Photograph the tach** (opens M-FLIGHT-02 in setup mode), "Not this time" on Hobbs. Primary **Next**.
2. **The last annual**: "When was the last annual?" two choices as large rows: **Find it on a page** (camera: photograph the sign-off page; it uploads and is read; online) / **Type the date** (DatePicker, month and year required, day optional "the end of the month is used"). Quiet **Skip for now**. Primary **Next**.
3. **Your first verdict**: the Verdict and line ahead for the aircraft as computed, "Your four Part 91 items are set up. Add more in Maintenance." Primary **Open Status**; secondary **Scan the first logbook** (M-SCAN-01).
**States.** Offline: step 2 "Find it on a page" holds the photo and says "It's read when you have signal. Type the date for now if you know it." Read result arrives later as a review item.
**Acceptance.**
- [ ] Each step can be skipped and resumed from Status "Finish setup".
- [ ] The annual read from a photo is only used after the owner confirms the entry (rule 2).

### M-SWITCH-01 Aircraft switcher (added; phone version of W-SWITCH-01)
**Purpose.** Change aircraft in place, see sync state, and reach the hangar, Settings and Waiting to upload from any screen.
**Entry.** Tap the SyncLine (tail line) on any screen inside an aircraft.
**Presentation.** iOS sheet detents `.medium`, `.large`; Android `ModalBottomSheet`.
**Layout.**
| Region | Size | Content |
|---|---|---|
| Sync row | 64 | Left: "Synced 9:38" 16/700 + "Nothing waiting" 14 ink-3 (or "3 changes waiting", "1 change needs you to decide" in alarm, "Offline since 8:52"). Right: **Sync now** (secondary s). Tap the row (not the button) → M-SYS-01. |
| Aircraft list | 64 per row | For each aircraft: tail 18/800, model 14 ink-3, StatusMark word right; the current one has a check and leaf-2 ground. |
| Row | 52 | house icon "All aircraft" → M-HANGAR-01 |
| Row | 52 | settings icon "Settings" → M-SYS-02 |
**Interactions.** Tap an aircraft: the sheet closes and the same tab and sub-view open for that aircraft (pushed screens are cleared). Sync now: runs and shows progress in the row.
**Acceptance.**
- [ ] Settings and Sync now are reachable in two taps from any aircraft screen (critique #3).
- [ ] Switching keeps the current tab.

---

## 4. Status

### M-STATUS-01 Status home
Mockup: d-m-status (settled; B's b-m-home plus the line ahead).
**Purpose.** Answer "what do the records say is due" in one sentence, show the next twelve months on the logbook lines, and list what needs attention, worst first.
**Entry.** Status tab; launch; widget tap; WhatsDue intent "Open".
**Layout.**
| Region | Size | Content |
|---|---|---|
| PhoneHeader | 96 | "N734DM ⌄ · synced 9:38" / "Status" / search square |
| OfflineBar or ConflictBar | 36 | §1.3 |
| Leaf | | padding 20/16 |
| Notice | optional | §1.9 |
| Verdict | type.lede 20, lead phrase 800, max 4 lines | "**One check has lapsed**, IFR only. Two of the next three fit one visit." |
| Freshness line | type.small ink-3, only if the last successful pull is > 6 h old | "From records synced Nov 16, 6:02 PM." |
| LineAhead | full leaf width × 168 | Four lines (Airframe, Engine, Propeller, Avionics; the Other logbook is never drawn) at fixed rows 28 apart, solid up to today then dotted (future); today marked at the left edge; 12 months to the right; rings at each due item's projected date on its book's line (status by ring style); suggested visits as dashed caps spanning the lines they cover, labelled ("One visit, Dec 7"); the annual cap labelled "Annual". Axis labels type.map 12: "Today", one mid month, the end month ("Nov 2027"). Geometry from `core:map` (10-line-map.md, line ahead, phone). |
| Groups | | Group header 14/700 ink-3 with a 2pt ink rule under it, 16 above. Groups in order: **Overdue**; the near horizon titled per 12-copy-and-voice.md (mock: "Before the new year"); **Later** with a count. Empty groups are omitted. |
| DueRows | min 58 | Title 16/700 ("VOR check"); meta 14 ink-3: LineChip (book) · due date or tach · qualifier ("IFR only"); right: value 15/700 ("9.7 h", "43 days") over status word 13 ("Due soon"), or an overdue slip ("lapsed 7 days ago"). Both limits when the item has both: "tach 4222.1 · about Dec 12" with "first" on the earlier one (see 02-components.md, DueRow). |
| Later group | first item only | then a row "See all 11 items" (16/700, chevron) → M-STATUS-08 |
| Facts outside the due list | rows in the Overdue or near group when present | Open squawks marked **Ground** ("Left brake feels soft · Ground · reported Nov 8"), missing carry-aboard documents ("Registration isn't in Documents"), one-time ADs not yet complied with. They are named, not counted into the Verdict's tracked-item numbers, and the Verdict appends a clause when one exists ("A squawk is marked Ground."). Fixes critique #4. |
| Situation rows | conditional | "6 pages wait for review. 4 read cleanly." → Review; "Finish setup" (setup incomplete) → M-HANGAR-03 |
| Boundary line | type.small ink-3, once, at the end | "Worked out from your confirmed entries. The paper logbooks are the record." |
| AddButton, PhoneTabBar | | §1.1 |
**Data.** `maintenance_item` (label, kind, regulatory, interval_months, interval_hours, last_done_date, last_done_hours, next_due_date, next_due_hours, meter), recurring and one-time `ad_compliance` (status, recurring, next_due_date, next_due_hours, complied_date, complied_hours, reference, title), `document` expiries (registration, insurance), `squawk` (severity ground, status open), latest `hours_reading`, recent flying pace (for "about <date>"), suggested visits (`core:rules`) and booked visits (09-data-and-api.md). Only confirmed entries move anything (rule 2). The due-soon window per item comes from 08-capabilities.md.
**States.**
- Loading: §1.6.
- No tracked items: Verdict "**Nothing is tracked yet.** Set up the standard inspections to see what's due." + **Set up the standard inspections** (`mx.seedStandard`) and the line "Scan the logbooks so we can find when they were last done." with **Scan pages** (M-SCAN-01).
- Situations: M-STATUS-02.
- Offline: OfflineBar; values moved by local changes carry "Moved by your flight, on this phone" (b-m-home-offline).
- Conflict: ConflictBar; the affected row shows the alarm PendingCaption.
- Viewer: no AddButton (or Add with only Report a squawk), no swipe Mark done; viewer line at the end.
- Unconfirmed data present: never counted; the "6 pages wait for review" row appears.
**Interactions.**
- Tap the line ahead (empty area) → M-STATUS-03. Tap a ring → that item (M-STATUS-05). Tap a dashed cap → M-STATUS-04. Hit regions ≥ 44pt; overlapping rings open a small menu listing them.
- Tap a DueRow → M-STATUS-05. Swipe right → **Mark done** (M-STATUS-06). Long press → Mark done · Plan a visit · Open the page · Copy.
- Pull to refresh = sync. Scrolling collapses the header; the line ahead scrolls with the leaf.
**Copy.** Verdict sentences come from `core:rules` and 12-copy-and-voice.md; mock examples: "One check has lapsed, IFR only. Two of the next three fit one visit." / "Nothing tracked is overdue, and nothing comes due before the end of February." Group "Overdue". Row values "lapsed 7 days ago", "9.7 h", "43 days", "Due soon". "See all 11 items".
**iOS.** The leaf is a `ScrollView` with a `LazyVStack` (not `List`, to keep D's rules and margins); swipe actions use a custom `SwipeRow` matching system timings; `.contextMenu(menuItems:preview:)` previews the item's page.
**Android.** `LazyColumn` with `AnchoredDraggable` rows; long press opens a `DropdownMenu`; the header uses `exitUntilCollapsed`.
**Accessibility.** Order: board title "Status" (heading), Verdict, freshness line, the line ahead as one element with a summary ("Line ahead, next 12 months. Suggested visit December 7: oil, transponder and static. Annual July 31.") and an adjustable action that steps between rings, then the rows with actions Mark done, Plan a visit, Open the page.
**Acceptance.**
- [ ] The Verdict is the first readable content and is never pushed below the fold at default text size (a notice is capped at 3 lines, then "More").
- [ ] Items with both limits show both and name the first.
- [ ] Squawks marked Ground and missing carry-aboard documents appear as named rows.
- [ ] Unconfirmed entries never change any row, ring or the Verdict.
- [ ] The line ahead and rows match the web's W-STATUS-01 for the same data (fixture test).

### M-STATUS-02 Home situations
Mockups: b-m-home-clear, b-m-home-offline (and the web's W-STATUS-02).
**Purpose.** The home changes with the aircraft's situation. Same screen and regions as M-STATUS-01; only the Verdict, the line-ahead window and the first rows change.
| Situation | Trigger (`core:rules`) | Verdict (example) | Below the line ahead |
|---|---|---|---|
| All clear | nothing overdue, nothing in the near horizon | "**Nothing tracked is overdue**, and nothing comes due before the end of February." | Group "Coming up · 11 tracked" with the next three items; the line "Tach 4231.6, read Jan 16. Flying about 3 hours a week, nothing on the hours side comes due before April."; secondary full-width **Log a flight** (plane-landing). |
| Offline with changes waiting | offline and the outbox is not empty | the normal Verdict recomputed with local changes ("The oil change is now 7.3 hours away.") | OfflineBar "3 changes on this phone. They upload when you have signal."; affected rows show "Moved by your flight, on this phone"; a group "Waiting to upload" with **See all**, listing up to 3 changes by label and time ("Flight, tach 4212.4 to 4214.8 · 9:20", "Oil added, 1 qt · 9:20", "Photo on "Left brake feels soft" · 9:31") → M-SYS-01. |
| Annual month | the annual is not overdue and is due within 60 days (09 §3.6) | "**The annual is due by Jul 31.** Four items ride along." | Line ahead zoomed to the next 60 days with the annual interchange and what rides along; row **Share with your IA** → M-SHARE-01 with the IA preset. |
| In the shop | the owner set "In the shop", or a visit has status `in_shop` (09 §3.6) | "**N734DM is at AeroCheck Instruments** for the transponder and static checks, since Dec 7." | The visit's items, each with Mark done; primary **Scan the new pages** (M-SCAN-01). |
| Preparing a sale | a record room with the buyer preset is live | "**The buyer's record room is open** until Dec 18. Opened 3 times." | Pages waiting for review and gaps ("The 1983 to 1991 airframe gap is noted in the room.") with **Review the 6 pages**. |
**Acceptance.**
- [ ] Each situation is chosen by 09 §3.6's rule; the owner can set or clear "In the shop" and "Preparing a sale" by hand.
- [ ] Offline, every local change shows on the home at once, labelled as on this phone.

### M-STATUS-03 Plan ahead
Mockup: d-m-plan.
**Purpose.** Pick a date and the hours you expect to fly; see what will have lapsed by then and which visit covers each item. Replaces Forecast and Pick a date.
**Entry.** Tap the line ahead on Status; "Plan ahead" in a DueRow's menu; deep link `/plan?date=`.
**Layout** (pushed; back "Status"; title "Plan ahead"; trailing hours chip "+44 h" with chevrons-up-down):
| Region | Size | Content |
|---|---|---|
| Horizon | (none) | 24 months, fixed, first 6 months at double scale (14-decisions.md D5) |
| Pace | type.small ink-3 | "3 h a week" (tap opens the hours sheet) |
| LineAhead with DateScrubber | full width × 220 | Lines and rings as on Status; suggested visits as caps ("Visit Dec 7", "Visit Feb 8"); approximate labels ("AD ≈ Mar 28"); a vertical marker at the chosen date with a 44×44 handle and its date label ("Mar 1"); the `win` bracket from today to the marker; rings inside the bracket turn solid where the item will have lapsed by the marker. |
| Statement | type.lede 20 | "By **Mar 1**, at about tach 4256, five items lapse unless the two visits happen." |
| Table | rows 58 | Header "Lapsed by Mar 1" and "covered by" (type.label). Rows: item 16/700; meta LineChip · due 14; right: the covering visit "Dec 7 visit" (link) or "No visit yet" (ink-3). |
| Close behind | type.small | "Close behind: seat-rail AD, 11.9 h left on Mar 1." |
| Primary | 52, pinned above the tab bar | **Open the Dec 7 visit** (merge icon) when a suggested visit covers the first item; otherwise **Remind me Feb 22** (a reminder one week before the date; enqueues a dated reminder, 09) |
**Hours sheet** (tap "+44 h"; medium detent): "Hours by Mar 1" MeterStepper in whole hours (default pace × weeks), "Your recent pace is about 3 hours a week.", **Use this**.
**Data.** `core:rules` planAhead(date, hours) over confirmed data; visits from suggestions and bookings.
**Interactions.** Drag the marker (snaps to days; selection haptic per ring crossed); tap an axis month to jump; tap a row → M-STATUS-05; tap a visit → M-STATUS-04. Changing the horizon keeps the marker if it is still inside, else moves it to the horizon's end.
**States.** Nothing lapses: "By Mar 1, nothing tracked lapses." and only "Close behind" shows. A document without a date: "The insurance policy still has no date on file." with **Add date** (M-DOCS-02). Viewer: no Remind or Book. Offline: works fully.
**iOS.** Custom drag gesture; VoiceOver adjustable action moves one week, a custom rotor "Months" moves a month; announces "March 1. Five items lapse."
**Android.** `detectHorizontalDragGestures`; semantics `setProgress` so TalkBack's adjust gestures move a week.
**Acceptance.**
- [ ] Hours projections never move a calendar limit; the earlier limit decides.
- [ ] Calendar-month items lapse at the end of their month.
- [ ] Statement, rings and table agree for every date in the horizon (fixture test against the web).

### M-STATUS-04 Suggested visit
Mockup: d-m-suggest.
**Purpose.** One proposed shop visit: what rides along, who did it last and on which page; book it or send the list to the shop.
**Entry.** A dashed cap on any line ahead; Plan ahead; VISIT notification "Plan the visit".
**Layout** (pushed; back "Plan ahead" or "Status"; title "Week of Dec 7"; status word "Suggested", "Planned", "In the shop" or "Awaiting records"):
| Region | Size | Content |
|---|---|---|
| Statement | type.lede 20 | "One visit, four items: three before they come due, and the VOR check that has lapsed." |
| Mini line ahead | full width × 120 | only the lines in the visit (Engine, Avionics): today, the visit cap, the following month; rings labelled "Oil, about Dec 12", "VOR lapsed", "Transponder, static" |
| Group | | "In this visit" with "about half a day" at right (ink-3) |
| Rows | 58 | "Oil and filter change" · Engine · due tach 4222.1 · M. Torres · 9.7 h; "Transponder test, 91.413" · Avionics · due Dec 31 · AeroCheck · 43 days; "Pitot-static and altimeter" · Avionics · 91.411 · IFR only · AeroCheck · 43 days; "VOR check" · Avionics · log it yourself that day · Lapsed (slip) |
| Proof | type.small + PageCite | "AeroCheck Instruments did both tests last time, on Dec 3, 2024." "Airframe p. 58" |
| Buttons | 52 + 52, pinned | secondary **Send to AeroCheck** · primary **Book this visit** |
**Book this visit** (sheet, medium): "Which week?" date field (default the suggestion), "Where?" a Select of service providers (default the provider of the main item; "Add a shop" at the end), **Book it**. Enqueues `visit.create` (works offline). Reminders then follow the visit ("Your visit at AeroCheck is next Monday.").
**Send to AeroCheck** (planned visits only, online): makes a 30-day mechanic link (09 §4.12) and opens the share sheet with the list (tail, owner, items with due dates and last-done page citations) and the link, email prefilled to the shop if its address is known. Never sends by itself.
**States.** Planned: status "Planned"; buttons **Change** · **Cancel the visit** (quiet; asks "Cancel the Dec 7 visit? The items stay on your due list.") · primary **Mark items done** (M-STATUS-06 for each in turn). Viewer: read-only. Offline: booking queues with toast "Booked on this phone. It uploads when you have signal."
**Acceptance.**
- [ ] A suggestion is never booked without the owner's tap.
- [ ] Each item names who did it last and cites the page.

### M-STATUS-05 Item detail
Mockups: d-m-item (transponder), b-m-item (oil).
**Purpose.** One tracked item: its limits, when it is due, the page that set the clock, and its whole history as stops on one line.
**Entry.** A DueRow; a ring; Spotlight; DUE notification "Open the page" (scrolls to the page section).
**Layout** (pushed; back "All items" or "Status"; title the item name; status word at trailing, e.g. "Due soon" with its mark):
| Region | Size | Content |
|---|---|---|
| Rule line | 14 ink-3 | "91.413 · every 24 calendar months" / "Every 50 hours on the tach · advisory" |
| KeyValueList | rows 32 | Due "Dec 31, 2026 · 43 days"; hours items: Due "tach 4222.1 · 9.7 h left" and About "Dec 12, at 3 hours a week"; Last done "Dec 3, 2024 at 4131.5"; Usually "AeroCheck Instruments" (the most frequent signer). Both limits shown when present, "first" on the earlier. |
| The page that says so | | Heading 16/700 + TrustMark ("Confirmed by you"); a SourceMat crop of the last completion's entry with the ink highlighted, its Literata transcription below (type.paper-small 15), PageCite "Engine logbook, page 38". Tap → the full page in the ScanViewer. |
| History line | vertical, 64 per stop | "Every check since 2008 · 9 pages"; a vertical line in the book's ink, newest at the top under a ring "Due Dec 31, 2026"; one stop per completion labelled "Dec 3, 2024 · tach 4131.5 · p. 58"; interval labels at right ("24 mo"); a late renewal in alarm text "Jan 20, 2015 · 20 days late · p. 46". Tap a stop → its page. For oil: earlier completions as rows "May 9, 2026 at 4131.5 · With compressions 76/74/75/77 over 80 · Engine p. 36". |
| Do these together | Well, optional | merge + "Do these together: pitot-static is due the same day." → M-STATUS-04 |
| Buttons | 52 + 52, pinned | secondary **Plan a visit** (or **Edit item** for items the owner defined) · primary **Mark done** |
**Data.** `maintenance_item` or `ad_compliance`; completions from confirmed `log_entry` rows linked to the item (09); their pages.
**States.** No completion on record: "No page shows this being done yet." + **Find it in the logbooks** (M-ASK-01 prefilled with the item name); Mark done stays. Unconfirmed completion found: a hollow stop "Read by AI, not yet confirmed" + **Review it**; the due date does not move. Page not cached and offline: "This page isn't on this phone yet. It downloads when you have signal." VOR item: primary **Log a VOR check** (M-STATUS-07). Viewer: no buttons.
**Acceptance.**
- [ ] The due date carries a PageCite to the entry that set it.
- [ ] The history shows intervals and flags any late renewal.
- [ ] Mark done is one tap away.

### M-STATUS-06 Mark done
Mockup: b-m-mark-done.
**Purpose.** Record that an item was done: date, the meter it counts on, the reading, notes, and the entry that records it, with the new due point shown before committing.
**Entry.** Item detail; swipe on a DueRow; DUE notification "Mark done" (opens the app with this sheet over the item).
**Presentation.** Sheet, large detent; title "Mark done"; Close.
| Region | Size | Content |
|---|---|---|
| Item line | 14 ink-3 | "Oil and filter change · every 50 hours" |
| Date | Field 52 | "Date", default today (local); no future dates |
| Counted on | Segmented | "Tach · Hobbs" (hours items only; default the item's `meter`) |
| Reading | MeterStepper | "Tach when done" + caption "last read Nov 14"; default the latest reading unless it is estimated, then empty |
| Notes | TextInput, 3 lines | placeholder "What was done, oil used, findings" |
| Link the logbook entry | row 58 | paperclip + "Link the logbook entry" / "Pick it now, or after you scan the page" → searchable entry picker (pushed; confirmed entries, the item's book and ±60 days of the date first) |
| Preview | Well | "Next due at tach **4262.4**, about mid-March. The signed entry in the engine log stays the record." (live) |
| Primary | 52, above the keyboard | **Mark done** |
**After.** The sheet closes; toast "Oil and filter change marked done. Next due at tach 4262.4." with **Undo** (removes the queued mutation if unsent, else enqueues the reversal); the item and Status update at once.
**States.** Offline: toast adds "Saved on this phone." Item not on the phone yet: "This item isn't on this phone yet. Sync, then mark it done." + **Sync now**. Reading lower than the last: soft alarm slip "That's lower than the last tach reading (4212.4). Check the number." (saving still allowed).
**Data.** `mx.complete {itemId, date, hours, tach|hobbs, description, logbookId?, entryId?}` with `base`.
**Acceptance.**
- [ ] The preview's due point equals what Status shows after saving.
- [ ] Dates are local calendar dates.
- [ ] Undo works from the toast and from M-SYS-01 while unsent.

### M-STATUS-07 VOR check log
Mockup: b-m-vor.
**Purpose.** Log a VOR check with the four things 91.171(d) asks for.
**Entry.** VOR item primary; Add sheet "Log a VOR check" (shown when the aircraft tracks it).
**Layout** (pushed; title "Log a VOR check"):
| Region | Size | Content |
|---|---|---|
| Intro | type.small | "91.171(d) asks for these four in the aircraft log or another permanent record. Last one: Oct 12," + PageCite "Airframe p. 61" |
| Date | Field | default today |
| Kind of check | Segmented | "VOT · Ground · Airborne · Dual" (sets the tolerance) |
| Place | TextInput | label "Place", e.g. "Home field VOT, 108.0 MHz"; remembers the last value |
| Bearing error | MeterStepper, whole degrees, −10 to +10 | label "Bearing error, within 4° for a VOT" (±4° VOT and ground; ±6° airborne; dual: 4° between receivers). Outside: soft alarm slip "Outside the 4° allowed for a VOT. Log it anyway, and have the receiver checked." |
| Signature | SignaturePad 140 tall, **Clear** | label "Signature" |
| Primary | 52 | **Save VOR check** |
| Next due | type.small | "Next due Dec 18, 2026" |
**Data.** Enqueues `vor.log` (or `mx.complete` with `{kind, place, bearingError, signature}` per 09), which writes an entry in the Airframe book, as today.
**Acceptance.**
- [ ] Save stays disabled until date, place, bearing error and signature are present.
- [ ] The saved entry appears on the Airframe line with the signature image.

### M-STATUS-08 All items (added; the phone due list)
Mockup: b-m-due.
**Purpose.** All tracked items by horizon with both limits, filterable by status, with Mark done in place.
**Entry.** "See all 11 items" on Status; deep link `/due`.
**Layout** (pushed; title "All 11 items"):
| Region | Size | Content |
|---|---|---|
| Filter chips | 36 visual, 44 hit, horizontal scroll | "All 11" · "1" with the overdue slip · "3" with the due-soon ring · "1" with the dashed ring; each chip has an accessible name ("Overdue, 1") |
| Groups | | Overdue · Before the new year · Later 6 · No record |
| DueRows | 58 | Limit icon before the meta (calendar for a date, gauge for tach or hobbs, file-text for a document); **Mark done** (secondary s, with check icon) on rows in the first two groups; documents without a date show **Add date** |
| Suggestion | Well in the group | merge + "Do these together. AeroCheck did both on Dec 3, 2024." → M-STATUS-04 |
**Interactions.** Swipe right = Mark done; long press menu; chips filter. Toolbar text button **Manage items** → M-MAINT-04.
**Acceptance.**
- [ ] Every row shows the icon of the limit that applies and both values when it has both.
- [ ] Document expiries are on the same list.

---

## 5. Maintenance
The Maint. tab has three views in SubTabs: **Items · ADs · Squawks 2** (the count is open squawks). It opens on the view last used; the first time, on Squawks if any is open, otherwise Items. Board colour maint (teal).

### M-MAINT-01 ADs
Mockup: b-m-ads.
**Purpose.** The AD and SB register: whether each applies, recurs, when it was complied with and on which page, or why it does not apply.
**Entry.** Maint. tab › ADs; Status rows for ADs.
**Layout.**
| Region | Size | Content |
|---|---|---|
| PhoneHeader | 96 | "N734DM ⌄ · synced 9:38" / "Maintenance" / search |
| SubTabs | 36 | Items · **ADs** · Squawks 2 |
| AD rows | auto, min 88 | Line 1: "AD 2011-10-09 · Seat rails" 16/700 + StatusMark word right ("Current" dot / "Due soon" ring / "Overdue" slip / "Complied" ink-2 check / "Not applicable" ink-3). Line 2 (16, ink-2): "Recurring, every 100 hours. Complied Jul 14, 2026 at 4168.3; next at tach 4268.3, 55.9 h." Line 3: PageCite "Airframe p. 60" and, for recurring ADs, **Record compliance** (secondary s). For a recurring AD a 24pt-tall strip of its compliance stops on its book line (d-w-ads idea), shown when text size ≤ XL. |
| Not applicable rows | | "Reason: a different pump part number is installed." |
| Find row | 64 | "Find ADs for this aircraft" 16/700 / "FAA list for the 172N and O-320-H2AD" 14 ink-3 / chevron → M-MAINT-07 |
| AddButton, PhoneTabBar | | |
**Data.** `ad_compliance` (kind AD/SB, reference, title, applicability, recurring, interval_hours, interval_months, status, method, complied_date, complied_hours, next_due_date, next_due_hours, reference_entry_id, reason), `ad_reference` (official title and abstract when synced).
**Sort.** Overdue, due soon, current recurring, complied one-time, not applicable; then by reference.
**States.** Empty: "No ADs are tracked yet." + **Find ADs for this aircraft** + quiet **Track an AD by number**. AD read by AI from a page but not confirmed: listed in a group "Found in your logbooks" with TrustMark "Read by AI" and **Review** (not counted). Offline: everything works except Find. Viewer: no Record compliance, no Add.
**Interactions.** Tap a row → M-MAINT-06. Record compliance → M-MAINT-06 scrolled to the compliance form. Long press → Record compliance · Open the page · Copy the AD number.
**Acceptance.**
- [ ] Each AD states whether it recurs, its last compliance with a page citation, or its reason for not applying.
- [ ] AD numbers can be selected and copied.

### M-MAINT-02 Squawk detail
Mockup: b-m-squawk-detail.
**Purpose.** One squawk: what was noticed, its photos, who reported it; send it to the mechanic as a link; resolve it by naming the entry that cleared it.
**Entry.** Squawks list; Status Ground row; notification; deep link.
**Layout** (pushed; back "Squawks"; title area: status and severity "Open · Low"):
| Region | Size | Content |
|---|---|---|
| Title | 22/800 | the first line of the description as written ("Nav light lens cracked") |
| Meta | 14 ink-3 | "Reported Oct 21 by Dana · 1 photo" |
| Photos | 120 tall strip, 4:3 thumbnails, 8 gap | tap opens full screen with pinch zoom; **Add a photo** tile (dashed, camera icon) when editable |
| Description | 16 | the full text, selectable |
| When it is fixed | group header | |
| Link the entry | row 58 | "Link the entry that cleared it" / "Pick it from the logbook, or add it later" → entry picker |
| Send note | type.small ink-3 | "Sending makes a link with the photo and these words. M. Torres can open it without an account; it expires in 30 days." |
| Buttons | 52 + 52, pinned | secondary **Send to mechanic** (icon send) · primary **Mark resolved** |
**Mark resolved** (sheet, medium): "When was it fixed?" date (default today), "Which entry cleared it?" (entry picker; "Not in the logbook yet" allowed), "What was done" (TextInput, optional, saved as `resolution_notes`), **Resolve**. Toast "Resolved. Undo".
**Send to mechanic** (sheet, medium): recipient name (default the last mechanic, "M. Torres"), expiry (7 / 30 / 90 days, default 30), what to include (photos on, description on), **Make the link** → the link appears with **Copy** and **Share** (system share sheet). Calls the mechanic-link route (online only, 09 §5.3); offline the button is disabled with "Making a link needs signal." and the choices are kept.
**Resolved state.** Header "Resolved · Low"; "Resolved Nov 2 · cleared by" PageCite to the entry; buttons **Reopen** (secondary) and **Edit**. Overflow menu: Edit, Delete ("Delete this squawk? Resolving keeps its history; deleting removes it." → **Delete** alarm).
**Data.** `squawk` (description, severity, status, reporter_name, reported_at, resolved_at, resolved_log_entry_id, resolution_notes) and squawk photos (09).
**States.** Offline: all actions queue. Conflict on this squawk: ConflictBar with Compare. Viewer: can read, can add a squawk elsewhere, cannot resolve, edit or send.
**Acceptance.**
- [ ] Resolving asks for the date and offers the clearing entry; resolution notes can be written.
- [ ] The mechanic link opens without an account and expires.
- [ ] Delete asks first and explains the difference from resolving.

### M-MAINT-03 New squawk: photo then words
Mockups: b-m-squawk-photo, b-m-squawk-words.
**Purpose.** File a squawk at the aircraft with gloves on: a photo first (skippable), then words (typed or dictated), then a plain severity choice.
**Entry.** Add sheet "Report a squawk"; Squawks "+"; `ReportSquawkIntent`; viewer Add.
**Step 1, photo** (full-screen cover, camera ground): header Cancel (x) left, "New squawk" centre; line "Photograph it first. You can skip this." under the header; live preview; bottom bar: **Library** (image icon, left), shutter 72 (centre), **Skip photo** (pencil icon, right). Up to 4 photos: after a shot, a thumbnail strip with count and **Next** replaces Skip.
**Step 2, words** (pushed in the cover; back "Photo"; title "New squawk"; tail badge "N734DM"):
| Region | Size | Content |
|---|---|---|
| Photos | 70 tall | thumbnails + dashed add tile |
| What did you notice? | TextInput 4 lines, 17 | placeholder "e.g. Left wingtip nav light lens is cracked" ; autofocus when there is no photo |
| Dictation | 44 row | mic button 44 round in maint colour + "Tap to speak" → "Listening. Tap to stop." (iOS `SFSpeechRecognizer` on-device when available, `requiresOnDeviceRecognition = true`; Android `SpeechRecognizer` with `EXTRA_PREFER_OFFLINE`); the keyboard's own dictation also works |
| How serious is it? | SeverityPicker, rows 58 | radio rows: **Low** "Fix at the next convenient visit" · **Watch** "Look at it before each flight" · **Ground** "You won't fly until it is looked at". Nothing selected by default. |
| Primary | 52, pinned above the keyboard | **Add squawk** (disabled until there is text or a photo, and a severity) |
**After.** The cover closes; toast "Squawk added to N734DM." (+ "Saved on this phone." offline); the squawk appears at the top of Squawks; a Ground squawk also appears on Status.
**Data.** `squawk.create {id, description, severity, reportedAt}` then `squawkPhoto.create` per photo (file jobs, 05 §7.2) with `depends_on`.
**States.** Camera denied: "MyTailLog needs the camera to photograph the squawk." **Open Settings** · **Skip photo**. Microphone/speech denied: the mic button hides; keyboard dictation remains.
**iOS / Android.** Library uses `PhotosPicker` / the system photo picker (no storage permission). Discarding with text present asks "Discard this squawk?".
**Accessibility.** Severity is a radio group with each meaning read after the name. The shutter is "Take photo".
**Acceptance.**
- [ ] A squawk can be filed with no photo, and with up to 4.
- [ ] Severity has no default.
- [ ] Works fully offline; photos upload later.

### M-MAINT-04 Tracked items (added; phone version of W-MAINT-06)
**Purpose.** Set up what is tracked: add, edit or delete inspections and recurring items, set intervals, seed the Part 91 set, scan the logs for completions.
**Entry.** Maint. › Items; All items "Manage items".
**Layout.** Rows per item: name 16/700, rule 14 ink-3 ("Required · every 12 calendar months" / "Advisory · every 50 hours"), next due right. Chips "All 11 · Required 7 · Advisory 4". Buttons at the end: secondary **Add an item**; quiet **Find completions in the logbooks** (online AI scan; offline "Reading your logbooks needs signal.").
**Item editor** (pushed form; title "New item" / item name): What (menu of standard kinds: Annual inspection, 100-hour inspection, Transponder, Pitot-static and altimeter, ELT inspection, ELT battery, VOR check, Oil and filter change, Engine TBO, Propeller overhaul, Something else); Name; Required by regulation / Advisory (Segmented); Every … months (number) and Every … hours (number), at least one; Counts hours on (Tach / Hobbs); Last done (date) and At … hours; Notes; live preview Well "Next due works out to Jul 31, 2027, or tach 4268.3, whichever is first."; primary **Add item** / **Save changes**; quiet **Delete this item** (asks "Delete the annual inspection? Its history in the logbooks stays.").
**Empty.** "Nothing is tracked yet." + **Set up the standard inspections**.
**Acceptance.**
- [ ] The preview shows both limits and which comes first before saving.
- [ ] Deleting asks first; logbook entries are never deleted with an item.

### M-MAINT-05 Squawks (added; the list behind b-m-squawk-detail)
**Purpose.** Open and resolved squawks.
**Entry.** Maint. › Squawks.
**Layout.** Groups: **Waiting to upload** (unsent new squawks, PendingCaption) · **Open 2** · **Resolved 1** (collapsed, tap to expand). Row: 12pt severity mark (Ground = alarm slip with the word, Watch = alarm ring + word, Low = ink dot + word), description (full text, 16, up to 3 lines then "More"), meta "Watch · 10 days ago · Dana · 1 photo" with a 44×44 photo thumbnail at right. AddButton opens M-MAINT-03 directly (not the Add sheet) on this view.
**Interactions.** Tap → M-MAINT-02. Swipe left reveals **Resolve** (ink): opens the Mark resolved sheet prefilled with today (never resolves silently, fixes critique #17). Long press: Resolve · Send to mechanic · Copy · Delete (asks).
**Empty.** "Nothing open. Report one with the add button when you notice something."
**Acceptance.**
- [ ] Swipe to resolve opens a confirmation sheet with the date and entry.
- [ ] Unsent squawks are listed and labelled.

### M-MAINT-06 AD detail and compliance (added)
**Purpose.** Read the AD, record compliance with date, hours, method and the proving entry; set it recurring or one-time; retire it with a reason.
**Entry.** AD row; Record compliance; Find ADs result "Track this AD".
**Layout** (pushed; title "AD 2011-10-09"; subtitle the subject "Seat rails"):
- Status block: StatusMark + sentence ("Recurring, every 100 hours. Next at tach 4268.3, 55.9 h, about Apr 2027.").
- Official text: the synced `ad_reference` title and abstract (16), "Read the full AD" (opens the FAA page in the in-app browser; offline: "The full text isn't on this phone yet.").
- Compliance history: rows "Jul 14, 2026 · tach 4168.3 · inspection" + PageCite.
- **Record compliance** form (inline, expands): Complied on (date), At tach (MeterStepper), How it was complied with (Menu: Inspection, Replacement, Modification, Not applicable, Other + text), Logbook entry that records it (entry picker), Related equipment (picker of `component`), Notes. Primary **Save compliance**.
- Settings: One-time / Recurring (Segmented) + Every … hours / months; Status (Applies / Not applicable with **Why** required).
- Quiet **Stop tracking this AD** (asks; explains it leaves the history).
**Data.** `ad_compliance`, `ad_reference`, `component`. Mutations `ad.upsert`, `ad.delete`, `ad.track`.
**Acceptance.**
- [ ] Not applicable requires a reason.
- [ ] Compliance requires a date and accepts an entry link.

### M-MAINT-07 Find ADs (added; phone version of W-MAINT-02)
**Purpose.** Search the FAA AD list by make and model and start tracking.
**Entry.** ADs "Find ADs for this aircraft".
**Layout** (pushed; title "Find ADs"): search field prefilled "Cessna 172N · Lycoming O-320-H2AD" with chips per component (Airframe, Engine, Propeller, appliances from Equipment); results rows: AD number 16/700, subject, effective date, "Recurring" tag, "Tracked" check if already tracked; tap → preview sheet (large) with the abstract and **Track this AD** / **Track with an interval**.
**States.** Online only: offline shows "Finding ADs needs signal. Your tracked ADs are under ADs." Loading: rows skeleton. No results: "No ADs found for that search. Try the engine or propeller model."
**Acceptance.**
- [ ] Results mark ADs already tracked.
- [ ] Tracking from here opens M-MAINT-06 for the new record.

---

## 6. Logbooks, scanning and review
The Logbooks tab (board: books, chrome yellow, dark text) has SubTabs **Map · Pages · Review 6** (the count is pages waiting for review). It opens on Map.

### M-BOOKS-01 Map
Mockups: d-m-map (settled), with the four hollow stops of d/mobile.html.
**Purpose.** The aircraft's whole life down the screen, one column per book, newest at the top: stops are entries, interchanges are visits that signed several books, dashed stretches are gaps, the dotted top is the future with what is due.
**Entry.** Logbooks tab; "On the map" links (Ask, tablet status); spine taps on tablets.
**Layout.**
| Region | Size | Content |
|---|---|---|
| PhoneHeader | 86 (padding-bottom 10) | "N734DM · 412 pages" / "Logbooks" / search square |
| SubTabs | 36 | **Map** · Pages · Review 6 (a leaf-coloured segmented control on the yellow board) |
| Leaf | padding 12 top, 12 sides | |
| Column heads | 24, sticky at the top of the leaf | "Air · Eng · Prop · Avi" in their inks (type.map 13/700), each centred over its column; a book filter button at right "All books ⌄" (44 hit) |
| Map | full leaf width, height from the layout | Vertical RouteMap (10-line-map.md, phone vertical): year labels on the left axis (type.map 12, ink-3: 2027, Today, 2025, 2015 … 1978) with the scale break at Nov 2025 drawn as the standard break mark; lines 6pt in their inks; stops 10pt circles; read-by-AI stops hollow and dotted (`stop unconf`); interchanges as rounded caps across columns; gaps dashed with a label at the right ("No airframe pages / 1983 to 1991"); the future above "Today" dotted with rings ("Annual due Jul 31", "Oil, transponder due", "VOR lapsed Nov 11"). Labels to the right of the columns, horizontal, never overlapping (label placer drops lower-priority labels at large text sizes). |
| List toggle | 44 floating chip, bottom left above the tab bar | "List" (icon list) → M-BOOKS-08 |
| AddButton, PhoneTabBar | | AddButton opens the Add sheet with "Scan logbook pages" first |
**Data.** `core:map` layout from `logbook`, `log_entry` (entry_date, logbook_id, owner_confirmed, signature), `page`, gaps (computed + owner marks), due rings from Status.
**States.** No pages at all (new aircraft, W-SETUP-02 idea): lines in the past drawn dashed with "No pages yet" per book, today and the line ahead from setup answers; leaf-2 Well at the top "Scan your first logbook and its entries appear here as stops." + **Scan pages**. Pages being read: hollow stops land as entries are read (live from the mirror). Offline: fully works (thumbnails cached). Viewer: read-only (no Scan in gaps).
**Interactions.**
- Tap a stop → M-BOOKS-02 (map sheet). Tap an interchange → M-BOOKS-03. Tap a gap → M-BOOKS-04. Tap a ring → M-STATUS-05. Several within one 44pt target → a menu listing them.
- Pinch vertically to zoom time (whole life ↔ 2 years); double-tap zooms one step at that point; two-finger double-tap zooms out. Zoomed views label every stop with its date (d-w-map-decade idea).
- Book filter → M-BOOKS-05 (one book).
- Pull to refresh = sync. Scroll position and zoom persist per aircraft.
- Long press a stop: Open page · Open entry · Copy date and tach · Share the page.
**iOS.** Map in a `ScrollView` of `Canvas` tiles (05 §21) with `MagnifyGesture` for time zoom; selection highlights with `cap sel`; the sheet uses `.presentationBackgroundInteraction(.enabled(upThrough: .medium))` so the map stays usable.
**Android.** `LazyColumn` of Canvas tiles; `transformable` for zoom; sheets via `BottomSheetScaffold`.
**Accessibility.** 05 §21: lines as containers, stops in time order, rotors (Stops, Visits, Gaps, Due), custom actions; years as headings on Android. A visible **List** equivalent.
**Acceptance.**
- [ ] Newest at the top; scrolling down goes back in time.
- [ ] Unconfirmed stops are hollow and dotted and say "read by AI" when focused.
- [ ] No label overlaps another label, stop or cap at default and XL text sizes (snapshot tests).
- [ ] Every stop is reachable with VoiceOver/TalkBack without touching the canvas.

### M-BOOKS-02 Stop sheet
Mockup: d-m-stop.
**Purpose.** The entry behind a stop, in the paper's voice, with its trust mark and a crop of the page, without leaving the map.
**Presentation.** Map sheet: iOS detents `.height(360)` (default) and `.large`; Android `BottomSheetScaffold` peek 360dp, expandable. The selected stop stays visible above (the map scrolls it into the top half).
| Region | Size | Content |
|---|---|---|
| Title row | 52 | "Engine overhaul" 18/800 (the entry's title in the owner's words) + Close (x) 44 |
| Meta | 14 ink-3 | LineChip "Engine" · "Sep 14, 2005 · tach 2803.0 · Signal Engines" |
| Page crop | 120 tall on a SourceMat | the entry's lines from the scan with the ink highlighted (`field_boxes`); tap → full page |
| Transcription | type.paper 17 Literata | the entry text ("Engine overhauled to new limits, 0 SMOH. Reinstalled and run in per Lycoming. Ops check good.") |
| Source line | 14 | "Engine logbook, page 13" (PageCite) + TrustMark "Confirmed by you" |
| Buttons | 44 + 52 | quiet **2011** with chevron-up (the next stop up the same line; label is that stop's year) · primary **Open page** (book-open) |
**Interactions.** Swipe the sheet left/right: previous/next stop on the same line. Drag up for large: adds "What it satisfied" (items and ADs closed by this entry) and **Edit entry** / **Share** (M-BOOKS-07 content).
**States.** Read by AI: TrustMark "Read by AI", a line "Not confirmed yet. It doesn't count toward what's due." and primary **Review this page** instead of Open page. Page not cached offline: crop area "This page isn't on this phone yet."
**Acceptance.**
- [ ] The paper text is in Literata; everything else in Libre Franklin.
- [ ] The next stop on the same line is one tap.

### M-BOOKS-03 Visit cards
Mockup: d-m-visit.
**Purpose.** A visit that signed several books (an interchange) opens as one card per book, each with its crop and its own trust mark.
**Presentation.** Map sheet, detents `.height(440)` and `.large`.
| Region | Size | Content |
|---|---|---|
| Title row | 52 | "Jul 14 annual, three books" 18/800 + Close |
| Meta | 14 ink-3 | "D. Alvarez, A&P 3105582 IA · tach 4168.3" |
| Cards | horizontal pager, card width = sheet width − 48 (next card peeks 24) | Per book: LineChip + "Airframe p. 60" + TrustMark "Confirmed"; crop (100 tall, SourceMat); transcription in Literata ("Annual inspection IAW FAR 43 App. D. AD 2011-10-09 complied with. ELT inspected per 91.207.") |
| Pager hint | 13 ink-3 | "Swipe for Engine p. 37 and Propeller p. 12 · 1 of 3" (page dots also) |
| Primary | 52 | **Open Airframe p. 60** (follows the visible card) |
**Accessibility.** The pager is an adjustable element ("Airframe page 60, card 1 of 3"); each card's text is readable.
**Acceptance.**
- [ ] Each card carries its own trust mark; a mixed visit (one book read by AI) shows that difference.

### M-BOOKS-04 Gap
Mockup: d-m-gap.
**Purpose.** A dashed stretch explains itself from the other books, counts pages already waiting for review, and offers to scan the rest or record that none exist.
**Presentation.** Map sheet, detents `.height(480)` and `.large`.
| Region | Size | Content |
|---|---|---|
| Title row | 52 | "No airframe pages, 1983 to 1991" 18/800 + Close |
| Explanation | 16 | "The other books say the aircraft flew about 840 hours in those years, so the airframe pages were kept somewhere." |
| Group | | "What the other books show" |
| Rows | 58 | Engine · "19 entries" · "tach 534.0 to 1376.2" · PageCite "Engine p. 6 to 11"; Propeller · "4 entries" · "1984 to 1990" · "Prop p. 3 to 4"; Airframe · "6 pages read" · "1984 to 1988 · not yet confirmed" · link **Review 6** |
| Primary | 52 | **Scan these pages** (camera) → M-SCAN-01 with Airframe preselected |
| Quiet buttons | 44 each, side by side | **No pages exist** · **I asked the previous owner** |
**No pages exist / I asked the previous owner**: a confirmation sheet with an optional note ("Previous owner says the 1983 to 1991 book was lost in a move.") and **Save**; enqueues `gap.setStatus`. The gap then draws as a labelled gap ("No pages exist, noted Nov 18") and dossiers and record rooms state it plainly.
**Acceptance.**
- [ ] The explanation uses only confirmed entries from other books (counts of unconfirmed pages are shown separately).
- [ ] Marking a gap never hides it; it changes its label.

### M-BOOKS-05 One book
Mockup: d-m-engine.
**Purpose.** The map filtered to one book: room to label every stop with its page, era bands (time since overhaul), and that book's line ahead.
**Entry.** Map book filter; "Engine" from Aircraft hours; deep link `book=`.
**Layout.** As M-BOOKS-01 with: header tail line "N734DM · 118 engine pages"; SubTabs plus a book menu "Engine ⌄" (Menu: All books, Airframe, Engine, Propeller, Avionics, Other); one wide column; every stop labelled "Oil change, Sep 3 · p. 38"; an era band (leaf-2 fill spanning the column) "Since overhaul: 1409.4 h / of a 2000 h TBO, advisory"; earlier era "First run: 2803.0 h to overhaul"; the gap note "19 entries in the airframe gap"; future rings "TBO at tach 4803.0, after 2027", "Annual, Jul 31", "Oil and filter, 9.7 h".
**Acceptance.**
- [ ] Every stop in the filtered book is labelled with its date and page at default text size.
- [ ] Era bands come from confirmed overhaul entries only.

### M-BOOKS-06 Books and pages
Mockup: b-m-books.
**Purpose.** The five books and their volumes, what waits for review, coverage by year, and every page; scan, reorder, retake and delete pages.
**Entry.** Logbooks › Pages.
**Layout.**
| Region | Size | Content |
|---|---|---|
| Review banner | Well, 64 | "6 pages wait for review. 4 read cleanly." + **Review** (secondary s) |
| Summary | 14 ink-3 | "412 pages · 212 entries" + "Bars: 1978 to today" |
| Book rows | 72 | Book name 16/700; "2 volumes · 198 pages · gap 1983 to 1991"; a CoverageBar (12 tall) with the gap hatched in alarm; chevron |
| Book page (pushed on tap) | | title "Airframe"; Volume chips "Vol. 1 · Vol. 2"; a 3-column grid (5 on tablets) of 3:4 thumbnails, page number bottom right 13/700 on a leaf chip, a status mark top left (dotted = read by AI waiting, alarm ring = needs a look, none = confirmed); toolbar **Scan pages** (primary s) and **Select** |
| Select mode | sticky bottom bar 64 | "3 selected" · **Retake** (single selection) · **Move** (to another volume) · **Delete** (alarm text) |
| Sort menu (book page) | Menu | "Filed order · By date · By tach" and **Keep this as the filed order** when a sort is definite (enqueues `page.reorder`) |
**Interactions.** Tap a thumbnail → the page in the ScanViewer (full screen, pinch 1–5×, swipe for next/previous page, a strip of thumbnails, its entries in a bottom sheet). Long press a thumbnail → Retake · Open entries · Delete. Drag to reorder in Select mode (tablet and phone; haptic on pick-up). Delete asks: "Delete 3 pages? 5 entries read from them go too. This can't be undone." Retake opens M-SCAN-02 for one page, replaces the old page after upload.
**States.** No pages in a book: "No pages in the Propeller logbook yet." + **Scan pages**. Offline: thumbnails always cached; full pages per cache. Viewer: no Scan, Select, sort-save.
**Acceptance.**
- [ ] Logbook volumes can be created from the phone (book page › overflow **Add a volume**; `logbook` create per 09).
- [ ] Deleting says how many entries go with the pages.

### M-BOOKS-07 Entry
Mockup: b-m-entry.
**Purpose.** One entry with its scan on top, the transcription in the paper's type below, and what it closed.
**Entry.** Stop sheet "Open entry"; search results; citations; history list.
**Layout** (pushed; back to the previous screen; trailing TrustMark "Confirmed by you"):
| Region | Size | Content |
|---|---|---|
| Page | SourceMat, 46% of the screen height | the scanned page scrolled to the entry, its lines outlined; **Zoom** (zoom-in) button 44; caption "Airframe logbook, page 60" |
| Title | 22/800 | "Annual inspection" |
| Meta | 14 ink-3 | "Jul 14, 2026 · tach 4168.3 · D. Alvarez, A&P 3105582 IA" |
| Transcription | type.paper 17 | full text, selectable |
| What it satisfied | chips (44 tall, rule-2) | "Annual inspection" · "ELT inspection" · "AD 2011-10-09" · "Squawk: belt squeal"; each opens its item |
| Also signed in | 14 | "Also signed in Engine p. 37 and Propeller p. 12" (links) |
| Attached documents | rows, if any | document rows (M-DOCS-02) |
| Buttons | 52 + 52 | secondary **Edit entry** (pencil) · secondary **Share** (share-2); for e-signed entries: **Print sticker** and **Create a correction** instead of Edit |
| Spine strip | 24, under the nav bar | the whole life with this stop bracketed; **Previous / Next on this line** chevrons (44) at its ends (d-w-entry idea) |
**Edit entry** opens the review fields for this entry (M-REVIEW-02 form) in a pushed screen with Save; edits mark it confirmed.
**States.** Read by AI: TrustMark dotted, line "Not confirmed yet." and primary **Review this page**. Page not cached offline. Viewer: no Edit.
**Acceptance.**
- [ ] Entry text, AD numbers and part numbers are selectable.
- [ ] Previous and next on the same line work from here.

### M-BOOKS-08 Entries as a list (added; the phone equivalent of W-BOOKS-12)
Mockup: b-m-timeline.
**Purpose.** The same records as the map, as a list by year and month: for reading, searching, and for anyone who prefers lists or uses a screen reader.
**Entry.** Map "List" chip; tablet map list toggle.
**Layout.** Book chips "All books · Airframe · Engine · Propeller · Avionics · Other"; a 56-tall year strip (horizontal, draggable) with entries-per-year bars and the gap hatched, "Engine since overhaul" bracket; year groups "2026 · 14 entries"; rows: title 16/700 ("Oil and filter change"), meta "Sep 3 · tach 4172.1 · Engine p. 38" + TrustMark when not confirmed; "in 3 books" for visits.
**Interactions.** Tap → M-BOOKS-07. Drag the year strip to jump. "Map" chip returns to the map at the same year.
**Acceptance.**
- [ ] The list and the map show the same entries for the same filter.

### M-BOOKS-09 Write a logbook entry (added; phone version of W-BOOKS-11)
**Purpose.** Author an owner-performed preventive maintenance entry from a template and sign it with an emailed code; print the sticker.
**Entry.** Add sheet "Write a logbook entry"; entry "Create a correction".
**Layout** (pushed; title "New logbook entry"; a Stepper "Details · Wording · Sign"):
1. **Details**: Logbook (Menu), Template (Menu: Oil and filter change, Tire change, Battery service, … from `authored_template`), Completed (date), Tach, Hobbs, Airframe (MeterSteppers with "Leave blank"), the template's fields.
2. **Wording**: generated "Work performed" in a PaperInput (Literata, 17) with **Reset wording**; "Review before signing."
3. **Sign**: Your full name; Person who performed the work; Certificate (Menu or **Add a certificate**); attestation Checkbox "I performed this work and it is described accurately."; primary **Email me a signing code** → "Enter the 8-digit code we sent to dana@example.com" field → **Sign this entry**.
After signing: "Signed. Print the sticker and put it in the logbook, then sign it by hand." + **Print sticker** (05 §22) + **Done**.
**States.** Draft autosaves (outbox `draft`). Offline: steps 1–2 work; Sign shows "Signing needs signal to send the code. Your draft is saved."
**Acceptance.**
- [ ] The draft survives the app being closed.
- [ ] A signed entry can't be edited; corrections create a new entry that supersedes it.

### M-SCAN-01 Choose the logbook
Mockup: b-m-scan-book.
**Purpose.** Pick the book, see where the pages will go and how much of today's reading is left, then open the camera.
**Entry.** Add sheet "Scan logbook pages"; Pages "Scan pages"; Gap "Scan these pages"; setup; `ScanPagesIntent`.
**Presentation.** Sheet, `.medium` and `.large`; title "Scan pages"; Close.
| Region | Size | Content |
|---|---|---|
| Which logbook? | chips 44, wrapping | Airframe · Engine · Propeller · Avionics · Other (last used preselected; volume menu when the book has volumes: "Vol. 2 ⌄") |
| Where they go | 16 | "Adds to the end. **198 pages so far**, so these start at page 199. Put them in date order later if you like." |
| Handwritten entries | Toggle row 58 | "Handwritten entries" / "Reads cursive as well as typed text. Turn off for printed pages; they come back faster." (default on) |
| Allowance | type.small ink-3 | "Reading allowance today: 31 of 50 pages used, shared by your aircraft. Pages past it wait for tomorrow." (own key: "Reading with your own key.") |
| Primary | 52 | **Open the camera** (camera) |
| Overflow | quiet | **Use the system scanner** · **Choose photos or PDFs** |
**States.** No logbooks (should not happen; enrol creates five): **Add a logbook**. Offline: allowance line "Pages are read when you have signal." Viewer: not reachable.
**Acceptance.**
- [ ] Two taps from any top-level screen to the camera (Add → Scan logbook pages → Open the camera), one from a gap.

### M-SCAN-02 Camera
Mockups: d-m-camera, b-m-scan-camera.
**Purpose.** Photograph pages fast: edges found, steady shot taken automatically, running count, the last page in view, and where the page lands in time.
**Presentation.** Full-screen cover, cover background, portrait; status bar hidden.
| Region | Size | Content |
|---|---|---|
| Top bar | 56 | **Cancel** (x) left; centre "Airframe vol. 1 · 5 taken" 16/700 on-cover |
| Lands-in line | 36 pill, cover-2, 12 from the top bar | route icon + "Lands in 1984, inside the airframe gap" (only when a date was legible on the last page; 05 §15) |
| Preview | fills | live camera; the detected page outline drawn in 3pt on-cover with 40% cover tint outside the page |
| Hint | 40 pill, centred near the bottom of the preview | scan-line icon + "Page found. Hold still." / "Looking for the page edges" / "Move back so the whole page fits" / "More light, or turn on the torch" |
| Bottom bar | 120 | left: the last page thumbnail 56×74 with the count badge "5" (tap = review strip); centre: shutter 72 (manual capture always available); right: **Done** 16/700 (44 hit) |
| Torch | 44 icon button top right of the preview | |
**Interactions.** Auto-capture when steady (05 §15.1) with haptic and a brief outline pulse; manual shutter; tap the thumbnail → a strip of this session's pages with **Adjust corners**, **Retake**, **Delete** per page; Done → M-SCAN-03 (and the Live Activity starts). Cancel with pages taken asks: "Keep the 5 pages you took?" **Keep them** (primary, they upload) · **Delete them** (alarm).
**States.** Camera denied (M-SYS-04 primer first; after denial "MyTailLog needs the camera to photograph pages." **Open Settings** · **Choose photos instead**). 50 pages: "That's 50 pages. Upload these before shooting more?" Low storage (< 200 MB free): "Your phone is almost full. Pages may not save." Reduce Motion: no flash, outline pulse only.
**Accessibility.** VoiceOver/TalkBack announce "Page found", "Page 6 taken", and the lands-in line. Shutter "Take photo"; Done "Done, 5 pages".
**Acceptance.**
- [ ] Each page is on disk before the next capture is accepted.
- [ ] Works offline; pages are held and upload later.
- [ ] The lands-in line never appears when no date was read.

### M-SCAN-03 Queue (pages in progress)
Mockups: d-m-queue, b-m-scan-queue.
**Purpose.** Every page has a place: on this phone, being read, waiting for you. Above it, the map from the years these pages cover, with hollow stops landing as entries are read.
**Entry.** Camera Done; Live Activity tap; Pages banner; deep link `/queue`.
**Layout** (pushed in Logbooks; back "Logbooks"; title "Pages in progress"):
| Region | Size | Content |
|---|---|---|
| Mini map | full width × 200 | the vertical map clipped to the years the session's pages cover (e.g. 1995 to 1978), the gap dashed, hollow stops appearing for each entry read; labels "Gap, 1983 to 1991" and "4 entries read so far / hollow until you confirm" |
| On this phone | group "On this phone 2" | row "Uploading 1 of 2" + progress bar + "Airframe vol. 1, p. 18 and 19"; offline: "They upload when you have signal." + **Upload now** when online but paused |
| Being read | group "Being read 4" | "2 of 4 read" + progress + "p. 14 to 17 · a minute or two" |
| Waiting for your review | group with count | rows per page with **Review**; empty: "Pages arrive here once they are read. You can put the phone away; we will tell you." |
| Allowance | Well | "35 of 50 pages read in the last 24 hours" + "Each page frees up 24 hours after it was read." (12-copy-and-voice.md `allowance.today`; the mockup's "Resets at midnight" is superseded) |
**States.** Allowance spent: group "Waiting for tomorrow's allowance 4" with "Use your own key in Settings to read them now." Reading failed for a page: row in alarm "Page 17 couldn't be read." + **Try again** (online). Offline: being-read shows the last known state with "as of 9:44".
**Acceptance.**
- [ ] Every held, uploading, reading and waiting page is listed with its state.
- [ ] The allowance is stated where it is spent.

### M-SCAN-04 Pages-read notification
Mockups: d-m-read, b-m-scan-done.
**Purpose.** Reading runs in the background and announces when it finishes, with the count that needs you and the ones that don't.
**Surfaces.** The PAGES_READ push (05 §10) and the end state of the Live Activity / ongoing notification (05 §12).
**Content (exact).** Title "6 pages are read. 2 need a look." Body "Airframe p. 14 to 19, from 1984 to 1988: the first pages found for the gap. Four read cleanly and can be confirmed together." Expanded (iOS long-press / Android big picture style): the airframe strip from 1978 to 1995 with the gap dashed, the new entries as hollow stops and the two doubtful ones ringed in vermilion, caption "Dashed: a date or tach value worth checking". Actions **Review the 2** · **Later**.
**Rules.** One notification per reading batch (pages uploaded within 10 minutes form a batch). No notification if the app is in the foreground on M-SCAN-03 (the screen updates instead). The image is drawn on the device by the Notification Service extension (iOS) or the app (Android) from the display list, never by the server.
**Acceptance.**
- [ ] The notification names how many pages need the owner and opens review at the first of them.

### M-REVIEW-01 Review a page
Mockups: d-m-review, b-m-review.
**Purpose.** The page fills the screen; a drawer holds the entry with the least certain field first; a small spine says where the page lands in time.
**Entry.** Logbooks › Review; PAGES_READ "Review the 2"; queue rows; "Review this page" anywhere.
**Presentation.** Full screen (tab bar hidden), cover header; landscape allowed.
| Region | Size | Content |
|---|---|---|
| Header | 56, cover | back "Queue" (or "Logbooks"); right: "Airframe vol. 1, p. 15" 16/700 over "1 of 2 to check" 13 on-cover-2 |
| Spine strip | 32, cover-2 | "Jun 11, 1984 fills 1984 in the airframe gap" with the airframe line and a bracket at 1984 |
| Page | fills to the drawer | the scan on the mat, zoomable 1–5×, the current entry's lines outlined (1.5pt on-cover), the selected field's ink highlighted (yellow highlight per 02 ScanViewer) |
| Drawer | detents: 34% (default), 60%, full; leaf; drag handle | Title row: "Entry 2 of 2 · Annual" 16/700 + TrustMark "Read by AI". Field rows (58 each): label 14/700 ink-3 (Tach, Date, Work, Signed), value 17 (paper fields in Literata), right: a check (accepted) or "6 or 8?" doubt chip (alarm text, circle-help icon). Order: least certain field first. |
| Primary | 52, pinned at the drawer's bottom | **Confirm page and next** (enabled when no field is doubtful or every doubtful field has an outcome) |
| Drawer extras (60% and full) | | "Missed an entry? **Add one**" · "This entry continues on the next page" Toggle · **Merge with the previous page's entry** · quiet **Something's wrong with this page** (flag) · quiet **Read this page again** (online; uses the allowance) · quiet **Delete this entry** (asks) |
**Interactions.** Tap a field → M-REVIEW-02. Swipe the page horizontally (with the drawer at its lowest detent) → previous/next page in the queue. Two-finger tap on the page → zoom to the current entry. Swipe a field row right → Looks right; left → Edit (as b-m-review-doubt's hint). Confirm page and next → M-REVIEW-03.
**Data.** `page`, `log_entry` (fields, field_confidence, field_boxes, owner_confirmed, continues_next, is_continuation), mutations `entry.update`, `entry.confirm`, `entry.create`, `entry.merge`, `entry.delete`, `page.review`, `entries.confirmClean`.
**States.** Page not read yet: drawer "This page hasn't been read yet." + **Read this page · 19 of 50 left today** (online) / "Being read now. Entries appear here when it's done." / "Reading this page didn't work last time." + **Try again**. Sideways writing: Well "Some writing on this page runs sideways. Check it against the page." Offline: everything except Read again works; confirmations queue. Viewer: read-only drawer, no outcomes.
**Acceptance.**
- [ ] The least certain field is always first.
- [ ] Selecting a field highlights its ink on the page.
- [ ] A clean page can be confirmed without opening any field.

### M-REVIEW-02 Doubtful field
Mockup: b-m-review-doubt.
**Purpose.** Tapping a field zooms the page to its ink; the reader says what it doubted and why the neighbours suggest an answer; the owner picks one of three outcomes.
**Layout.** Header back "Entry"; right "Airframe p. 199" / "Zoomed to the tach". The page zoomed to the field's box (top 50%). Below, a leaf panel:
| Region | Content |
|---|---|
| Label row | "Tach" 14/700 + doubt chip "Read with doubt" |
| Value | TextInput with type.numeric 28/700 (a number is the app's reading of the page, so Libre Franklin; text fields such as Work use PaperInput in Literata) "1874.6", editable |
| Reason | 16: "The second digit could be a 1, which would make it 1814.6. The entry above it on this page reads 1861.2 on Apr 18, 1992, so 1874.6 fits and 1814.6 would run backwards." |
| Outcomes | three buttons, 52 each, full width, stacked: **Looks right** (check, primary) · **Edit** (pencil, secondary; focuses the value) · **Not on this page** (quiet; clears the field) |
| Hint | 13 ink-3 | "Swipe right: looks right · Swipe left: edit" |
**After an outcome:** back to M-REVIEW-01 with the next doubtful field selected; a check replaces the chip.
**Acceptance.**
- [ ] Every doubtful field offers exactly the three outcomes.
- [ ] The raw text the reader saw is available ("What the reader saw", expandable).

### M-REVIEW-03 Next page
Mockup: b-m-review-next.
**Purpose.** Confirming slides the page away with an Undo and brings the next one in; a clean page can be confirmed from the drawer without opening a field.
**Behaviour.** After **Confirm page and next**: success haptic; toast at the top of the drawer "Page 199 confirmed, 2 entries" + **Undo** (6 s); the next page slides in from the right (cross-fade with Reduce Motion); the drawer opens at its lowest detent showing a summary row "Reads cleanly · 3 entries" + TrustMark "Read by AI" + "Sep 14, 1992 to Feb 8, 1993 · tach 1902.3 to 1938.4", and two buttons **Look at fields** (secondary) · **Confirm page and next** (primary). A back chevron at the page's left edge returns to the previous page.
**End of queue.** "All 6 pages are reviewed. 14 entries confirmed." + the airframe strip with the new filled stops + **Done** (back to the map at that year).
**Acceptance.**
- [ ] Undo reverts the confirmation and all its entries.
- [ ] Clean pages need one tap each.

---

## 7. Add, flights and Ask

### M-FLIGHT-01 Add sheet
Mockup: b-m-add.
**Purpose.** One list for everything the owner might add; each item wears the colour of the tab where it will be filed.
**Entry.** AddButton on top-level screens; ⌘N on iPad keyboards.
**Presentation.** Sheet, `.medium` (grows to `.large` at accessibility sizes); title "Add to N734DM"; Close.
| Row (64 each) | Icon tile 40×40 in the section colour | Title / subline | Goes to |
|---|---|---|---|
| Log a flight | plane-landing on aircraft green | "Photograph the tach, or type it" | M-FLIGHT-02 (or M-FLIGHT-03 if "Start with the camera" is off in Settings) |
| Add oil | droplet on aircraft green | "Quarts added at the aircraft" | M-FLIGHT-05 |
| Report a squawk | flag on maint teal | "A photo first, then a few words" | M-MAINT-03 |
| Scan logbook pages | camera on books yellow (dark icon) | "Adds to the end of a logbook" | M-SCAN-01 |
| Add a document | file-plus-2 on docs sienna | "Insurance, registration, a Form 337" | M-DOCS-03 |
| Write a logbook entry | pencil on books yellow | "Sign it with a code sent by email" | M-BOOKS-09 |
| Log a VOR check (only when tracked) | radio on status blue | "Place, bearing error, signature" | M-STATUS-07 |
Footer type.small ink-3: "Each colour is the tab where it will be filed."
**Order.** Fixed as above (muscle memory); the first row is the most common at the aircraft.
**Viewer.** Only "Report a squawk".
**Acceptance.**
- [ ] Every add action in the app is reachable from this sheet.
- [ ] Rows are 64 tall with 44+ targets and full-row tap areas.

### M-FLIGHT-02 Photograph the tach
Mockup: b-m-tach-photo.
**Purpose.** Review, don't retype: the camera finds the hour meter and reads it before the shutter.
**Presentation.** Full-screen cover, cover background.
| Region | Size | Content |
|---|---|---|
| Top bar | 56 | **Cancel** (x) left; "Tach" centre (or "Hobbs") |
| Preview | fills | live camera; a guide rectangle 280×120 centred (2pt on-cover, radius 8) |
| Found readout | 72 pill under the guide | scan-line icon + value in type.numeric 34/700 "4214.8" |
| Caption | 16 on-cover | "Hour meter found. Last reading was 4212.4." / "Looking for the hour meter" / "Can't read it yet. Move closer, or type it." |
| Bottom bar | 96 | left **Type it** (keyboard); right **Hobbs next** (gauge) when the aircraft records hobbs; centre a shutter that freezes the frame for a still read |
**Behaviour.** 05 §16. When found, a light haptic and after 0.8 s the screen advances to M-FLIGHT-03 with the value as a draft (or to the hobbs step when "Hobbs next" was chosen first). Nothing is saved here.
**States.** Camera denied → M-FLIGHT-03 with the keypad up and the line "Allow the camera in Settings to read the tach from a photo." No reading after 8 s → "Type it" pulses once (no motion with Reduce Motion). Low light → torch button appears.
**Acceptance.**
- [ ] The read value is never saved without the confirm screen.
- [ ] Implausible values (lower than the last reading, or far above it) are never offered as found.

### M-FLIGHT-03 Confirm the flight
Mockups: d-m-flight (with the mini line ahead), b-m-tach-confirm.
**Purpose.** The photo's number lands in a large stepper for the last tenth; hobbs alongside; oil in one tap; the date; one Save in thumb reach. A strip of the engine line shows the oil ring sliding nearer as the reading goes up.
**Presentation.** Pushed inside the cover (back "Photo"); title "Log a flight"; tail badge.
| Region | Size | Content |
|---|---|---|
| Source note | Well 56 | "Read from your photo" 16/700 / "Check it against the meter." (only when read from a photo) |
| Tach | MeterStepper | label "Tach" + "was 4212.4 on Nov 14" (ink-3); keys − and + 64×64; value type.numeric 34/700, tappable to type (numeric keypad with decimal; typing replaces the value; no reformatting while typing; one decimal on commit); clear (x) 44 at the value's right; delta line "2.4 hours this flight" |
| Mini line ahead | full width × 64 | the Engine line from today to the next two months; the oil ring with its label moving as the tach changes: "was about Dec 12" (ghost ring) → "Oil now 7.3 h, about Dec 5" |
| Hobbs | MeterStepper | label "Hobbs" + "was 4680.4"; delta "2.7 hours"; text button **Not this time** (min 44) toggles it off ("Hobbs not recorded this time" + **Record it**) |
| Oil added | Segmented 44 | "None · 1 qt · 2 qt · Other" (Other opens a decimal field, placeholder "0.5") |
| Date | row 52 | "Date" + "Today, Nov 18" + **Change** (date picker; past dates only) |
| Primary | 52, pinned above the keyboard and the home indicator | **Save flight** (disabled until a meter changed or oil was entered) |
**Stepper behaviour.** Tap: ±0.1 (selection haptic). Press and hold: repeats every 90 ms, after 18 ticks steps by 1.0 (one light haptic at the switch). Values below the last reading show the soft alarm slip "Lower than the last reading (4212.4)." and Save then asks the meter question.
**Meter-replacement question** (sheet, medium) when a saved value is lower than the last: title "Lower than the last reading. Was the tach replaced?"; line "4212.4 → 12.0"; Notes; buttons **Yes, a new meter from today** (primary) · **I mistyped it** (back to the value) · **It's right as typed** (saves the reading). A meter swap is undoable from Hours and readings (M-AIRCRAFT-02), which now exists (fixes critique #18).
**Data.** `reading.create {id, date, tach?, hobbs?}`, `oil.create {id, date, quarts, tach?}`, `meterReset.create` when chosen. Date is the local calendar date.
**States.** Offline: Save queues; M-FLIGHT-04 says so. Hours-only aircraft: hobbs hidden by default ("Not this time" remembered per aircraft; fixes the tach-only friction in workflow C). No previous reading: steppers start empty with the keypad up.
**Accessibility.** Each MeterStepper is one adjustable element ("Tach, 4214.8, 2.4 hours this flight"); increment/decrement by 0.1; a "Type a value" action. The mini line ahead is summarised ("Oil change moves to about December 5").
**Acceptance.**
- [ ] Typing "4214.8" into the value field produces 4214.8 (critique #9).
- [ ] A flight can be logged for an earlier date (critique #10).
- [ ] Oil can be saved with or without a meter reading.
- [ ] The oil ring and "now 7.3 h" update live before saving.

### M-FLIGHT-04 Saved
Mockups: d-m-saved, b-m-flight-saved.
**Purpose.** Say what the flight moved; redraw the line ahead; offer the one follow-up that now makes sense.
**Presentation.** Replaces M-FLIGHT-03 in the cover; header "N734DM · Synced 9:42" (or "Saved on this phone").
| Region | Size | Content |
|---|---|---|
| Title | 28/800 + check | "Flight saved" |
| Statement | type.lede 20 | "**Oil change now 7.3 h away**, about Dec 5. Logged 2.4 h, tach 4214.8, with 1 qt of oil." |
| Line ahead | full width × 120 | "Visit Dec 7" cap; "Oil about Dec 5, was Dec 12" ring moved (ghost of the old position); "VOR lapsed"; "Transponder, static" |
| Follow-up (when the move matters) | Well | "The oil change now falls two days before the Dec 7 visit." + **Move the visit to the week of Nov 30** (secondary) |
| What it moved | group | rows: "Oil and filter · Engine · was 9.7 h" → "7.3 h Due soon"; "AD 2011-10-09 seat rails · Airframe · was 55.9 h · about Mar 23" → "53.5 h"; "Engine since overhaul · Engine · TBO 588.2 h away, advisory" → "1411.8 h" |
| Note | 14 ink-3 | "Calendar items did not change." |
| Buttons | 52 + 52 | secondary **Undo** (undo-2) · primary **Done** |
**Undo** removes the queued mutations (or enqueues deletes if already uploaded: `reading.delete`, `oil.delete`), confirmation toast "Flight removed."
**Offline.** Header "Saved on this phone"; statement adds "It uploads when you have signal."
**Acceptance.**
- [ ] Every hours-limited item that changed is listed with before and after.
- [ ] Done returns to where Add was opened.

### M-FLIGHT-05 Add oil (added)
**Purpose.** Record quarts added without logging a flight.
**Presentation.** Sheet, `.medium`; title "Add oil".
**Layout.** "Quarts" Segmented "½ · 1 · 2 · Other" (Other: decimal field); Date row (today, Change); Tach (optional MeterStepper, collapsed: "Add the tach reading" link); Notes (optional, e.g. "Phillips XC 20W-50"); primary **Add oil**. Toast "1 qt added. Saved." / "… Saved on this phone."
**Data.** `oil.create {id, date, quarts, tach?, notes?}`. A mistaken top-off can be deleted from Oil and engine (M-AIRCRAFT-05).
**Acceptance.**
- [ ] Oil saves without a tach reading and without creating a reading.

### M-ASK-01 Search and Ask
Mockup: d-m-ask (and b-m-ask).
**Purpose.** One field: search the records on the phone, or ask a question and get an answer cited to confirmed entries, with the matching entries lit on a strip of the whole life.
**Entry.** The search square on every PhoneHeader; ⌘K; Spotlight "Search in app".
**Presentation.** Full-screen cover; leaf background; the field at the top with the keyboard up.
| Region | Size | Content |
|---|---|---|
| Field row | 56 | search icon + TextInput 17 "Search or ask about N734DM" + **Cancel** (44) |
| Before typing | | "Recent" (last 5 queries) and "Try" chips: "When was the engine last overhauled?", "Last annual", "ELT battery", "GTN 650" |
| While typing (search, offline OK) | rows 58 | live FTS results grouped: Entries, Tracked items, ADs, Documents, Squawks, Equipment; each row with LineChip/page cite and TrustMark when not confirmed; tap opens it |
| Ask row | 58, first row once the text reads as a question (ends with "?" or starts with a question word) | icon circle-help + "Ask: When was the engine last overhauled?" → runs Ask |
| Answer (after Ask) | | header "Answer from 2 confirmed entries" 14/700 ink-3; answer type.lede 20 ("On **Sep 14, 2005**, at tach 2803.0, by Signal Engines. It has run 1409.4 hours since, against a 2000-hour TBO."); a whole-life strip (full width × 56) with matching entries lit as stops ("Engine 2005", "Prop 2010", "Today"); a SourceMat crop of the cited entry with the quote in Literata ("Engine overhauled to new limits. 0 SMOH.") and PageCite "Engine p. 13" |
| Matching entries | group "Matching entries 3" | rows: "Engine overhaul · Engine · Sep 14, 2005 · p. 13"; "Propeller overhaul · Propeller · Apr 30, 2010 · p. 8"; "Engine TBO · Tracked item · 590.6 h left, advisory" |
| Footer | 14 ink-3 + button | "Answers come from confirmed entries." + **On the map** (route icon) → M-BOOKS-01 zoomed to the matching years with those stops highlighted |
| Allowance | 13 ink-3 under the field while asking | "Asking needs signal. 12 of 30 questions left today." (the numbers come from the server; 08-capabilities.md owns the cap, §13 question 3) |
**States.** Offline: search works; the Ask row reads "Asking needs signal. Search still works on this phone." Asking: "Reading the logbooks" with progress (the answer streams in when the server streams; otherwise appears whole). No answer: "The confirmed entries don't say. 6 pages wait for review; the answer may be there." + **Review**. Error: "Asking didn't work. Try again." The conversation is kept per aircraft for the session (follow-up questions keep context) and cleared on aircraft change, with "New question" to clear.
**Interactions.** Citations open the entry (M-BOOKS-07) or page (fixes critique #16). Long press an answer → Copy · Share (text with citations).
**Accessibility.** Results are announced as a count ("3 matching entries"); the answer is a live region read when it arrives.
**Acceptance.**
- [ ] Search works offline over every record type.
- [ ] Every answer cites at least one confirmed entry with its page, or says it can't answer.
- [ ] Unconfirmed entries are never used in answers.

---

## 8. Aircraft, documents and sharing

### M-AIRCRAFT-01 Aircraft
Mockup: b-m-aircraft.
**Purpose.** Meters and time since overhaul checked against the logbooks, equipment, weight and balance, documents: the aircraft as an object.
**Entry.** Aircraft tab.
**Layout** (board aircraft green; title "Aircraft"):
| Group | Content |
|---|---|
| Hours, "read Nov 14" | Two large values side by side: Tach **4212.4**, Hobbs **4680.4** (type.numeric 28/700); rows: "Engine since overhaul · 1409.4 h", "Prop since overhaul · 1007.6 h"; a check line "Written and calculated times agree" (circle-check) or, when they disagree, a soft alarm slip "The engine log says 1405.0 since overhaul on Sep 3; the meters say 1404.2. Check it." with **Show me**; group tap → M-AIRCRAFT-02 |
| ADS-B nudge (if opted in and flights were seen) | Well: "3 flights totalling about 4.2 h since your last reading." + **Log a flight** (prefilled) · **Dismiss** |
| Equipment, "3 installed · 1 removed" | top 2 rows ("Garmin GTN 650 · 011-01057-00 · 2019", "Rapco vacuum pump RA215CC · 2021") + "See all" → M-AIRCRAFT-03 |
| Weight and balance, "2019" | "1447.80 lb · arm 39.610 · Max gross 2300 lb" + chevron → M-AIRCRAFT-04; stale notice (circle-alert, soft alarm) "May be stale: the 2021 vacuum pump came after this revision." |
| Oil and engine | "Burns about 1 qt in 9.2 h · last sample Sep 2026, normal" → M-AIRCRAFT-05 |
| Documents | "14 in the vault · carry-aboard complete" (or "Registration missing" in alarm) → M-DOCS-01 |
| Details | "1978 Cessna 172N · S/N 17269841 · home base" → M-AIRCRAFT-06 |
**States.** No readings: "No hours recorded yet." + **Log a flight**. Viewer: read-only. Offline: all readable.
**Acceptance.**
- [ ] Every value has its source one tap away (reading list, entry, or page).

### M-AIRCRAFT-02 Hours and readings (added; phone version of W-AIRCRAFT-01)
**Purpose.** Every meter reading with its source, corrections, meter replacements (and undoing them), and the written-versus-calculated check.
**Layout** (pushed; title "Hours"): engine line strip (64) with oil changes as stops and time since overhaul; group "Readings" rows "Tach 4212.4 · Hobbs 4680.4" / "Nov 14 · logged by you" or "from a log entry · Engine p. 38" or "from MyFlightBook"; group "Meter replacements" rows "Tach replaced Mar 2, 2021: 2417.3 → 0.0" with **Undo this replacement** (asks; `meterReset.delete`).
**Interactions.** Tap a hand-entered row → "Correct this reading" sheet (date, two MeterSteppers with "Leave blank", **Save correction**); swipe left → Delete (asks "Delete the Nov 14 reading? Items counted from it will move."); readings from entries open the entry.
**Acceptance.**
- [ ] A meter replacement can be undone (critique #18).
- [ ] Only hand-entered readings can be edited or deleted here.

### M-AIRCRAFT-03 Equipment (added; W-AIRCRAFT-03)
**Purpose.** Installed and removed equipment, suggestions found in the logs, linked ADs.
**Layout.** Group "Found in your logbooks" (proposals, TrustMark "Read by AI") with **Add to equipment** · **Not on this aircraft**; group "Installed 3" rows (name, part number, installed year, linked AD count); group "Removed 1" ("King KX-155 · removed 2019") with **Reinstalled**; secondary **Record an installation**; quiet **Find equipment in the logbooks** (online).
**Component** (pushed form): Name, Manufacturer, Type, Part number, Serial number, Installed on (date), Entry that records it (picker), Life limit + unit, Notes; **Save**; **Removed from the aircraft** → sheet (date, entry; "Its ADs stop applying from that date.") ; quiet **Delete: it was never on this aircraft** (asks).
**Acceptance.**
- [ ] Removal and deletion are distinct and explained at the tap.

### M-AIRCRAFT-04 Weight and balance (added; W-AIRCRAFT-04)
**Purpose.** The current weighing, the stale notice, earlier revisions; add a revision.
**Layout.** Current card: Empty weight 1447.80 lb, Arm 39.610 in, Moment 57,347.36, Max gross 2300 lb, Useful load, method "computed", reference, reason, with PageCite to the W&B sheet; soft alarm "Equipment changed since this weighing: Rapco vacuum pump (2021)."; group "Earlier revisions" (1998 weighed 1441.20 lb …). Secondary **Add a revision** (form: date, empty weight, arm, moment computed, max gross, method Weighed / Computed, reason, source page picker) → `wb.upsert`.
**Acceptance.**
- [ ] Moment is computed and shown; the stale notice names the equipment.

### M-AIRCRAFT-05 Oil and engine (added; W-AIRCRAFT-02)
**Purpose.** How much oil it drinks, top-offs, lab results, compressions.
**Layout.** "How much it drinks": hours per quart (type.numeric 28) and a 12-interval bar chart (ink bars on leaf, labelled axes; 05 §21 drawing, dataviz rules from 02); group "Oil added" rows (date, quarts, tach) with swipe-left Delete (asks; `oil.delete`); group "What the lab found": wear-metal table for the last 4 samples (Fe, Cu, Al, Cr, Ni, Pb, Si) with tabular figures, right-aligned, lab comments; group "Compressions" ("May 9, 2026 · 76/74/75/77 over 80 · Engine p. 36").
**States.** No samples: "No oil analysis on file. Scan a lab report into Documents and it's read here."
**Acceptance.**
- [ ] A mistaken top-off can be deleted from the phone.

### M-AIRCRAFT-06 Aircraft details (added; W-AIRCRAFT-05)
**Purpose.** Edit tail-independent details; logbooks and volumes; leave or transfer (owner only) and delete (owner only; online).
**Layout.** Fields: Make, Model, Year, Serial number, Engine serials, Propeller serials, Home base, Notes; group "Logbooks" (rename, add a volume, add a logbook); group "ADS-B" (opt in, ICAO24); overflow menu **Run a backup now** (online; toast "Backup scheduled. It runs tonight."); danger zone at the end: **Transfer ownership** (online; "Transferring revokes every record room link.") and **Delete N734DM** (online; type the tail to confirm; "This removes every record and scan of N734DM from MyTailLog. The paper logbooks are not affected. This can't be undone.").
**Acceptance.**
- [ ] Delete requires typing the tail number and signal.

### M-DOCS-01 Documents and carry-aboard
Mockup: b-m-docs.
**Purpose.** The vault: the four carry-aboard documents first with their expiry dates (which feed the due list), then everything else.
**Entry.** Aircraft › Documents (phone); the Documents tab (tablets); Status "Registration isn't in Documents".
**Layout** (pushed; back "Aircraft"; title "Documents"; search icon in the nav bar):
| Region | Content |
|---|---|
| Carry aboard (AROW) | group header with "All 4 here" (or "1 missing" in alarm); rows: Airworthiness certificate; Registration "Expires Mar 31, 2029"; Operating handbook (POH); Weight and balance "2019 revision · may be stale". A missing one: "Not in Documents yet" + **Add it** (opens M-DOCS-03 with the type set; fixes the dead end in today's app). |
| Everything else 10 | rows: title, "PDF · added Jan 2026", linked entry ("linked to 2019 entry"), expiry when present; "Insurance policy · No expiry date" with **Add date** |
| Primary | **Add a document** (file-plus-2), pinned |
**Interactions.** Tap → M-DOCS-02. Long press → Share · Attach to an entry · Rename · Change type · Remove from Documents (asks). Search filters by name, type and reference live. Drag files in (tablets).
**States.** Empty: "Nothing in Documents yet. Add the registration and airworthiness certificate and they travel with you." Files waiting to upload: Well "2 documents on this phone. They upload when you have signal." Offline: pinned documents open; others "Not on this phone yet."
**Acceptance.**
- [ ] The four carry-aboard documents open offline once added.
- [ ] Expiry dates appear on the due list.

### M-DOCS-02 Document viewer (added)
**Purpose.** Read a document; share, print, attach, rename, set its type and expiry.
**Layout** (pushed; title the document title; landscape allowed): PDF in PDFKit / PdfRenderer pager with page count "1 / 3", pinch zoom; images in the ScanViewer. Bottom toolbar: **Share** · **Print** · **Details**. Details sheet: Title, Type (Menu), Date, Expires (date), Reference, Linked entry (picker), Notes; **Save** (`document.update`, `document.setEntry`); quiet **Remove from Documents** (asks).
**States.** Not cached offline: "This document isn't on this phone yet. It downloads when you have signal." Can't be opened: "This file couldn't be opened. Share it to another app to read it."
**Acceptance.**
- [ ] Rename and retype work offline.

### M-DOCS-03 Add a document (added)
**Purpose.** Add a document from the camera, Files or Photos, typed and named.
**Presentation.** Sheet, `.large`; title "Add a document".
**Layout.** Two source tiles 96 tall: **Use the camera** "Finds the page edges" (ScanCamera in document mode, multi-page into one PDF) · **Choose a file** "Files or photos"; "Ready to add" list (name, size, x); "What is it?" chips (Registration, Airworthiness certificate, Operating handbook, Weight and balance, Insurance policy, Form 337, 8130-3, STC, Oil analysis, Radio licence, Other); "Name it (optional)"; "Expires" date (shown for registration, insurance, licence); primary **Add to Documents**; note "PDF or a photo, up to 25 MB each."
**After.** Toast "Added to Documents." / "Saved on this phone. It uploads when you have signal." Oil analysis and W&B documents are read by AI after upload (online) and their results go to review.
**Acceptance.**
- [ ] Works offline; files over 25 MB are refused with the size stated.

### M-SHARE-01 Who is it for
Mockups: d-m-share (with the record room preview), b-m-share.
**Purpose.** Start every hand-off from the person receiving it; preview the record room it will build, whose cover is the map.
**Entry.** Share tab; Status "Share with your IA" (preset).
**Layout** (board share violet; title "Share"):
| Region | Content |
|---|---|
| Who is it for? | 18/800 heading; four rows (64, icon tile 40 in leaf-2): **My IA, for the annual** "What falls due, ADs, squawks, gaps" (clipboard-check) · **A buyer, for a pre-buy** "Every book and document, a dossier" (scale) · **My insurer** "Hours, inspections, equipment" (shield-check) · **A co-owner or mechanic** "Invite them to edit or view" (users). The selected one shows a check. |
| Preview (after a pick) | "What the buyer opens first" 14/700 ink-3; a leaf-2 card: "N734DM records as of Nov 18, 2026" 16/700; a whole-life map strip (64) with 1978, 1998, 2011, Today labels and the gap; the room's tabs as small labels "Status · Logbooks · Maint. · Documents"; line "The 1983 to 1991 gap is marked. Read only." |
| Options (expand "Change what it holds") | Includes: summary, logbooks (chips per book), scans (toggle), documents (chips); Expires: 7 / 30 / 90 / 180 days; Label ("Pre-buy for J. Okafor") |
| Primary | **Make the link** (pinned above the tab bar) |
| Below the fold | "Live links 1" row ("Pre-buy for J. Okafor · Expires Dec 18 · opened 3 times") and "People 3" row ("Dana (you), Sam Reyes, D. Alvarez · Owner, editor, viewer") → M-SHARE-03; quiet **Share a summary** (PDF, 05 §22) and **Get the pre-buy dossier** (online) |
**Co-owner or mechanic** opens an invite sheet: Email, Role (Editor "Can add and change records" / Viewer "Can read and report squawks"), **Send invitation** (online, or queued: "The invitation is sent when you have signal.").
**States.** Unconfirmed pages exist: line "6 pages aren't confirmed yet. They won't be in the room until you confirm them." + **Review**. Viewer: only "Share a summary". Offline: **Make the link** is disabled with "Making a link needs signal, so it works the moment you send it."; the choices are kept as a draft (05 §6.5).
**Acceptance.**
- [ ] The preview shows exactly what the recipient will see first.
- [ ] Only confirmed entries go into a room, summary or dossier.

### M-SHARE-02 Link made
Mockups: d-m-link, b-m-link.
**Purpose.** The QR code for showing the buyer in person, the link to copy, expiry, what it holds, and that it opens on the map.
**Layout** (pushed; back "Share"; title "Link made"):
| Region | Content |
|---|---|
| Label | "Pre-buy for J. Okafor" 22/800; "A read-only record room. No account needed." |
| QRCard | QR 220×220 on white with a 16 quiet zone (white in dark mode too); tap → full screen at maximum brightness |
| Link row | "mytaillog.com/r/7KQ2M4" type.numeric 16 + **Copy** (copy icon); copied toast "Link copied." |
| KeyValueList | Expires "Dec 18, 2026, in 30 days · **Change**"; Opens on "The map of 48 years, then the tabs"; Holds "5 logbooks, 412 pages, 14 documents, and a plain note of the 1983 to 1991 gap" |
| Primary | **Send the link** (send) → share sheet |
| Note | 14 ink-3: "Opens are logged in Share. Revoke it there any time." |
**Offline.** Not reachable offline (links are made online only); an existing link's QR and copy still work offline from the cache.
**Acceptance.**
- [ ] The QR encodes exactly the shown link.

### M-SHARE-03 Links and people (added; W-SHARE-01's management half)
**Purpose.** Live links with expiry, opens and revoke; people and roles.
**Layout** (pushed; title "Links and people"): group "Live links" rows (label, "Expires Dec 18 · opened 3 times · last Nov 17"); tap → link detail: the open log (date, time, approximate place if the server provides it), **Change expiry**, **Revoke link** (alarm text; "Revoke this link? J. Okafor won't be able to open it again."). Group "Expired and revoked" (collapsed). Group "People": rows (name, email, role); owner can change role (Menu) or **Remove access** (asks); "Invite someone" → invite sheet.
**Acceptance.**
- [ ] Revoking needs a connection; offline the button is disabled with its reason (14-decisions.md D1).

---

## 9. Tablet
Reference size 1024×768pt landscape (iPad 10th gen class) and 1280×800dp (Android tablets). Tablets use the binder: the Rail (240 wide, cover) with the RailPlate (tail with chevrons-up-down, sync line "Synced 9:38"), six SectionTabs with sublines (Status "1 overdue, 3 soon" · Logbooks "412 pages" with a "6" badge · Maintenance "2 open squawks" · Aircraft "Tach 4212.4" · Documents "14 in the vault" · Share "1 link live"), and the RailFoot (**Search or ask** ⌘K, **Add** ⌘N, Account). The board: BoardHead (title 30/800, SubTabs, board actions), the spine (52 tall) under it, then leaves (left : right 1.62 : 1 on records screens, 1 : 1 on review). Portrait on 11-inch and smaller: the Rail collapses to a 96-wide icon rail with tab colours and badges; tapping the RailPlate opens the full Rail as an overlay.

### T-STATUS-01 Status in two panes
Mockup: d-t-status (b-t-home).
**Layout.** BoardHead "Status" with SubTabs **What's due · Plan ahead** and the board action **Log a flight** (plane-landing). Spine "N734DM 1978 to 2027" bracketing the year ahead, **Map** link at its right. Left leaf: Verdict (22/400, lead 800); LineAhead for 12 months (full leaf width × 200, the four book lines labelled at the left: Airframe, Engine, Propeller, Avionics); DueTable "Due next" with "8 more later" (columns Item with LineChip and page cite · Due · Left · Status), rows 48. Right leaf (SourceMat): the page behind the selected row: "Airframe logbook, page 58 · Dec 3, 2024 · confirmed by you", the scan with the entry highlighted, its transcription in Literata, **Zoom** and **On the map**.
**Interactions.** Selecting a row (tap, arrow keys) changes the right leaf without leaving the list; Mark done opens as a popover-style sheet anchored to the row (iOS `.popover` with `presentationCompactAdaptation(.sheet)`; Android a side sheet). Double-tap a row → item detail fills the left leaf with its own history line (M-STATUS-05 content), back returns.
**Acceptance.**
- [ ] The page for the selected row is always visible on the right.

### T-STATUS-02 Plan ahead
Mockup: d-t-plan.
**Layout.** BoardHead SubTabs "What's due · **Plan ahead**", board action **Remind me Feb 22** (bell). Spine "N734DM to Mar 1, 2027" bracketing today to the marker. Left leaf: (24-month horizon, fixed), "Hours by then +44 h · 3 a week" control, the LineAhead with the DateScrubber (full leaf × 260) and its legend "current · due soon · lapsed by the marker · suggested visit"; below, "Two suggested visits cover all five": cards "Week of Dec 7 · Oil, transponder, static, VOR. AeroCheck and M. Torres. · **Book this visit**" and "Week of Feb 8 · ELT battery and the seat-rail AD, about 20 h early. · **Open**". Right leaf: statement "By **Mar 1, 2027**, at about tach 4256, five items lapse unless they are done."; table "Lapsed by then · covered by"; "Close behind" group; footnote "Four more stay current. The insurance policy still has no date on file."
**Acceptance.**
- [ ] Dragging the scrubber updates the right leaf continuously (≤ 16 ms per update).

### T-BOOKS-01 Map with pages
Mockup: d-t-map.
**Layout.** BoardHead "Logbooks", SubTabs **Map · Pages · Review 6**, book filter "All books ⌄". Left leaf: the horizontal RouteMap ("48 years, 212 confirmed entries · tap a stop or a visit"; legend Airframe, Engine, Propeller, Avionics, "no pages yet", "one visit"); year axis 1980 to 2027 with Today; era band "Overhauled 2005 · 1409.4 h since overhaul"; under the map, the selected visit's entries ("Jul 14, 2026 · Annual, three books": Airframe "Annual inspection IAW FAR 43 App. D. AD 2011-10-09 c/w." Confirmed; Engine "Annual. Compressions 76/75/77/76 over 80." Confirmed; Propeller "Inspected i/a/w annual. Dressed nicks." Read by AI). Right leaf (SourceMat): "Jul 14 annual, one visit · D. Alvarez, A&P 3105582 IA · tach 4168.3", book tabs Airframe · Engine · Propeller, the page with the entry highlighted, "Airframe p. 60 · 1 of 3", **Zoom**.
**Interactions.** Pinch horizontally to zoom time; trackpad scroll pans time; hover shows a stop's date and title in a tooltip; click selects; arrow keys move between stops on a line, ⌥↑/⌥↓ between lines; Return opens the entry.
**Acceptance.**
- [ ] The right leaf shows one tab per book for a multi-book visit.

### T-REVIEW-01 Review in three panes
Mockup: b-t-review.
**Layout** (≥ 1000 wide): BoardHead "Review", "1 of 6", board action **Confirm the 4 clean pages**. Left pane 120: page thumbnails (p. 199 … p. 203) with state marks; middle: the scan on the mat ("Airframe, page 199 · Scanned Nov 15 · read by AI") with the doubtful ink lit; right pane 340: "Entry 2 of 2 · Annual · Read by AI", fields (Tach "Check", Date, Work, Signed), the doubt explanation ("Could be 1814.6. The entry above reads 1861.2, so 1874.6 fits."), outcome buttons with key hints **Looks right** A · **Edit** E · **Not on this page** X, then "Missed an entry? Add one · Crop and re-read" and primary **Confirm page and next** (Enter). Below 1000 wide: two panes (scan | fields), the page list in a popover from the BoardHead.
**Keyboard.** A / E / X outcomes on the selected field; ↑/↓ fields; ⌘← / ⌘→ pages; Enter (or ⌘↩) confirm page and next; ⌘Z undo the last confirmation; Space toggles zoom to the field.
**Acceptance.**
- [ ] Every review action has a key, shown as a KeyHint beside it when a hardware keyboard is attached (hidden otherwise).

### Tablet mapping of every other screen
| Phone screen | Tablet presentation |
|---|---|
| M-HANGAR-01 | Full board, no rail: aircraft as wide rows with their spine strips; Add an aircraft as a form sheet |
| M-SWITCH-01 | Popover from the RailPlate |
| M-STATUS-05, 06, 07, 08 | Left leaf content with the page on the right leaf; Mark done and VOR as form sheets |
| M-STATUS-04 | Left leaf; the visit's pages (last done) on the right |
| M-MAINT-01, 04, 05 | List in the left leaf, detail (M-MAINT-06, M-MAINT-02) in the right leaf; new squawk as a form sheet with the camera |
| M-BOOKS-06 | Book list left, page grid right (5 columns), page viewer as a full-screen cover |
| M-BOOKS-07 | Entry left, page right |
| M-BOOKS-08 | List left, page right |
| M-BOOKS-09 | Form left, wording preview and sticker preview right |
| M-SCAN-01 | Popover from Add; camera full screen |
| M-SCAN-03 | Left leaf queue, right leaf the map for the years covered |
| M-FLIGHT-01 | Popover from Add (RailFoot) |
| M-FLIGHT-02..05 | Form sheet (camera full screen) |
| M-ASK-01 | A 520-wide overlay pane over the board (⌘K), results left, cited page right when expanded |
| M-AIRCRAFT-01..06 | Left leaf content; the source (entry, page, document) on the right |
| M-DOCS-01, 02 | Documents tab: list left, document right |
| M-SHARE-01..03 | Audiences left, room preview right (full size) |
| M-SYS-01 | Changes left, the selected conflict's Yours / Theirs right |
| M-SYS-02, 05 | Settings list left, section right (iOS Settings style) |

---

## 10. System and native-only screens

### M-SYS-01 Waiting to upload, with a conflict
Mockup: b-m-pending.
**Purpose.** Everything on this phone that hasn't reached the server, refusals with their reason, and conflicts shown as yours beside theirs. Nothing is overwritten silently.
**Entry.** SyncLine sheet; OfflineBar; ConflictBar **Compare**; CONFLICT notification; deep link `/sync`.
**Layout** (pushed; back to the previous screen; title "Waiting to upload"):
| Region | Content |
|---|---|
| Summary | "3 changes and 2 pages on this phone." / "Uploading 2 of 5" / "Everything you've recorded has reached the server." with **Sync now** |
| Recent | rows that just uploaded fade to "Uploaded 9:52" (circle-check) for 10 s, then go to the activity list |
| Changed in two places (count) | per conflict: title "Squawk: Left brake feels soft"; explanation "Sam Reyes resolved it on the web at 9:12, while your phone was offline and you added a photo and a note."; a three-column table Field · Yours · Theirs (Sam) with differing rows marked by an alarm-bg row fill, a 3pt alarm bar at the row's start and the word "Different" for screen readers — rows: Status Open / Resolved Nov 17; Note "Pedal sinks further after taxi" / "Bled left brake, firm now"; Photo "1 added" / "None"; Severity Watch / Watch; buttons per 05 §6.6: **Keep both changes** (when disjoint) or **Keep mine** · **Take Sam's** · quiet **Decide later** |
| Not saved (refused) | rows in alarm text: label, reason ("You don't have edit access to N4321J."), **Discard this change** (asks) |
| Waiting | rows: label ("Flight, tach 4212.4 to 4214.8"), time "9:20", state ("On this phone" / "Trying again at 9:45" / "Uploading"); pages and documents as one row each with a thumbnail strip and progress; swipe left **Discard** (asks: "Discard this change? It hasn't reached the server and can't be recovered.") |
| Activity | collapsed "What sync did" (last 200 events, 05 §6.2) |
**Phone layout of the table.** At compact width the table stacks per field: field name 14/700, then "Yours" and "Theirs (Sam)" as two labelled lines; at AX sizes the same.
**Interactions.** Resolving a conflict shows a toast "Kept both changes. Uploading." and removes it from the list once accepted.
**Acceptance.**
- [ ] Every queued, refused and conflicted change is listed by an owner-readable label.
- [ ] A conflict can be left undecided indefinitely.
- [ ] Back from here returns to where the owner came from (critique: today it always lands on the fleet).

### M-SYS-02 Settings
Mockup: b-m-settings.
**Purpose.** Appearance, the offline copy, storage, sync, reminders, account, and sign-out on one screen.
**Entry.** Switcher sheet "Settings"; Hangar avatar.
**Layout** (pushed; title "Settings"; grouped rows 52–64):
| Group | Rows |
|---|---|
| Account | "Dana Morgan · dana@example.com · Apple and email link" → Account details (name, email change, password, **Sign-in methods**: Connect Apple / Google, Add a passkey (phase 2)) |
| Appearance | Segmented **Match system · Light · Dark**; hint "Auto follows your phone. Light reads best outdoors. Text follows your phone's size setting." |
| On this phone | **Keep a full offline copy** (Toggle per aircraft; "412 pages and 14 documents"; progress when downloading); **Use mobile data for the offline copy** (Toggle); **Storage** "1.3 GB · pages 1.2 GB" + **Clear cached pages**; **Page cache limit** (500 MB / 1 GB / 2 GB / No limit); **Show records in phone search** (Toggle) |
| Sync | "Last synced 9:38 · nothing waiting" + **Sync now** (refresh-cw); **Waiting to upload** → M-SYS-01; **Rebuild from the server** ("Downloads every record again. Changes on this phone are kept.") |
| Reminders | "On · 30 days ahead, 10 hours ahead" → M-SYS-05 |
| Logging | **Start Log a flight with the camera** (Toggle, default on); **Open the hangar on launch** (Toggle, default off) |
| AI reading | "Shared allowance: 31 of 50 pages today" ; "Use your own key" → online form (save key, last four shown) |
| On the website | Cloud backups, MyFlightBook, Connected apps, Developer access (each opens in the in-app browser) |
| Help | Help and docs; What's new; **Copy diagnostics**; "Send crash details to MyTailLog" (Toggle, default off) |
| About | Version, licences (MIT, OFL fonts), Privacy policy |
| — | **Sign out** (alarm text) with the 05 §8.6 flow; **Delete my account** (alarm text, online, 05 §8.6) |
**Acceptance.**
- [ ] Signing out with unsent work asks first and offers to sync.
- [ ] Account deletion is possible inside the app.

### M-SYS-03 Lock screen, widget, notifications
Mockups: d-m-lock, b-m-lock.
**Purpose.** The answer without opening the app: a lock-screen widget with the line ahead for the next 60 days, and reminders that carry the whole answer.
**Lock screen (iOS).** `accessoryRectangular`: "N734DM next 60 days" 13/700, a three-row mini line ahead (Today, Dec 7, Jan, Jan 17) with the visit cap and rings, monochrome. If the line cannot render at the user's text size: two text lines "Dec 7 visit: oil, transponder and static" / "VOR check lapsed Nov 11, IFR only". `accessoryInline`: "N734DM: oil 9.7 h · transponder 43 d". `accessoryCircular`: the next item's number (9.7) with "h" and a gauge of the interval used.
**Home screen widgets.** 05 §11.1 (small, medium, large on iOS; 2×2, 4×2, 4×3 on Android) on a leaf so the inks hold.
**Reminder** (DUE / VISIT, 05 §10.2): title "N734DM: three items fit one visit, week of Dec 7"; body "Oil change in 9.7 h (about Dec 12), transponder and pitot-static by Dec 31. AeroCheck Instruments did the last two on Dec 3, 2024, Airframe p. 58."; actions **Plan the visit** · **Remind me Friday**. A lapsed IFR-only item: "The VOR check lapsed on Nov 11. It only matters if you fly IFR."
**Acceptance.**
- [ ] Widgets and notifications use confirmed data only.
- [ ] Every reminder names what, when, who did it last and the page.

### M-SYS-04 Permissions onboarding (added)
**Purpose.** Ask for camera and notification permission in context, after explaining why, so the system prompt is not met cold.
**When.** Notifications: after the first aircraft is enrolled (end of M-HANGAR-03) or when the owner opens M-SYS-05. Camera: the first time any camera opens. Speech: the first time the mic is tapped. Never on first launch.
**PermissionPrimer layout** (full-screen cover on the setup board; leaf from 30% down):
| Permission | Title | Body | Primary | Secondary |
|---|---|---|---|---|
| Notifications | "Reminders that carry the whole answer" | "We'll tell you before something comes due, with the date, who did it last and the page. One reminder per item per due cycle. You can change this any time." Example card: the d-m-lock reminder | **Turn on reminders** (then the system prompt) | **Not now** |
| Camera | "The camera reads pages and the tach" | "Photos of logbook pages upload to read them. The tach is read on this phone and never leaves it." | **Allow the camera** | **Not now** |
| Microphone and speech | "Speak a squawk instead of typing" | "Speech is turned into text on this phone where it can be." | **Allow** | **Not now** |
**After denial.** No repeat prompts. The feature's screen shows the line and **Open Settings** (iOS `UIApplication.openSettingsURLString`; Android `ACTION_APPLICATION_DETAILS_SETTINGS`, or the notification settings intent for notifications).
**iOS.** Notifications requested with `.alert, .sound, .badge`; no provisional authorisation (reminders are the point). Live Activities are allowed by default; push-to-start needs the separate opt-in in M-SYS-05.
**Android.** `POST_NOTIFICATIONS` on 13+; on 12 and below notifications are on by default and the primer is skipped. Exact alarms are not used.
**Acceptance.**
- [ ] No system permission prompt appears without the primer immediately before it.
- [ ] Every feature works or explains itself when its permission is denied.

### M-SYS-05 Notification settings (added; mirrors the web's Settings › Reminders)
**Layout** (pushed; title "Reminders"):
- Master **Reminders** Toggle; state line: "On this phone: on" / "Notifications are off for MyTailLog in your phone's settings." + **Open Settings** / "This phone couldn't register for reminders: <reason>." (today's diagnostics kept).
- Lead times: Annual "90 days before" (stepper in days); Oil change "10 hours before" (hours); ADs and everything else "30 days or 25 hours before, whichever is first" (two steppers). Saved to the profile (shared with email reminders).
- Kinds (Toggles): Coming due and lapsed (on); Shop visits (on); Pages read (on); Flights seen by ADS-B (on if opted in); Changes that need you to decide (on); Record room opened (off).
- Live progress: **Show reading progress on the lock screen** (Toggle, on); **Start it for pages uploaded from the website** (Toggle, off; push-to-start).
- Email: **Also email me reminders** (Toggle).
- **Send a test notification** ("Sent. It should arrive within a minute.").
**Acceptance.**
- [ ] Lead times match the web's for the same account.
- [ ] Turning reminders off unregisters this device only.

### M-SYS-06 Widget configuration (added)
**iOS.** Long-press the widget › Edit Widget: the system configuration sheet from `AppIntentConfiguration` with two parameters: **Aircraft** (list of `AircraftEntity`, default "Last opened") and **Show** (fixed: next 60 days, 14-decisions.md D6; medium and large only). Lock-screen widgets: Aircraft only.
**Android.** A configuration activity on placement (and reconfigurable via the widget's long-press on Android 12+), a leaf with the setup board header "Widget": Aircraft (radio list with tail and model), Show (radio "Next 60 days" / "Next 12 months"), a live preview of the widget at its size, **Add widget**.
**Acceptance.**
- [ ] A widget for an aircraft that is later removed shows "This aircraft isn't on this phone anymore. Edit the widget to pick another."

### M-SYS-07 Android predictive back (added; behaviour)
- Enabled app-wide (`enableOnBackInvokedCallback`). The back-to-home animation shows when back would leave the app (tab root of the start tab, or the hangar with no aircraft).
- Order of handling for one back gesture: (1) an open menu or dropdown closes; (2) the keyboard hides (system); (3) an expanded map sheet collapses to its peek, then closes; (4) a modal sheet closes (if it has unsaved input, the gesture is cancelled and "Discard this …?" asks); (5) a full-screen cover (camera, Ask, review) closes or steps back (review: previous page is not "back"; back leaves review); (6) the tab's stack pops with the cross-fade/peek animation; (7) at a tab root other than Status, back goes to Status (Material guidance for bottom navigation); (8) at Status root, back leaves the app.
- Sheets animate their own collapse during the gesture with `PredictiveBackHandler` (scale 0.9 and translate down with progress).
- The camera's back with pages taken asks "Keep the 5 pages you took?" (the gesture is cancelled until answered).
**Acceptance.**
- [ ] No back gesture ever discards typed input or captured pages without asking.

### M-SYS-08 Keyboard, pointer and drag on iPad and Android tablets (added)
| Shortcut (iOS ⌘ / Android Ctrl) | Action |
|---|---|
| ⌘1 … ⌘6 | Status, Logbooks, Maintenance, Aircraft, Documents, Share |
| ⌘K | Search or ask |
| ⌘N | Add menu |
| ⌘⇧F | Log a flight |
| ⌘R | Sync now |
| ⌘F | Find in the current list |
| ⌘[ or Esc | Back / close |
| ⌘, | Settings |
| ↑ ↓, Return | Move selection in lists, open |
| Review: A, E, X, ↑ ↓, ⌘← ⌘→, Return / ⌘↩, ⌘Z | T-REVIEW-01 |
| Map: ← → between stops, ⌥↑ ⌥↓ between lines, + / − zoom | T-BOOKS-01 |
iOS: `.keyboardShortcut` on commands so holding ⌘ shows the system shortcut overlay; menu bar commands on iPadOS 26 via `.commands`. Android: `onPreviewKeyEvent` handlers and `KeyboardShortcutGroup`s via `onProvideKeyboardShortcuts` so Meta+/ lists them.
Pointer: hover effects on rows, tabs and buttons (iOS `.hoverEffect(.highlight)`; Android pointer hover states via `hoverable`); right-click opens the same context menu as long press; tooltips (`.help`) on icon buttons; trackpad pinch zooms the map and scans.
Drag and drop: drop PDFs and images on Documents (adds) or on a logbook in Pages (scans them as pages, asking "Add 3 images to the Airframe logbook as pages 199 to 201?"); drag pages within a logbook to reorder; drag a page or document out to other apps (as a file).
**Acceptance.**
- [ ] Every shortcut appears in the system shortcut list.

### M-SYS-09 Apple Watch and Wear OS complication (optional, added)
Phase 3, not required for launch. A complication (WidgetKit accessory families on watchOS 11+: circular, rectangular, inline, corner; Wear OS Tiles and a `ComplicationDataSourceService` with SHORT_TEXT and RANGED_VALUE) showing the next item for the chosen aircraft: "Oil 9.7 h" with a range gauge; tapping opens a one-screen watch app: the Verdict, the next three items, and **Log a flight** (digital crown adjusts the tach by 0.1 from the last reading; sends to the phone, which queues it). Data from the phone's widget snapshot via WatchConnectivity / the Wearable Data Layer; no direct network.

---

## 11. Coverage: today's mobile app → new screens
Every screen, view and capability in `research/mobile-inventory.md` (§1 screen map, §3 specs, §4 offline, §6 mobile-only strengths) and where it lives now. "Kept" means the behaviour carries over; "Changed" says how.

| Today (file) | Capability | New screen | Notes |
|---|---|---|---|
| `index.html` boot placeholder, `App.tsx` Loading | Startup and session restore | Launch screen (05 §20) → last screen | No "Loading…" text; the mirror renders at once |
| `App.tsx` Login | Apple (iOS) / Google (Android), email password, magic link, sign up | M-AUTH-01 | Changed: Apple and Google on both platforms; link plus 6-digit code; forgot password added |
| `App.tsx` Shell not-native notice | Desktop browser warning | — | Not needed (native apps) |
| `screens.tsx` Hangar, `App.tsx` header | Fleet home: cards worst first, sync word, pending banner, avatar | M-HANGAR-01 | Changed: sync time stated; Add an aircraft and Import added |
| `first-run.tsx` | First run: steps, "How did you hear", Add my aircraft | M-HANGAR-01 empty state, M-HANGAR-02, M-HANGAR-03 | "How did you hear" moves to M-HANGAR-03 step 3 as an optional row (writes `profile.heard_about`) |
| `enroll-sheet.tsx` | Tail → FAA registry → confirm → enrol (online) | M-HANGAR-02 | Kept, plus five logbooks named before committing |
| `account-menu.tsx` | Sync now | M-SWITCH-01, M-SYS-02 | Reachable from every screen |
| `account-menu.tsx` | Connect Apple/Google | M-SYS-02 › Account › Sign-in methods | Kept with the mismatch wipe (05 §8.3) |
| `account-menu.tsx` | Help & docs | M-SYS-02 › Help | Kept |
| `account-menu.tsx` | Send a test notification; push failure reason | M-SYS-05 | Kept |
| `account-menu.tsx` | Download all for offline, progress, retry | M-SYS-02 › Keep a full offline copy | Changed: per aircraft, background download |
| `account-menu.tsx` | Rebuild from the server | M-SYS-02 › Sync | Kept |
| `account-menu.tsx` | Storage readout, Clear cached scans | M-SYS-02 › On this phone | Kept, plus a cache limit setting |
| `account-menu.tsx` | Run a backup now | M-SYS-02 › On the website › Cloud backups (in-app browser) and M-AIRCRAFT-06 overflow **Run a backup now** (online) | Kept; copy "Backup scheduled" |
| `account-menu.tsx` | Appearance Match / Light / Dark | M-SYS-02 › Appearance | Kept |
| `account-menu.tsx` | Website links (profile and reminders, backups, MyFlightBook, developer access) | M-SYS-02 › On the website; reminders now native (M-SYS-05) | Changed |
| `account-menu.tsx` | Sign out with unsent work guard | M-SYS-02, 05 §8.6 | Kept |
| `account-menu.tsx` | Delete my account (web link), Privacy policy | M-SYS-02 | Changed: deletion in the app |
| `pending.tsx` Pending, PendingBanner | Waiting to upload: queued writes, pages, documents, refusals | M-SYS-01; OfflineBar, ConflictBar, SyncLine (§1.3) | Changed: visible inside every aircraft screen |
| `pending.tsx` Conflict | Field / Yours / Theirs; Keep mine / Take theirs / Decide later | M-SYS-01 | Kept, plus "Keep both changes" when fields differ |
| `announcement.tsx` | Admin notices, dismiss per account | Notice (§1.9) on M-STATUS-01 and M-HANGAR-01 | Changed: a row, not a floating card |
| `lightbox.tsx` | Full-screen image, pinch, pan, double-tap, swipe down | ScanViewer full screen (M-BOOKS-06, M-BOOKS-07, M-DOCS-02) | Kept |
| `switcher.tsx` | Switch aircraft in place keeping the tab; See all aircraft | M-SWITCH-01 | Kept |
| `tabbar.tsx` | Status · Log · Records · Squawks | PhoneTabBar: Status · Logbooks · Maint. · Aircraft · Share (§1.1) | Changed: Log moves to Add; Records splits into Logbooks and Aircraft › Documents; Squawks into Maint. |
| `layout.tsx` iPad sidebar, two-pane, three-pane | iPad layouts | §9, T-* | Changed: the binder Rail; six tabs |
| `status-screen.tsx` Status | Verdict ring, headline, detail, meter tiles, Needs attention, link to all items, footnote | M-STATUS-01 | Changed: sentence and line ahead replace the ring; meters move to Aircraft (and the Saved screen) |
| `status-screen.tsx` AllItems › Inspections | Items with countdown, filters, Mark done, Set up standard inspections, Scan the logs for completions | M-STATUS-08 (due list), M-MAINT-04 (setup) | Kept |
| `status-screen.tsx` AllItems › Directives, `ad-compliance.tsx` | AD list, AD sheet: track, record compliance, retire, delete, full text link | M-MAINT-01, M-MAINT-06, M-MAINT-07 | Changed: Find ADs on the phone |
| `status-screen.tsx` AllItems › Equipment, `equipment-list.tsx` | Proposals, install, edit, remove, reinstall, delete, find in logs | M-AIRCRAFT-03 | Kept |
| `item-editor.tsx` | Create, edit, delete an item; unsaved guard | M-MAINT-04 item editor | Changed: live "Next due works out to" preview |
| `complete-screen.tsx` | Mark done with date, meter, hours, notes | M-STATUS-06 | Changed: entry link, new due preview, Undo |
| `complete-screen.tsx` VOR | 91.171(d) fields | M-STATUS-07 | Kept, plus kind of check and tolerance |
| `record-screen.tsx` Record | Log a flight: steppers, Not this time, oil presets, Save | M-FLIGHT-02, M-FLIGHT-03, M-FLIGHT-04 | Changed: tach photo, typed values, date, line-ahead effect |
| `record-screen.tsx` Finish saving flight sheet | Partial failure: Retry / Discard | Not needed: one outbox transaction per flight; failures show in M-SYS-01 | — |
| `meter-reset-prompt.tsx` | New meter / mistyped / right as typed | M-FLIGHT-03 meter-replacement question; undo in M-AIRCRAFT-02 | Kept; the undo now exists |
| `record-screen.tsx` RecentReadings, ReadingEditor | Last 30 readings, correct, delete | M-AIRCRAFT-02 | Kept |
| `records-screen.tsx` Records segments | Documents · Scans · History | M-DOCS-01, M-BOOKS-06, M-BOOKS-01/08 | Changed |
| `documents-screen.tsx` | Search, Add a document, Carry aboard card, Everything else, upload waiting | M-DOCS-01 | Changed: missing carry-aboard rows have "Add it" |
| `document-upload.tsx` | Choose a file / camera, type, name | M-DOCS-03 | Kept, plus expiry |
| `documents-screen.tsx` DocumentActions | Attach to an entry, detach, remove | M-DOCS-01 long press, M-DOCS-02 Details | Changed: rename and retype added |
| `pdf-screen.tsx` | PDF viewer, Prev/Next, zoom | M-DOCS-02 | Changed: native PDF view, share, print |
| `wb-view.tsx` | W&B current, stale warning, revisions | M-AIRCRAFT-04 | Changed: add a revision |
| `oil-view.tsx` | Hours per quart, lab table | M-AIRCRAFT-05 | Changed: top-offs listed and deletable |
| `ask-pane.tsx` | Ask with citations, allowance, offline message | M-ASK-01 | Changed: one field with search; citations open entries |
| `records-screen.tsx` shareSummary | Text summary to the share sheet | M-SHARE-01 "Share a summary" (PDF) | Changed: PDF, offline |
| `records-screen.tsx` Share a records link | Opens the website | M-SHARE-01, M-SHARE-02, M-SHARE-03 | Changed: native |
| `screens.tsx` Pages, Thumb | Thumbnails by logbook, Needs a look, Confirm N clean | M-BOOKS-06; Review segment; T-REVIEW-01 "Confirm the 4 clean pages" | Kept |
| `page-manager.tsx` | Sort, reorder, select, retake, delete | M-BOOKS-06 book page | Kept |
| `capture-screen.tsx` | Scan pages sheet: logbook chips, handwritten, held pages, upload | M-SCAN-01, M-SCAN-03 | Changed: allowance shown; queue screen |
| `capture.ts` | VisionKit / ML Kit scanner, 24 pages | M-SCAN-02 (custom), system scanner fallback | Changed |
| `screens.tsx` PageViewer | Dark page view, swipe, strip, spotlight | ScanViewer (M-BOOKS-06), M-REVIEW-01 | Kept |
| `review-pane.tsx` EntriesDrawer, PageReview, EntryCard | Drawer, field rows, Check this, spotlight, confirm, merge, delete, mark reviewed, flag, missed entry, read this page | M-REVIEW-01, M-REVIEW-02, M-REVIEW-03 | Changed: least certain first, three outcomes, confirm and next |
| `entry-editor.tsx` | Edit an entry, add a missed one, raw OCR | M-REVIEW-02 ("What the reader saw"), M-BOOKS-07 Edit entry | Kept |
| `screens.tsx` Entries, `history.ts`, HistoryFilters | History: search, category chips, year, month groups, merged tag | M-BOOKS-08, M-ASK-01 | Kept |
| `screens.tsx` EntryDetail | Entry with scan, Print sticker, Create correction | M-BOOKS-07 | Changed: what it satisfied, edit, share |
| `authored-entry-screen.tsx` | Authored entry, emailed 8-digit code, e-sign | M-BOOKS-09 | Kept |
| `squawks-screen.tsx` | Waiting to upload, Open, Resolved, swipe to resolve, New squawk FAB | M-MAINT-05 | Changed: swipe opens a confirmation |
| `squawks-screen.tsx` Composer | Description + Low / Watch / Ground | M-MAINT-03 | Changed: photos, dictation, no default severity |
| `squawk-detail.tsx` | Edit, resolve with date and entry, reopen, delete | M-MAINT-02 | Changed: resolution notes writable; send to mechanic |
| `push.ts` | Push registration, state, reminders | 05 §10, M-SYS-05 | Changed: tap handling, actions, more kinds |
| `theme.ts`, `tokens.ts` | Light and dark, live switch, status-bar style | 05 §20 | Kept with D's palettes |
| `shortcuts.ts` | ⌘1–4, ⌘N, ⌘F, ⌘K, ⌘←/→, ⌘↩ | M-SYS-08 | Kept and extended |
| `layout.tsx` drag-drop | Files onto Documents, reorder pages | M-SYS-08 | Kept |
| `auth.ts` deep link | OAuth and magic-link return | 05 §8.4, §5.5 | Changed: Universal/App Links |
| Offline mirror (`db.ts`, `sync.ts`) | Everything readable offline | 05 §6 | Kept |
| Durable queues (`mutations.ts`, `actions.ts`, `blob-upload.ts`) | Offline writes, idempotent ids, backoff | 05 §6.4, §7.2 | Kept |
| Blob cache (`blobs.ts`) | 500 MB ceiling, documents pinned | 05 §7.3 | Changed: 1 GB default, cited pages pinned |
| Not built today | Widget, Siri Shortcut, pushes for reading finished and conflicts | M-SYS-03, M-SYS-06, 05 §11–13 | New |

---

## 12. Screens added to the canonical list
The writers' brief's list does not include these; the lead should add them (or merge them) so every file uses the same ids.
| Id | Screen | Why it is needed |
|---|---|---|
| M-HANGAR-03 | First setup | The phone needs W-SETUP-01's three steps to reach a first verdict after enrolling |
| M-SWITCH-01 | Aircraft switcher | Phone version of W-SWITCH-01; also the route to Settings, Hangar and Sync from every screen |
| M-STATUS-08 | All items (due list) | b-m-due exists in the mockups; item detail's back target |
| M-MAINT-04 | Tracked items | Maint. › Items; W-MAINT-06 on the phone |
| M-MAINT-05 | Squawks | Maint. › Squawks list behind M-MAINT-02 |
| M-MAINT-06 | AD detail and compliance | Recording compliance, retiring with a reason |
| M-MAINT-07 | Find ADs | W-MAINT-02 on the phone |
| M-BOOKS-08 | Entries as a list | b-m-timeline; the accessible equivalent of the map |
| M-BOOKS-09 | Write a logbook entry | Today's authored-entry screen |
| M-FLIGHT-05 | Add oil | Oil without a flight (fixes workflow D) |
| M-AIRCRAFT-02 … 06 | Hours and readings, Equipment, Weight and balance, Oil and engine, Aircraft details | Detail screens behind M-AIRCRAFT-01's groups |
| M-DOCS-02, M-DOCS-03 | Document viewer, Add a document | Behind M-DOCS-01 |
| M-SHARE-03 | Links and people | Revoke, expiry, opens, roles |
| M-SYS-04 … 09 | Permissions, Notification settings, Widget configuration, Android predictive back, Keyboard and pointer, Watch/Wear (optional) | Native platform needs |

Components this file uses that are not on the brief's list are defined in 05-mobile-architecture.md §30 (SyncLine, OfflineBar, PendingCaption, ScanCamera, MeterReader, MeterStepper, SeverityPicker, SignaturePad, PermissionPrimer, QRCard, Notice) plus **ConflictBar** (§1.3 here: a 36pt alarm-bg strip with "1 change needs you to decide." and Compare) and **PhoneSubTabs** (the leaf-coloured segmented control on a phone board, §1.1).

---

## 13. Open questions
1. **Due-soon window.** The mockups mark the transponder "Due soon" at 43 days, which is outside the default 30-day reminder lead. This file takes the window from 08-capabilities.md; the lead should state the rule (per-item lead time, or a fixed 60-day window) in one place.
2. **Horizon group names** ("Before the new year") need a rule in 12-copy-and-voice.md for other times of year.
3. **Ask allowance numbers.** The phone shows "N of M questions left today" from the server; 08 should state whether Ask has its own daily cap or shares the reading allowance.
4. **Visits as data.** Booking a visit, cancelling it, and reminders that follow it need a `shop_visit` table and mutation types in 09-data-and-api.md (05 §6.4 lists the types reserved).
5. **Squawk photos and the mechanic link. Resolved:** 09 §2.8 (0076) adds photos and mechanic links; the link is made online through 09 §4.12, not a queued `squawk.share`.
6. **Gap marks** ("No pages exist", "I asked the previous owner") need storage and must flow to record rooms and dossiers (09, 04).
7. **Viewer squawks.** Today viewers can report squawks; confirm this stays (it is kept here).
8. **"Open the hangar on launch"** default is off (launch opens the last aircraft). Confirm with the lead's flows (07).
9. **Android lock screen.** Android phones have no third-party lock-screen widgets; the lock-screen experience there is the notification only. Confirm that is acceptable for M-SYS-03.
10. **Watch and Wear** (M-SYS-09) is optional; the build plan decides the phase.
11. **Allowance reset wording. Resolved** in 12-copy-and-voice.md §7 (rolling 24 hours). Original note: the mockups say "Resets at midnight"; today's server frees each AI call 24 hours after it was used (docs-digest §1.11). 12-copy-and-voice.md and 08-capabilities.md should settle the rule and the sentence.
12. **Mock-only figures.** "Burns about 1 qt in 9.2 h" (M-AIRCRAFT-01) and "12 of 30 questions" (M-ASK-01) are illustrative, not from the brief's mock data.
