# Addendum: Screens 12–24 — regular width, and the surfaces that let you finish the job

Written against `design_handoff_ios_redesign/README.md` (direction "Verdict first") and the screen-11
addendum. Same tokens, same type scale, same voice. **Nothing here introduces a new colour, radius or
family.** Two frames carry the drawings:

- `MyTailLog iOS Redesign - iPad regular width 12-18.dc.html` — screens 12–18, 1194 × 834 (11" iPad,
  landscape), authored at the same 390 pt logical scale as the phone frames.
- `MyTailLog iOS Redesign - Sheets and overlays 19-24.dc.html` — screens 19–24, phone frames at
  340 × 718 and iPad frames at 1194 × 834.

## Why this exists

The approved handoff specifies ten phone screens; screen 11 added capture. It says nothing about the
iPad, and it says nothing about **editing**. Both gaps are the same gap: the app can show a logbook and
add four kinds of row to it, and every correction, every resolution, every install and every conflict
still sends the owner to the web.

Pilots live on the iPad. It is in the flight bag and on the hangar bench, and the desk work MyTailLog
exists for — reviewing an annual against the scan, walking an inspector through the ADs — is exactly
what a tablet is for. Today it runs the phone layout at 1194 points, with four meter tiles stretched
across a screen wide enough to hold the scan beside them.

### Two rules the whole addendum obeys

1. **Regular width is a layout change, not a redesign.** Every composition here is the phone's own
   pieces placed side by side. The verdict ring, the meter tiles, the attention card, the All-items
   rows, the page grid, the entry cards, the vault list, the timeline — none is redrawn. `Sidebar` and
   `TwoPane` compose; the screen components take the same props at both widths.
2. **One surface, two presentations.** Every new editor is a **sheet** at compact width and an
   **overlay on the right pane** at regular width. Same content, same order, same copy. Nothing is
   authored twice.

The breakpoint is **700 pt** (`useSizeClass`). Full-screen iPad in either orientation is regular; Split
View beside ForeFlight and Slide Over fall back to the phone layout unchanged, which is the right answer
— at 507 pt a two-pane layout is two bad columns.

---

## 12 · Sidebar

**Purpose.** Replace the tab bar at regular width without moving anything the owner already knows. The
four destinations keep their order and their icons; the tail number keeps its job as the aircraft
switcher; the account keeps its corner.

**Layout.** 200 pt fixed column, `surface`, 1 pt `hairline` right border, padding 18 / 12 / 16.

1. **Fleet switcher**, top. `surfaceRaised`, 1 pt `hairline`, radius 12, min-height 52, padding 10 × 12.
   Tail in Space Grotesk 17/700, type beneath at 11.5 `dim`, trailing `chevron.up.chevron.down` in
   `faint`. Tapping opens a **popover anchored under it** — 300 pt wide, `surface`, radius 16, 8 pt
   padding, shadow `0 18 48 rgba(0,0,0,.45)` — using screen 2's picker row idiom exactly: tail in
   Space Grotesk 15/700, type 12 `dim`, status pill trailing, 52 pt rows. Hairline, then
   **"See the whole fleet"** at 44 pt in `accent`.
2. **Nav**, 18 pt below. Rows 44 pt, radius 11, padding 0 × 12, 4 pt gaps, 19 pt icon + 11 pt gap +
   14.5/500 label in `dim`. Selected row: `surfaceRaised` fill, `accent` label at 600.
   Order: Status · Log · Records · Squawks, then an 8 pt gap and **Ask**.
   A destination with attention shows a **count** (Space Grotesk 12/700) in `warning`, or `danger` if
   anything there is grounding. Rows without a count show their shortcut in `faint` 10.5 instead —
   `⌘1`–`⌘4`, `⌘K` for Ask. The count wins; the shortcut still works.
3. **Account**, pushed to the bottom (`margin-top:auto`). 52 pt, 30 pt avatar circle in `surfaceRaised`
   with initials, name 13.5/600, and beneath it the **sync line** — "Synced 4 min ago" — 11 `faint`.

**Copy.** The sidebar labels are the tab labels, unchanged. The sync line is the only new string and it
never says "queue": *Synced 4 min ago* · *Syncing…* · *Waiting for a connection*.

**SF Symbols.** Status `gauge.medium` · Log `plus.circle` · Records `folder` · Squawks `flag` ·
Ask `sparkles` · fleet chevron `chevron.up.chevron.down` · account `person.crop.circle`.

