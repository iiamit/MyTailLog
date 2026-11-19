---
name: MyTailLog
description: Aircraft logbook index and maintenance tracker, drawn as a tabbed records binder with a line map of the aircraft's life.
colors:
  cover: "#17191e"
  cover-2: "#24272e"
  on-cover: "#f2f1ec"
  on-cover-2: "#a9adb6"
  mat: "#2a2c31"
  leaf: "#ffffff"
  leaf-2: "#f4f4f1"
  ink: "#15171b"
  ink-2: "#454a52"
  ink-3: "#636973"
  rule: "#d9dad5"
  rule-2: "#b8bab4"
  control-border: "#7d828a"
  alarm: "#dd3418"
  alarm-text: "#c42e15"
  alarm-bg: "#fde9e4"
  on-alarm-bg: "#7a1707"
  section-status: "#2a3dbe"
  section-books: "#edbb1b"
  section-books-ink: "#7a5c00"
  on-section-books: "#1c1600"
  section-maint: "#0b6b6a"
  section-aircraft: "#2f7533"
  section-docs: "#85491f"
  section-share: "#6b44b8"
  section-share-ink: "#5a36a3"
  section-setup: "#3a3f46"
  line-airframe: "#23318f"
  line-engine: "#a8326b"
  line-propeller: "#4a4f57"
  line-avionics: "#0f7fa6"
  line-other: "#8a8f97"
typography:
  board-title:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  lede:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.35
  heading:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.25
  section:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-strong:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.4
  small:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
  button:
    fontFamily: "Libre Franklin, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1
  paper:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  paper-small:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  s: "3px"
  m: "4px"
  l: "5px"
  round: "50%"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.leaf}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "42px"
    typography: "{typography.button}"
  button-secondary:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "42px"
  button-on-board:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 12px"
    height: "34px"
  button-alarm:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.alarm}"
    rounded: "{rounded.m}"
    padding: "0 18px"
    height: "42px"
  input:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.m}"
    padding: "0 12px"
    height: "44px"
  leaf:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.ink}"
    rounded: "{rounded.s}"
    padding: "26px 30px 28px"
  rail:
    backgroundColor: "{colors.cover}"
    textColor: "{colors.on-cover}"
    width: "216px"
  section-tab:
    backgroundColor: "{colors.section-status}"
    textColor: "{colors.leaf}"
    rounded: "{rounded.l}"
    height: "50px"
---

# Design System: MyTailLog

## Overview

**Creative North Star: "The Tabbed Binder"**

MyTailLog looks like the records binder an owner already keeps for the aircraft, with a line map of the aircraft's life drawn on its pages. A dark cover rail on the left holds six coloured section tabs (Status, Logbooks, Maintenance, Aircraft, Documents, Share), each tab as tall as its section is full. Opening a section floods the board, the area right of the rail, with that section's colour. Work happens on white leaves laid on the board: usually two, the record on the left and its scanned source page on a dark mat on the right.

The map gives every record a place in time. Each logbook is a line in its own printer's ink, each entry a stop, a visit that signed several books an interchange, a stretch with no pages a dashed gap, and the future dotted with what's due drawn as rings. A one-finger-high spine under every board's title shows the whole life, today, and the part the screen covers. The app speaks in Libre Franklin. Literata appears only for words transcribed from a scanned page, so the owner can always tell what the logbook says from what the software concluded. Status is ink plus one alarm colour, vermilion, and nothing else.

The light theme is the design reference. A dark "night hangar" theme exists on every platform, and the default follows the system setting. The web, a native SwiftUI app for iPhone and iPad, and a native Compose app for Android share this look. The phones use their own platform's navigation, sheets, gestures, pickers, widgets and notifications.

The full specification lives in `docs/redesign/handoff/` (tokens in `tokens.json` and `01-design-tokens.md`, components in `02-components.md`, accessibility and motion in `11`, copy in `12`, conflicts settled in `14-decisions.md`). This file is the summary that design tooling reads; where they differ, the handoff wins.