**What this fixes.** The tab bar at 1194 pt is four icons marooned at the bottom of a very wide screen,
and the aircraft switcher was in the header, which regular width does not have. The sidebar keeps both
gestures in place: you still switch aircraft in place, you still keep the tab you were on.

---

## 13 · Status, regular

**Purpose.** The verdict and the answer to "what else?" on screen at once. On the phone that is a scroll;
on the iPad it is a glance.

**Layout.** `TwoPane` ratio **40/60**, 16 pt gutter, 20 pt screen padding.

*Title row:* "Status" (Space Grotesk 26/700, −0.02em) with "N9363V · Cessna 172M" trailing at 12.5
`faint`. This replaces the phone header; the tail is in the sidebar too, and repeating it here is what
makes a screenshot self-describing.

*Left pane* — the phone's own stack, unchanged, at a 40 % column:
- **Verdict ring** 120 × 120, 5 pt stroke, track `surfaceRaised`, arc in the semantic colour, number in
  Space Grotesk 28/700 over a 10.5 `dim` unit.
- **Verdict line** 19/700 in the semantic colour, then the plain-English second line at 13 `dim`,
  max 250 pt, centred: *"Everything else is clear. Book the annual before 28 Sep."*
- **Meter tiles**, two across, 10 pt gap: label 10.5/600 tracked `faint`, value Space Grotesk 21/700
  tabular, then provenance at 11.5 `faint` — *"5 days ago · logged by you"*.
- **"NEEDS ATTENTION"** section label, then the attention card: `surface`, border `tint.warningBorder`,
  radius 16, padding 13 × 15 — title 15.5/600 with the rule number as a 10 pt `tag`, the due line in
  `warning`, the interval in `faint`, and one 44 pt **Mark done** button.
- **"Clear for now"** row, radius 16, min-height 44: the count in `success` and the items named in
  `faint`, so the six things that are fine are still visible without a tap.
- **Foot note**, 11.5 `faint`: *"Worked out on this iPad from your last sync. It mirrors your records —
  it isn't the logbook, and the PIC is still responsible for airworthiness under 91.7."*

*Right pane* — a `pane card` (`surface`, `hairline`, radius 18, padding 16): "All items" 19/700 with
"7 tracked" trailing in `faint`, the **segmented control Inspections · ADs · Equipment** (38 pt
segments, radius 12/9), a chip row (All 7 · Required 5 · Advisory 2), then the item rows at 14 pt gaps.
Each row is the phone's row: title 14.5/600, countdown Space Grotesk 13/700 in the semantic colour, a
4 pt progress bar, and a metadata line — *"Required · every 12 mo · 28 Sep 2026"*. A 36 pt ghost
**"Add an item"** closes the list.

**Copy.** Unchanged from screen 1 and screen 3. The one new string is the pane heading **"All items"**
— on the phone this is a segmented screen, and at regular width it needs a name.

**SF Symbols.** Mark done `checkmark.circle` · add an item `plus` · segmented control none.

**What this fixes.** On the phone, "what else is due" is below the fold — the ring answers the question
and the list answers the follow-up, and the follow-up costs a scroll. At regular width there is no
follow-up: both are on screen, and the "Clear for now" row stops the app looking like a list of
problems when six of seven items are fine.

### 13L · The light appearance

The same frame in the light set — see the token table at the end. Every semantic colour is still paired
with its word (`GROUNDED` / `DUE SOON` / `AIRWORTHY`), and the tints are the same alphas over a light
`surface`.

---

## 14 · Log, regular

**Purpose.** Give the meters a sane width, and put **the last thirty readings beside them** so a slipped
digit is visible at the moment it is typed.

**Layout.** `TwoPane` ratio **40/60**.

*Left pane* — the phone's Log panel at a fixed, comfortable width: `surface`, radius 18, padding 18 × 16.
- Title "Log a flight" 19/700 with "Today · 2 Sep 2026" trailing in `faint`.
- Two **steppers**: 64 pt label column (TACH / HOBBS, 10.5/600 tracked), 46 pt − and + keys in
  `surfaceRaised` radius 13, a 46 pt value field on `bg` with the number in Space Grotesk 20/700, and a
  74 pt trailing column reading *"was 2417.3"* over the delta in `success`.
- Hairline, then **"Oil added"** with the label *optional*: four 44 pt options — None · ½ qt · 1 qt ·
  Other — selected one in `tint.accent` with an `accent` border. Beneath, 12 `faint`: *"Any amount —
  half a quart counts. Tracked against the meters you recorded, so it shows up on your consumption
  trend."*
- One **primary**, 52 pt: **Save to logbook**, and under it *"Saves immediately when connected · kept on
  this iPad until it can."*

*Right pane* — "Recent readings" with "last 30" trailing. Rows 52 pt, radius 14, padding 0 × 14:
86 pt date column in `dim`, then tach and hobbs as Space Grotesk 15/700 over 10 pt tracked unit labels,
and a trailing **source** at 11.5 `faint` — *logged by you* · *from a log entry* · *ADS-B*.

- **Pointer hover** swaps the source for two 36 pt ghost buttons, **Edit** and **Delete**.
- **Touch** uses the same swipe as the phone: the row translates 96 pt to reveal a `danger` Delete.
- A reading **lower than the one before it** keeps its row and gains a `warning` note under it —
  *"Hobbs below the reading before it"*. Flagged, not hidden.
- Foot: *"Tap a reading to correct it. A reading that is lower than the one before it is flagged, not
  hidden — that is usually a slipped digit."*

**SF Symbols.** − `minus` · + `plus` · edit `pencil` · delete `trash` · flagged row
`exclamationmark.triangle`.

**What this fixes.** Today a mistyped tach is invisible until a countdown goes strange weeks later.
Showing the history next to the input is the cheapest possible check, and it is only affordable at
regular width — which is why the phone keeps the list one tap away instead.

---

## 15 · Records › Scans, regular — the review layout

**Purpose.** The screen the iPad exists for: the page rail, the scan, and the entries read from it, all
on screen. This is the web's proven review layout, not a new idea.

**Layout.** Title row "Records" + the Documents · Scans · History segmented control, then a **three-way
split**: a 40 % left pane holding the page rail, and a right pane itself split 55/45 into scan and
entries.

*Left — page rail.* Chips **Needs review 4** · **All 97**, then logbook sections
("Airframe · 61 pages", "Engine · 36 pages") over a 2-column grid of 3:4 thumbnails, radius 9. The page
number sits bottom-left in Space Grotesk 11/700; a 8 pt `warning` dot top-right marks a page with
something to check. The current page carries a 2 pt `accent` outline at 1 pt offset.

*Middle — the scan.* Header "Page 16 of 97" 19/700 with "Airframe" and the `⌘← ⌘→` hint in `faint`.
The image fills the pane at radius 10 under a 42 % scrim, and the **spotlight** is a 2 pt `accent`
rectangle over the region a field was read from, with `box-shadow: 0 0 0 4px tint.accent, 0 0 24px
tint.accentBorder` — the ◎ ring. Hint at the foot: *"Tach — read from here. Tap the page to magnify."*
Two 36 pt ghosts under the image: **Re-read page** and **Missed an entry?**, and a `pill.ok` **Reviewed**
when the page is done.

*Right — entries on this page.* "Entries on this page" with "2 · 1 to check" trailing. Each entry card:
`surface`, radius 16, padding 13 × 14 — date in Space Grotesk 14/700, a kind `tag`, a trailing pill
(**Check 1 field** in `warning`, **Confirmed** in `success`), the description at 13.5/1.5, then a
2-column **field grid**. Each field is a 44 pt cell, radius 10: key 10/600 tracked `faint`, value in
Space Grotesk 14/700 (or Instrument Sans 13/500 for text), and a trailing 26 pt **locate** button. A
field read uncertainly carries `tint.warning` and its border. The field whose spotlight is lit gets an
`accent` border and the locate button turns `accent` on `tint.accent`.
Actions: **Confirm ⌘↩** (primary, 44 pt) and **Dispute** (ghost). Foot: **Confirm all that look right**.

**Copy.** *"Check 1 field"*, not "1 low-confidence field". *"Re-read page"*, not "re-extract".
*"Missed an entry?"*, not "add manual entry".

**SF Symbols.** Prev/next `chevron.left` / `chevron.right` · locate `scope` · magnify
`plus.magnifyingglass` · re-read `arrow.triangle.2.circlepath` · reviewed `checkmark.seal` ·
confirm `checkmark` · dispute `exclamationmark.bubble`.

**What this fixes.** Reviewing on the phone means alternating between the crop and the value. Here the
scan is the reference and the fields sit beside it, with ◎ showing exactly which marks on the paper
produced the number under the cursor. This is the single strongest argument for regular width, and it is
why Scans gets three panes where every other tab gets two.

---

## 16 · Records › Documents, regular

**Purpose.** The vault and the document itself, side by side — and a drop target, because on an iPad the
document is usually already in Files.

**Layout.** `TwoPane` **40/60**.