**Key Characteristics:**
- Cover, board, leaf, mat: four grounds, each with its own text colours.
- Section hues fill boards and tabs only; on a leaf they appear only as `section-ink` links and the `hue` button.
- Status is ink and vermilion, always a mark plus a word; no green, no amber.
- Two voices: Libre Franklin (the app), Literata (the paper). No monospace; numbers use tabular figures.
- Readable by a 60-year-old in a hangar: 16px body, nothing under 13px, 4.5:1 text contrast.
- Flat: a 1px leaf edge is the only shadow on screen.

## Colors

A dark binder cover, six section hues, white leaves with ink, one vermilion alarm, and four printer's inks for the logbook lines. Dark-theme values are in `tokens.json` and `01-design-tokens.md` §3; dark is not an inversion (leaves become warm charcoal, scanned pages are never tinted).

### Primary
- **Binder Ink** (ink): text and drawn marks on leaves, the primary button fill, the "current" status dot, the focus ring. The system's primary colour is ink, not a hue.
- **Vermilion** (alarm): overdue (solid slip), due soon (ring), errors, destructive confirmation. `alarm-text` is the darker alarm ink for alarm-coloured words; `alarm-bg` is the soft alarm slip with `on-alarm-bg` text.

### Secondary
- **Section hues** (section-status blue, section-books yellow, section-maint teal, section-aircraft green, section-docs brown, section-share violet, section-setup slate): one per tab, filling that tab and the open board. White text on all but books, which takes dark text (on-section-books). Each has a darker `section-ink` for links on a leaf (status, maint, aircraft, docs and setup inks are within a shade of their hue; books and share differ and are listed).

### Tertiary
- **Logbook inks** (line-airframe, line-engine, line-propeller, line-avionics, line-other): the lines on the map, LineChips, the coloured key of a logbook-scoped PageCite, and the map legend. The Other logbook is never drawn as a line.

### Neutral
- **Cover** (cover) and **Cover Raised** (cover-2): the rail, the phone tab bar, the camera bar, sign-in. Text on-cover and on-cover-2.
- **Mat** (mat): the dark ground behind scanned pages, a step lighter than the cover so the page edge reads.
- **Leaf** (leaf) and **Leaf Well** (leaf-2): every working surface; leaf-2 for wells, selected and hovered rows, table heads.
- **Ink 2** (ink-2) and **Ink 3** (ink-3): secondary text, then meta text and labels.
- **Rule** (rule) and **Rule 2** (rule-2): dividers; rule-2 is decorative only. **Control Border** (control-border): the edge of every input, select, checkbox, toggle and secondary button.

### Named Rules
**The Ink and Vermilion Rule.** Status is ink plus one alarm colour: a filled ink dot is current, a vermilion ring is due soon, a solid vermilion slip is overdue, a dashed ring is no record. Green and amber are not in the palette.

**The Board Rule.** Section hues fill boards and tabs. Never put a raw section hue on a leaf; use that section's `section-ink`.

**The Line Ink Rule.** Logbook inks belong to the map and its keys. They never mean status and never mean a section.

## Typography

**Display Font:** Libre Franklin (with system-ui)
**Body Font:** Libre Franklin (with system-ui)
**Label/Mono Font:** none. Numbers use Libre Franklin with tabular figures.
**Paper Font:** Literata (with Georgia), for transcribed text only.

**Character:** A sturdy American grotesk does all of the app's talking, from the 30px heavy board title to 13px labels. A bookish, screen-tuned serif carries only the logbook's own words, so transcriptions read as quotations from paper.