*Left — the vault.* A 44 pt search field (16 pt text — it is editable), then the **Carry aboard** card:
`surface`, radius 16, a `pill.ok` **All present**, the line *"AROW — required on every flight"*, and a
2-column grid of four 10 pt slots (Airworthiness cert. · Registration · Operating limits · Weight &
balance), each with a `success` "In the vault" beneath. Then **"Everything else · 9"** and the document
rows: 56 pt, radius 14, a 32 × 40 type chip (PDF / JPG) in `surfaceRaised`, title 14/600, and a
metadata line — *"12 Nov 2024 · linked to an entry"*. The selected row is `tint.accent`.

*Right — the document.* Title 19/700 with the attachment line beneath — *"Attached to: 12 Nov 2024 ·
Avionics install"* — a **Share** ghost, and the PDF filling the pane on white, radius 10, with
"Page 1 of 2" at the foot.

*Drop target.* While a file is dragged over the left pane it gains a 2 pt dashed `accent` border at
−4 pt inset over `tint.accent`, with a centred `surface` card: **"Drop to add to the vault"** 15/600
`accent` over *"PDF or photo · you'll name it next"* 12 `dim`. Releasing opens screen 23 with the file
already chosen. A 56 pt **Add a document** FAB sits bottom-right for the same job by tap.

**SF Symbols.** Search `magnifyingglass` · add `plus` · share `square.and.arrow.up` · drop
`arrow.down.doc` · PDF `doc.richtext` · photo `photo` · linked `paperclip`.

**What this fixes.** Drag-and-drop from Files is the iPad's own idiom and the reason people file
paperwork on a tablet at all; today the app has no drop target anywhere. The AROW card earns the top of
the pane because it is the one question with a preflight deadline.

---

## 17 · Records › History, regular

**Purpose.** The timeline and the entry, with the entry's **scan** beside its text — so the record and
the transcription are never more than a glance apart.

**Layout.** `TwoPane` **40/60**.

*Left — timeline.* Search field, filter chips (All · Inspection · Oil · Avionics), then month labels
(12/600 tracked `faint`) over 14 pt rows: a 22 pt category glyph circle in the category tint, the date
and tach in Space Grotesk 13/700 — *"14 Mar 2026 · tach 2417.3"* — the description truncated at 13
`dim`, and any AD line beneath it. Selected row is `tint.accent`.

*Right — the entry.* Title in Space Grotesk with "Airframe · page 16" trailing in `faint`, then labelled
blocks (key 10.5/600 tracked, value 13.5/1.5): **Entry**, **Work performed**, **Meters**
("tach 2417.3 · hobbs 3102.8"), **Attached**. Beneath, the **scan thumbnail** at radius 10 with
*"Signed page · tap to zoom"*. Two ghosts: **Attach a document** and **Open on Scans**.

**SF Symbols.** Attach `paperclip` · open on Scans `doc.text.magnifyingglass` · zoom
`arrow.up.left.and.arrow.down.right` · categories `wrench.and.screwdriver`, `drop`, `antenna.radiowaves.left.and.right`.

**What this fixes.** On the phone the entry is a push and the scan is a push from there, so verifying
"does the page actually say that" is two taps and a memory test. Here it is one glance. **Open on Scans**
is the bridge between the two tabs the current app never had.

---

## 18 · Squawks, regular

**Purpose.** Both lists and the squawk, with **resolution in the app** — including which entry cleared
it, so the fix carries a signature.

**Layout.** `TwoPane` **40/60**. Title "Squawks" with a **New squawk ⌘N** ghost trailing.

*Left.* "Open · 2" then "Resolved · 5". Rows: an 8 pt severity dot (`danger` grounding, `warning` watch
it), the text at 14/600 line-height 1.4, and a metadata line — *"Grounding · noticed 30 Aug 2026 · by
you"* for open, *"Cleared 14 Mar 2026 · with the annual"* for resolved. Resolved rows sit at reduced
emphasis; they are not hidden, because a returning symptom is the reason to read them.

*Right.* Title with the severity pill, then **What you noticed** as a block, then a key/value list
(Noticed · Reported by · How serious), each row 9 pt with a `hairline` under it. Then the resolve
section: **"RESOLVE"** label, a 52 pt **"Which entry cleared it?"** picker with *"Optional — link the log
entry so the fix has a signature"* beneath, a **Resolved on** date field, and one primary **Mark
resolved**. **Change severity** is a ghost below it.

**Copy.** *"How serious"* with the options **Grounding — don't fly until cleared** and **Watch it**.
Never "severity: critical". *"Which entry cleared it?"*, never "resolution entry FK".

**SF Symbols.** New `flag.badge.plus` · resolve `checkmark.circle` · severity
`exclamationmark.triangle` · link an entry `link`.

**What this fixes.** Squawks can be raised on the phone and only cleared on the web, which means the
list drifts out of date exactly when someone is standing at the aircraft. Linking the clearing entry is
what turns a squawk from a note into part of the record.

---

## 19 · Ask

**Purpose.** Ask a question about *this aircraft's* records while looking at them. That is the iPad-only
value, so the regular-width form is a pane over whatever tab you are on, not a destination.

**Layout, regular.** The current tab dims to 50 % and a **420 pt overlay** slides in from the right:
`surface`, 1 pt `hairline` left border, radius 18 on the leading corners, 20 pt padding, shadow
`-24 0 60 rgba(0,0,0,.45)`. Title "Ask about N9363V" with a **Done** in `accent`. Beneath it, 12 `faint`:
*"Answers come from this aircraft's records only, with the entry they came from. It is not an
inspector."*

Messages: 88 % max width, radius 14, padding 10 × 13, 14/1.5. Yours right-aligned in `tint.accent`;
the answer left-aligned on `bg` with a `hairline`. **Every answer ends in source chips** — 11/600
`accent` on `tint.accent`, radius 6 — naming the entry and page: *"14 Mar 2026 · Airframe p.16"*.
Follow-up ghosts sit under the last answer: **Open the 14 Mar entry** · **Track it as an item**.

Composer pinned to the bottom: a 46 pt input at 16 pt with the placeholder *"Ask about this
aircraft…"*, a 46 pt send key in the accent gradient, and one line of 11.5 `faint` beneath:
**"Needs a connection · 14 of 50 questions left this month"**.

**Layout, compact (19a).** The identical content as a large-detent sheet over the tab, with suggestion
chips above the composer when the thread is empty. The allowance line shortens to *"Needs a connection ·
14 of 50 left this month"*.

**Copy rules.** Never "AI", never "model", never "tokens". The allowance is stated on the composer where
the cost is incurred, not buried in a profile. "Needs a connection" is the honest constraint — this is
the one surface that cannot work offline, and saying so beside the send key prevents the silent failure.

**SF Symbols.** Ask `sparkles` · send `arrow.up.circle.fill` · done `xmark` · source chip `doc.text`.

**What this fixes.** Ask exists on the web and is invisible on the device where the question actually
occurs — standing at the aircraft, or sitting with the book open. Citing the entry every time is what
keeps it a search tool rather than a claim.

---

## 20 · Field editor

**Purpose.** Correct one field that was read from a page, **against the page** rather than from memory.

**Layout, compact.** A sheet, medium detent: grabber, then a title row — the field name 19/700 with
**Cancel** in `accent` trailing — and a context line, *"Page 16 · Airframe · 2 entries · 1 to check"*.

1. **Read chip.** `pill.due` **Uncertain read** or `pill.ok` **Read clearly**. Never a percentage, never
   the word "confidence" — that is our word for our number.
2. **Raw transcription**, directly beneath the chip: a dashed-`hairline` block on `bg`, radius 12,
   label **"AS READ FROM THE PAGE"** 10.5/600 tracked, then the raw string in 14 italic `dim` —
   `"3102.8" — the last digit could be a 3`. The doubt is stated in words.
3. **Crop.** A 56 pt strip of the scan with the read region boxed in 2 pt `accent`.
4. **The value.** A meter field is a **stepper**: 46 pt − / + keys and a 46 pt value field with an
   `accent` border, Space Grotesk 20/700. Step **0.1**, because that is the resolution of the
   instrument; press-and-hold accelerates. Under it, 12 `faint`: *"Steps by 0.1. Hold to move faster.
   The reading before this entry was 3097.9."*
   A text field (20a) is one 46 pt input at **16 pt** — or several, when the page yields parts:
   **Name** *R. Brock* and **Certificate** *A&P 3311209 IA*.
5. **Actions.** One primary — **Looks right** (or **Save** for a text field) — and two ghosts,
   **Blank it** and **Show on scan ◎**.
6. **Foot** for text fields: *"Fix what the page says, not what should have happened — the scan stays
   the record."*

**Layout, regular (20b).** The same list as a 420 pt overlay on the right pane. The scan stays visible in
the middle pane and the crop step is dropped — the **spotlight on the live scan stays lit for as long as
the editor is open**, which is strictly better than a thumbnail. The context line becomes the full entry
(*"14 Mar 2026 · Annual inspection · Airframe page 16"*) and the primary gains its shortcut:
**Looks right ⌘↩**.