### Hierarchy
- **Board title** (800, 30px, 1.1, -0.01em): the section name on the board ("Status"), the page `h1`.
- **Lede** (400 with 800 lead phrases, 22px, 1.35): the Verdict sentence, an `h2` directly after the board title; max 34ch.
- **Heading** (800, 20px, 1.25): leaf headings.
- **Section** (700, 16px, 1.5): HungSection headings in a leaf's margin column.
- **Body** (400, 16px, 1.6): everything readable; prose max 68ch. **Body strong** (700, 16px): row titles, values.
- **Small** (400, 14px): secondary lines under row titles.
- **Caption** (600, 13px) and **Label** (700, 13px, ink-3): citations, chips, legends, column heads, field labels. Sentence case, no tracking.
- **Paper** (Literata 400, 17px, 1.6) and **Paper small** (15px): entry narratives, quotes in answers, citation excerpts.
- Phone scale (pt/sp) and Dynamic Type mapping: `01-design-tokens.md` §5.

### Named Rules
**The Two Voices Rule.** If the software wrote it, it is Libre Franklin. If the logbook says it, it is Literata. Never mix them in one run.

**The 13px Floor.** No text below 13px, except 12px (weight 600+, 4.5:1) for map ticks, the phone tab label, KeyHint chips, count badges and the "first" badge.

## Layout

Desktop web (≥ 1280px): a 216px cover rail on the left, then the board. The board has a head (title and its actions, min 70px), the 52px spine, and the leaves (10px gap; split 1.62 : 1 for a record beside its page, 1 : 1 on the review desk, a single leaf for settings and forms). Leaves pad 26px top, 30px sides, 28px bottom. HungSections put a 118–148px heading column beside their content. Table rows are at least 48px. Space is a 4px scale (`spacing.1`–`spacing.8`). Responsive bands are in `03-information-architecture.md`.

Phone: 16pt/16dp screen margins; the phone leaf sits 8pt in from the edges; rows at least 58pt; buttons 52pt; D's own tab bar (50pt plus safe area) carries the six coloured tabs. Tablet: list-detail at ≥ 700pt wide, three panes for review at ≥ 1000pt.

## Elevation & Depth

Flat. Depth comes from the grounds (cover, board, leaf, mat) and hairline rules. On screen, leaves cast a 1px bottom edge and nothing else. The phone AddButton, the map's tooltip sheet and menus are the only other shadows. No glows, no gradients except a scanned page's own paper.

### Shadow Vocabulary
- **Leaf edge** (`box-shadow: 0 1px 0 rgba(0,0,0,.25)`): every leaf.
- **Add button** (`box-shadow: 0 8px 18px -8px rgba(0,0,0,.7)`): the phone's floating AddButton only.

### Named Rules
**The Paper Stack Rule.** A leaf lies on the board; it does not float. No card shadows, no hover lift.

## Shapes

Small, square-shouldered corners like cut card stock: 3px on leaves, wells and slips; 4px on buttons, inputs, segmented controls and page thumbnails; 5px on section tabs (left corners only on the web, where the open tab runs flush into the board). Status dots, map stops and rings are circles; the "signed" trust mark is a square turned 45°. Map stops are leaf-filled with an ink stroke, dotted when read by AI and not yet confirmed.

## Components

### Buttons
One filled action per view; everything else is outlined or quiet.
- **Shape:** 4px corners. Sizes s 34px, m 42px (default), l 48px web / 52pt phone. 700 weight, 15px (14px at s).
- **Primary:** ink fill, leaf text. Hover #282a2d, pressed #36373b.
- **Secondary:** leaf fill, control-border edge, ink 600 text. Hover #ececed, pressed #dedfdf.
- **On-board:** leaf fill, ink text, for actions in the board head ("Log a flight").
- **Hue:** the section colour fill, for a section-owned primary on the phone ("Make the link").
- **On-mat:** transparent with a #5a5e68 edge and on-cover text, on the source mat.
- **Alarm:** leaf fill, vermilion edge and text, only for confirmed destructive actions.
- **Quiet:** no fill or border; ink 600 with an underline on hover; section-ink when it navigates.
- **States:** hover adds an 8% layer of the content colour, pressed 14%; disabled is 40% opacity with a one-line reason beside it; loading keeps the width and shows a turning loader plus the busy word. Focus is the double ring (2px ink outside, 2px leaf inside) on `:focus-visible` only.

### Chips
- **FilterChip / ChoiceChip:** pill, control-border edge, ink 600 13–14px; selected is an ink fill with leaf text (never colour alone). LineChips take a logbook ink key.
- **Tag:** small square-cornered label on leaf-2 for metadata.

### Cards / Containers
- **Corner Style:** 3px (radius.s).
- **Background:** leaf; wells and selected rows leaf-2; scans on the mat.
- **Shadow Strategy:** the leaf edge only (see Elevation).
- **Border:** none on leaves; 1px rule between rows; a 2px ink rule under a HungSection's first group.
- **Internal Padding:** 26px 30px 28px (22–28px on dense screens).

### Inputs / Fields
- **Style:** leaf fill, 1px control-border edge, 4px corners, ink 16px text; label above in the 13px label style.
- **Focus:** the edge becomes 2px ink; inputs don't draw the double ring.
- **Error / Disabled:** the edge and a message below in alarm-text, with `role="alert"`; disabled at 40% opacity with its reason. **PaperInput** edits transcribed text in Literata.

### Navigation
- **Rail (web):** the cover column holds the RailPlate (aircraft switcher), six SectionTabs and the RailFoot. Each tab is the section hue, 50–180px tall in proportion to its content, 16px 700 name over a 13px subline. The open tab runs flush into the board of the same colour and carries `aria-current="page"`.
- **SubTabs:** links in a `nav` under the board head, each with its own URL and `aria-current="page"` (not an ARIA tablist).
- **Phone:** D's own PhoneTabBar on the cover colour (the system bar can't show coloured tabs), a PhoneHeader on the board colour, platform-native push, sheets and back.

### StatusMark (signature)
A 12px mark plus a word, 700 14px: filled ink dot "Current"; 3px vermilion ring with alarm-text "Due soon"; solid vermilion slip with white text "lapsed 7 days ago"; 2px dashed ink-3 ring "No record"; no mark, ink-2 "Advisory". The mark is `aria-hidden`; the word always carries the meaning.

### TrustMark (signature)
How far to trust a value: a dotted ring "Read by AI", a filled ink dot "Confirmed", an ink diamond "Signed". Shown wherever a value from the records appears.

### Verdict (signature)
The opening sentence of Status and every hand-off: what the confirmed records show, in at most two sentences and two bold runs, in the lede style. Never "airworthy", "legal", "grounded" or "compliant".

### Spine and RouteMap (signature)
The line map in ink on a leaf, never on a board. The spine is a 40px strip under every board head with the whole life, today marked and the current scope bracketed; the RouteMap opens Logbooks; the LineAhead shows the next 12 months on Status. Drawing rules: `10-line-map.md`.

### PageCite (signature)
Every derived value carries a citation to its scanned page (logbook ink key, page number, caption style) that opens the page with the source ink highlighted in yellow.

## Do's and Don'ts

### Do:
- **Do** generate colours, type and spacing from `tokens.json`; no literal values in components.
- **Do** show every status as a mark plus a word, using ink and vermilion only.
- **Do** put the source page one step away from every fact: on the right leaf (web, tablet) or one tap away (phone).
- **Do** keep one primary (ink-filled) button per view.
- **Do** set every number with tabular figures in Libre Franklin.
- **Do** keep body text at 16px and nothing below 13px, with 4.5:1 text contrast in both themes.
- **Do** offer Light, Dark and Match system, defaulting to Match system; keep scans untinted in dark.

### Don't:
- **Don't** use green or amber anywhere, or vermilion for anything but overdue, due soon, errors and destructive confirmation.
- **Don't** put a raw section hue on a leaf, or draw the map on a board.
- **Don't** set software-written text in Literata or transcribed text in Libre Franklin.
- **Don't** use a monospace face, a third typeface, emoji or Unicode glyphs as icons (icons are Lucide).
- **Don't** add card shadows, glows or gradients.
- **Don't** let an AI reading the owner hasn't confirmed change any status, Verdict, map ring, share or export.
- **Don't** write "airworthy", "legal to fly", "grounded" or "compliant" as a conclusion.