**SF Symbols.** Uncertain `exclamationmark.circle` · clear `checkmark.circle` · show on scan `scope` ·
blank it `xmark.circle` · − `minus` / + `plus`.

**What this fixes.** Every correction is a web trip today. And the two things that make a correction
*safe* — the raw transcription and the place on the page it came from — exist in the data and have never
been shown on the device.

---

## 21 · Item editor and AD compliance

### 21 · Item editor (maintenance)

**Purpose.** Add or change a tracked item without leaving the aircraft.

**Layout.** Sheet (compact) / right-pane overlay (regular). Title **Edit item** with Cancel.
- **What is it** — a 46 pt text input at 16 pt.
- **Kind** — two chips, **Required** / **Advisory**. The word does the work; the colour follows.
- **How often** — a 2-column row: a number input and a unit, then a second pair for the hours
  interval: `12 months` — `— hours on tach`. An item may have either or both; whichever comes first
  wins, which is what "every 12 months or 100 hours" means in practice.
- **Last done** — a date field and an optional hours field.
- **Notes** — a 74 pt text area, placeholder *"Anything else worth recording"*.
- **Result line**, 12 `faint`: *"Next due works out to **3 Apr 2027**. Change the interval and it
  moves."* The arithmetic is shown before saving, not after.
- One primary **Save**; a `danger` ghost **Stop tracking this item** at the foot.

### 21a · AD compliance

**Purpose.** Record where an AD stands, from the aircraft, with the entry that proves it.

**Layout.** Title is the AD's **subject** — *"Seat rail wear"* — with the number as a `tag` beneath
(`AD 2011-10-09`), the interval, and the applicability line (*"Cessna 172 series"*). Never a bare FAR
or AD number as the title; the number is the citation, not the name.
- **Where it stands** — four 44 pt chips: **Complied** · **Open** · **Doesn't apply** · **Superseded**.
- **Complied on** — a date and a tach field side by side.
- **How** — a text area: *"Inspected IAW AD para (g); no wear beyond limits"*.
- **Shown in the entry of 14 Mar 2026** — a 52 pt picker with *"Airframe page 16 · tap to change"*.
- **Result line:** *"Next due at tach **2517.3**. The AD text is on this phone — open it from the tag."*
- One primary **Save**.

**SF Symbols.** Item `wrench.and.screwdriver` · AD `doc.text` · stop tracking `trash` · picker
`chevron.right` · AD text `doc.plaintext`.

**What this fixes.** ADs and inspections are the reason the app exists and they were read-only on the
device. Recurring ADs in particular go stale between annuals precisely because recording compliance
required a laptop.

---

## 22 · Equipment, and the meter-replacement prompt

### 22 · Install / remove

**Purpose.** Put a part on the aircraft or take it off, keeping both facts in the record.

**Layout.** Title is the part — *"Vacuum pump"* — with a `pill.ok` **Installed**.
Fields: **Make**, **Part number**, **Serial** (each 46 pt, 16 pt text), then **Life limit** as a number
with two unit chips, `hours` / `or months`. Then the provenance picker: *"Installed in the entry of
14 Mar 2026 · Airframe page 16"*.

**Removal** is a separate section under a hairline, not a separate screen:
**"Coming off the aircraft?"**, a date field defaulting to today, a `danger` ghost **Remove it**, and
12 `faint`: *"Removing keeps its history. Link the entry that removed it when it's written up."*

> Removal is destructive-looking and is not a delete. Saying so at the point of the tap is cheaper than
> an undo.

### 22a · Meter-replacement prompt

**Purpose.** Catch the one entry that silently breaks every hour-based countdown: a reading lower than
the last.

**Layout.** A 290 pt centred alert over Log a flight, `surface`, radius 20, padding 20/18/14, shadow
`0 24 60 rgba(0,0,0,.5)`. Fires on blur of the meter field, not on every keystroke.
- Title, Space Grotesk 17/700: **"Lower than the last reading — was the tach replaced?"**
- Delta line: `2417.3 → 0.0` in Space Grotesk 20/700, the arrow in `faint`.
- Body 13 `dim`: *"If the meter was swapped, we'll remember the old one stopped at 2417.3 so your
  totals and hour-based items keep counting from where they were."*
- **Yes — new meter from today** (primary) and **I mistyped it** (ghost, and the common answer — it
  returns focus to the field with the text selected).
- Foot 12 `faint`: *"You can undo a meter swap from the reading list."*

**SF Symbols.** Install `wrench.and.screwdriver` · remove `minus.circle` · meter prompt
`gauge.with.dots.needle.bottom.50percent`.

**What this fixes.** A replaced tach currently produces a negative interval and a countdown that reads
as airworthy. The owner is the only one who knows which of the two things happened, so ask — in their
words, once, at the moment the number lands.

---

## 23 · Add a document, attach to an entry, resolve a squawk

### 23 · Add a document

**Layout.** Sheet, large detent. Two 64 pt source rows on `bg`, radius 14, each with a 36 pt
`tint.accent` icon tile:
- **Choose from Files** — *"PDF or photo, up to 25 MB"*
- **Scan with the camera** — *"Apple's scanner finds the edges"* (the same VisionKit flow as screen 11)

Then **"WHAT IS IT"** as a wrapping chip row: Form 337 · 8130-3 · STC · ICA · Weight & balance ·
Something else. Then **Title** (prefilled from the chip and the aircraft), **Dated**, **Form or STC no.**
*(optional)*, and a 52 pt **Attach to an entry** picker — *"Optional — 14 Mar 2026 · Annual
inspection"*. One primary **Add to the vault**, and beneath it: *"Kept on this phone until it can upload
— it needs a connection to reach the vault."*

At regular width this is the same list in the right-pane overlay, and it is what the screen-16 drop
target opens with the file already chosen.

### 23a · Attach to an entry — the picker

Title **"Which entry does this belong to?"**, a 46 pt search field at 16 pt with the placeholder
*"Search entries — a date, a part, a name"*, then logbook-grouped 52 pt rows: date in Space Grotesk
13/700 in an 84 pt column, description truncated at 12.5 `dim`, a `accent` check when selected.
A ghost **No entry — keep it loose** sits above the primary **Attach to 14 Mar 2026** — the primary
names the entry it will attach to, so the tap is unambiguous.

### 23b · Resolve a squawk

The right pane of screen 18 as a sheet. Title is the squawk, with its severity line beneath. Fields:
**Resolved on** (date), **Which entry cleared it?** (picker, *"Optional — gives the fix a signature"*),
**What was done** (text area). Primary **Mark resolved**, then: *"Reopen it any time from the resolved
list if it comes back."*

**SF Symbols.** Files `folder` · camera `camera.viewfinder` · attach `paperclip` · search
`magnifyingglass` · selected `checkmark` · resolve `checkmark.circle`.

**What this fixes.** Documents can only be added on the web, which means the 337 the shop just handed
over sits in a photo roll until someone gets to a laptop. Attachment matters more than upload: a form
that is not linked to its entry is a file, not a record.

---

## 24 · Conflict

**Purpose.** When the same entry changed here and on the web, **show both and let the owner choose**.
Never last-write-wins, and never a toast.

**Layout, compact.** A full screen, not a sheet — this is a decision, and a sheet invites a swipe-away.
- Title **"Changed in two places"** with **"1 of 2"** trailing when several are waiting.
- **Banner**, `tint.warning`, radius 14: *"Edited on the web while your change was waiting to upload."*
  over *"14 Mar 2026 · Annual inspection · Airframe page 16. Nothing has been overwritten."*
- **Two columns**, 8 pt gutter, each on `bg` with a `hairline`, radius 14, padding 12:
  header **Yours** *· phone* / **Theirs** *· web, 2 h ago*, then the fields in the same order in both
  columns. Key 10.5/600 tracked, value 13.5/500. **Only the fields that differ are highlighted** —
  `tint.warning` with its border. Identical fields are shown, unhighlighted, so the columns line up and
  the eye lands on the difference.
- Foot 12 `faint`: *"Highlighted fields differ. Keeping yours replaces theirs; taking theirs drops your
  change. The scan is still the record either way."*
- **Take theirs** (ghost) and **Keep mine** (primary) side by side, then **Decide later** as a plain
  centred ghost.

**Layout, regular (24a).** A 560 pt centred card over the dimmed tab, same content, same order. The
column headers say *· on this iPad*.

**Copy rules.** "Yours" and "Theirs", never "local" and "remote". "Changed in two places", never
"merge conflict". "Decide later" is always present — a conflict is never resolved by dismissal, and an
owner who does not know which is right must be able to leave it alone.

**SF Symbols.** Conflict `arrow.triangle.branch` · keep mine `checkmark` · take theirs
`arrow.down.circle` · decide later `clock`.

**What this fixes.** Silent last-write-wins is how a logbook loses a signature, and it is the failure
mode an offline-first app is most likely to produce. Two edits are rare; losing one without a trace is
unacceptable, so the rare case gets a whole screen.

---

## The light appearance — answer to open question #4

> **Open question #4:** *should the app offer a light appearance, or commit to dark?*
> **Answer: offer both, following the system.** Hangars are bright and a lot of this work happens on a
> ramp in daylight. The direction survives the switch because it never depended on the darkness — it
> depended on **one accent, semantic colour paired with a word, and hairlines instead of shadows**, all
> of which read the same either way.

Same names as `apps/mobile/src/tokens.ts`, light values. Nothing else changes: no size, no radius, no
weight, no gradient direction. `useTheme()` follows `prefers-color-scheme`.

### Colours

| Token | Dark (shipped) | Light | Role |
|---|---|---|---|
| `bg` | `#0F1216` | `#F4F5F7` | App background |
| `surface` | `#191D24` | `#FFFFFF` | Cards, panels, list rows, segmented track |
| `surfaceRaised` | `#212630` | `#ECEEF2` | Stepper keys, chips, unselected segments, avatar |
| `hairline` | `#2B313C` | `#D8DDE4` | Every 1 pt border and divider |
| `ink` | `#ECEFF4` | `#151A21` | Primary text |
| `dim` | `#9AA3B0` | `#4A5462` | Secondary text |
| `faint` | `#6B7482` | `#666F7C` | Metadata, section labels |
| `accent` | `#5AA9FF` | `#1C6FD2` | The one accent |
| `accentLight` | `#8EC8FF` | `#4A8FE3` | Gradient end |
| `onAccent` | `#0B1017` | `#FFFFFF` | Text on the accent gradient |
| `warning` | `#F2B544` | `#9A6400` | DUE SOON |
| `danger` | `#FF7060` | `#C4392C` | GROUNDED |
| `success` | `#4ED69A` | `#177F55` | AIRWORTHY |

### Tints

Same alphas, over the light `surface`.

| Token | Dark | Light |
|---|---|---|
| `tint.accent` | `#5AA9FF24` | `#1C6FD21A` |
| `tint.accentBorder` | `#5AA9FF4D` | `#1C6FD24D` |
| `tint.warning` | `#F2B5441F` | `#9A64001A` |
| `tint.warningBorder` | `#F2B5444D` | `#9A64004D` |
| `tint.danger` | `#FF70601F` | `#C4392C1A` |
| `tint.dangerBorder` | `#FF70604D` | `#C4392C4D` |
| `tint.success` | `#4ED69A1F` | `#177F551A` |
| `tint.successBorder` | `#4ED69A3D` | `#177F553D` |

### Why these values

- **The semantic three had to move the most.** `#F2B544` on white is 1.9:1 — unreadable. The light
  warning, danger and success are the same hues rotated down in lightness until each clears **4.5:1 on
  `bg`**: 4.59, 4.85 and 4.58 respectively. They look less like instrument lamps and more like ink,
  which is correct on paper-white.
- **`accent` is darker than it looks it should be.** `#1C6FD2` is 4.53:1 on `bg` and 4.94:1 on
  `surface`. The gradient still runs to `accentLight`, and `onAccent` flips to white.
- **`faint` is `#666F7C`, not the obvious `#77808E`.** The lighter grey reads correctly but measures
  3.7:1, a regression on the dark set's 4.0:1. `#666F7C` measures **4.66:1 on `bg`** and 5.08:1 on
  `surface`, so metadata at 11.5 pt is legible in daylight — which is the entire point of shipping a
  light appearance.
- **`surface` is pure white and `bg` is not.** Inverting the dark relationship (cards lighter than the
  ground) keeps the elevation model intact without a single shadow, so nothing in the frames needs a
  new value.

Scan and PDF imagery keeps its own colours in both appearances; only the scrim over it changes —
`rgba(0,0,0,.42)` dark, `rgba(21,26,33,.28)` light.

---

## Open questions this addendum leaves

1. **Split View at 507 pt** falls back to the phone layout, which is right for Scans and arguably wasteful
   for Status. Worth a look once there is a build to hold.
2. **Pointer affordances** are specified for hover on Log (screen 14) only. Every list row that has a
   swipe action on touch should probably reveal the same action on hover; that is a systematic pass, not
   a per-screen decision.
3. **Ask has no offline state drawn.** The composer says "Needs a connection"; what the pane shows when
   opened offline with an existing thread is unspecified. Probably the thread, read-only, with the
   composer disabled and the same line.
