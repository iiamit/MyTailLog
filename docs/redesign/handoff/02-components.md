# 02 Components

This file specifies every component of the MyTailLog direction D ("Tabbed Binder") interface, on the web (Next.js) and natively
(SwiftUI and Jetpack Compose). Values come from the mockup CSS (`b/system.css`, `d/system.css` and the page-local `<style>` blocks in
`d/web.html`, `d/mobile.html`, `b/web1.html`, `b/web2.html`, `b/mobile.html`) and from the mockup markup itself. Each component lists its
purpose, where it is used (screen IDs and mockup figure ids), anatomy with sizes, variants, every state, web behaviour and keys,
accessibility, a SwiftUI note, a Compose note and acceptance criteria. Values are written as token names from 01-design-tokens.md, with
literal px where no token exists. The mockups define almost no hover, focus, pressed, disabled or loading styles; the ones given here
are decisions made in this file and are marked "Decision". The six map components (Spine, RouteMap, LineAhead, DateScrubber,
VisitCapsule, MapLegend) are specified here at component level (anatomy, marks, props, states, input); their layout and scale
algorithms live in 10-line-map.md. Screen composition lives in 04-web-screens.md and 06-mobile-screens.md; copy templates in
12-copy-and-voice.md; motion durations and screen-reader rules in 11-accessibility-and-motion.md.

## Contents

1. [Conventions used in this file](#1-conventions-used-in-this-file)
2. [Shared foundations](#2-shared-foundations): grounds, section context, interaction states, focus ring, targets, icons, type roles
3. [Web shell](#3-web-shell): Rail, RailPlate, AircraftSwitcher, SectionTab, RailFoot, RailAircraftLink, AddMenu, Board, BoardHead, SubTabs, Leaves, Leaf, SourceMat, HungSection, Drawer
4. [Map components](#4-map-components): map marks, Spine, LifeStrip, RouteMap, LineAhead, DateScrubber, VisitCapsule, MapLegend, StopStepper, BookTabs, MapTooltip
5. [Records vocabulary](#5-records-vocabulary): Verdict, StatusMark, TrustMark, PageCite, LineChip, FirstBadge, Tag, DueTable and DueRow, EntryRow, Row, KeyValueList, Reading, Well, AlarmSlip, CoverageBar, ProgressBar
6. [Pages and scans](#6-pages-and-scans): ScanViewer, PageCrop, PageThumb, SelectionBar, DropZone, QueueRow, ReviewField, QRCode
7. [Controls](#7-controls): Button, Field, TextInput, SearchField, PaperInput, Select, Segmented, Toggle, Checkbox, Radio and OptionCard, FilterChip, ChoiceChip, KeyHint, Stepper, Avatar
8. [Feedback](#8-feedback): Toast, EmptyState, Skeleton, ConflictTable
9. [Phone components](#9-phone-components): PhoneHeader, SyncState, OfflineBanner, PhoneTabBar, PhoneLeaf, PhoneGroupHeader, PhoneRow, AddButton, BottomSheet, OptionRow, ActionFooter, PageCard, CameraBar, Widget, NotificationContent
10. [Print components](#10-print-components): PrintSheet, Sticker
11. [Tablet size set](#11-tablet-size-set)
12. [Components to add](#12-components-to-add), including ConfirmDialog
13. [Open questions](#13-open-questions)

---

## 1. Conventions used in this file

| Notation | Meaning |
|---|---|
| `color.ink` | A colour token from 01-design-tokens.md. CSS custom property in the mockups: `--ink`. |
| `color.section.books` | The section hue (`--h-books`). `color.section-ink.books` is the hue used as text or line on a white leaf (`--board-ink` under `.sec-books`). `color.on-section.books` is text on the hue (`--on-board`). |
| `board`, `board-ink`, `on-board` | Shorthand for "the current section's" `color.section.*`, `color.section-ink.*`, `color.on-section.*`. Every board sets these through the SectionContext (§2.2). |
| `on-board-2` | Secondary text on the hue: `color.on-section.*` at 92% opacity (books: `#1c1600` at 72%). No token exists; implement as listed. |
| `space.3 (12)` | Space token and its px value. Scale assumed: space.1 = 4, .2 = 8, .3 = 12, .4 = 16, .5 = 20, .6 = 24, .7 = 28, .8 = 32. Values that are not multiples of 4 (10, 14, 18, 22, 26) are written as literal px because the mockups use them. |
| `radius.s` / `radius.m` / `radius.l` | 3px (leaves), 4px (controls), 5px (tabs). Other radii are literal. |
| `type.body` | A type role (§2.7). A literal such as "700 13px/1.2" means weight, size, line height in font.app unless font.paper is named. |
| `[icon:name]` | A Lucide icon (version 0.469.0) by name. |
| "Decision" | A value or rule this file sets because the mockups do not show it. The lead should keep it or overrule it in 01-design-tokens.md or 11-accessibility-and-motion.md. |
| Figure ids | `d-w-*`, `d-m-*`, `d-t-*` are in `d/web.html` and `d/mobile.html`; `d-web-status`, `d-web-map`, `d-m-status`, `d-m-map` in `d/index.html`; `b-w-*` in `b/web1.html` or `b/web2.html`; `b-m-*`, `b-t-*` in `b/mobile.html`. |

Props are written in TypeScript notation for the web. Native implementations take the same fields as Swift structs or Kotlin data
classes. Data field names follow the current schema (`log_entry.owner_confirmed`, `log_entry.field_confidence`,
`page.extraction_status`, `squawk.severity`, `logbook.type`); 09-data-and-api.md is the authority if names change.

Every component is built on the web as a React component in `apps/web/src/components/binder/` (proposal; 13-build-plan.md decides) and
styled with CSS custom properties generated from tokens.json. Natively, each is a SwiftUI `View` and a Compose `@Composable` reading the
same tokens from generated constants.

---

## 2. Shared foundations

### 2.1 Grounds

Every component sits on one of five grounds. The ground decides text colours, focus ring rendering and the state-layer colour.

| Ground | Fill | Primary text | Secondary text | Where |
|---|---|---|---|---|
| Cover | `color.cover` (#17191e); raised: `color.cover-2` (#24272e) | `color.on-cover` (#f2f1ec), 15.55:1 | `color.on-cover-2` (#a9adb6), 7.82:1 | Rail, phone tab bar, camera bar, offline banner, sign-in |
| Board | `board` (section hue) | `on-board` | `on-board-2` | Board head, phone header, the strip around leaves |
| Leaf | `color.leaf` (#ffffff); wells and selected rows `color.leaf-2` (#f4f4f1) | `color.ink` (#15171b), 17.94:1 | `color.ink-2` 8.92:1; `color.ink-3` 5.53:1 (5.02:1 on leaf-2) | All work surfaces, sheets, the spine |
| Mat | `#2a2c31` (literal; proposed token `color.mat`, see §13) | `color.on-cover`, 12.35:1 | `color.on-cover-2`, 6.21:1 | SourceMat, PageCrop, phone page view |
| Paper print | `#ffffff` regardless of section | `#15171b` | `color.ink-3` | PrintSheet, Sticker |

Rules:
- The map is drawn only on Leaf (never on Board or Cover). Logbook inks (`color.line.*`) are never used for status or sections.
- `color.alarm` is used only for overdue, lapsed, doubtful readings, errors and the review flag. Never decorative.
- No shadows except the leaf edge `0 1px 0 rgba(0,0,0,.25)`, the AddButton shadow, the map sheet shadow and menus (§3.3).

### 2.2 SectionContext

A board sets the section once; every child reads `board`, `board-ink`, `on-board`, `on-board-2` from it.

| Section | `board` | `board-ink` (on leaf) | `on-board` | White or dark text on hue |
|---|---|---|---|---|
| status | #2a3dbe | #2a3dbe | #ffffff | 8.37:1 |
| books | #edbb1b | #7a5c00 | #1c1600 | 10.07:1 |
| maint | #0b6b6a | #0b6665 | #ffffff | 6.31:1 |
| aircraft | #2f7533 | #2c6e30 | #ffffff | 5.66:1 |
| docs | #85491f | #824a22 | #ffffff | 7.07:1 |
| share | #6b44b8 | #5a36a3 | #ffffff | 6.68:1 |
| setup (Hangar, Account, sign-in leaf) | #3a3f46 | #3a3f46 | #ffffff | 10.61:1 |
| cover (phone lock screen, camera) | `color.cover` | `color.ink` | `color.on-cover` | 15.55:1 |

Web: a `data-section` attribute on the board root sets the four custom properties. SwiftUI: an `EnvironmentValue` `\.section`.
Compose: a `CompositionLocal` `LocalSection`. Changing tabs changes the section; the transition is a cross-fade of the board fill
(duration per 11-accessibility-and-motion.md; none under reduced motion).

### 2.3 Interaction states (Decision)

The mockups show rest and selected states only. All interactive components use one state-layer system so the three platforms agree.

| State | Rule |
|---|---|
| Hover (web, pointer: fine) | Overlay of the component's content colour at 8% over its fill. |
| Pressed (all platforms) | Overlay of the content colour at 14%. On native, pressed replaces hover; no ripple on Android (use the 14% layer as the indication, `indication = StateLayerIndication`), no scale or bounce on iOS. |
| Focus-visible | FocusRing (§2.4). Shown for keyboard focus only (`:focus-visible`), never on mouse click. |
| Selected | Per component (ink fill, leaf-2 row with board rules, thicker stroke). Never colour alone: selected also changes weight, fill or adds a mark. |
| Disabled | Whole control at 40% opacity, `cursor: not-allowed`, no state layers, `aria-disabled="true"` (keep it focusable when the reason is shown beside it so screen readers reach the reason). Primary actions that cannot run yet show a one-line reason in `type.small` `color.ink-3` next to them. |
| Loading | Control keeps its width; label is replaced by a 16px `[icon:loader-circle]` turning once per 1000 ms plus the busy label (copy in 12-copy-and-voice.md, for example "Saving"). `aria-busy="true"`. Under reduced motion the icon does not turn. |

Precomputed fills (8% hover / 14% pressed):

| Fill | Rest | Hover | Pressed |
|---|---|---|---|
| Ink (primary button, selected segment) | #15171b | #282a2d | #36373b |
| Leaf (secondary, on-board buttons, rows) | #ffffff | #ececed | #dedfdf |
| Leaf with alarm content (alarm button) | #ffffff | #fcefed | #fae3df |
| Mat (on-mat buttons) | #2a2c31 | #3a3c40 | #46484b |
| Cover (rail rows) / cover-2 (rail buttons) | #17191e / #24272e | #292a2e / #34373d | #36373b / #414349 |
| status / maint / aircraft / docs / share / setup hue | as §2.2 | #3b4dc3 / #1f7776 / #408043 / #8f5831 / #7753be / #4a4e55 | #4858c7 / #2d807f / #4c8850 / #96623e / #805ec2 / #565a60 |
| books hue (dark content) | #edbb1b | #dcae19 | #d0a417 |

Row hover on a leaf (tables, lists, map rows): background `color.leaf-2`. Selected rows add their rules (DueRow, EntryRow); hover alone never
shows rules.

### 2.4 FocusRing (Decision)

One ring that works on every ground: a 2px leaf ring inside a 2px ink ring.

- Web: `outline: 2px solid color.ink; outline-offset: 2px; box-shadow: 0 0 0 2px color.leaf;` on `:focus-visible`. On white leaves the ink ring
  shows (17.9:1); on cover, mat and dark hues the leaf ring shows (at least 7.4:1); on the books hue the ink ring shows (10:1).
- The ring follows the component's radius (outline follows border-radius in current browsers).
- Inputs keep their own focus style (TextInput §7.3) and do not draw the ring.
- SVG map marks draw the ring as two concentric strokes around the mark's hit area (`color.leaf` 2px, then `color.ink` 2px).
- iOS: full keyboard access and the iPad focus system draw the system focus effect; do not suppress it. Compose: draw the same two-ring
  border with `Modifier.focusRing()` (custom: `onFocusChanged` + `border`), since Material's default focus indication is a state layer only.

### 2.5 Targets and density

| Platform | Minimum target | Notes |
|---|---|---|
| Web | 24 by 24 CSS px (WCAG 2.5.8); controls are 34px (size s) or 42px (size m) high | Inline PageCite and links in text are exempt as inline targets but get 2px vertical padding. Map marks get an invisible 24px hit circle. |
| iOS | 44 by 44 pt | Visual size may be smaller (map stops are 10pt) if the hit area is 44pt. |
| Android | 48 by 48 dp | Same. Use `Modifier.minimumInteractiveComponentSize()`. |

### 2.6 Icons

Lucide 0.469.0 on the web, stroke width 2, `currentColor`, default size 1.2em (19px at 16px text). Fixed sizes: 14 (sync and pending
marks), 16 (spine link, select chevrons, plate chevrons), 17 (phone status bar, not drawn by us), 21 (phone tab bar), 28 (AddButton).
Natively, ship the same Lucide glyphs as vector assets (iOS asset catalog with "Preserve vector data"; Android VectorDrawable) so the
binder looks the same on all platforms. Use platform symbols only for system chrome the OS draws (share sheet, system back on Android,
keyboard accessories). Icons beside text are decorative (`aria-hidden="true"`, `accessibilityHidden(true)`, `contentDescription = null`);
icon-only buttons need a name.

### 2.7 Type roles as used by components

01-design-tokens.md owns the type scale. Components in this file assume this mapping, taken from the CSS:

| Role | Web value (font.app unless noted) | Phone value | Used by |
|---|---|---|---|
| type.board-title | 800 30px/1.1, letter-spacing -0.01em (tablet 26px) | 800 28px/1.1, -0.01em | BoardHead, PhoneHeader |
| type.lede | 400 22px/1.35, -0.005em, bold runs 800 (tablet 20px) | 400 20px/1.35, bold runs 800 | Verdict |
| type.heading | 800 20px/1.25 (sheet titles 22px/1.2; hangar names 24px) | 800 22px/1.2 (sheets), 19px (in-leaf) | Leaf headings, BottomSheet head |
| type.body | 400 16px/1.6 | 400 16px | Everything by default |
| type.body-strong | 700 16px | 700 16px/1.3 | Row titles, HungSection heads |
| type.small | 400 14px, `color.ink-3` | 400 14px/1.35 | Row details, meta lines |
| type.caption | 600 13px/1.2 to 1.4 | 600 13px | PageCite, TrustMark, LineChip, Tag, spine label |
| type.label | 700 13px, `color.ink-2` (field labels); 700 14px `color.ink-3` (phone group heads) | 700 14px | Field, PhoneGroupHeader |
| type.paper | font.paper 400 17px/1.6 | font.paper 16px/1.5 | Transcribed entry text |
| type.paper-small | font.paper 15 to 16px/1.45 to 1.5 | font.paper 15px/1.45 | Quotes under crops, cards |
| type.numeric | `font-variant-numeric: tabular-nums` on everything (set on the root) | `.monospacedDigit()` / `fontFeatureSettings = "tnum"` | All figures |

Sizes below 13px are allowed only for: KeyHint (12px), FirstBadge (12px), map axis ticks (`.f`, 12px), phone tab labels (12px) and
the flag on a SectionTab (12px). Everything else is 13px or larger. Native text uses Dynamic Type (iOS `relativeTo:` the nearest text
style) and `sp` on Android so all of it scales; layouts must survive 200% text (see 11-accessibility-and-motion.md).

### 2.8 Unconfirmed data rule (applies to every component)

Values read by AI and not yet confirmed (`log_entry.owner_confirmed = false`) are drawn with the "read by AI" TrustMark, hollow dotted
stops on maps, and never feed a StatusMark, DueRow, LineAhead ring, Verdict, Widget, notification or share. Components that receive
data must filter on confirmation themselves only where this file says so (Spine and RouteMap draw unconfirmed stops; everything that
computes status receives already-filtered data from the API).

---

## 3. Web shell

The web app is a two-column grid: Rail 216px, Board fills the rest (`grid-template-columns: 216px 1fr`; tablet size set 178px, §11).
The page does not scroll; leaves scroll. Figure references: every `d-w-*` figure.

### 3.1 Rail

**Purpose.** The binder's cover: who and which aircraft, the six section tabs, and the three global actions.

**Anatomy (top to bottom).**

| Part | Spec |
|---|---|
| Container | `color.cover`, full viewport height, `display:flex; flex-direction:column; gap: space.1 (4)`, padding 18px 0 16px 14px (right padding 0 so the open tab can touch the board). |
| RailPlate | §3.2 |
| SectionTab × 6 | §3.4: Status, Logbooks, Maintenance, Aircraft, Documents, Share. In Hangar and Account the tabs are replaced by one `setup` tab and the RailAircraftLink list (§3.6). |
| RailFoot | §3.5, pushed to the bottom (`margin-top:auto`). |

**States.** Loading: plate shows the tail from cache or a Skeleton bar 120 by 20; tabs render at minimum height with empty count lines
(Skeleton 80 by 10 on cover-2). Offline (web): not applicable; the web needs a connection, a full-width AlarmSlip soft on the board
says so (copy in 12-copy-and-voice.md). Viewer role: tabs and counts identical; Add in RailFoot lists only what a viewer may add
(nothing), so it is hidden for viewers.

**Accessibility.** `<nav aria-label="Sections">` wraps the tabs. The plate is a button. RailFoot is a separate `<nav aria-label="Tools">`.
Focus order: plate, six tabs top to bottom, Search or ask, Add, Account.

**SwiftUI / Compose.** The rail exists only on iPad landscape and large Android tablets (T-* screens): SwiftUI `NavigationSplitView`
sidebar with a custom `List` style (no system sidebar chrome, `.scrollContentBackground(.hidden)`, cover background); Compose
`PermanentNavigationDrawer` or a custom `Column` in a `Row` scaffold. Keep the coloured tabs and proportional heights; adapt by using the
platform's split-view collapse rules (the sidebar hides in compact width and the PhoneTabBar takes over).

**Accept.**
- [ ] Rail is 216px wide (178px in the tablet size set) and full height; tabs never scroll out of view at 768px viewport height.
- [ ] Focus order is plate, tabs, foot; each has a visible FocusRing.

### 3.2 RailPlate

**Purpose.** Names the open aircraft and opens the AircraftSwitcher (W-SWITCH-01). In Hangar and Account it shows the product and the
user instead and is not interactive.

**Anatomy.** Padding 2px 14px 14px 4px. Line 1: tail number, 800 24px/1.1, letter-spacing .02em, `color.on-cover`, followed at the right
edge by `[icon:chevrons-up-down]` 16px at 60% opacity. Line 2: "1978 Cessna 172N · Demo", 13px `color.on-cover-2` (year, make, model; "Demo"
for the demo aircraft; role suffix for shared aircraft, for example "· Viewer").

**States.** Hover: `color.cover` hover fill #292a2e behind the plate (radius.l). Pressed #36373b. Focus: FocusRing. Open: chevron icon at
100% opacity, plate fill `color.cover-2`. Single aircraft: chevron still shown (switcher also holds "Hangar" and "Add an aircraft").

**Behaviour.** Click or Enter or Space opens AircraftSwitcher (§3.3) anchored below the plate. Keyboard shortcut: none.

**Accessibility.** `<button aria-haspopup="menu" aria-expanded>`; name "N734DM, 1978 Cessna 172N. Switch aircraft".

**Native.** Phone and tablet use the tail line in PhoneHeader (§9.1) instead; tablet rail uses the same plate as a `Menu` (SwiftUI) or
`DropdownMenu` anchor (Compose).

### 3.3 AircraftSwitcher (W-SWITCH-01, M-HANGAR-01 for phone)

**Purpose.** Change aircraft without going to the Hangar. Not drawn in the mockups; specified here.

**Anatomy.** Popover anchored 4px below the RailPlate, left aligned with it, width 280px, `color.leaf`, radius.m, shadow
`0 8px 24px -8px rgba(0,0,0,.5)` (Decision: menus are the only floating surfaces with a shadow), padding space.2 (8) 0.
- One item per aircraft, 56px min height, padding 8px 14px: tail 700 16px `color.ink`; below, model and the Verdict's first clause
  truncated to one line, 14px `color.ink-3`; at right, the StatusMark of the worst item (dot only, with its word as visually hidden text).
- Current aircraft: leaf-2 fill and `[icon:check]` 16px at the right instead of the mark.
- Divider 1px `color.rule`, then "Hangar" (`[icon:warehouse]`) and "Add an aircraft" (`[icon:plus]`), 44px rows.

**States.** Hover row leaf-2; focus row FocusRing inset (-2px offset); loading: three Skeleton rows; error: "Could not load your aircraft."
with a quiet Retry button; empty is impossible (the open aircraft is listed).

**Keyboard.** WAI-ARIA menu button pattern: Down or Up moves, Home or End jump, Enter opens the aircraft (navigates to the same section of
the other aircraft when it exists, else Status), Escape closes and returns focus to the plate. Type-ahead on tail numbers.

**Accessibility.** `role="menu"`, items `role="menuitem"`; the current aircraft has `aria-current="true"`.

**SwiftUI.** `Menu` from the tablet plate; on phone a `.sheet` with `presentationDetents([.medium])` listing aircraft as rows.
**Compose.** `DropdownMenu` on tablet; `ModalBottomSheet` on phone. Keep: tail number weight, worst-status mark. Adapt: platform menu
chrome and shadows.

**Accept.**
- [ ] Switching keeps the current section when the other aircraft has it.
- [ ] Escape returns focus to the RailPlate.

### 3.4 SectionTab

**Purpose.** One coloured tab per section; its height shows how much the section holds; its sub-lines say what is in it now.

**Anatomy.**

| Part | Spec |
|---|---|
| Box | `display:flex; flex-direction:column; gap:1px`, padding 11px 12px, margin-right 12px, radius `radius.l` on the left corners only (5px 0 0 5px), min-height 50px, fill `color.section.<s>`. |
| Title | 700 16px/1.2, `color.on-section.<s>` (white; books #1c1600). |
| Sub-lines | 0 to 2 lines, 500 13px, same colour. Content examples: "1 overdue, 3 soon"; "412 pages in 5 books" + "212 entries"; "11 tracked items" + "2 open squawks"; "Hours, equipment, W&B"; "14 in the vault"; "1 link live". |
| Flag | Optional. Absolute, right 22px (open tab: 12px), top 10px; `color.alarm` fill, white 700 12px, radius 3px, padding 1px 6px. Text like "6 to review". White on alarm is 4.59:1. |
| Open state | margin-right 0, padding-right 24px: the tab grows 12px to the right and meets the board, so the open tab and the board read as one sheet. |

**Height rule (Decision; check against 03-information-architecture.md).** Each tab's height = max(its content height, 50px + its share of
the free rail height). Free height = rail height − plate − foot − 6 × 50px − 5 × 4px gaps, capped at 300px. Shares are proportional to
√n, where n is the section's item count: Status = tracked items; Logbooks = pages; Maintenance = tracked items + ADs + open squawks;
Aircraft = equipment items + 1; Documents = documents; Share = live links + people with access. Round to whole px. Recompute when counts
change; animate height changes only when not reduced motion. The mockup at 900px shows 58 / 172 / 104 / 78 / 62 / 58.

**States.**

| State | Visual |
|---|---|
| Default | As above; inactive tabs at 100% opacity on the web (the phone bar dims inactive to 92%). |
| Hover | Hue hover fill (§2.3 table). |
| Pressed | Hue pressed fill. |
| Focus-visible | FocusRing. |
| Selected (open) | Open state above; `aria-current="page"`. |
| Loading counts | Sub-lines replaced by one Skeleton bar 80 by 10 in `on-board` at 30%. |
| Count error | Sub-line omitted; tab still works. |
| Viewer role | Same; sub-lines never mention actions the viewer cannot take ("6 to review" flag hidden for viewers). |

**Behaviour.** A link to the section's default sub-tab (Status: What's due; Logbooks: Map; Maintenance: Tracked items; Aircraft: Hours;
Documents: Vault; Share: Hub). Middle-click opens in a new tab.

**Accessibility.** `<a aria-current="page">` on the open tab. Accessible name = title + sub-lines + flag, for example "Logbooks, 412
pages in 5 books, 212 entries, 6 to review". Colour is not the only cue: the title names the section.

**Native.** Tablet only (phone uses PhoneTabBar). SwiftUI: a `Button` row with `.buttonStyle(SectionTabStyle())` and
`.accessibilityAddTraits(.isSelected)` when open; Compose: `Surface(onClick)` with `Modifier.semantics { selected = true; role = Role.Tab }`.

**Accept.**
- [ ] Heights follow the rule; no tab is shorter than its text.
- [ ] Open tab visually joins the board (no gap, no rounded right corners).
- [ ] Flag text is at least 4.5:1 and hidden for viewers.

### 3.5 RailFoot

**Purpose.** The three global tools: Search or ask, Add, Account.

**Anatomy.** `margin-top:auto`, padding-right 14px, grid gap space.2 (8). Each is a RailButton: height 42px, padding 0 12px, radius.l,
`display:flex; align-items:center; gap:10px`, 600 15px, icon 1.2em.

| Button | Fill | Text | Icon | KeyHint |
|---|---|---|---|---|
| Search or ask | `color.cover-2` | `color.on-cover` | `[icon:search]` | `/` |
| Add | `color.on-cover` | `color.cover` | `[icon:plus]` | `N` |
| Account | transparent | `color.on-cover` | `[icon:circle-user-round]` | none; label is the user's short name ("Dana M.") |

Rail KeyHint: 500 12px/1, `color.on-cover-2`, border 1px #4a4e57, radius 3px, padding 3px 5px, `margin-left:auto`. On the Add button the
hint uses `color.ink-3` text and `color.rule-2` border.

**States.** Hover and pressed per §2.3 (cover-2 row; Add: hover #e0e0dc, pressed #d3d3cf, Decision). Current
(Search page open, Account page open): `box-shadow: inset 0 0 0 2px color.on-cover`. Focus: FocusRing.

**Behaviour.**
- Search or ask: navigates to W-ASK-01 and focuses its SearchField. Shortcut `/` from anywhere except inside a text field.
- Add: opens AddMenu (§3.7). Shortcut `N` from anywhere except inside a text field. Hidden for viewers.
- Account: opens a menu with "Settings", "Import and export", "Hangar", "Sign out".

**Accessibility.** Shortcuts exposed with `aria-keyshortcuts="/"` and `"N"`. KeyHints are `aria-hidden`. Hide KeyHints under
`(pointer: coarse)`.

**Native.** Phone: Search is the icon in PhoneHeader, Add is the AddButton, Account is in Settings. Tablet rail: same three as `Button`s.

### 3.6 RailAircraftLink (Hangar and Account only)

**Anatomy.** Heading "Aircraft" 13px `color.on-cover-2`, padding 16px 4px 4px. Each link: `display:flex; gap:10px; align-items:center`,
padding 8px 10px, margin-right 14px, radius.l, 700 15px/1.25 `color.on-cover`; `[icon:plane]`; second line 500 13px `color.on-cover-2`
("Cessna 172N"). Hover `color.cover-2` (this hover is in the mockup CSS). Figures: d-w-hangar, b-w-hangar.

**Accessibility.** Links inside the Sections nav; name "N734DM, Cessna 172N".

### 3.7 AddMenu (W-ADD-01)

**Purpose.** One list of everything the owner can add, filed to the tab it lands in. Not drawn for the web; derived from the phone Add
sheet (b-m-add).

**Anatomy.** Popover anchored to the Add RailButton, opening upward and to the right of the rail (left edge at rail right edge + 8px,
bottom aligned with the button), width 360px, leaf, radius.m, menu shadow (§3.3), padding 8px 0. Header "Add to N734DM" 700 15px, padding
8px 16px. Six items, each 56px min height, padding 8px 16px, grid `36px 1fr auto`, gap 12px: SectionIcon tile 36px (§9.8) in the colour of
the destination tab; title 700 16px; description 14px `color.ink-3`; right KeyHint for the item's shortcut letter.

| Item | Icon | Tile colour | Description | Key |
|---|---|---|---|---|
| Log a flight | plane-landing | aircraft | Photograph the tach, or type it | F |
| Add oil | droplet | aircraft | Quarts added at the aircraft | O |
| Report a squawk | flag | maint | A photo first, then a few words | S |
| Add logbook pages | upload | books | Drop scans, or scan with your phone | P |
| Add a document | file-plus-2 | docs | Insurance, registration, a Form 337 | D |
| Write a logbook entry | pencil | books | Sign it with a code sent by email | W |

Footer note 13px `color.ink-3`, padding 8px 16px: "Each colour is the tab where it will be filed."

**Keyboard.** Menu pattern; while open, the single letters in the table activate items. Escape closes and returns focus to Add.

**Viewer role.** Not shown. **Editor role.** All items.

**Accept.**
- [ ] `N` opens it from anywhere outside a text field; the letters work while it is open.
- [ ] Every tile colour matches the destination tab.

### 3.8 Board

**Purpose.** The open section's coloured field holding the BoardHead, Spine and Leaves.

**Anatomy.** Fill `board`; padding 0 22px 22px; `display:flex; flex-direction:column; min-width:0; height:100vh`. Children in order:
BoardHead, Spine (every app screen except Hangar, Account, sign-in and record room), Leaves.

**States.** Section change: fill cross-fades. Loading: BoardHead renders with the title (known from the route), Spine Skeleton, Leaves
with Skeleton content. Error loading the aircraft: one leaf with EmptyState (error variant).

**Native.** Phone: the board shows only as the PhoneHeader fill and the 8px strip beside PhoneLeaf. Tablet: as web.

### 3.9 BoardHead

**Anatomy.** `color: on-board`; `display:flex; align-items:flex-end; gap:28px`; min-height 78px (70px on D screens with a spine; use 70px
whenever the Spine follows); padding 16px 4px 0.

| Slot | Spec |
|---|---|
| Title | `<h1>`, type.board-title, margin 0 0 14px. Section name or screen name ("Status", "Logbooks", "Search or ask", "Hangar"). |
| SubTabs | §3.10, aligned to the bottom edge. |
| Actions | `margin-left:auto; display:flex; gap:8px; align-items:center; margin-bottom:12px`; 14px `on-board-2` text ("Tach 4212.4, read Nov 14") followed by Buttons in the `on-board` variant, size s. Also holds pagers ("Found book, page 3 of 5 read" with prev/next icon buttons) and Segmented filters on a leaf background (Map: All books, Airframe, ...). |

**Accessibility.** The h1 is the first heading of the page; `document.title` = "Status · N734DM · MyTailLog" (format in
12-copy-and-voice.md).

### 3.10 SubTabs

**Purpose.** The pages inside a section ("What's due", "Plan ahead"; "Map", "Pages", "Review 6", "Add pages").

**Anatomy.** `display:flex; gap:2px; align-self:flex-end`. Each tab: 600 15px, padding 9px 14px 11px, radius 5px 5px 0 0, `on-board-2`, no
underline. Selected: fill `color.leaf`, text `color.ink`; it sits directly on the Spine (or the leaf when there is no spine), so it reads as
the tab of the white sheet below. Count suffix ("Review 6"): same weight, separated by a space; the number is part of the name.

**States.** Hover (unselected): fill `on-board` at 12% (Decision), text `on-board`. Pressed: 20%. Focus: FocusRing. Selected: as above,
`aria-current="page"`. Disabled: never; hide sub-tabs the role cannot use (viewers see no "Add pages", no "Review").

**Keyboard.** They are links (navigation), not an ARIA tablist, because each has its own URL. Tab moves between them.

**Accessibility.** `<nav aria-label="Status pages">`. Count in the name: "Review, 6 pages waiting".

**Native.** Phone: a Segmented (§7.6) on the board below the header (d-m-stop shows "Map / Pages / Review 6" on a leaf-filled segmented).
SwiftUI `Picker(.segmented)`; Compose `SingleChoiceSegmentedButtonRow`. Keep: count in the label. Adapt: platform segmented shape.

### 3.11 Leaves

**Purpose.** The two-sheet spread: the record on the left, its source on the right.

**Anatomy.** `display:grid; grid-template-columns: var(--split, 1.25fr 1fr); gap:10px; flex:1; min-height:0`. Splits used in the mockups:
1.62fr 1fr (Status, Map), 1fr 1.08fr (Review desk), 1.25fr 1fr (queue), 2.05fr 1fr (Plan ahead), 1.6fr 1fr (Ask), 250px 1fr (Pages
library), 3.3fr 1fr (Due list), single column (`one`: Hangar). The screen spec names the split.

**Responsive rule (Decision).** Container width ≥ 1180px: split as specified. 900 to 1179px: the split becomes `1fr 1fr` except
`250px 1fr` which stays. Below 900px (web only): one column; the SourceMat leaf leaves the grid and becomes a right Drawer (§3.15, width
min(560px, 92vw), mat fill) opened by any PageCite or "Show page" action. 04-web-screens.md may override per screen.

**Scrolling.** Each Leaf scrolls on its own (`overflow:auto`); BoardHead and Spine stay fixed. Scroll position per leaf is kept when
switching selection inside the same screen.

### 3.12 Leaf

**Anatomy.** Fill `color.leaf`, radius.s, padding 26px 30px 28px (D screens commonly 20 to 22px top, 26 to 28px sides; use 22px 28px
20px as the default for leaves under a Spine, Decision), `position:relative; min-width:0`, shadow `0 1px 0 rgba(0,0,0,.25)`.

| Variant | Spec |
|---|---|
| default | as above |
| flush | padding 0, overflow hidden (tables edge to edge, the record room cover) |
| mat | SourceMat, §3.13 |
| punched | A row of binder holes down the bound edge: `::before` at left 9px, width 10px, radial circles 5px radius in `board` colour every 33.33% of the height, opacity .9; padding-left 38px. Used on the record leaf only when the screen spec asks (sign-in leaf, record room). Purely decorative (`aria-hidden`). |

**Accessibility.** Each leaf is a `<section>` with an `aria-label` (for example "Due items", "Page 58 of the airframe logbook") or a
heading inside. Leaves are landmarks only when labelled.

**Native.** PhoneLeaf (§9.5); tablet leaves are `RoundedRectangle(cornerRadius: 3)` fills in an `HStack` (SwiftUI) or `Row` (Compose)
with independent `ScrollView`/`LazyColumn`s.

### 3.13 SourceMat

**Purpose.** The dark mat holding the scanned page that proves what the left leaf says. B's signature: whenever a screen states a fact
from the records, its page is visible here or one click away.

**Anatomy (top to bottom).**

| Part | Spec |
|---|---|
| Container | Leaf variant `mat`: fill #2a2c31 (`color.mat`, proposed), `color.on-cover` text, padding 18px, `display:flex; flex-direction:column; gap:12px`. |
| MatHead | `display:flex; justify-content:space-between; align-items:flex-start; gap:12px`. Left: label block 13px/1.45 `color.on-cover-2` with the title on its own line in 15px `color.on-cover` (for example "Airframe logbook, page 58" then "Dec 3, 2024 · confirmed by you"). Right: Buttons variant on-mat size s, gap 6px: "Zoom" `[icon:zoom-in]`, icon-only Rotate `[icon:rotate-cw]`, "Crop and read again" `[icon:crop]`, "On the map", "Open entry", "Open in the desk". The screen spec picks which. |
| BookTabs | Optional (§4.10), when the selection is an interchange with pages in several books. |
| ScanViewer | §6.1, `flex:1; min-height:0`. |
| Quote line | Optional. Transcription of the highlighted ink in type.paper-small 16px, `color.on-cover`, in curly quotes. |
| Close-up strip | Optional (review desk): grid `auto 1fr`, gap 16px: a 230 by 76 crop enlarged 4 times and a label ("Close-up of the tach" / "Enlarged four times from the scan. If the paper is clearer, check it there."). |
| Two-page variant | For a gap (d-w-map-gap): two labelled ScanViewers stacked, each with a 14px bold label ("Airframe vol. 1, page 22 · Feb 9, 1983"). |

**States.**

| State | Visual and copy (final copy in 12-copy-and-voice.md) |
|---|---|
| Loading | MatHead with known title; ScanViewer Skeleton (a 0.72 aspect block in `color.cover-2`). |
| Nothing selected | Centered 15px `color.on-cover-2`: "Select a row to see its page." |
| No page exists (owner's note, no scan) | `[icon:file-question]` 28px and "No page for this yet. It is your note, confirmed by you." with on-mat Button "Add the page". |
| Page not on this device (native offline) | "This page downloads when you are online." |
| Error | "This page did not load." + on-mat Button "Try again". |
| Unconfirmed page | MatHead second line includes the TrustMark "Read by AI" (on-mat colours). |
| Viewer role | Rotate and "Crop and read again" hidden. |

**Behaviour.** Selecting a row, stop, field or PageCite on the left leaf loads that page and moves the highlight; the viewer scrolls so the
highlight is visible. The mat never navigates away from the screen.

**Accessibility.** `<section aria-label="Source page">`; the MatHead title is an `<h2>` (visually 15px). Changing page announces "Showing
Airframe logbook, page 58" through a polite live region.

**SwiftUI / Compose.** A `VStack` / `Column` on `Color.mat`; on phone the mat is the full-screen page view (M-REVIEW-01) or the strip
inside a sheet (d-m-stop). Keep the dark ground (pages read better on it) and the label voice.

**Accept.**
- [ ] Every PageCite on the left leaf of a two-leaf screen loads its page here without leaving the screen.
- [ ] The highlighted region is scrolled into view on every selection change.

### 3.14 HungSection

**Purpose.** A heading hung in the margin column with its content beside it: the document voice of the binder.

**Anatomy.** `display:grid; grid-template-columns: var(--hung, 132px) 1fr; gap: 0 22px`, padding 18px 0, border-top 1px `color.rule`; the
first HungSection in a leaf has border-top 2px `color.ink`. Heading `<h3>`: 700 16px/1.5; optional count line below it 400 14px
`color.ink-3` ("1 item", "14 of 14"). Margin column width per screen: 118px on D status-type leaves, 120px settings, 110px Ask, 86px
small blocks.

| Variant | Spec |
|---|---|
| default | as above |
| stack | `display:block`; heading above content, count inline after it with 8px margin. Used when the leaf content width is below 560px (Decision) and in the tablet size set. |

**Accessibility.** Real `<h3>`; content follows in reading order. Native: a `VStack(alignment: .leading)` with the heading row; hung layout
only on tablet regular width (`ViewThatFits` between hung and stacked; Compose `BoxWithConstraints`).

### 3.15 Drawer (web)

**Purpose.** A side panel over the spread for focused tasks (mark done from item detail, b-w-item; the narrow-window SourceMat).

**Anatomy.** Scrim `rgba(15,16,20,.5)` over the board. Panel right-aligned, full height, width 470px, leaf, padding 26px 30px,
`display:flex; flex-direction:column; gap:16px`, edge shadow `-1px 0 0 rgba(0,0,0,.3)`. Head: title type.heading 22px with a meta line
14px `color.ink-3`, and a close icon Button (quiet, `[icon:x]`, name "Close"). Footer: actions pinned with `margin-top:auto`, border-top
1px `color.rule`, padding-top 16px: primary then secondary ("Mark done", "Cancel").

**Behaviour.** Opens with a slide from the right (duration per 11-accessibility-and-motion.md; fade only under reduced motion). Focus moves
to the first field. Focus is trapped. Escape, the close button and a scrim click close it; if fields changed, closing asks "Discard these
changes?" (ConfirmDialog, §12). Focus returns to the control that opened it.

**Accessibility.** `role="dialog" aria-modal="true" aria-labelledby` the title.

**Native.** Not used on phone (BottomSheet instead); tablet uses `.sheet` (SwiftUI, form sheet) or `ModalBottomSheet`/`Dialog` on Android.

---

## 4. Map components

The map is direction D's addition: each logbook is a line in its own ink, entries are stops, a shop visit that signed several books is
an interchange (capsule), a stretch with no pages is dashed, the future is dotted, due items ahead are rings. It appears in three
places: the Spine (every board), the RouteMap (Logbooks › Map and wherever history is browsed) and the LineAhead (Status, Plan ahead).
This section fixes the marks, the component props, states and input. Scales, scale breaks, label placement and collision rules,
vertical layout on the phone and zoom levels are in 10-line-map.md; components here call that file's layout functions and render
what they return.

### 4.1 Map marks (shared primitives)

Every map component draws with these marks. Sizes are rendered px (not viewBox units). A map whose viewBox is wider than its leaf uses
the `.z` text sizes so labels render at 12 to 13px (d/system.css). Decision: render all maps at their real pixel size (measure the
container, compute positions) instead of scaling a fixed viewBox with `preserveAspectRatio="none"`, which the spine mockup uses and which
turns rings into ellipses at wide widths.

| Mark | Class in mockup | Spec (RouteMap and LineAhead size) | Spine size | Phone size |
|---|---|---|---|---|
| Line, past | `ln air/eng/prop/avi` | stroke 6px, round caps and joins, colour `color.line.<book>` | 3px (`thin`) | 6px, vertical |
| Line, future | `ln future` | 6px, `stroke-dasharray: 0.1 11` with round caps (a row of dots) | 3px, `0.1 7` | 6px, `0.1 11` |
| Line, no pages (gap) | `ln gap` | 2px, `stroke-dasharray: 6 6`, butt caps, book colour | 2px | 2px |
| Line, filtered out | inline style | stroke-opacity .3 | n/a | stroke-opacity .3 |
| Line, highlighted book | inline style | stroke-width 4 while other books are dimmed (engine filter) | n/a | 6px |
| Stop, confirmed entry | `stop` | circle r 4.5 to 5, fill `color.leaf`, stroke `color.ink` 2 to 2.5 | r 2.4 to 2.6, stroke 1.3 | r 5 |
| Stop, read by AI (unconfirmed) | `stop unconf` | same with `stroke-dasharray: 2 2.5` | same, dashed | same, dashed |
| Stop, selected | inline | stroke-width 4; on phone add a halo circle r +5, stroke `color.ink` 1.5, no fill | r 3.6, stroke 2 | stroke 4 + halo |
| Stop, late or flagged | inline | stroke `color.alarm` (d-w-item: late transponder renewal) plus an `.alarm` label | n/a | same |
| Stop, open squawk anchor | inline | fill `color.leaf-2`, stroke 3.5 when selected | n/a | n/a |
| Interchange (done visit) | `cap` | rounded rect, width 20 on horizontal maps, spanning from the first to the last book line it touches plus 12px at each end, rx = half the width, fill leaf, stroke ink 2.5 | 8 wide, rx 4, stroke 1.5 | horizontal capsule 18 high, rx 9, spanning the columns |
| Interchange, selected | `cap sel` | stroke-width 4 (2.5 in the decade view where caps are thinner) | n/a | stroke 4 |
| Visit, suggested | `cap plan` | stroke ink 2.5, `stroke-dasharray: 4 4`, fill `color.leaf-2` | 7 to 8 wide, stroke 1.5 | as horizontal |
| Ring, current | `ring` | circle r 7 to 8, fill leaf, stroke ink 3 | r 3.5, stroke 2 | r 6 to 7 |
| Ring, due soon | `ring soon` | stroke `color.alarm` | same | same |
| Ring, overdue or lapsed | `ring bad` | fill and stroke `color.alarm` | same | same |
| Ring, no record | `ring unk` | stroke `color.ink-3`, `stroke-dasharray: 3 3` | same | same |
| Squawk | inline path | 9 by 9 square rotated 45 degrees; open = fill ink, resolved = fill leaf, stroke ink 1.5 | 6 by 6 | n/a |
| Today | `today` | vertical line, stroke ink 1.5, full map height; "Today" 12px ink under the axis | full height | horizontal line across the columns |
| Scale break | `axis` + dasharray | 1px `color.rule`, `stroke-dasharray: 2 3` (spine) or `3 5` / `3 4` | same | horizontal |
| Window (what this view covers) | `win` | rect, fill `board` at 12% (5% for a selection on a busy map), stroke `board` 1.5, rx 3 | full height | same |
| Era band (since overhaul) | inline rect | fill `color.line.<book>` at 9% and 4% alternating, behind the line, full band height | n/a | 10% |
| Selected column (gap) | inline rect | fill `color.leaf-2` across all books for the selected years | n/a | n/a |
| Bracket | inline path | 1.5px `color.ink-3` with 8px legs above a stretch ("Found book: 5 landed, 9 being read"); dashed `4 3` for an estimate | n/a | n/a |
| Text | `text`, `.s`, `.f`, `.nm`, `.alarm`, `.paper` | 600 13px ink; `.s` 500 `color.ink-2`; `.f` 500 12px `color.ink-3` (ticks); `.nm` 700 in the book's ink (line names); `.alarm` fill alarm; `.paper` font.paper 500 13px `color.ink-2` | label column only | 12 to 13px |

Rules (from mockup-brief-d.md): labels horizontal, one size, never rotated, never over a cap, stop or another label; line colours never
mean status; status rings use StatusMark's shapes. `color.line.avionics` text on leaf is 4.56:1 and `color.line.other` is 3.25:1: use
line inks for line names only at 700 weight and 13px or larger, and never use `color.line.other` for text (name the "Other" line in
`color.ink-2`).

### 4.2 Spine

**Purpose.** A strip of the aircraft's whole life under every board head: the binder's index by time. It shows where the current screen
sits in that life (the window bracket) and is the way into the map. Figures: every `d-w-*` with a board, d-web-status; phone variant on
d-m-review.

**Anatomy (web).** Leaf fill, radius.s, margin 0 0 10px, padding 6px 14px 4px, `display:grid; grid-template-columns:auto 1fr auto; gap:14px;
align-items:center`, leaf-edge shadow.

| Part | Spec |
|---|---|
| Label | 700 13px/1.2 `color.ink-2`: the tail number; second line 500 `color.ink-3`: the span or the context ("1978 to 2027", "Jun 1984"). |
| Strip | SVG 40px high, full width of the middle column. Four lines at y 8, 16, 24, 32 (airframe, engine, propeller, avionics; a line starts at its book's first entry, avionics in 2008 for N734DM). The "other" book is not drawn on the spine. Marks at spine size (§4.1): done interchanges, suggested visits, rings ahead, open squawks, unconfirmed stops landing, the scale break, today and the window. |
| Link | 600 13px/1.2 `board-ink`, `[icon:route]` 16px, gap 6px: "Open the map" (default), "See it on the map" (review), or a MapLegend key when the strip needs one ("read, not confirmed", d-w-queue). |

**Props.**

```ts
type BookType = 'airframe' | 'engine' | 'prop' | 'avionics' | 'other';   // logbook.type
type Trust = 'ai_read' | 'confirmed' | 'signed';
type DueStatus = 'current' | 'due_soon' | 'overdue' | 'no_record';
type SpineProps = {
  tail: string;                         // "N734DM"
  context: string;                      // second label line: "1978 to 2027" | "Jun 1984"
  life: { from: string; to: string };   // ISO dates; to = today + horizon (10-line-map.md)
  scaleBreak?: string;                  // ISO date where the recent scale starts (10-line-map.md)
  today: string;
  books: { type: BookType; segments: { from: string; to: string; kind: 'solid' | 'gap' | 'future' }[] }[];
  visits: { date: string; books: BookType[]; kind: 'done' | 'suggested' | 'planned' | 'in_shop' }[];
  rings: { date: string; book: BookType; status: DueStatus }[];
  squawks?: { date: string; open: boolean }[];
  pending?: { date: string; book: BookType }[];   // unconfirmed entries, drawn as dashed stops
  window?: { from: string; to: string } | null;   // what this screen covers
  focusStop?: { date: string; book: BookType; trust: Trust };   // review: the page being reviewed
  link: { label: string; href: string } | { legend: 'unconfirmed' };
  windowDescription: string;            // for the accessible name, e.g. "the next twelve months bracketed"
};
```

**States.**

| State | Visual |
|---|---|
| Default | As above. |
| Hover (strip) | 1px `color.ink-3` vertical guide follows the pointer; MapTooltip (§4.11) shows the month and year under the pointer ("Jun 1984") and, within 6px of a mark, the mark's label ("Annual, Jul 14, 2026"). |
| Focus-visible | FocusRing around the whole spine (the spine is one link). |
| Pressed | Strip fill `color.leaf-2` while pressed. |
| Loading | Label shows the tail; strip shows four lines in `color.rule`, no marks; link visible. |
| Empty (new aircraft, no pages) | Past drawn as gap lines from year built to today, future dotted; no stops; only the rings the setup answers prove (the annual). Context line "No pages yet". |
| Unconfirmed present | Pending stops drawn dashed at spine size; never counted in rings. |
| Error | Strip replaced by 13px `color.ink-3` "The map could not be drawn."; link stays. |
| Offline (native tablet) | Drawn from the local copy; no visual change. |
| Viewer role | Same. |

**Behaviour (web).** Superseded by 10-line-map.md §8.1 and 03 §7.2 (14-decisions.md M3): a `role="group"`; click before today opens Logbooks › Map at ±2 years around the point, click after today opens Status › Plan ahead at that date, drag selects a range on map screens. Original text, for reference: click anywhere on the strip: open Logbooks › Map (W-BOOKS-01) centred on the clicked date
with the same window. Click the link text: open the map with the window. Keyboard: Tab focuses the spine; Enter opens the map with the
window. No arrow-key navigation inside the spine: it is an index; the RouteMap is the browser.

**Accessibility.** One `<a>` wrapping the spine, name "Open the map. The whole life of N734DM, 1978 to 2027, with " + `windowDescription`.
The SVG is `aria-hidden` inside the link. Window descriptions per screen come from 12-copy-and-voice.md (the mockups' `aria-label`s are the
starting set).

**Phone (dm-spine).** Only on M-REVIEW-01 and M-SCAN-03: leaf fill, margin 0 12px 10px, radius.s, padding 7px 12px 5px, leaf-edge shadow;
label row 600 13px/1.3 `color.ink-2` with the tail in bold `color.ink` and the context at the right; strip 36px high. Display only (not a
link) so review is never left by accident; one accessibility element, label "This page lands in June 1984, inside the airframe gap".

**SwiftUI.** `Canvas` inside a `GeometryReader`, x from dates through the 10-line-map.md scale; on tablet wrap in a `Button` with
`.buttonStyle(.plain)`. **Compose.** `Canvas(Modifier.fillMaxWidth().height(40.dp))` with `drawLine`, `drawCircle`, `drawRoundRect` and
`PathEffect.dashPathEffect`; wrap in `Modifier.clickable(role = Role.Button)`. Keep: four inks, 3px lines, the window bracket. Adapt: on
tablets the hover tooltip becomes a long-press preview.

**Accept.**
- [ ] Rings stay circular at every width.
- [ ] The window matches what the screen covers (12 months on Status, 24 on Plan ahead, the stop's month on Entry detail, the page's month on Review).
- [ ] Unconfirmed stops are dashed and never change rings.
- [ ] Click opens the map at the clicked date; Enter opens it with the window.

### 4.3 LifeStrip

**Purpose.** The spine without its board shadow, inside a leaf: the hangar card header (d-w-hangar) and the record room cover (d-w-room).

**Anatomy.** `display:grid; grid-template-columns:150px 1fr; gap:34px; align-items:center`, padding 12px 0 10px, border-bottom 1px
`color.rule`. Label 600 13px/1.3 `color.ink-3` on two lines ("1978 to 2026" / "412 pages, 5 books"). Strip SVG 34px high with spine marks.
Tick row below (`d-ticks`): 16px high, 500 12px/16px `color.ink-3`, decade labels placed at their x with `translateX(-50%)`, plus "Today".

**Props.** Spine props minus `window` and `link`, plus `ticks: { label: string; date: string }[]` and `href` (that aircraft's map).

**Behaviour and accessibility.** The strip is a link into that aircraft's map; name "Open N734DM's map, 1978 to 2026". In the record room
it is not a link (the room opens on the full map below it). Native: the Spine Canvas at 34pt.

### 4.4 RouteMap

**Purpose.** The full network of the aircraft's records on a leaf. Stops open their page on the right leaf; interchanges open every page
of that visit, one BookTab per book; gaps are dashed and offer to scan. Used on W-BOOKS-01 to 04 (d-web-map, d-w-map-engine,
d-w-map-decade, d-w-map-gap), W-BOOKS-06 (d-w-queue), W-BOOKS-09 (d-w-firstread), W-ASK-01 (d-w-ask), W-STATUS-04 (d-w-item, single
line), W-MAINT-01 (d-w-ads, mini), W-MAINT-03 (d-w-squawks, single line), W-AIRCRAFT-01 (d-w-engine), W-SHARE-02 and 03 (d-w-room,
d-w-dossier, static), M-BOOKS-01 to 05 (vertical), M-SCAN-03, M-ASK-01, T-BOOKS-01.

**Anatomy (horizontal).**

| Part | Spec |
|---|---|
| Header row | Above the SVG: leaf heading (type.heading) at the left, MapLegend (§4.8) at the right; `display:flex; justify-content:space-between; align-items:baseline; gap:12px`. A quiet "List view" link sits after the legend (Decision, for the accessible alternative). |
| Line names | Left column 84px: `.nm` text in each book's ink ("Airframe", "Engine", "Propeller", "Avionics"). Lines start at x 84. |
| Lines | One per book at fixed y, 40 to 80px apart (10-line-map.md), drawn per segment kind. |
| Marks | §4.1. |
| Labels | Event labels above or below marks, never overlapping (10-line-map.md placement). |
| Axis | Year ticks (`.f`) along the bottom, "Today" 12px ink, last tick right-aligned. |
| Overlays | Era bands, selected column, window, bracket. |

**Variants.**

| Variant | Spec | Figure |
|---|---|---|
| `life` | Whole life with a scale break: 1978 to Nov 2025 compressed, the last 12 months and the next 12 expanded. | d-web-map |
| `book` | One book highlighted (stroke 4, others at stroke-opacity .3), era bands for "since overhaul". | d-w-map-engine |
| `decade` | A 10-year window, every stop labelled by date. | d-w-map-decade |
| `selection` | A gap or Ask results selected: other marks dimmed (.22 to .3 opacity), matching stops stroke 3, the cited one 4. | d-w-map-gap, d-w-ask |
| `landing` | Pending pages drawn as dashed stops landing on their line, with a bracket and a count label. | d-w-queue, d-m-queue |
| `single` | One line, an item's or squawk's history: a stop per completion, intervals labelled between stops, late ones flagged. 128px high (item) or 70px (squawk). | d-w-item, d-w-squawks |
| `mini` | 282 by 34, inline in a table row: one line, compliance stops, the next ring. Not interactive (the row is). | d-w-ads |
| `static` | Print and record room cover: no interaction; in print every label carries a footnote number. | d-w-room, d-w-dossier |
| `vertical` (phone) | One column per book, 40px apart (x 58, 98, 138, 178 in a 358-wide box), newest at the top; book names abbreviated in 12px `.nm` ("Air", "Eng", "Prop", "Avi"); caps become horizontal capsules 18 high spanning the columns; year ticks at x 0; labels in a column from x 208; today is a horizontal line. | d-m-map, d-m-engine |

**Props.**

```ts
type RouteMapProps = {
  variant: 'life' | 'book' | 'decade' | 'selection' | 'landing' | 'single' | 'mini' | 'static';
  orientation: 'horizontal' | 'vertical';
  range: { from: string; to: string; breaks?: { at: string; ratio: number }[] };   // 10-line-map.md
  today: string;
  books: { type: BookType; name: string; segments: { from: string; to: string; kind: 'solid' | 'gap' | 'future' }[] }[];
  stops: { id: string; date: string; book: BookType; trust: Trust; label?: string; pageId?: string; flagged?: boolean }[];
  visits: { id: string; date: string; books: BookType[]; entryIds: string[]; kind: 'done' | 'suggested' | 'planned' | 'in_shop'; label?: string }[];
  gaps: { id: string; book: BookType; from: string; to: string; state: 'open' | 'no_pages_exist' | 'asked_previous_owner' }[];
  eras?: { book: BookType; from: string; to: string; label: string }[];             // since-overhaul bands
  rings?: { id: string; date: string; book: BookType; status: DueStatus; label: string }[];
  filterBook?: BookType | 'all';
  lit?: string[];                         // stop ids kept at full strength (Ask results); others dimmed
  selection?: { kind: 'stop' | 'visit' | 'gap'; id: string } | null;
  onSelect?: (sel: { kind: 'stop' | 'visit' | 'gap'; id: string } | null) => void;
  summary: string;                        // hidden description: "4 books, 212 confirmed entries, 1 gap: airframe Feb 1983 to Mar 1991"
};
```

**States.**

| State | Visual |
|---|---|
| Default | All marks at full strength. |
| Hover on a mark (web) | Mark radius +1px (caps: stroke +1); MapTooltip with the entry's date, book, a one-line summary and its TrustMark word. Cursor pointer. |
| Focus on a mark | FocusRing drawn around the mark's 24px hit circle (two concentric strokes). |
| Selected stop | Stroke 4 (phone adds the halo). The right leaf (or phone sheet) shows the page. |
| Selected visit | `cap sel`; the SourceMat shows BookTabs, one per book. |
| Selected gap | Column tinted `color.leaf-2` across all books, the gap's ends labelled ("Feb 1983", "Mar 1991"), per-book counts inside the column ("11 entries"), heading "Selected: 8 years". |
| Filtered to one book | Other lines and their marks at opacity .3; era bands on. |
| Lit (Ask) | Non-lit stops at opacity .22, lit stops stroke 3 (the cited one 4), window at 5%. |
| Loading | Lines drawn in `color.rule` across the cached range; no marks; heading visible; Skeleton on the right leaf. |
| Empty (no pages) | All past segments `gap`; today; the future with what the setup answers prove; `.f` label on the airframe line "No pages yet". The EmptyState sits beside the map (d-w-new). |
| Unconfirmed present | Dashed stops; the legend shows "read, not confirmed". |
| Error | SVG replaced by AlarmSlip soft "The map could not be drawn." with a quiet "Show the list instead" Button (W-BOOKS-12). |
| Offline (native) | Drawn from the local copy; the owner's own pending changes are drawn as confirmed with a PendingMark in the sheet. |
| Viewer role | Same marks; gap actions hidden (a viewer cannot scan or mark "no pages exist"). |
| Record room (recipient) | Only confirmed and signed stops; gaps drawn with their state; never unconfirmed stops. |

**Behaviour (web).**
- Click a stop: select it; the right leaf loads its page and entry; the URL updates (`?stop=<entryId>`) so Back restores the previous selection.
- Click a capsule: select the visit; the mat shows BookTabs with the first book selected.
- Click a dashed gap segment (hit area 24px tall along the segment): select the gap; the left leaf shows "What the other books show" and
  the three actions ("Scan the missing pages", "Mark "no pages exist"", "Note: asked the previous owner"); the mat shows the pages either
  side of the gap.
- Click empty map space or press Escape: clear the selection.
- Book filter: the board Segmented ("All books, Airframe, Engine, Propeller, Avionics"). Zoom levels (life, decade) per 10-line-map.md,
  changed by a Segmented or by ctrl + wheel / pinch on the map. A plain wheel scrolls the leaf (Decision: no scroll-jacking).

**Keyboard (web; Decision).** The map is one tab stop with roving focus over its marks:
- Tab enters on the selected mark, else the most recent stop on the first visible line.
- Left / Right: previous / next mark on the same line in time (stops, caps and gap segments in date order).
- Up / Down: nearest mark in time on the line above / below.
- Home / End: first / last mark on the line.
- Enter or Space: select (opens its page). Escape: clear the selection; focus stays.
- `+` / `-`: zoom in / out one level around the focused mark. `L`: open the list view (W-BOOKS-12) at the focused entry.
- Each move is announced through a polite live region: "Engine. Sep 14, 2005. Engine overhaul. Confirmed by you. Stop 41 of 61."

**Accessibility.** Container `role="group"`, `aria-label` "Route map, 1978 to 2027", `aria-describedby` the hidden `summary`. Each mark is
an element with `role="button"`, roving `tabindex`, `aria-label` as announced, `aria-pressed` on the selected one. The list view
(W-BOOKS-12) is the equivalent alternative. Never rely on line colour: every announcement and tooltip names the book.

**Phone (vertical).** Scroll is time: scrolling down goes back. Tapping a stop or capsule opens the map BottomSheet (§9.9, variant `map`)
over the lower half with the map still visible and the selected mark scrolled into the upper third. Tapping a gap opens the gap sheet
(d-m-gap). The sheet's "next stop" button moves along the same line. No pinch zoom; zoom by the decade Segmented.

**SwiftUI.** Draw with `Canvas` for performance; overlay invisible 44pt `Button`s for interactive marks positioned from the same layout, or
expose marks with `.accessibilityChildren` / `AccessibilityElement`s plus `accessibilityRotor("Stops")`; next / previous on a line through
`.accessibilityAdjustableAction`. The vertical map lives in a `ScrollView` with `ScrollViewReader` to keep the selection visible.
**Compose.** `Canvas` inside a `LazyColumn` item (vertical) or a `Box` (tablet); hit testing with `pointerInput { detectTapGestures }`
mapped to the nearest mark within 24dp; semantics per mark with `clearAndSetSemantics { contentDescription = ...; role = Role.Button }`
and `customActions` for next / previous. Keep: inks, mark shapes, label rules, newest at top on phone. Adapt: hover tooltips become
long-press previews (iOS `contextMenu` with a preview; Android long-press opens the sheet).

**Accept.**
- [ ] Every stop, capsule and gap is reachable by keyboard and by VoiceOver and TalkBack, and announces book, date, label and trust.
- [ ] Selecting a stop shows its page without leaving the screen (web) or in a sheet that keeps the stop visible (phone).
- [ ] Unconfirmed stops are dashed; the record room never shows them.
- [ ] No label overlaps another label or a mark at any supported width (tests in 10-line-map.md).

### 4.5 LineAhead

**Purpose.** The next 60 days to 24 months on the same lines: due items as rings on their book's line, suggested shop visits as dashed
capsules. Answers "what is coming and what fits one visit". Used on W-STATUS-01 (d-web-status), W-STATUS-02 annual month (d-w-annual),
W-STATUS-03 (d-w-plan, with DateScrubber), W-MAINT-04 (d-w-annualprep), W-SETUP-02 (d-w-new), M-STATUS-01 (d-m-status), M-STATUS-03
(d-m-plan), M-FLIGHT-03 and 04 (mini; d-m-flight, d-m-saved), M-SYS-03 Widget, T-STATUS-01 and 02.

**Anatomy.** Line geometry as RouteMap horizontal (names column 84px, 45px between lines on the web, 680 to 740 wide). The past stub
(today minus about 4% of the width) is solid; everything after today is `future`. Today line full height with "Today" under the axis.
Month ticks along the bottom (`.f`), first "Today", last right-aligned with its year ("Nov 2027"). Rings at their due dates; an
hours-limited item's ring sits at its projected date and its label says "about" or shows hours ("Oil, 9.7 h"). Labels: ink for visits,
`.s` for upcoming items, `.alarm` for lapsed or about-to-lapse items.

**Variants.** `status` (12 months), `annual` (60 days), `plan` (24 months, the first 6 at double scale, with DateScrubber), `prep` (today
to the annual), `new` (setup answers only), `phone` (354 wide, 12 months, short labels), `mini` (phone flight confirm: one line, the oil
ring moving), `widget` (330 by 100, 60 days, no ticks except "Today").

**Props.**

```ts
type LineAheadProps = {
  variant: 'status' | 'annual' | 'plan' | 'prep' | 'new' | 'phone' | 'mini' | 'widget';
  range: { from: string; to: string; breaks?: { at: string; ratio: number }[] };
  today: string;
  books: BookType[];                                   // lines drawn, top to bottom
  items: { id: string; book: BookType; dueDate: string; dueKind: 'calendar' | 'hours';
           status: DueStatus; label: string; hoursLeft?: number }[];
  visits: { id: string; date: string; books: BookType[]; kind: 'suggested' | 'planned' | 'in_shop'; label: string; itemIds: string[] }[];
  marker?: { date: string };                           // plan: DateScrubber position
  selection?: { kind: 'item' | 'visit'; id: string } | null;
  onSelect?: (sel: { kind: 'item' | 'visit'; id: string } | null) => void;
  previous?: { itemId: string; dueDate: string };      // mini: where the ring was before this flight
  summary: string;                                     // hidden description: "1 lapsed, 3 due soon, 2 suggested visits"
};
```

Items arrive already computed from confirmed records only (§2.8). Items with status `unknown` and no date are not drawn; the screen lists
them in their own group (d-w-new: "The three inspections without a date wait in their own column").

**States.**

| State | Visual |
|---|---|
| Default | As above. |
| Hover ring or capsule (web) | Ring r +1; MapTooltip: item name, due date, limit kind ("every 50 h"), what is left ("9.7 h, about Dec 12"). |
| Focus | FocusRing around the 24px hit circle. |
| Selected item | Ring stroke 4; the matching DueRow is selected (two-way). |
| Selected visit | `cap sel`; the visit's items are listed with "Book this visit". |
| With marker (plan) | Window tinted from today to the marker; rings inside it that will have lapsed by then drawn filled (`ring bad`) with `.alarm` labels. |
| After a flight (mini) | Previous ring position at 30% opacity with a 1.5px `color.ink-3` arrow to the new one (Decision; d-m-flight shows the ring moved nearer). |
| Loading | Lines, today and ticks drawn; no rings. |
| Empty (nothing tracked) | Dotted lines with today; centred `.f` label "Nothing tracked yet". |
| All clear | All rings `current`; nothing else changes on the line (the Verdict says it). |
| Unconfirmed present | Not drawn (§2.8). |
| Error | AlarmSlip soft "What is due could not be worked out." with a quiet Retry; the DueTable does not repeat the error. |
| Viewer role | Same; "Book this visit" hidden. |

**Behaviour.** Click a ring: select the item (DueRow selected, SourceMat shows its last page). Click a capsule: select the visit.
Keyboard as RouteMap (Left / Right along a line in date order, Up / Down between lines, Enter selects). The DueTable is the full
equivalent for screen readers. Group label: "The line ahead: the next twelve months on each logbook line" (per variant range).

**Native.** As RouteMap. On phone the LineAhead is horizontal (d-m-status), 354pt wide, not scrollable; 44pt targets centred on rings,
overlapping targets resolve to the nearest ring. Widget variant: SwiftUI shapes in WidgetKit (no interactivity); on Android a bitmap
drawn in a worker and shown with Glance `Image` (Glance has no canvas). See Widget §9.14.

**Accept.**
- [ ] Every drawn ring has a DueRow, and selecting either selects both.
- [ ] Hours-limited rings sit at the projected date and their labels say "about" or show hours.
- [ ] No unconfirmed reading moves a ring.

### 4.6 DateScrubber

**Purpose.** A draggable date marker on the LineAhead that replaces Forecast and Pick a date: drag to a day, see what will have lapsed
by then. Used on W-STATUS-03 (d-w-plan), M-STATUS-03 (d-m-plan), T-STATUS-02 (d-t-plan).

**Anatomy.**

| Part | Web (d-w-plan) | Phone (d-m-plan) |
|---|---|---|
| Marker line | Vertical, stroke `color.ink` 3px, from 4px above the top line to the axis | 2.5px |
| Window | From today to the marker: `win` fill `board` 12%, no stroke | `win` with stroke |
| Handle | Rect 104 by 24, rx 4, fill `color.ink`, under the axis, centred on the marker; two grip lines 12px tall, 1.5px `color.leaf`, 4px apart at its left; label 700 13 to 14px `color.leaf` ("Mar 1, 2027") | Pill 56 by 24, rx 12, ink, label 700 "Mar 1" in leaf |
| HTML handle (when drawn over the map in HTML, `d-handle`) | `display:inline-flex; gap:6px; height:30px; padding:0 10px; radius.m; ink fill; leaf 700 14px/1` | n/a |
| Companion fields | Date TextInput (shown focused while scrubbing) + "Flying until then" Select ("3 h a week") + meta line "About 44 hours, so the tach reads about 4256 that day. Drag the marker on the map or type a date." | Header input "+44 h" with `[icon:chevrons-up-down]` (expected hours) and the range Segmented "6 months / 12 / 24" |

**Props.**

```ts
type DateScrubberProps = {
  value: string;                 // ISO date
  min: string;                   // today
  max: string;                   // end of the LineAhead range
  hoursPerWeek: number;          // from recent flying or the Select
  onChange: (date: string) => void;   // while dragging, throttled to animation frames
  onCommit: (date: string) => void;   // on release or Enter; recomputes the lapsed list
};
```

**States.** Default; hover (web: handle fill #282a2d, cursor `ew-resize` on handle and line); dragging (cursor `grabbing`, label updates
live, the lapsed list updates on commit only, Decision, to avoid flicker); focus (FocusRing around the handle); at min (label "Today",
empty window); at max (handle stops, no overshoot); disabled (nothing tracked: handle hidden, fields disabled with the reason "Nothing
tracked yet").

**Keyboard (web).** The handle is `role="slider"`; `aria-valuemin` 0 and `aria-valuemax` = days from today to max, `aria-valuenow` = days,
`aria-valuetext` "March 1, 2027, about tach 4256". Left / Right ±1 day; Shift + Left / Right ±1 week; Page Up / Page Down ±1 month; Home
today; End max. The Date TextInput is the precise alternative and stays in sync both ways.

**Phone.** Drag the pill or anywhere on the marker line (44pt wide hit strip). Selection haptic at each month boundary (iOS
`UISelectionFeedbackGenerator`; Android `HapticFeedbackConstants.CLOCK_TICK`). VoiceOver: adjustable, swipe up / down = ±1 week
(Decision), value "March 1, 2027". TalkBack: `setProgress` semantics with the same step.

**SwiftUI.** `DragGesture` on an overlay mapped through the inverse scale (x to date); `.accessibilityRepresentation { Slider(...) }`.
**Compose.** `pointerInput { detectHorizontalDragGestures }` and `semantics { stateDescription = ...; setProgress { ... } }`. Keep: ink
handle under the axis, tinted window. Adapt: haptics and the wider hit strip.

**Accept.**
- [ ] Dragging and typing a date give the same result.
- [ ] Keyboard and screen-reader adjustment move by the specified steps.
- [ ] The lapsed list never includes items computed from unconfirmed readings.

### 4.7 VisitCapsule

**Purpose.** A shop visit drawn as an interchange: a done visit that signed several books, a suggested visit ("Do these together") or a
planned visit. Used on every map; its detail opens on W-STATUS-03, M-STATUS-04 (d-m-suggest) and M-BOOKS-03 (d-m-visit).

**Anatomy.** A rounded rectangle across the lines it touches (§4.1 sizes). Label above the top end, centred, ink 600 13px ("Visit 1,
Dec 7", "Jul 14 annual", "Annual and ELT, by Jul 31").

| Kind | Stroke | Fill | Meaning |
|---|---|---|---|
| done | ink 2.5 solid | leaf | A past visit with confirmed entries in two or more books. |
| suggested | ink 2.5, dash 4 4 | `color.leaf-2` | MyTailLog's bundle of items due close together. Not yet planned. |
| in_shop | section-ink 3 solid | `color.leaf-2` | The aircraft is at the shop for this visit (09 visit status `in_shop`). |
| planned (Decision) | ink 2.5 solid | `color.leaf-2` | The owner pressed "Book this visit" and set a date. Future but committed. |

**States.** Default; hover (stroke +1, MapTooltip listing the items); focus (FocusRing on the capsule bounds); selected (stroke 4); dimmed
(opacity .3 under a filter). For viewers a suggested visit is shown but not actionable.

**Props.** `{ id; date; books: BookType[]; kind: 'done' | 'suggested' | 'planned' | 'in_shop'; label; itemIds?: string[]; entryIds?: string[] }`.

**Behaviour.** Selecting a done visit shows BookTabs on the mat (web) or PageCards (phone). Selecting a suggested or planned visit lists its
items with "Book this visit" (primary for the first suggested visit, secondary for later ones, as in d-w-plan) and on phone "Send to
AeroCheck" (the mechanic hand-off; 07-flows.md).

**Accessibility.** Names: "Suggested visit, week of Dec 7. Clears oil and filter, transponder, pitot-static." / "Jul 14, 2026 annual,
signed in the airframe, engine and propeller books".

### 4.8 MapLegend

**Purpose.** Explains the marks a map uses: only the ones on screen.

**Anatomy.** `display:flex; flex-wrap:wrap; gap:6px 16px; align-items:center`, 13px `color.ink-3`. Each key: swatch (6px right margin,
vertically centred) then the word.

| Key | Swatch | Default word |
|---|---|---|
| solid | 22 by 4, radius 2, ink | "pages in" |
| gap | 22 wide, 2px dashed top border, ink | "no pages yet" |
| future | 22 by 4, 1.6px dots every 7px, ink | "ahead" |
| ring | 12 circle, 2.5px ink border | "due, current" |
| ring soon | same, alarm border | "due soon" |
| cap | 12 by 20, radius 6, 2.5px ink border | "one visit, several books" |
| cap dashed | same, dashed | "suggested visit" |
| stop | 12 circle, 2.5px ink border, leaf fill | "entry" |
| stop unconf | same, dotted | "read, not confirmed" |
| squawk | 9 by 9 diamond, 2px ink; open = ink fill | "open squawk" / "resolved" |
| book | LineChip (§5.5) | book name |

Words are owned by 12-copy-and-voice.md. The legend is a `<ul aria-label="Map key">`, swatches `aria-hidden`, not interactive. Native:
`HStack` in a flow layout (SwiftUI `Layout`) / Compose `FlowRow` of small `Canvas` swatches and `Text`.

### 4.9 StopStepper

**Purpose.** Step from stop to stop along one line from an entry detail (d-w-entry, W-BOOKS-10).

**Anatomy.** `display:inline-flex`, border 1px `color.rule-2`, radius.m, overflow hidden. Three cells 34px high: previous link
(`[icon:chevron-left]` + "Jul 14 annual"), a status cell (`color.leaf-2` fill, 14px `color.ink-3`, containing a LineChip "Stop 61 of 61"),
next link ("Next: oil due about Dec 12" + `[icon:chevron-right]`). Links 600 14px `color.ink`, padding 0 12px, gap 6px, separated by 1px
`color.rule-2`.

**States.** Leaf hover and pressed layers; FocusRing per link; at the last stop the next link points to the next ring ahead in
`color.ink-3` text, or is absent when there is none; at the first stop the previous link is absent.

**Keyboard.** Two links; also `[` and `]` step previous / next while focus is inside the entry leaf (Decision). Native: in the stop sheet a
secondary Button "[icon:chevron-up] 2011" beside "Open page" (d-m-stop).

### 4.10 BookTabs

**Purpose.** On the mat, one tab per book a visit signed (d-w-map-decade), so each page of an interchange is one click away.

**Anatomy.** `display:flex; gap:4px; flex-wrap:wrap`. Tab: 34px high, padding 0 12px, radius.m, border 1px #5a5e68, `color.on-cover` 600
14px, gap 7px; leading swatch 14 by 4, radius 2. Selected: fill and border `color.leaf`, text `color.ink`, swatch in the full book ink.
Unselected swatches use light tints that read on the mat: airframe #8d97e0, engine #e08ab4, propeller #a9adb6, avionics #6cc2df.
Label "Airframe p. 41".

**Keyboard.** WAI-ARIA tabs: `role="tablist"`, `aria-selected`, Left / Right move and activate, the ScanViewer is the tabpanel.

**Native.** Phone uses PageCards (§9.12). Tablet: a row of buttons on the mat with `.accessibilityAddTraits(.isSelected)` / `selected`.

### 4.11 MapTooltip (web)

**Purpose.** Hover readout for map marks (not drawn in the mockups; Decision).

**Anatomy.** Fill `color.ink`, `color.leaf` 600 13px/1.35, radius 3px, padding 4px 8px, max-width 260px, 8px above the mark (flips below
near the top edge). Lines: bold label; date and book; TrustMark word.

**Behaviour.** Appears after 150 ms of hover and on keyboard focus of a mark; hides on leave or blur; never holds links. `role="tooltip"`,
referenced by the mark's `aria-describedby`. Native: no tooltip; long-press preview instead.

---

## 5. Records vocabulary

### 5.1 Verdict

**Purpose.** The opening sentence: what the records show, in words, before any evidence. Leads Status, the hangar cards, item and
situation screens, the record room and several task screens (review, audit, plan). Figures: d-web-status, d-m-status, d-w-annual,
b-w-clear, d-w-new, d-w-plan, d-w-hangar, d-w-room, b-w-reviewall, d-m-saved.

**Anatomy.** A `<p>` in type.lede: web 400 22px/1.35, letter-spacing -0.005em, `color.ink`, max-width 34ch (`max-width:none` when the leaf
is narrower than 34ch or the screen spec says so; d-web-status uses none), margin 0 0 20px (10px when a map follows). Bold runs are 800
and carry the state ("**One check has lapsed**, and it only matters for IFR."). Phone: 400 20px/1.35, margin 0 0 14px. Tablet: 20px.
Plan variant inside a narrow right leaf: 20px.

**Content rules (copy templates in 12-copy-and-voice.md).**
- Sentence one names the worst state found in confirmed records and its scope ("IFR only"). Sentence two names what comes next or what
  fits one visit. At most two sentences, at most two bold runs.
- Never "airworthy", "legal to fly", "grounded", "compliant" as a verdict; say "lapsed", "due", "nothing tracked is overdue".
- Computed from confirmed and signed data only. Pages waiting for review are mentioned elsewhere (flag, queue), never in the Verdict's
  state.
- Situations change the template: all clear, something coming up, annual month, in the shop, preparing a sale, new aircraft (W-STATUS-02).

**Props.** `{ parts: { text: string; strong?: boolean }[]; size?: 'web' | 'tablet' | 'phone' | 'narrow'; asOf?: string }`. The server
builds the parts; the component only renders. `asOf` adds nothing visible on app screens; the record room prepends "As of Nov 18, 2026,".

**States.**

| State | Visual |
|---|---|
| Default | As above. |
| Loading | Two Skeleton lines, 90% and 55% of the max width, 22px high, 8px apart. |
| Changed (after logging a flight, marking done, confirming pages) | Text replaced; announced through `aria-live="polite"` on the paragraph (only for changes caused by the user's own action on this screen, not on first load). |
| Offline (native) | Computed on the device from the local copy; text identical; no "offline" wording in the Verdict (SyncState carries it). |
| Error | "We could not work out what is due right now." in type.lede `color.ink-2`, plus a quiet Retry Button on the next line. |
| Empty (new aircraft, nothing scanned) | The setup template (d-w-new). |
| Unconfirmed present | No change to the sentence. |
| Viewer role | Same sentence. |

**Accessibility.** The Verdict follows the h1 and the spine in reading order and is an `h2` (11 §5, 14-decisions.md A2). Bold runs are `<b>` (no semantic
emphasis needed). Contrast 17.9:1.

**SwiftUI.** `Text` built from `AttributedString` runs with `.font(.custom("LibreFranklin-Regular", size: 20, relativeTo: .title3))` and
the bold runs in `LibreFranklin-ExtraBold`. **Compose.** `Text(buildAnnotatedString { withStyle(SpanStyle(fontWeight = W800)) { ... } })`.
Keep: two sentences, bold state. Adapt: Dynamic Type and font scale grow it; it wraps, never truncates.

**Accept.**
- [ ] No banned words; scope words ("IFR only") present when the item applies only to IFR.
- [ ] Never changes because of an unconfirmed reading.
- [ ] Wraps at 200% text without truncation.

### 5.2 StatusMark

**Purpose.** The ink-and-vermilion status vocabulary: mark plus word, never colour alone. Figures: everywhere a due state shows.

**Anatomy.** `display:inline-flex; align-items:center; gap:7px`, 700 14px, `white-space:nowrap`; mark is a `::before` 12 by 12 circle.

| Kind | Mark | Text | Typical words |
|---|---|---|---|
| current (`ok`) | filled circle `color.ink` | `color.ink` | "Current", "Complied", "On file", "Connected", "On" |
| due soon (`soon`) | ring, 3px border `color.alarm` | alarm-coloured text (see note) | "Due soon", "Soon", "Unsure", "Needs a look", "Watch" |
| overdue (`bad`) | a slip: fill `color.alarm`, white text, padding 2px 9px 2px 7px, radius 3px; mark is an 8px white dot | `#ffffff` (4.59:1) | "Overdue", "lapsed 7 days ago", "Lapsed", "Lapses", "2.3 h over", "Ground" |
| no record (`unk`) | ring, 2px dashed `color.ink-3` | `color.ink-3` | "No record", "Needs a date", "No expiry date", "May be stale" |
| advisory (`adv`) | none | 500 weight, `color.ink-2` | "Advisory", "Not applicable" |
| neutral (`low`) | ring, 2px `color.ink` | `color.ink` | "Recurring", squawk severity "Low" |

Note on alarm text (Decision): `color.alarm` text is 4.59:1 on leaf but 4.16:1 on `color.leaf-2` (selected and hovered rows) and 3.92:1 on
`color.alarm-bg`. Due-soon text therefore uses a darker alarm ink, #c42e15 (5.60:1 on leaf, 5.08:1 on leaf-2, 4.79:1 on alarm-bg);
proposed token `color.alarm-text`. The ring keeps `color.alarm`.

**Sizes.** default 14px with 12px mark; compact 13px with 10px mark (PageThumb captions, phone rows, print; print soon ring 2.5px);
count-only (FilterChip) shows the mark and the word, the number sits outside in the chip.

**Props.** `{ kind: 'current' | 'due_soon' | 'overdue' | 'no_record' | 'advisory' | 'neutral'; label: string; size?: 'default' | 'compact' }`.
The kind comes from the server status; the label from 12-copy-and-voice.md.

**States.** Not interactive. Inside a selected ink ChoiceChip the overdue slip inverts: fill white, text `color.alarm` (b/mobile CSS).

**Accessibility.** The word is always present, so no extra label is needed; the mark is `aria-hidden`. Where only a number is shown
next to the mark ("1" in a hangar summary), add visually hidden text ("1 overdue").

**Native.** A small `HStack` with a `Circle()` / `Circle().strokeBorder()` / dashed `StrokeStyle(dash: [3, 3])` and `Text`; Compose
`Row` with `Canvas(Modifier.size(12.dp))`. Identical everywhere (it is a mark, not a platform control).

**Accept.**
- [ ] Every status has a word; no green or amber anywhere.
- [ ] Due-soon text passes 4.5:1 on leaf, leaf-2 and alarm-bg.

### 5.3 TrustMark

**Purpose.** How much to trust a value: read by AI, confirmed by you, signed by a mechanic. Used on every entry, page, field and crop.

**Anatomy.** `display:inline-flex; align-items:center; gap:5px`, 600 13px, `color.ink-2`, nowrap. Mark 9 by 9:

| Level | Data | Mark | Words (12-copy-and-voice.md) |
|---|---|---|---|
| read by AI | `owner_confirmed = false` | circle, 2px dotted `color.ink-3` border, no fill | "Read by AI", "Read by AI, not yet confirmed", "Read from your photo" |
| confirmed by you | `owner_confirmed = true`, not signed | filled circle `color.ink` | "Confirmed", "Confirmed by you", "Confirmed by you, Apr 2, 2026" |
| signed by a mechanic | signed entry (`signed_entry_scan` or a mechanic certificate on the entry) | filled square rotated 45 degrees, radius 1px, `color.ink` | "Signed", "Signed by M. Torres", "Signed by D. Alvarez, IA", "Signed on paper" |

On the mat: text and mark use `color.on-cover` (d-m-stop). On a thumbnail caption: same size.

**Props.** `{ level: 'ai_read' | 'confirmed' | 'signed'; label?: string; onMat?: boolean }`.

**Accessibility.** Text carries the meaning; the mark is `aria-hidden`. Not interactive (the action to confirm lives in review).

**Native.** Same drawing; identical on all platforms.

### 5.4 PageCite

**Purpose.** Every number carries its source: a citation to the logbook page beside every derived value, in lists, answers, shares and
print. Figures: everywhere ("Airframe p. 58", "Engine p. 6 to 11", "p. 2").

**Anatomy.** Inline `<a>`, `display:inline-flex; align-items:baseline; gap:4px`, 600 13px/1.4, `board-ink`, underline dotted, offset 3px,
nowrap. Text: "<Book> p. <n>" or "p. <n>" when the book is clear from context; ranges "p. 6 to 11". On the mat and in crops: `color.on-cover`.
In print: a superscript footnote number (10px 700, `color.ink`) with the citation in the footnotes (PrintSheet §10.1).

**States.** Hover: solid underline. Focus: FocusRing (inline, 2px padding block). Visited: no change. Current (its page is on the mat):
700 weight and `aria-current="true"` (Decision). Page missing (cited entry has no scan, an owner note): text "your note" in `color.ink-3`,
not a link.

**Behaviour.** On a two-leaf screen: loads that page on the SourceMat and highlights the cited region; no navigation. Elsewhere (single
leaf, phone): opens the page view (W-BOOKS-05 page or M-BOOKS-07). Ctrl / Cmd click opens the page in a new tab. In a record room: opens
the room's page viewer, never the owner's app.

**Accessibility.** Name: "Airframe logbook, page 58" (expanded). Board-ink colours are 6.2 to 8.4:1 on leaf.

**Native.** SwiftUI `Button` with `.buttonStyle(.plain)` and an underline pattern `.underline(pattern: .dot)`; inside `Text` use a
`Text` with an `AttributedString` link and an `OpenURLAction` handler that routes to the page sheet. Compose: `LinkAnnotation.Clickable` in
an `AnnotatedString` with `TextDecoration.Underline` (dotted is not supported: draw a 1px dotted line with `drawBehind`, or accept solid,
Decision: solid underline on Android). Target size: extend the hit area to 44pt / 48dp vertically with padding when standalone.

**Accept.**
- [ ] Every derived value on every screen has a PageCite or a "your note" marker.
- [ ] On two-leaf screens a click never navigates away.

### 5.5 LineChip

**Purpose.** Tags a row or a citation with its logbook ink.

**Anatomy.** `display:inline-flex; align-items:center; gap:6px`, 600 13px/1.2, `color.ink-2`, nowrap. Swatch 16 by 5, radius 3,
`color.line.<book>` (other: `color.line.other`). Label: "Airframe", "Engine", "Propeller", "Avionics", "Other", or a book reference
("Airframe p. 60", "Stop 61 of 61").

**Accessibility.** The text names the book; the swatch is `aria-hidden`. Not interactive by itself.

**Native.** `HStack(spacing: 6) { Capsule().fill(ink).frame(width: 16, height: 5); Text(...) }` / Compose `Row` equivalent.

### 5.6 FirstBadge

**Purpose.** Marks which limit bites first when an item has both a calendar and an hours limit ("tach 4222.1 first").

**Anatomy.** 700 12px, `color.ink`, border 1px `color.ink`, radius 2px, padding 0 4px, margin-left 6px, `vertical-align:1px`. Text "first".

**Accessibility.** Visually hidden expansion "comes first". Native: a bordered `Text`.

### 5.7 Tag

**Purpose.** A small neutral label: kind of work ("100-hour inspection"), aircraft facts ("Demo aircraft", "Shared with you, editor"),
part keywords on Find ADs.

**Anatomy (web).** `display:inline-flex; align-items:center; gap:5px`, height 24px, padding 0 8px, border 1px `color.rule-2`, radius 3px,
600 13px `color.ink-2`, nowrap; optional leading icon (`[icon:users]`). Variant `strong`: border and text `color.ink` (the selected model on
Find ADs). Variant `hue`: border and text `board-ink`. Phone: 700 13px, padding 1px 7px, no fixed height. On a board: `on-board` text,
border `on-board-2`.

**States.** Not interactive. Where tags are removable (Find ADs keywords), use FilterChip instead.

### 5.8 DueTable and DueRow

**Purpose.** The one due list: every tracked item with both limits, which bites first, what is left, its state, and its page. Figures:
d-web-status (compact, inside HungSections), b-w-due (full list), d-w-new, d-w-annual, d-w-annualprep, d-m-status (phone rows).

**Anatomy, compact (Status home).** `<table>` width 100%, collapsed borders. Cells: padding 11px 12px 11px 0, border-bottom 1px `color.rule`,
top-aligned; last cell padding-right 0.

| Column | Width | Content |
|---|---|---|
| Item | auto | Name 700 16px; below, 400 14px `color.ink-3`: LineChip · rule reference ("91.413, 91.411") · scope ("IFR only") · PageCite |
| Date | 100px, nowrap | Calendar date ("Dec 31") or hours limit ("tach 4222.1") with "about Dec 12" below in 14px `color.ink-3` |
| Left | 86px, nowrap, right, 700 | "43 days", "9.7 h", "lapsed 7 days ago" |
| State | 104px, right | StatusMark |

**Anatomy, full (Maintenance › Tracked items).** Header row: 700 13px `color.ink-3`, padding 0 12px 8px 0, border-bottom 1px `color.rule-2`,
nowrap. Columns: Item (40%), Calendar limit (`lim`, 150px, nowrap, second line 14px `color.ink-3`), Hours limit (`lim` with FirstBadge on the
one that bites first and "about <date>" below), Left (right), State (StatusMark), Action (secondary Button size s "Mark done"). Group rows:
`<tr>` with one cell spanning all columns, padding 22px 0 7px (4px top on the first), border-bottom 2px `color.ink`, 700; count after it
400 14px `color.ink-3` with 8px margin ("1 item"). Groups: Overdue, Next 60 days, Within a year, Further out, No record. Above
the table: FilterChips (§7.10) with counts. Under it: a meta line "Counted from entries you confirmed. Pages waiting for review do not move
any date. Hours become dates at your recent flying, about 3 hours a week."

**Row states.**

| State | Visual |
|---|---|
| Default | As above. |
| Hover | Row cells `color.leaf-2`. |
| Focus | The row's item name is a link; FocusRing on it. |
| Selected | Cells `color.leaf-2` with `box-shadow: inset 0 2px 0 board, inset 0 -2px 0 board`; first cell padding-left 12px. `aria-selected="true"` on the row in a grid, else `aria-current="true"` on the link. The SourceMat shows the item's last page; the LineAhead ring is selected. |
| Mark done open (inline) | The row is replaced by a full-width selected row containing the item's done form (b-w-due: four Fields for the VOR check and a primary "Mark done"), plus a meta line naming what to write in the paper logbook. Escape cancels. |
| Saving | The Mark done Button shows its loading state; other rows stay interactive. |
| Saved | The row moves to its new group; Toast "Marked done. Next due Dec 18." with Undo (§8.1). |
| No date (unknown) | Date cell is a quiet link "Add date"; StatusMark unknown. |
| Unconfirmed source | Never shown as due; if the last completion is only on a page waiting for review, the detail line says "A newer entry is waiting for review" with a link to it (Decision). |
| Viewer role | Action column hidden; "Add date" is plain text "No date". |
| Loading | Five Skeleton rows (name bar 50%, small bar 30%, right bars). |
| Empty | EmptyState inside the leaf: "Nothing tracked yet." with "Track an item" (editor) or the reason (viewer). |
| Error | One AlarmSlip soft above the table, rows omitted. |

**Phone DueRow.** PhoneRow (§9.7): title 700 16px; detail 14px `color.ink-3` with LineChip · date · scope; right column value 700 15px
("9.7 h", "43 days") with the state word below in 13px. Decision: put the compact StatusMark (10px mark) before the state word so phone rows
carry the mark too; the overdue row shows the StatusMark slip in place of the value (d-m-status). Tap opens Item detail (M-STATUS-05).

**Keyboard (web).** Rows are reached by Tab on their item links. Up / Down move between rows while focus is in the table (Decision:
grid-like convenience, implemented as roving focus on the item links). Enter opens the item (W-STATUS-04) or selects it on screens with a
mat. `m` opens "Mark done" for the focused row (editor; Decision).

**Accessibility.** A real `<table>` with `<th scope="col">` headers (compact tables have visually hidden headers: Item, Due, Left, State).
Group rows use `<th scope="rowgroup" colspan>`. Numbers right-aligned with tabular figures.

**Native.** Phone: `List` / `LazyColumn` of PhoneRows grouped by PhoneGroupHeader; no swipe actions on due rows (Decision: marking done
happens on Item detail to avoid accidental marks). Tablet: SwiftUI `Table` is not used (its chrome is too system-like); build rows as a
`Grid` with `GridRow`s; Compose `LazyColumn` with fixed-width `Row` cells.

**Accept.**
- [ ] Every row shows both limits when the item has both, the first one marked, and hours converted to "about <date>".
- [ ] Every row has a PageCite (or "your note").
- [ ] Selecting a row selects its ring and loads its page, and the other way round.

### 5.9 EntryRow

**Purpose.** A logbook entry in a list: date, transcribed text in the paper voice, meter reading. Figures: d-w-ask, d-w-entry, b-w-timeline,
W-BOOKS-12 list view.

**Anatomy.** `display:grid; grid-template-columns:112px 1fr 92px; gap:2px 18px`, padding 13px 0, border-bottom 1px `color.rule`,
`align-items:baseline`. When: 700 16px, second line 400 14px `color.ink-3` (book and page, "Engine p. 19"). Text: type.paper 16px/1.5; search
matches in `<b>`. Right: tach 700, right-aligned. Meta row (optional, spans columns 2 to 3): 14px `color.ink-3`, flex, gap 14px: TrustMark,
LineChip, attachments, linked items.

**States.** Hover leaf-2. Selected: fill `color.leaf-2`, `box-shadow: inset 4px 0 0 board`, padding 13px 10px 13px 14px with negative
margins 0 -10px 0 -14px so text does not move. Focus: FocusRing on the row link. Unconfirmed: TrustMark "Read by AI" in the meta row.

**Accessibility.** The row is one link to the entry; name "Sep 14, 2005, Engine page 19: Engine removed and sent to Signal Engines...
tach 2803.0".

**Native.** PhoneRow with the paper text in `font.paper`; date and meter as row title and right value.

### 5.10 Row

**Purpose.** The generic two-column list row on a leaf: title and detail at left, value or action at right. Figures: d-w-plan lapsed list,
b-w-due "Do these together", d-w-new actions, d-w-firstread.

**Anatomy.** `display:grid; grid-template-columns:1fr auto; gap:14px`, padding 12px 0, border-bottom 1px `color.rule`, `align-items:baseline`.
Title 700 16px; detail block 14px `color.ink-3`. Right: StatusMark, a value, a link, or a secondary Button size s. A list of Rows may open
with a 2px `color.ink` top border (d-w-plan) when it follows a Verdict.

**States.** Interactive only when the whole row is a link (hover leaf-2, FocusRing). Otherwise static.

### 5.11 KeyValueList

**Purpose.** Facts as label and value pairs (aircraft details, meters, link expiry).

**Anatomy.** `<dl>`, `display:grid; grid-template-columns:148px 1fr; gap:6px 22px; margin:0`. `<dt>` 15px `color.ink-3`; `<dd>` 600, margin 0,
may contain a muted source after the value (400, `color.ink-3`: "FAA registry", "you, today"). Label column widths used: 148 (default), 110,
96, 86 (phone).

**Accessibility.** Native `<dl>`; on phone `accessibilityElement(children: .combine)` per pair.

### 5.12 Reading

**Purpose.** A large figure with its unit: tach, hours since overhaul, oil burn (b-w-hours, b-w-oil, d-w-engine).

**Anatomy.** 800 26px/1.1, letter-spacing -0.01em, tabular; unit 600 15px `color.ink-3`, margin-left 4px, letter-spacing 0. Optional note
below: 14px `color.ink-3`, margin 6px 0 0 (`b-note`). Never in a tile or card (craft rule: no hero-metric tiles); it sits in a HungSection
or a grid of plain columns.

### 5.13 Well

**Purpose.** A quiet inset inside a leaf for a consequence or a side note ("Next due at tach 4262.4...", "This page fills 1984 in the
airframe gap", reading allowance on phone).

**Anatomy.** Fill `color.leaf-2`, padding 14px 16px, radius.s. May hold a mini map (150 by 26) in a grid `auto 1fr` with gap 4px 14px.
Variant `quote` (`b-quote`): padding 14px 18px, margin 0, holds type.paper text. Text inside uses `color.ink`; `color.ink-3` is 5.02:1 on it.

### 5.14 AlarmSlip

**Purpose.** The one loud strip: errors and states that need action now. Also the soft variant for cautions ("May be stale").

**Anatomy.** `display:flex; gap:10px; align-items:center`, padding 10px 14px, radius 2px, 600 16px. Strong: fill `color.alarm`, text white
(4.59:1). Soft: fill `color.alarm-bg`, text #7a1707 (9.19:1; proposed token `color.on-alarm-bg` or reuse; see §13). Leading icon
`[icon:circle-alert]`. Optional trailing quiet Button in the same text colour ("Try again", "Show the list instead").

**Behaviour.** Static slips for persistent states (offline web, lapsed item in context). Slips raised by a failed action use `role="alert"`
once; static ones have no role. Never auto-dismissed. Never used for success (Toast).

**Native.** A `HStack` with the same fills; for transient errors on phone prefer an inline slip near the control over an alert dialog.

### 5.15 CoverageBar

**Purpose.** How much of each book is in, by year, with gaps hatched (d-w-new, d-w-firstread, b-w-firstread, b-m-books).

**Anatomy.** Grid `96px 1fr 70px` (also 84px 1fr 56 to 64px), gap 6px 14px, 14px text, `align-items:center`. Per book: name; the bar 12px high,
fill `color.leaf-2`, radius 1px, position relative; filled spans absolute `color.ink`, radius 1px, placed by date (left and width in %); gap
spans hatched `repeating-linear-gradient(135deg, color.alarm 0 2px, transparent 2px 5px)`; right count `color.ink-3` ("198", "none").
Phone: single column, bar 8px high under the row's detail line.

**Props.** `{ books: { type: BookType; name: string; count: number; spans: { from: string; to: string; kind: 'in' | 'gap' }[] }[]; range: { from; to } }`.

**Accessibility.** Each bar has `role="img"` and a label "Airframe: pages from 1978 to 1983 and 1991 to 2026; no pages 1983 to 1991; 198
pages". Native: `Canvas`/`GeometryReader` bars with the same label.

### 5.16 ProgressBar

**Purpose.** Upload progress, reading progress, the daily AI reading allowance (d-w-queue, d-m-queue, b-w-settings).

**Anatomy.** Web: 10px high, fill `color.leaf-2`, radius 1px, `box-shadow: inset 0 0 0 1px color.rule`, overflow hidden; value bar `color.ink`
from the left. Phone: 8px, no inset rule. Label row above: flex between, 15px; left "**31 of 50 pages** used", right `color.ink-3` "shared
allowance". Note below 14px `color.ink-3`.

**States.** Determinate only (no indeterminate stripes, Decision; while a page is being read show the QueueRow "reading now" text instead).
At 100% of the allowance the value bar stays ink; the note says what happens next ("Past 50, pages wait their turn tomorrow, or add your
own key").

**Accessibility.** `role="progressbar"` with `aria-valuenow`, `aria-valuemax`, `aria-valuetext` "31 of 50 pages used today". Native:
`ProgressView(value:total:)` with `.progressViewStyle(.linear)` tinted ink / `LinearProgressIndicator(progress, color = ink, trackColor = leaf2)`
with square ends (`strokeCap = StrokeCap.Butt`).

---

## 6. Pages and scans

### 6.1 ScanViewer

**Purpose.** Shows a scanned logbook page with an ink highlight on the region in question; zoom, rotate and crop. The page is evidence,
so it is never cropped by layout without the owner seeing that it is cropped.

**Anatomy.**

| Part | Spec |
|---|---|
| Frame | `flex:1; min-height:0; overflow:hidden; display:grid; place-items:start center` (`b-scanwrap`) inside the SourceMat. The image keeps its aspect ratio (logbook pages are about 0.72); fit width by default, top aligned. Radius 2px on the image. |
| Highlight, selected | Absolute rect over the image in image coordinates, radius 3px, fill `rgba(255,214,10,.42)`, outline 2px #c99700, `mix-blend-mode:multiply` (marks the selected field or entry like a highlighter on paper; literal values, proposed tokens `color.highlight` and `color.highlight-edge`). |
| Highlight, quiet | Outline 2px dashed #c99700, no fill: the whole entry region around a selected field. |
| Highlight, doubt | Fill `rgba(221,52,24,.16)`, outline 2px `color.alarm`: a doubtful field (d-m-review). |
| Page number | The scan's own printed number is part of the image; no overlay. |
| Controls | In the MatHead (Zoom, Rotate, Crop and read again). |

Highlight rectangles come from the extraction's bounding boxes, normalised 0 to 1 of the page image (09-data-and-api.md). If a field has
no box, only the entry's quiet box is drawn; if the entry has none, no highlight and the quote line says "Position on the page not known".

**Zoom and pan (web).** "Zoom" toggles fit-width and 2x centred on the highlight. Ctrl + wheel or pinch: continuous 1x to 4x around the
pointer. Drag to pan when zoomed (cursor `grab` / `grabbing`). Keys when the viewer has focus: `+` / `-` zoom by 0.5x, `0` fit, arrow keys
pan 40px (Shift: 160px). Double-click: toggle fit and 2x at the point.

**Rotate.** 90 degree steps clockwise; saved on the page (`page.rotation`, 09-data-and-api.md) so every viewer sees the same; editor only.

**Crop and read again.** Enters crop mode: the image dims to 50% outside a rectangle with four corner handles (16px squares, leaf fill, ink
border 2px) and edge drag; Enter or "Read this part again" (primary on-mat) sends the region for a new AI reading; Escape cancels. Needs a
connection and allowance; otherwise the button is disabled with the reason ("Reading again needs a connection" / "Today's 50 pages are
used").

**States.**

| State | Visual |
|---|---|
| Loading | Skeleton block at 0.72 aspect in `color.cover-2`; MatHead shows the title. Progressive: show the low-resolution thumbnail first, swap in the full image. |
| Loaded | Image with highlights; the highlight scrolls into view (centred vertically when possible). |
| Selection changed | Highlight moves; smooth scroll to it (instant under reduced motion). |
| Zoomed | Zoom button label "Fit page" (`[icon:zoom-out]`). |
| Crop mode | As above; other MatHead buttons hidden; "Cancel" on-mat button. |
| Reading again | Busy overlay on the cropped region: 50% `color.cover` with "Reading this part" 15px `color.on-cover`; the rest stays visible. |
| Error | "This page did not load." with on-mat "Try again". |
| Offline, not cached (native) | "This page downloads when you are online." |

**Accessibility.** The image `alt` = "Airframe logbook, page 58, scanned page". The highlight is described by the quote line under the
viewer (type.paper-small, the transcription of the highlighted ink), which is the accessible equivalent. Zoom and pan keys are announced
by the viewer's `aria-describedby` hint "Use plus and minus to zoom, arrows to move". The viewer is focusable (`tabindex="0"`,
`role="img"` wrapping) only when zoom is possible.

**SwiftUI.** Wrap a `UIScrollView` (`UIViewRepresentable`) for reliable zoom (1 to 4), double-tap zoom and pan, with an image view and a
highlight overlay layer in image coordinates; `zoomToRect` on selection change. **Compose.** A `Box` with `Modifier.pointerInput {
detectTransformGestures }` and `graphicsLayer { scaleX; scaleY; translationX; translationY }`, highlights drawn in `drawWithContent` in
image coordinates; `animateTo` the highlight on selection. Keep: highlight colours, multiply blend (iOS `blendMode(.multiply)`, Compose
`BlendMode.Multiply`). Adapt: pinch is primary; the Zoom button stays for one-handed use.

**Accept.**
- [ ] Highlights align with the ink within 4px at every zoom level.
- [ ] Selecting a field scrolls its highlight into view.
- [ ] Rotate and crop are hidden for viewers and disabled offline with the reason.

### 6.2 PageCrop

**Purpose.** A crop of a page next to an answer or a card: the cited words, small, with their source (d-w-ask, d-m-visit cards).

**Anatomy.** Fill #2a2c31, radius.s, padding 8px, `display:grid; gap:6px`, `color.on-cover`. Crop image 84px high (phone cards 96px),
full width, with its highlight. Label: 13px/1.45 `color.on-cover-2` block with the title line "Engine p. 19 · Sep 14, 2005" in 15px
`color.on-cover`, then the quote in type.paper-small 15px `color.on-cover`. Selected (the crop whose page is on the mat):
`box-shadow: inset 0 0 0 2px color.section.books` (Decision: use `board` of the current section, which is books on these screens).

**Behaviour.** The whole crop is a button: loads the page on the mat. Name "Engine page 19, Sep 14, 2005: Overhauled to new limits".

### 6.3 PageThumb

**Purpose.** A page in the Pages library grid with its state (b-w-pages), and small thumbnails in queues and lists.

**Anatomy.** Grid: `repeat(8, minmax(0,1fr))`, gap 18px 14px. Thumb: `display:grid; gap:6px`, 13px/1.3. Image at 0.72 aspect, radius 2px.
Caption: "**p. 9**" then a TrustMark ("Confirmed", "Read by AI", "Signed") or a compact StatusMark soon "Needs a look". Selection Checkbox
absolute at top 6px, left 6px, leaf fill (ink when checked), shown on hover, on focus and whenever any thumb is selected. Small thumbs:
30px wide (queue rows), 34px (review list), 42px (phone queue).

**States.** Hover: Checkbox appears; image `outline: 1px solid color.rule-2`. Selected: Checkbox checked and `outline: 3px solid color.ink;
outline-offset: 2px`. Focus: FocusRing on the thumb link. Dragging (Reorder mode): thumb lifts with a 2px ink outline, others shift; drop
target shows a 3px ink insertion bar. Loading: Skeleton 0.72 block. Failed read: StatusMark unknown "Not read" with a retry in the
SelectionBar.

**Keyboard.** Arrow keys move focus in the grid (roving), Space toggles selection, Shift + arrows extends, Enter opens the page in the review
desk or page view. Reorder mode: Space picks up, arrows move, Space drops, Escape cancels; announce "Page 14, moved to position 12".

**Accessibility.** `role="grid"` with `aria-multiselectable="true"`; each cell `aria-selected`; name "Page 16, needs a look".

**Native.** `LazyVGrid` / `LazyVerticalGrid`; selection via edit mode (iOS `EditButton` pattern; Android long-press to start selection, as
platform convention). Reorder: iOS drag and drop (`onMove` in a list view of pages), Android `reorderable` drag handles.

### 6.4 SelectionBar

**Purpose.** Actions on several selected pages (b-w-pages).

**Anatomy.** Fill `color.ink`, text white, radius 3px, padding 8px 10px 8px 14px, margin 14px 0 18px, 15px, `display:flex; align-items:center;
gap:12px`. "**3 pages selected**", then 80% opacity detail ("pp. 30 to 32, 7 entries"), then at the right on-mat Buttons size s (on ink):
"Move to another book" `[icon:folder]`, "Read again" `[icon:refresh-cw]`, "Delete" (alarm treatment on ink: text #ff8a73, Decision, 7.81:1 on
ink), "Clear" quiet.

**Behaviour.** Appears when one or more items are selected; sticky to the top of the leaf scroll area. Delete opens a ConfirmDialog naming
what goes with the pages ("7 entries on these pages will be deleted too"). Escape clears the selection.

**Accessibility.** `role="toolbar"`, `aria-label="Selected pages"`; selection count announced politely.

**Native.** iOS: bottom toolbar in edit mode (`.toolbar { ToolbarItemGroup(placement: .bottomBar) }`); Android: contextual top app bar
(selection mode). Keep the wording.

### 6.5 DropZone

**Purpose.** Drop PDFs or photos to add pages (d-w-queue, b-w-addpages).

**Anatomy.** Border 2px dashed `color.rule-2`, radius.m, fill `color.leaf-2`, padding 30px 24px (18px 20px when compact), `display:grid;
justify-items:center; gap:6px; text-align:center`. Line 1: `[icon:upload]` + "Drop PDFs or photos here", 700 17px. Line 2: `color.ink-3`
"or choose files. Long PDFs are split into pages, in order." with "choose files" as a link that opens the file picker.

**States.** Drag over the window: zone border becomes 2px solid `color.ink`, fill #ececed. Drag over the zone: same plus text "Drop to add
to Airframe, found book". Uploading: the zone stays; progress shows in the queue. Wrong file type: AlarmSlip soft inside the zone "Only PDF,
JPG, PNG and HEIC files can be added. 1 file was skipped." Disabled (viewer): not rendered.

**Accessibility.** The visible link is the keyboard path (a real `<input type="file" multiple accept=".pdf,image/*">` behind a button).
Drop is a pointer enhancement only.

**Native.** Not used; phone uses the camera (CameraBar) and the system document picker / Photos picker (`PhotosPicker`,
`ActivityResultContracts.PickMultipleVisualMedia`).

### 6.6 QueueRow

**Purpose.** One step of the capture pipeline: waiting to upload, uploading, being read, waiting for you, done (d-w-queue, d-m-queue,
M-SCAN-03, M-SYS-01).

**Anatomy (web).** Inside a HungSection per stage ("Uploaded", "Being read", "Waiting for you", "Reading today"). Row: `display:grid;
grid-template-columns:30px 1fr auto; gap:12px; align-items:center`: PageThumb 30px, label 16px ("Page 6 of 14", "Pages 7 to 14"), right meta
14px `color.ink-3` ("reading now", "next, about 4 minutes"). File rows: name and "split into 14 pages" above a ProgressBar.

**Anatomy (phone).** `display:grid; grid-template-columns:auto 1fr; gap:12px; align-items:center`, padding 10px 0, border-bottom 1px
`color.rule`: stacked thumbs (42px each, gap 6px, pending ones at 50% opacity) and a text block: title 700 ("Uploading 1 of 2", "2 of 4
read"), an 8px ProgressBar (uploading only), detail 14px `color.ink-3` ("Airframe vol. 1, p. 18 and 19", "p. 14 to 17 · a minute or two").

**States (`page.extraction_status` plus device state).**

| Stage | Title example | Right / detail | Action |
|---|---|---|---|
| On this phone, waiting (offline) | "2 pages on this phone" | "Upload when you have signal" with `[icon:cloud-upload]` | none |
| Uploading | "Uploading 1 of 2" | ProgressBar | Cancel (quiet) |
| Queued for reading (`pending`) | "Pages 7 to 14" | "next, about 4 minutes" | none |
| Waiting for allowance | "9 pages wait for tomorrow" | "Today's 50 pages are used" | "Add your own key" (link) |
| Being read (`processing`) | "Page 6 of 14" | "reading now" | none |
| Read, waiting for you (`extracted`, not confirmed) | "6 pages" | "4 read cleanly, 2 have a doubtful date or tach" | primary "Review 6 pages" |
| Failed (`failed`) | "Page 9 could not be read" | AlarmSlip soft reason | "Read again", "Remove" |
| Done | "Uploaded 9:52" with `[icon:circle-check]` | none | none |

The queue keeps working when the user leaves the screen; the leaf says "Carries on if you leave this page". Live updates arrive by
subscription; each stage change is announced politely only for stage totals ("6 pages are read. 2 need a look.").

**Accessibility.** Each stage is a list with a heading (the HungSection h3 with its count). Progress uses ProgressBar semantics.

**Native.** `List` sections; background upload with `URLSession` background configuration (iOS) and `WorkManager` (Android); the row
reflects persisted job state so it survives app restarts.

### 6.7 ReviewField

**Purpose.** One extracted field on the review desk: label, value, how sure the reader was; the least certain field opens first with its
ink lit on the page and three outcomes (W-BOOKS-07 d-w-review, b-w-review, M-REVIEW-01 and 02 d-m-review, b-m-review-doubt, T-REVIEW-01).

**Anatomy (web, `b-frow`).** `display:grid; grid-template-columns:112px 1fr auto; gap:4px 16px`, padding 12px 0, border-bottom 1px `color.rule`,
`align-items:center`. Label 700 14px `color.ink-2`. Value 16px (transcribed narrative in type.paper 16px/1.5; other values in font.app).
Right: "Clear" with `[icon:check]`, 600 14px `color.ink-2` (field confidence high), or StatusMark soon "Unsure".

**Selected (the field being decided).** Fill `color.leaf-2`, `box-shadow: inset 4px 0 0 color.ink`, margin 0 -16px, padding 16px,
`align-items:start`; the label gets padding-top 10px. Content, stacked with gap 8px:
1. Row: PaperInput or TextInput in doubt style (width 130px, 700 18px; dashed `color.alarm` border), an alternative ChoiceChip 32px high
   ("or 1198.2", click to use it), StatusMark soon "Unsure" 13px.
2. Reason, 15px/1.45: what the reader doubted and what the neighbours show, with PageCites ("The third digit is smudged. 1178.2 is 99.8 hours
   after the last 100-hour inspection at 1078.4 on p. 2; 1198.2 would be 119.8, over the limit.").
3. Outcomes, Buttons size s with KeyHints: primary "Confirm 1178.2" `[icon:check]` (A), secondary "Edit" `[icon:pencil]` (E), secondary "Not on
   this page" (X).

**Desk around the fields (component-level).** Above: an entry switcher Segmented of the page's entries (dates), meta "Entry 2 of 3 on this page",
the entry heading 800 22px with its TrustMark, and "Least certain first. 1 field to check, 4 read clearly." Below the fields: Checkbox
"Carries on to page 4", quiet link "Add an entry the AI missed" `[icon:plus]`. Footer pinned to the leaf bottom, border-top 2px ink, padding-top
12px: primary "Confirm page and next" with KeyHint "Shift Enter", meta "Entries 1 and 3 are accepted", and a KeyHint legend row (13px
`color.ink-3`: "J K next or previous field", "A accept", "E edit", "X not on this page").

**States.**

| State | Visual / behaviour |
|---|---|
| Clear (high confidence) | "Clear" with check; counts as accepted unless edited. |
| Doubtful | StatusMark soon "Unsure"; selected first; input dashed alarm border; highlight on the ScanViewer in the selected style (web) or doubt style (phone). |
| Editing | Input switches to focus style (ink border, 3px halo); Enter saves and moves to the next doubtful field; Escape reverts. |
| Accepted | Right shows "Accepted" with check (Decision) and the field collapses to the plain row. |
| Not on this page | Value struck through in `color.ink-3`, right shows "Not on this page"; the field is empty in the confirmed entry. Undo available on the row (quiet "Undo"). |
| Saving | Outcome buttons disabled while the outcome saves (optimistic: the row updates at once; on failure it reverts with an AlarmSlip soft on the row). |
| All decided | "Confirm page and next" becomes the only primary; KeyHint visible. |
| Offline (native) | Outcomes save locally and queue; the footer shows PendingMark "Saved on this phone". |
| Viewer role | Review is not available to viewers (the sub-tab is hidden). |

**Keyboard (web).** J / K: next / previous field (moves the highlight). A: accept the selected field's value. E: edit (focus the input,
caret at end). X: not on this page. Shift + Enter: confirm page and next. Enter inside the input: save the edit. Keys act only when focus is
in the desk and not inside a text input (except Enter and Escape). Every outcome is also a button.

**Phone (`bm-fld` in a drawer over the page).** Field row `display:grid; grid-template-columns:84px 1fr auto; gap:10px; align-items:center`,
padding 7px 0, min-height 48px, border-bottom 1px `color.rule`; label 600 14px `color.ink-3`; value type.paper; right `[icon:check]` or the doubt
note. Doubt row: fill `color.alarm-bg`, full-bleed (margin 0 -18px, padding 7px 18px), bottom border `color.alarm`, value underlined dashed
`color.alarm` with 5px offset, right note 700 13px with `[icon:circle-help]` ("6 or 8?") in `color.alarm-text` (#c42e15, Decision; the mockup
uses `color.alarm`, 3.92:1 on alarm-bg). Tapping the doubt row zooms the page to the ink (scale 2.3, b-m-review-doubt) and opens the decision
drawer: label row ("Tach" + "Read with doubt"), a PaperInput 28px 500, the reason 15px/1.45, then outcomes: primary "Looks right"
full width (52px), secondary "Edit" and "Not on this page" side by side, and the hint "Swipe right: looks right · Swipe left: edit"
14px `color.ink-3` centred. Swipe right on the drawer = accept, swipe left = edit (with a 30% threshold and haptic at the threshold).

**Accessibility.** Each field is a group labelled by its label; doubtful fields announce "Tach, 1178.2, unsure. Could be 1198.2." The
outcome buttons are always reachable; swipes have button equivalents. Moving to the next field moves focus to its first control and
announces it.

**Native.** SwiftUI: a `Form`-less custom `VStack` in a `.sheet` with detents for the drawer; swipe via `DragGesture` with
`.accessibilityAction(named: "Looks right")` and `"Edit"`. Compose: `BottomSheetScaffold` with the page behind, `SwipeToDismissBox`-style
gesture built with `anchoredDraggable`, and `customActions` for accessibility.

**Accept.**
- [ ] The least certain field is selected when a page opens.
- [ ] Every keyboard outcome has a button and every swipe has a button.
- [ ] Nothing on the page affects due status until "Confirm page" completes.

### 6.8 QRCode

**Purpose.** Phone hand-off for scanning (web) and showing a record room link in person (phone).

**Anatomy.** White square, padding 8px (web 148px; compact 96px with 6px padding), border 1px `color.rule-2`, radius 3px; modules in
`color.ink` with `shape-rendering: crispEdges`. Phone: 168 to 196px, padding 9 to 10px, border `color.rule`. Beside it on the web: heading
700 17px ("Or scan with your phone") and a 15px paragraph.

**Accessibility.** `role="img"`, label "Code to open the camera on your phone" or "Code for the record room link"; the link text is always
also shown as text (copyable) next to it. Native: generate with CoreImage `CIQRCodeGenerator` / ZXing; keep quiet zone of 4 modules.

---

## 7. Controls

Controls are standard and read as controls (craft rule). Control boundaries (Decision): the mockups draw input, select, checkbox,
radio and toggle-off edges in `color.rule-2` (#b8bab4, 1.96:1 on leaf), which fails WCAG 1.4.11 for component boundaries. This file
sets them to #7d828a (3.87:1 on leaf, about 3.5:1 on leaf-2; proposed token `color.control-border`). Separators, tags, chips and ghost
button borders keep `color.rule-2` (those controls are identified by their text). See §13.

### 7.1 Button

**Purpose.** Every command. One primary per view (craft rule). Labels say what happens ("Confirm page and next", "Mark done", "Book this
visit").

**Anatomy.** `display:inline-flex; align-items:center; justify-content:center; gap:8px`, radius.m, border 1px, 700 15px/1, nowrap, optional
leading icon (1.2em) and trailing KeyHint (§7.12, rendered inside with transparent fill, `currentColor` border, 70% opacity, margin-left 2px).

**Sizes.**

| Size | Height | Padding | Text | Where |
|---|---|---|---|---|
| s | 34px | 0 12px | 14px | Board actions, rows, mat heads, outcomes |
| m | 42px | 0 18px | 15px | Default |
| l | 52px (phone), 48px (web, full width in EmptyState) | 0 20px | 17px (phone), 15px (web) | Phone primary actions in ActionFooter and sheets; web EmptyState call to action |
| icon | 34 by 34 (s) or 42 by 42 (m) | 0 | n/a | Pager arrows, Rotate, Close; requires an accessible name |

**Variants.**

| Variant | Fill | Border | Text | Hover / Pressed | Use |
|---|---|---|---|---|---|
| primary | `color.ink` | `color.ink` | `color.leaf` | #282a2d / #36373b | The one main action on a leaf |
| secondary (`ghost`) | `color.leaf` | `color.rule-2` | `color.ink`, 600 | #ececed / #dedfdf | Other actions; "Mark done" in rows |
| hue | `board` | `board` | `on-board` | hue table §2.3 | Primary action that belongs to the section on phone ("Make the link" in Share) |
| on-board | `color.leaf` | `color.leaf` | `color.ink` | #ececed / #dedfdf | Actions in the BoardHead ("Log a flight", "Add an aircraft") |
| on-mat | transparent | #5a5e68 | `color.on-cover`, 600 | #3a3c40 / #46484b | Actions on the SourceMat and on ink bars |
| alarm | `color.leaf` | `color.alarm` | `color.alarm` (4.59:1) | #fcefed / #fae3df | Destructive actions after confirmation ("Delete N734DM", "Revoke link") |
| quiet | transparent | none | `color.ink` 600 15px, underline on hover (offset 3px); `board-ink` when it is a navigation-like action | underline / 8% ink layer | Low-weight actions: "Decide later", "Not this time", "Change", "Add an entry the AI missed" |

Board variant on books (yellow) board: the on-board variant keeps leaf fill and ink text (10:1 contrast to the hue edge is not needed;
the button has text). Phone buttons (`bm-btn`): size l, `display:flex` full width of their cell, 700 17px, gap 9px; ghost has a 1px
`color.rule-2` border.

**States.** Hover, pressed, focus-visible, disabled and loading per §2.3 and §2.4. Selected: not applicable (use Segmented or ChoiceChip).
Destructive confirmation: an alarm Button opens a ConfirmDialog (§12) unless the action is undoable by Toast.

**Behaviour.** `<button>` for actions, `<a>` styled as a button for navigation. Enter and Space activate buttons; Enter activates links.
Double activation is ignored while loading.

**Accessibility.** Visible label is the name; icon-only buttons have `aria-label` ("Previous page", "Rotate", "Close"). KeyHints inside are
`aria-hidden` and the shortcut goes into `aria-keyshortcuts`. Minimum size s (34px) meets the 24px target.

**SwiftUI.** `Button` with custom `ButtonStyle`s (`PrimaryButtonStyle`, `SecondaryButtonStyle`, ...) reading `configuration.isPressed`
for the 14% layer; `.disabled()` drives 40% opacity; `.controlSize` maps s, m, l. Keep: square 4pt corners, ink fill, weights. Adapt: no
hover on iPhone; iPad pointer uses `.hoverEffect(.highlight)`. **Compose.** `Button`/`OutlinedButton`/`TextButton` with
`shape = RoundedCornerShape(4.dp)`, `colors = ButtonDefaults.buttonColors(containerColor = ink, contentColor = leaf)`, `contentPadding`
matching sizes, `interactionSource` driving the state layer, `indication = null` plus the custom layer (no ripple, Decision).

**Accept.**
- [ ] One primary Button per view.
- [ ] All seven variants and three sizes render the specified colours; disabled and loading behave per §2.3.
- [ ] Icon-only buttons have names.

### 7.2 Field

**Purpose.** Label plus control plus help or error, used for every form input.

**Anatomy.** `display:grid; gap:5px`. Label: 700 13px `color.ink-2`, `display:flex; justify-content:space-between; gap:8px` so a right-side
link fits ("Email" ... "Change"). Control below. Help text below the control: 14px `color.ink-3` (`b-meta`). Error text: 600 14px
`color.alarm-text` (#c42e15) with `[icon:circle-alert]` 14px, replacing the help text. Phone label (`bm-lab`): `display:flex;
justify-content:space-between; align-items:baseline; gap:8px`, 700 14px `color.ink-2`, margin 0 0 6px, right part 500 `color.ink-3`
("was 4212.4 on Nov 14").

**States.** Default, focused (control's focus style), error (control border `color.alarm` solid, error text; `aria-invalid="true"`,
`aria-describedby` the error), disabled (control at 40%), read-only (control shows value as text with no border, Decision), required
(label suffix none; required is the default; optional fields say "(optional)" in `color.ink-3`).

**Accessibility.** `<label for>`; help and error linked by `aria-describedby`. Errors appear on blur or submit, not while typing.

**Native.** SwiftUI `VStack(alignment: .leading, spacing: 5)` with `Text` label above a `TextField` (do not use `Form` rows on the
binder's leaves, which add system insets; settings screens may use grouped `Form`, see 06-mobile-screens.md). Compose: label `Text` above an
`OutlinedTextField` without its floating label (Decision: labels sit above, as on the web).

### 7.3 TextInput

**Anatomy.** min-height 44px, padding 9px 12px, border 1px `color.control-border`, radius.m, fill `color.leaf`, 400 16px/1.5 `color.ink`,
`display:flex; align-items:center`. Trailing icon slot (`[icon:calendar]`, `[icon:chevron-down]`) right-aligned with `justify-content:
space-between`. Placeholder `color.ink-3`.

**States.**

| State | Visual |
|---|---|
| Default | As above. |
| Hover | Border `color.ink-2`. |
| Focus | Border `color.ink`, `box-shadow: 0 0 0 3px rgba(0,0,0,.12)` (from the CSS). |
| Doubt (AI unsure) | Border `color.alarm`, `border-style:dashed`. Used only in review. |
| Error | Border `color.alarm` solid; Field shows the error. |
| Disabled | 40% opacity; fill `color.leaf-2`. |
| Read-only | No border, value as text. |
| Large (Ask) | See SearchField. |
| Numeric | `inputmode="decimal"`, tabular figures, right-aligned when in a table. |

**Native.** SwiftUI `TextField` with `.textFieldStyle(BinderFieldStyle())` (rounded rect 4pt, 1pt stroke, focus via `@FocusState`
switching the stroke to ink and adding a 3pt 12% halo); keyboard types `.decimalPad` for meters. Compose `OutlinedTextField` with
`shape = RoundedCornerShape(4.dp)`, `focusedBorderColor = ink`, `unfocusedBorderColor = controlEdge`, `minHeight 44.dp` (48dp target is met
by the row). Keep: square corners, ink focus. Adapt: system keyboards, autofill types (`.textContentType(.emailAddress)`,
`KeyboardOptions(keyboardType = KeyboardType.Decimal)`).

### 7.4 SearchField

**Purpose.** The one field for search and the cited Ask (W-ASK-01, M-ASK-01).

**Anatomy.** TextInput large: 400 20px, min-height 56px, gap 12px; leading `[icon:search]`; trailing hint group (`margin-left:auto`): KeyHint
"Enter" + 14px `color.ink-3` "to ask". Shown in focus style when the page opens. Below: meta 14px `color.ink-3` "Answers come only from your
212 confirmed entries. Check the page before you rely on a date or an hour." Recent queries live in the BoardHead actions as links.

**States.** Empty (focus, recent queries shown), typing (search results update after 200 ms idle; Enter asks), asking (busy: hint replaced by
`[icon:loader-circle]` + "Reading your logbooks"), answered (answer paragraph with PageCites, RouteMap lit, EntryRows), no results ("No
confirmed entry mentions "<query>"." plus a suggestion), offline (native: search works on the local copy; Ask shows "Ask needs a
connection. Search still works here."), allowance reached (Ask disabled with the reason; search works).

**Keyboard.** `/` focuses it from anywhere; Enter asks; Escape clears; Down moves into results.

**Accessibility.** `role="search"` landmark around it; `<input type="search">` labelled "Search or ask your logbooks"; the answer region is
`aria-live="polite"` and announced once when complete.

**Native.** SwiftUI `.searchable` is the platform pattern but places the field in the navigation bar; Decision: use a custom large
`TextField` at the top of the leaf on M-ASK-01 (the answer is the screen's content), with `.submitLabel(.search)`. Compose: `SearchBar`
(Material 3) is too heavy; use a custom `OutlinedTextField` with `ImeAction.Search`.

### 7.5 PaperInput

**Purpose.** Editing text that is transcribed from paper, in the paper's voice (review desk, write an entry).

**Anatomy.** TextInput with font.paper 17px (`display:block` so it can wrap; multi-line uses `<textarea>` with auto-height, min 3 lines). Phone
doubt editor: 28px font.paper 500, padding 8px 14px. States as TextInput, including Doubt.

**Accessibility.** Same as TextInput; the label names the field ("What was done").

**Native.** `TextField(axis: .vertical)` with `Font.custom("Literata", ...)`; Compose `OutlinedTextField` with `fontFamily = Literata`.

### 7.6 Select

**Purpose.** Choose one of a list ("Into: Airframe, found book (1983 to 1991)", "Place them: In date order", "Flying until then: 3 h a
week").

**Anatomy (web).** Looks like TextInput with a trailing `[icon:chevron-down]` and `justify-content:space-between`. Built as a native
`<select>` for short fixed lists (fewer than 8 options, Decision) and as a listbox popover (leaf, radius.m, menu shadow, options 40px,
selected option with `[icon:check]` and 700) for long lists or options with two lines. Phone board select (`dm-select`): min-height 36px,
padding 0 10px 0 12px, radius.m, leaf fill, 700 15px, `[icon:chevron-down]` 16px, margin-left auto (d-m-engine filter).

**States.** As TextInput; open (border ink, chevron rotates 180 degrees, instant under reduced motion).

**Keyboard.** Native select keys; listbox: Enter or Space or Alt + Down opens, Up / Down move, Enter chooses, Escape closes, type-ahead.

**Native.** SwiftUI `Picker` with `.pickerStyle(.menu)` inside the field shell (keeps the binder field look, platform menu).
Compose `ExposedDropdownMenuBox` with the same field shell.

### 7.7 Segmented

**Purpose.** Switch between a few views or filters in place: book filter on the map, page states, entry switcher in review, "Link the page
later / Write the entry now", range "6 months / 12 / 24", phone section sub-tabs.

**Anatomy.** `display:inline-flex`, border 1px `color.control-border`, radius.m, overflow hidden. Segments: padding 7px 14px, 600 14px
`color.ink-2`, fill `color.leaf`, separated by 1px `color.rule-2` left borders. Selected: fill `color.ink`, text `color.leaf`. On a board the
whole control sits on a leaf fill.

**States.** Hover (unselected): leaf hover layer. Pressed: 14% layer. Focus: FocusRing on the segment. Selected as above. Disabled
segment: 40% (for example "Review" when nothing waits; prefer hiding).

**Keyboard and semantics.** When it switches a view in place: `role="radiogroup"` with `role="radio"` segments, arrows move and select,
one tab stop. When segments are links (phone sub-tabs mirrored on web), use links. Counts are part of the name ("Review, 6").

**Native.** SwiftUI `Picker(selection:) { ... }.pickerStyle(.segmented)` with `UISegmentedControl.appearance().selectedSegmentTintColor = ink`
and leaf text on the selected segment. Keep: ink selection. Adapt: iOS segment shape. Compose: `SingleChoiceSegmentedButtonRow` with
`SegmentedButtonDefaults.colors(activeContainerColor = ink, activeContentColor = leaf, inactiveContainerColor = leaf)` and
`shape = RoundedCornerShape(4.dp)` on the outer segments, `icon = {}` to drop the checkmark (Decision).

### 7.8 Toggle

**Purpose.** On / off settings that apply at once ("Handwritten pages", "Email and phone reminders", "Keep a full offline copy").

**Anatomy.** Track 42 by 24, radius 12px; off: fill `color.control-border` (Decision; mockup `color.rule-2`); on: `color.ink`. Knob 18px
white circle at top 3px, left 3px (off) or 21px (on). Placed at the right of its label row; the label and its description (14px
`color.ink-3`) are part of the control's click area.

**States.** Hover: track darkens 8%. Focus: FocusRing around the track. Disabled: 40%. Changing: knob slides (duration per
11-accessibility-and-motion.md). Saving: optimistic; on failure it flips back with an AlarmSlip soft next to it.

**Accessibility.** `<button role="switch" aria-checked>` labelled by the visible label, described by the description.

**Native.** SwiftUI `Toggle` with `.tint(ink)` (iOS switch shape, platform convention); Compose `Switch` with `SwitchDefaults.colors(
checkedTrackColor = ink, uncheckedTrackColor = controlEdge, uncheckedBorderColor = Transparent, checkedThumbColor = White,
uncheckedThumbColor = White)`. Keep: ink on. Adapt: native sizes.

### 7.9 Checkbox

**Purpose.** Multi-select (pages), confirmations in forms ("Oil sample sent for analysis", "Carries on to page 4"), audience selection.

**Anatomy.** 20 by 20, border 2px `color.control-border`, radius 3px, `display:inline-grid; place-items:center`. Checked: fill and border
`color.ink`, white `[icon:check]` 14px. Indeterminate: ink fill with a white 10 by 2 bar. Label to the right, gap 10px, 15 to 16px, the label
is clickable.

**States.** Hover: border `color.ink-2`. Focus: FocusRing. Disabled: 40%. Error: border `color.alarm` (in a Field).

**Accessibility.** Native `<input type="checkbox">` visually replaced; Space toggles.

**Native.** iOS has no checkbox control: SwiftUI `Toggle` with a custom `CheckboxToggleStyle` drawing this square, 44pt row target
(Decision: keep the square in forms; in lists use the row's selection checkmark). Compose `Checkbox(colors = CheckboxDefaults.colors(
checkedColor = ink, uncheckedColor = controlEdge, checkmarkColor = White))`.

### 7.10 Radio and OptionCard

**Purpose.** Choose one of a few options that need a description (meter choice, export type, "who is it for" on the web).

**Anatomy.** Radio: 20px circle, border 2px `color.control-border`, margin-top 2px; selected: border 6px `color.ink` (a ring with a white
centre). OptionCard: `display:grid; grid-template-columns:24px 1fr auto; gap:4px 12px`, padding 13px 14px, border 1px `color.rule-2`,
radius.m, `align-items:start`; title 700 16px, description 14px `color.ink-3`, optional right detail. Selected card: border 2px `color.ink`,
padding 12px 13px (so the content does not move).

**States.** Hover: card fill `color.leaf-2`. Focus: FocusRing on the card. Selected as above. Disabled: 40% with the reason in the
description.

**Keyboard.** Radiogroup: arrows move and select, one tab stop.

**Native.** SwiftUI: a `VStack` of `Button`s styled as cards with `.accessibilityAddTraits(.isSelected)` and the group as
`.accessibilityElement(children: .contain)`; Compose `Modifier.selectableGroup()` and `Modifier.selectable(role = Role.RadioButton)`.

### 7.11 FilterChip and ChoiceChip

**FilterChip (web, counts).** Filters a list and shows how many match (b-w-due). `display:inline-flex; align-items:center; gap:8px`, height
36px, padding 0 12px, border 1px `color.rule-2`, radius.m, 600 14px `color.ink-2`, leaf fill. Content: a StatusMark (or plain "All") and the
count in 800 `color.ink`. Selected: border `color.ink` plus `box-shadow: inset 0 0 0 1px color.ink` (a 2px ink outline; ink fill is not used
because the StatusMark colours would clash), text `color.ink`. Group: `display:flex; gap:8px; flex-wrap:wrap`, `role="group"` labelled
"Filter by state". Behaviour: single-select (Decision; "All" resets); `aria-pressed` on each.

**ChoiceChip (presets and pills).** Pick one preset quickly: oil added "None / 1 qt / 2 qt / Other" (phone), pills on web2 screens. Web
(`b-pill`): height 34px, padding 0 12px, border 1px `color.rule-2`, radius.m, 600 14px `color.ink-2`, nowrap; selected: ink fill and border,
leaf text; optional small suffix 500 13px at 80% opacity. Phone (`bm-chip`): min-height 44px, padding 0 13px, 600 15px; selected: ink fill,
white text (an overdue StatusMark inside inverts to white fill with alarm text). Row: `display:flex; gap:6px`, horizontally scrollable with
18px side bleed on phone.

**States (both).** Hover leaf layer; pressed 14%; focus FocusRing; disabled 40%.

**Native.** ChoiceChip: SwiftUI custom `Button`s in a horizontal `ScrollView` (system has no chip); Compose `FilterChip`/`InputChip` with
`shape = RoundedCornerShape(4.dp)`, `selectedContainerColor = ink`, `selectedLabelColor = White`, no leading check icon.

### 7.12 KeyHint

**Purpose.** Shows the keyboard shortcut for a control on the web.

**Anatomy.** 600 12px/1, border 1px `color.rule-2` with 2px bottom border, radius 3px, padding 3px 6px, `color.ink-2`, leaf fill. Inside a
Button: transparent fill, `currentColor` border, 70% opacity. On the rail: see RailFoot. A legend row (`b-kbd-row`): `display:flex; gap:14px;
flex-wrap:wrap`, 13px `color.ink-3`, each item an inline-flex of KeyHints and words.

**Rules.** Hidden under `(pointer: coarse)` and on native. Always `aria-hidden`; the control carries `aria-keyshortcuts`. Shortcuts
defined in this file: `/` search, `N` add, letters in AddMenu, J K A E X and Shift+Enter in review, Enter to ask, `[` `]` stop stepping,
`+` `-` `L` on the map, `m` mark done on a due row. 11-accessibility-and-motion.md keeps the master list; single-letter shortcuts must be
disableable (WCAG 2.1.4) from Settings.

### 7.13 Stepper

**Purpose.** Set a meter reading to the tenth with big targets after the photo fills it (M-FLIGHT-03, b-m-tach-confirm).

**Anatomy.** `display:grid; grid-template-columns:64px 1fr 64px`, border 1px `color.rule-2`, radius.m, overflow hidden, height 66px (small:
54px). Side cells: fill `color.leaf-2`, `color.ink`, centred "−" and "+" at 500 30px (small 26px), separated by 1px `color.rule-2`. Value: 800
34px/1 (small 24px), letter-spacing .01em, centred, tabular. Above: Field label row ("Tach" ... "was 4212.4 on Nov 14"). Below: the
consequence 700 16px ("2.4 hours this flight") or 15px `color.ink-3` ("2.7 hours · Not this time").

**Behaviour.** Step 0.1. Tap the value to type (opens the decimal keyboard). Press and hold a side repeats after 400 ms at 10 steps per
second, accelerating to 1.0 steps after 2 s (Decision). Minimum = previous reading (cannot run backwards; at the minimum "−" is disabled with
the hint "Tach was 4212.4"). Large jumps (more than 24 h since the last reading) show a Field warning "That is 26.3 hours in one flight. Check
the meter." (copy in 12-copy-and-voice.md).

**Accessibility.** One adjustable element: VoiceOver `accessibilityAdjustableAction` ±0.1, value "4214.8, 2.4 hours this flight"; TalkBack
`setProgress`-style custom actions "Increase", "Decrease" and editable text. Web (if used): `role="spinbutton"` with Up / Down ±0.1, Page Up /
Page Down ±1.0.

**Native.** Custom on both (UIStepper and Material steppers are too small). Haptic tick per step.

**Accept.**
- [ ] Cannot go below the previous reading.
- [ ] The consequence line updates on every change.

### 7.14 Avatar

**Purpose.** A person in Share and people lists.

**Anatomy.** 34px circle, `color.leaf-2` fill, 700 13px initials `color.ink`, `display:inline-grid; place-items:center`. Phone header round
icon (`ico round`): 44px circle, 800 15px. Image avatars are not used (Decision: initials only; no profile photos stored).

---

## 8. Feedback

### 8.1 Toast

**Purpose.** Confirms a completed action and offers Undo (b-m-review-next "Page 199 confirmed, 2 entries · Undo").

**Anatomy (phone).** Absolute, left and right 12px, top 6px under the header (or above the tab bar when the screen has one, Decision: top on
review screens where the bottom drawer is busy, bottom elsewhere), `display:flex; align-items:center; gap:10px`, fill `color.ink`, white 600
16px, radius.m, padding 10px 10px 10px 14px, z above content. Leading `[icon:circle-check]`. Action at the right: 700, underlined (offset 3px),
min-height 44px, padding 0 8px ("Undo").

**Web.** Same anatomy, bottom-centre of the board, 16px above the leaves' bottom edge, max-width 560px, min-width 320px.

**Behaviour.** Auto-dismiss after 6 s, 10 s when it has an action (Decision); pauses while hovered or focused; one at a time (a new toast
replaces the old one). Undo reverts the action and shows "Undone". Never used for errors (AlarmSlip) or for anything the user must read
later.

**Accessibility.** Container `role="status"` (`aria-live="polite"`); the Undo button is reachable by keyboard through a skip shortcut
(F6 moves focus to the toast region, Decision) and is announced as part of the message. Timing: users can extend by focusing it (WCAG 2.2.1).

**SwiftUI.** No system toast: an overlay `VStack` with `.transition(.move(edge: .top).combined(with: .opacity))`, and
`AccessibilityNotification.Announcement` posted with the message. **Compose.** `SnackbarHost` with a custom `Snackbar` (ink container,
4dp shape, action colour white) and `SnackbarDuration.Long` when it has an action.

### 8.2 EmptyState

**Purpose.** What to do next when there is nothing yet; also the error variant for a whole leaf (d-w-new right leaf, b-w-new).

**Anatomy.** Inside a leaf, no illustration (Decision: the binder has no decorative art; the map itself shows emptiness as dashed "no pages
yet" lines). Heading type.heading ("Next, scan the airframe logbook"); paragraph 16px `color.ink-3`, margin 4px 0 16px; primary Button size l
web (48px, full width, leading icon). Then optional secondary Rows ("Already scanned?" + secondary s "Upload pages"; "Know the dates?" + "Add
dates"). Optional HungSection "Pages in" with an empty CoverageBar and a note.

**Variants.** `first-run` (as above), `filtered` ("No items match "Overdue"." + quiet "Show all"), `role-limited` (viewer: says who can add,
no button: "Only the owner or an editor can add pages."), `error` (heading "This could not be loaded.", paragraph with what still works,
secondary "Try again"), `offline` (native: "This needs a connection. Your changes here are saved on this phone.").

**Accessibility.** Heading level fits the leaf (h2). The primary action is the first focusable element after the heading.

**Native.** `ContentUnavailableView` is the iOS pattern but brings its own icon and centring; Decision: use a custom leading-aligned
`VStack` with the same copy so the binder voice holds. Compose: a `Column`.

### 8.3 Skeleton

**Purpose.** Loading placeholders that keep the layout steady.

**Anatomy.** Bars with radius 2px in `color.leaf-2` on leaves, `color.cover-2` on cover and mat, `on-board` at 30% on boards. Heights match
the text they stand for (16px body, 13px small, 22px lede). No shimmer (Decision; calmer, and nothing to disable under reduced motion). Shown
after 300 ms of waiting (avoid flashes); content replaces it without animation.

**Accessibility.** The region carries `aria-busy="true"`; skeletons are `aria-hidden`. A polite "Loading" is announced only if loading
exceeds 2 s.

### 8.4 ConflictTable

**Purpose.** Shows "yours" beside "theirs" when the same record changed on the phone offline and elsewhere (M-SYS-01, b-m-pending).
Conflicts are never silent.

**Anatomy.** Heading 800 19px ("Squawk: Left brake feels soft"); explanation 15px/1.45 `color.ink-2` naming who changed what and when ("Sam
Reyes resolved it on the web at 9:12, while your phone was offline and you added a photo and a note."). Table 15px: header 700 13px
`color.ink-3`, padding 6px 8px 6px 0, border-bottom 1px `color.rule-2`; cells padding 8px 8px 8px 0, border-bottom 1px `color.rule`, line-height
1.35; columns Field (74px), Yours, Theirs (<name>). Rows that differ: fill `color.alarm-bg`, first cell padding-left 6px. Actions: two
secondary Buttons size l side by side, "Keep mine", "Take Sam's"; a quiet "Decide later" below (44px target).

**Behaviour.** Choosing applies to the whole record (Decision for v1: no per-field merge); the choice is logged in the change log. "Decide
later" keeps both and leaves the conflict listed under PhoneGroupHeader "Changed in two places" with its count.

**Accessibility.** Real table; differing rows also carry visually hidden "differs" text (colour is not the only cue).

**Native.** SwiftUI `Grid`; Compose `Column` of `Row`s. Same on tablet. The web shows the same component if a web edit conflicts with a
queued phone change arriving later (09-data-and-api.md decides whether the web ever sees conflicts).

---

## 9. Phone components

The phone is the same binder folded: the board colour floods the header, one white leaf holds the content, five coloured tabs sit at the
bottom, and a square add button floats over the leaf. Phone rules: targets 44pt / 48dp, body 16 or larger, nothing under 13 except the
listed exceptions (§2.7), tab bar on top-level screens, back on pushed screens, sync state visible inside the aircraft. The OS status bar
(50px in the mockups, `bm-sys`) is drawn by the OS; the header extends under it on the board colour.

### 9.1 PhoneHeader

**Purpose.** Names the screen on the section colour, shows which aircraft and its sync state, and holds one tool (Search) or back.

**Anatomy.** Fill `board` (extends under the status bar), `color: on-board`, padding 8px 20px 16px, `display:flex; justify-content:
space-between; align-items:flex-end; gap:12px`.

| Variant | Left | Right | Figures |
|---|---|---|---|
| top-level | Tail line (600 14px `on-board-2`, margin-bottom 4px, `display:flex; align-items:center; gap:4px`): "N734DM" + `[icon:chevron-down]` (opens AircraftSwitcher sheet) + SyncState (§9.2), or a context ("N734DM · 412 pages"). Then the h1, type.board-title phone (800 28px/1.1). | Icon button 44 by 44, radius.m, fill `on-board` at 20%, `[icon:search]` (opens M-ASK-01). | d-m-status, d-m-map, d-m-share |
| pushed | Back control above the h1: `[icon:chevron-left]` + parent name, 600 16px `on-board`, gap 2px, min-height 44px (32px in the mockups when stacked above the title; keep the 44pt hit area by extending it downward). | Optional: a Tag ("N734DM"), an input (Plan ahead "+44 h"), or nothing. padding-bottom 12px. | d-m-plan, d-m-queue, d-m-link |
| page | Back control and, right-aligned, a two-line title: 700 16px book and page ("Airframe vol. 1, p. 15") and 14px `color.on-cover-2` detail ("1 of 2 to check"). `align-items:center`, padding-bottom 10px. Used over the mat (section `cover`). | n/a | d-m-review, b-m-review-doubt |
| success | Title "Flight saved"; right icon tile `[icon:check]` (not a button). | n/a | b-m-flight-saved |

**States.** Offline: SyncState says "Offline". Long titles wrap to two lines (never truncate the h1). Scrolling: the header does not
collapse (Decision: the colour is the place marker; it stays 100% height).

**Accessibility.** h1 is the screen title; the tail line is a button "N734DM, switch aircraft"; Search button "Search or ask". Back button
name "Back to Status".

**SwiftUI.** Use `NavigationStack` for push / pop and the edge-swipe back. Decision: hide the system navigation bar on binder screens
(`.toolbar(.hidden, for: .navigationBar)`) and draw PhoneHeader as the first view, keeping the interactive pop gesture enabled (re-attach
`interactivePopGestureRecognizer.delegate`), because the system bar cannot show the tail line, the sync state and the board flood together
at this weight. On iPad the system bar is kept (split view chrome). **Compose.** A custom `Column` header (not `TopAppBar`, Decision, same
reason) with `WindowInsets.statusBars` padding and the board colour behind the status bar (`enableEdgeToEdge()`, light or dark status bar
icons per hue: dark icons on books, light on the others). System back (gesture and button) works through `BackHandler`/Navigation.
Keep: board flood, 28 title, tail line. Adapt: platform back gesture, status bar icon colour.

### 9.2 SyncState and PendingMark

**SyncState (`bm-sync`).** Inline after the tail, margin-left 8px, `display:inline-flex; gap:4px; align-items:center`, 500 weight, 14px icon.
States: "Synced 9:38" (no icon, or `[icon:check]`), "Syncing" (`[icon:refresh-cw]`, not rotating under reduced motion), "Offline"
(`[icon:wifi-off]`), "3 waiting" (`[icon:cloud-upload]`, opens M-SYS-01), "Needs you" (conflict: `[icon:circle-alert]`, opens M-SYS-01).
Times in the device's local time.

**PendingMark (`bm-pend`).** A row-level note that a value changed on this phone and is not uploaded yet: `display:inline-flex; gap:4px`,
600 13px `color.ink-2`, `[icon:cloud-upload]` 14px: "Moved by your flight, on this phone". Removed when uploaded.

**Accessibility.** SyncState is part of the tail button's description ("Synced at 9:38"); changes to "Offline" or "Needs you" are announced
politely once.

### 9.3 OfflineBanner

**Anatomy.** Full width under the header, fill `color.cover`, `color.on-cover` 600 14px, padding 7px 20px, `display:flex; gap:8px;
align-items:center`, `[icon:cloud-upload]`. Copy: "3 changes on this phone. They upload when you have signal." Shown only when offline
with queued changes (offline with nothing queued shows SyncState only). Tapping opens M-SYS-01.

**Accessibility.** `role="status"`; not a modal; does not move focus.

### 9.4 PhoneTabBar

**Purpose.** The five coloured tabs: Status, Logbooks, Maint., Aircraft, Share (Documents live under Aircraft).

**Anatomy.** Fill `color.cover`, height 86px including the 26px home-indicator area (use the safe-area inset, not a fixed 26),
`display:grid; grid-template-columns:repeat(5,1fr); gap:4px`, padding 0 8px, `align-items:start`. Each tab: height 50px, radius 0 0 5px 5px
(hangs from the top edge like a binder tab), fill `color.section.<s>`, 700 12px `color.on-section.<s>`, `display:flex; flex-direction:column;
align-items:center; justify-content:center; gap:3px`, icon 21px: `[icon:list-checks]` Status, `[icon:book-open]` Logbooks, `[icon:wrench]`
Maint., `[icon:plane]` Aircraft, `[icon:share-2]` Share. Inactive tabs at 92% opacity. Selected: height 58px, margin-top -8px (rises above the
bar's top edge), radius 5px all corners.

**States.** Pressed: 14% layer. Selected as above. Badge (Decision, mirrors the web flag): a 16px-high alarm pill with white 700 12px count at
the tab's top-right ("6") for pages waiting for review on Logbooks; hidden for viewers. Focus (hardware keyboard): FocusRing. Hidden on pushed
screens and full-screen tasks (camera, review page, sheets cover it).

**Behaviour.** Tap switches section, preserving each tab's own navigation stack. Tapping the current tab pops to its root; tapping again at
the root scrolls to top (platform convention on both).

**Accessibility.** iOS: each tab `accessibilityAddTraits(.isButton)` plus `.isSelected`, label "Logbooks, tab 2 of 5, 6 pages to review".
Android: `Modifier.selectable(role = Role.Tab)` inside a `selectableGroup`. Label 12px is an allowed exception; it scales with text size up to
the bar's limit and the Large Content Viewer (iOS) shows the label on long-press at accessibility sizes.

**SwiftUI.** `TabView` with the system tab bar hidden (`.toolbar(.hidden, for: .tabBar)`) and this bar drawn in a `safeAreaInset(edge:
.bottom)`; or a custom container holding five `NavigationStack`s. Decision: custom bar, since the system bar (and iOS 26 floating tab bar)
cannot show coloured hanging tabs. **Compose.** Custom `Row` in the `Scaffold` `bottomBar` (not `NavigationBar`), with
`WindowInsets.navigationBars` padding. Keep: hues, hanging shape, rise on selection. Adapt: haptic on selection change, platform re-tap
behaviour.

**Accept.**
- [ ] Each tab's text contrast is at least 4.5:1 at 92% opacity (books 7.59:1 measured).
- [ ] Re-tapping a tab pops to root, then scrolls to top.

### 9.5 PhoneLeaf

**Anatomy.** `flex:1; min-height:0; overflow:hidden` (the inner content scrolls), fill `color.leaf`, margin 0 8px (the board shows 8px each
side), radius 3px 3px 0 0, padding 20px 18px 0, `position:relative` (holds the AddButton). Variants: `flush` (padding 0, for full-bleed maps),
`tight` (`dm-tight`: PhoneRows at 48px min height, group heads with 10px top padding), map leaf (padding 12px 12px 0).

**Native.** A `ScrollView` / `LazyColumn` inside a `RoundedRectangle(cornerRadius: 3)` clipped top corners; bottom content inset clears the
AddButton (76pt) so the last row is never hidden.

### 9.6 PhoneGroupHeader

**Anatomy.** 700 14px/1.4 `color.ink-3`, padding 16px 0 6px (10px top in tight), border-bottom 2px `color.ink`, `display:flex;
justify-content:space-between`. Left: group name ("Overdue", "Before the new year", "Waiting to upload"); right: count or a link ("See all",
"covered by").

**Accessibility.** A heading (`.isHeader` / `heading()` semantics) so rotor and TalkBack heading navigation work. Native sticky headers
(`Section` headers pinned in `List(.plain)`, `stickyHeader` in `LazyColumn`).

### 9.7 PhoneRow

**Anatomy.** `display:grid; grid-template-columns:1fr auto; gap:10px`, padding 12px 0, border-bottom 1px `color.rule`, min-height 58px (tight:
48px, padding 7px 0), `align-items:center`. Title (`.t`) 700 16px/1.3; detail (`.d`) 14px/1.35 `color.ink-3`, may hold a LineChip, inline 14px
icons (vertical-align -2px) and PageCite text; right (`.r`) 700 15px right-aligned with a second line 400 13px `color.ink-3`. Optional
trailing `[icon:chevron-right]` when the row navigates; optional PendingMark under the detail.

**States.** Pressed: leaf pressed layer (#dedfdf). Selected (tablet master list): leaf-2 with board rules. Disabled: not used. Unconfirmed
value: TrustMark in the detail.

**Accessibility.** One element per row (`.accessibilityElement(children: .combine)` / `mergeDescendants = true`), with the chevron implying
a button trait. Swipe actions: none on due rows (§5.8); allowed on squawks ("Resolve") and documents ("Share") per 06-mobile-screens.md.

**Native.** `List` with `.listStyle(.plain)`, `.listRowInsets(EdgeInsets())`, custom separators (`.listRowSeparatorTint(rule)`) to keep 1px
rules; Compose `LazyColumn` items with `HorizontalDivider(color = rule)`.

### 9.8 AddButton and SectionIcon

**AddButton (`bm-fab`).** Square, 60 by 60, radius 6px, fill `color.ink`, white `[icon:plus]` 28px, shadow `0 8px 18px -8px rgba(0,0,0,.7)`,
absolute right 16px bottom 16px inside the PhoneLeaf (above the tab bar). Pressed: #36373b. Opens the Add BottomSheet ("Add to N734DM").
Hidden for viewers and on pushed screens. Name "Add". Native: SwiftUI `Button` in an overlay; Compose `FloatingActionButton(shape =
RoundedCornerShape(6.dp), containerColor = ink)`. Keep the square (the binder does not use circles for actions).

**SectionIcon (`bm-ic`).** 44 by 44 tile (36 on the web AddMenu), radius.m, `display:grid; place-items:center`, fill `color.section.<s>`, icon
`color.on-section.<s>` (books: #1c1600), or ink fill for neutral. Decorative inside an OptionRow.

### 9.9 BottomSheet

**Purpose.** Phone overlays: Add, mark done, stop and visit details on the map, the review drawer, aircraft switcher.

**Variants.**

| Variant | Spec | Figures |
|---|---|---|
| modal | Scrim `rgba(15,16,20,.55)`; sheet left and right 8px (Decision: on native use full width with platform corner radius, per radius.pill rule), leaf, radius 3px 3px 0 0 in the mockup, padding 20px 18px 30px. Grab handle 40 by 5, radius 3, `color.rule-2`, margin -8px auto 12px. Head (`bm-sheethead`): h2 800 22px/1.2 + close button 44 by 44, radius.m, fill `color.leaf-2`, `[icon:x]`. | b-m-add, b-m-mark-done |
| map | No scrim (the map above stays readable and interactive), radius 5px 5px 0 0, padding 20px 18px 26px, shadow `0 -1px 0 rgba(0,0,0,.18), 0 -16px 30px -16px rgba(0,0,0,.45)`. Meta line 15px/1.4 `color.ink-3`, margin 0 0 10px. Opens at half height. | d-m-stop, d-m-visit, d-m-gap |
| drawer | Over a page image: radius 5px 5px 0 0, padding 16px 18px 14px, shadow `0 -1px 0 rgba(0,0,0,.25)`, grab with -6px top margin. Collapsible to its header. | d-m-review, b-m-review-doubt |

**States.** Detents: medium and large (modal), half and large plus a 120pt peek (map), peek and fit-content (drawer). Loading content:
Skeleton inside. Error: AlarmSlip soft inside. Offline: content from the local copy; actions that need a connection are disabled with the
reason.

**Behaviour.** Drag the handle or swipe down to dismiss (modal, map); the drawer collapses instead of dismissing. Close button dismisses.
Unsaved edits: dismiss asks "Discard these changes?". Focus moves into the sheet on open and back to the trigger on close.

**Accessibility.** Modal sheets are modal (`accessibilityViewIsModal`); the map sheet is not modal and the map stays reachable. The grab handle
is not an element; the close button is ("Close").

**SwiftUI.** `.sheet` with `.presentationDetents([.medium, .large])`; map variant adds `.presentationBackgroundInteraction(.enabled(upThrough:
.medium))` and `.interactiveDismissDisabled(false)`; drawer uses `.presentationDetents([.height(120), .medium, .large])` with
`.presentationBackgroundInteraction(.enabled)`. Corner radius: platform default (radius.pill rule). **Compose.** `ModalBottomSheet` (modal),
`BottomSheetScaffold` with `sheetPeekHeight` (map and drawer; no scrim). Keep: leaf fill, head layout, close button. Adapt: platform corner
radius and drag handle.

### 9.10 OptionRow

**Anatomy (`bm-opt`).** `display:grid; grid-template-columns:44px 1fr auto; gap:14px; align-items:center`, padding 9px 0, border-bottom 1px
`color.rule`, min-height 64px (58px in Share). SectionIcon, title 700 16px/1.3 and description 14px/1.35 `color.ink-3`, trailing
`[icon:chevron-right]` or a Checkbox when it is a choice. Selected (a choice, d-m-share): fill `color.leaf-2`, full bleed (margin 0 -18px, padding
9px 18px), `box-shadow: inset 0 2px 0 board, inset 0 -2px 0 board`, trailing Checkbox checked. Note under the list 14px `color.ink-3` ("Each
colour is the tab where it will be filed.").

**Accessibility.** Navigation rows are buttons; choice rows are radio buttons in a group with the selected state.

### 9.11 ActionFooter

**Anatomy (`bm-foot`).** Pinned under the leaf content (not scrolling), fill leaf, margin 0 8px, padding 10px 18px 14px plus the bottom safe
area when there is no tab bar, border-top 1px `color.rule`, `display:grid; gap:8px`. Layouts: one full-width Button size l; `two` (two equal
columns); `wide` (`auto 1fr`: a narrow secondary "Undo" and a wide primary "Done"). Optional note spanning all columns, 14px/1.4 `color.ink-3`,
centred ("Opens are logged in Share. Revoke it there any time.").

**Behaviour.** Moves up with the keyboard (safe area keyboard inset). The primary action sits in thumb reach.

### 9.12 PageCard

**Purpose.** A visit's pages as swipeable cards, one per book (d-m-visit, M-BOOKS-03).

**Anatomy.** Row (`dm-cards`): `display:flex; gap:10px`, side bleed 18px, horizontal paging. Card (`dm-card`): flex 0 0 292px, border 1px
`color.rule-2`, radius.m, padding 10px 12px 12px, leaf. Head: LineChip with the page ("Airframe p. 60") and a TrustMark, `justify-content:
space-between`, margin-bottom 8px. Crop 96px high with a quiet highlight. Paper text type.paper-small 15px/1.45, margin 8px 0 6px. Under the
row: 14px `color.ink-3` hint "Swipe for Engine p. 37 and Propeller p. 12" and a 700 `color.ink-2` pager "1 of 3". Below: primary Button size l
"Open Airframe p. 60" (label follows the visible card).

**Accessibility.** The row is a paging list; VoiceOver swipes move card by card ("Airframe page 60, confirmed, 1 of 3"); the hint text is
hidden from screen readers (the pager says it).

**Native.** SwiftUI `ScrollView(.horizontal)` with `.scrollTargetBehavior(.viewAligned)` and `.scrollTargetLayout()`; Compose
`HorizontalPager` with `pageSize = PageSize.Fixed(292.dp)` and `pageSpacing = 10.dp`.

### 9.13 CameraBar

**Purpose.** The capture surface controls for scanning pages and the tach (M-SCAN-02 d-m-camera, M-FLIGHT-02).

**Anatomy.** Camera area fills the screen on the mat colour #2a2c31 (section `cover`). Top bar (`bm-camtop`): absolute, padding 8px 14px,
`display:flex; justify-content:space-between`: CameraPill "Cancel" `[icon:x]` and CameraPill with the book and count ("Airframe vol. 1 · 5
taken"). CameraPill (`bm-pill`): min-height 44px, padding 0 16px, radius.m, fill `rgba(23,25,30,.82)`, `color.on-cover` 700 16px, gap 8px.
Detected page: 3px `color.section.books` outline 6px outside the page edges. Guidance pill, bottom-centre over the preview, books fill with
#1c1600 text: "Page found. Hold still." `[icon:scan-line]`. D addition: once the date is legible, a pill "Lands in 1984, inside the airframe gap"
`[icon:route]` at top-left under the top bar (600 15px). Bottom bar (`bm-camfoot`): fill `color.cover`, `display:grid; grid-template-columns:1fr
auto 1fr; align-items:center`, padding 18px 22px 34px (34 includes the home indicator; use the safe area). Left: last page thumbnail 46px
wide rotated -4 degrees with a count badge (on-cover fill, cover text, 700 13px, radius 3px). Centre: Shutter 78px circle, 4px `color.on-cover`
ring with a 60px `color.on-cover` disc. Right: CameraPill "Done" in on-cover fill with cover text.

**States.** Searching for edges ("Looking for the page edges"), found (outline + "Hold still"), capturing (auto when steady for 600 ms,
Decision; shutter disc flashes to 80% for 100 ms, none under reduced motion), captured (thumbnail updates, count +1, haptic), low light
("More light, please" pill, torch toggle appears), permission denied (full-screen EmptyState on the mat: "MyTailLog needs the camera to scan
pages." + "Open Settings"), storage full (AlarmSlip).

**Accessibility.** Shutter button "Take photo"; VoiceOver announces "Page found" and "Photo 6 taken". Auto-capture can be turned off in
Settings (needed for switch-control users).

**Native.** iOS `AVCaptureSession` preview with Vision `VNDetectDocumentSegmentationRequest` for edges (custom UI so the book context and
the "lands in" line can show; VisionKit's document camera cannot host them). Android CameraX with ML Kit object/edge detection or the GMS
Document Scanner in a fallback mode. Keep: pills, shutter, count. Adapt: platform camera permission flow, volume-button shutter.

### 9.14 Widget

**Purpose.** The line ahead for the next 60 days on the home or lock screen, plus the next visit (d-m-lock, M-SYS-03).

**Anatomy (D).** Fill `rgba(244,244,241,.96)` (a white leaf, so the inks hold), radius 18px (OS widget rounding), padding 11px 14px 12px, ink
text. Head: tail 700 16px `color.ink` at left, "next 60 days" 14px `color.ink-3` at right, baseline aligned. LineAhead `widget` variant 330 by
100. List 14px/1.4 `color.ink-2` with bold `color.ink` lead words: "**Dec 7 visit:** oil, transponder and static" / "**VOR check** lapsed Nov 11,
IFR only".

**Platform adaptation (Decision).**
- iOS home screen: WidgetKit `systemMedium` with the layout above; `systemSmall` shows the head and the first list line only.
- iOS lock screen: accessory widgets are monochrome and tinted by the system, so the coloured line cannot show. `accessoryRectangular`:
  three text lines ("N734DM", "Dec 7 visit: oil, transponder", "VOR lapsed Nov 11"); `accessoryInline`: "N734DM: 3 items fit Dec 7".
- Android: Glance `AppWidget` on the home screen, 4 by 2 cells, with the line drawn as a bitmap (Glance has no canvas); Android phones
  have no lock-screen widgets.
- Data: computed from confirmed records on the device; refreshed on app background, after sync and at midnight; shows "as of 7:30" when
  older than 6 hours.

**States.** No aircraft (prompt to open the app), several aircraft (configurable per widget; default the last opened), nothing due in 60
days (line drawn, list "Nothing due before Jan 17"), stale (as-of time).

**Accessibility.** Widget label equals the list text plus the head ("N734DM, next 60 days: Dec 7 visit, oil, transponder and static. VOR
check lapsed Nov 11, IFR only."). Tapping opens Status (deep link).

### 9.15 NotificationContent

**Purpose.** A reminder that carries the whole answer (d-m-lock, b-m-lock, M-SCAN-04 d-m-read). The OS draws the notification; this
specifies content and actions.

**Anatomy as mocked.** App row (app mark, "MyTailLog", time), title in bold 16px ("N734DM: three items fit one visit, week of Dec 7"), body
15px/1.4 with the facts and the page ("Oil change in 9.7 h (about Dec 12), transponder and pitot-static by Dec 31. AeroCheck Instruments did
the last two on Dec 3, 2024, Airframe p. 58."), two actions ("Plan the visit", "Remind me Friday").

**Rules.** Title starts with the tail number. Body names items, dates or hours, and the page. Never "airworthy" or similar. Actions are
verbs. Built from confirmed data only. Copy templates in 12-copy-and-voice.md; delivery and lead times in 07-flows.md and Settings.

**Native.** iOS `UNNotificationContent` with a category registering the two actions (`UNNotificationAction`), `threadIdentifier` per
aircraft, `relevanceScore` higher for lapsed items. Android `NotificationCompat.Builder` with `BigTextStyle`, two `addAction`s, a channel per
kind ("Due items", "Pages read", "Sync problems").

---

## 10. Print components

### 10.1 PrintSheet

**Purpose.** Typeset documents on light paper whatever the section: pre-buy dossier (W-SHARE-03, d-w-dossier), maintenance summary
(W-SHARE-04). Printed from the browser and exported as PDF.

**Anatomy.** Fill #ffffff, text #15171b, 400 13px/1.5 font.app, padding 48px 54px 40px (on A4/Letter: 15mm 17mm 13mm margins), relative.
h1 800 26px/1.15, -0.01em. h2 700 15px/1.3, margin 20px 0 6px, padding-bottom 4px, border-bottom 1.5px #15171b. Tables 13px: th 700
`color.ink-3`, padding 0 8px 4px 0, border-bottom 1px `color.rule-2`; td padding 5px 8px 5px 0, border-bottom 1px `color.rule`, top-aligned;
numbers right-aligned and nowrap. Citations: superscript 10px 700 (ink, or `board-ink` in the summary). Footnotes: 13px `color.ink-2`,
border-top 1px `color.rule-2`, margin-top 18px, padding-top 8px, grid gap 3px; quoted paper text in font.paper 13px/1.45. Foot: absolute at
left and right 54px, bottom 18px, flex between, 13px `color.ink-3` (document name and "Page 1 of 4", generated date). StatusMarks at print size
(13px, 10px mark, 2.5px soon ring). The dossier's page 1 carries a RouteMap `static` with footnoted labels.

**Rules.** `@media print`: hide app chrome; `break-inside: avoid` on table rows and footnote blocks; repeat table headers; page counter in
the foot. Every derived value has a footnote to its page. Unconfirmed data never appears.

**Native.** Phones share the server-rendered PDF (share sheet), no native layout.

### 10.2 Sticker

**Purpose.** The printed maintenance-entry sticker for the paper logbook (W-BOOKS-11, b-w-write).

**Anatomy.** Fill #ffffff, text #15171b, border 1px `color.rule-2`, padding 14px 16px, 13px/1.45; bold lines 14px; signature block border-top
1px #15171b, margin-top 12px, padding-top 4px, 13px. Printed at the label stock's size (see 07-flows.md for stock sizes); entry ID printed
so the scan can be matched later ("sticker matched by its entry ID", d-w-entry).

---

## 11. Tablet size set

The tablet layouts (1024 by 768; T-* screens) and the web's compact viewports use these overrides of the web components (from
`b/mobile.html` and `d/mobile.html` `.tb` rules). 04-web-screens.md and 05-mobile-architecture.md decide which viewports use them.

| Component | Regular (web) | Tablet set |
|---|---|---|
| Rail width | 216px | 178px |
| Rail padding | 18px 0 16px 14px | 16px 0 12px 10px |
| RailPlate tail | 24px, padding 2px 14px 14px 4px | 20px, padding 2px 10px 10px 4px |
| SectionTab | min-height 50, padding 11px 12px, 16px, margin-right 12, open padding-right 24 | min-height 46, padding 9px 10px, 15px, margin-right 10, open padding-right 18; flag right 14px top 9px |
| RailButton | 42px, 15px, padding 0 12px | 44px, 14px, padding 0 10px; foot padding-right 10px |
| Board padding | 0 22px 22px | 0 14px 14px |
| BoardHead | min-height 78 (70), gap 28 | min-height 66, gap 18, padding-top 12 |
| Title | 30px, margin-bottom 14 | 26px, margin-bottom 12 |
| SubTabs | padding 9px 14px 11px | 9px 12px 11px |
| Leaf | padding 26px 30px 28px | 20px 22px 22px, overflow hidden (inner scroll) |
| Mat | padding 18px | 14px |
| HungSection | hung grid | stacked: one column, gap 4px, padding 12px 0 4px; h3 15px flex with the count inline 14px |
| DueTable compact columns | 100 / 86 / 104 | 104 / 74 / 98 |
| Verdict | 22px, max 34ch | 20px, no max width, margin-bottom 12 to 14 |
| Spine | padding 6px 14px 4px, gap 14 | 5px 12px 3px, gap 12 |

Touch rules apply on tablets: targets 44pt / 48dp (RailButton becomes 44px; SectionTabs already exceed it; Buttons size s become 44px tall
on touch, Decision, via `@media (pointer: coarse)` on the web and by default natively).

---

## 12. Components to add

Components this file defines that are not on the brief's list (the lead should add them to the shared vocabulary):

| Component | Section | One line |
|---|---|---|
| SectionContext | §2.2 | Provides `board`, `board-ink`, `on-board`, `on-board-2` to children. |
| FocusRing | §2.4 | Two-ring focus indicator that works on every ground. |
| AircraftSwitcher | §3.3 | Menu from the RailPlate (W-SWITCH-01); sheet on phone. |
| RailAircraftLink | §3.6 | Aircraft list in the Hangar and Account rail. |
| AddMenu | §3.7 | Web Add menu (W-ADD-01) with section-coloured icons and letter keys. |
| Drawer | §3.15 | Web side panel with scrim (mark done; narrow-window SourceMat). |
| LifeStrip | §4.3 | The spine inside a leaf (hangar card header, record room cover). |
| StopStepper | §4.9 | Previous / next stop on one line from an entry. |
| BookTabs | §4.10 | One tab per book of an interchange on the mat. |
| MapTooltip | §4.11 | Hover readout for map marks. |
| FirstBadge | §5.6 | "first" marker on the limit that bites first. |
| Tag | §5.7 | Small neutral label. |
| EntryRow | §5.9 | A logbook entry in a list, paper voice. |
| Row | §5.10 | Generic two-column leaf row. |
| Reading | §5.12 | Large figure with unit. |
| ProgressBar | §5.16 | Upload, reading and allowance progress. |
| PageCrop | §6.2 | Cited crop with its quote. |
| PageThumb | §6.3 | Page thumbnail with state and selection. |
| SelectionBar | §6.4 | Ink toolbar for selected pages. |
| DropZone | §6.5 | Drop files to add pages. |
| QRCode | §6.8 | Phone hand-off and record room code. |
| SearchField | §7.4 | The one search and Ask field. |
| Radio, OptionCard | §7.10 | Single choice with descriptions. |
| FilterChip, ChoiceChip | §7.11 | Counted filters (web) and presets (phone and web pills). |
| Avatar | §7.14 | Initials circle. |
| Skeleton | §8.3 | Loading placeholders. |
| ConflictTable | §8.4 | Yours beside theirs for offline conflicts. |
| ConfirmDialog | below | Asks before destructive actions. |
| SyncState, PendingMark | §9.2 | Sync state in the phone header; per-row "on this phone". |
| OfflineBanner | §9.3 | Queued changes while offline. |
| PhoneGroupHeader | §9.6 | Group heading with a 2px ink rule. |
| PhoneRow | §9.7 | The phone list row. |
| SectionIcon | §9.8 | Section-coloured icon tile. |
| OptionRow | §9.10 | Icon, title, description row for menus and audience choice. |
| ActionFooter | §9.11 | Pinned phone action area. |
| PageCard | §9.12 | Swipeable page cards of a visit. |
| CameraBar, CameraPill, Shutter | §9.13 | Capture controls. |
| NotificationContent | §9.15 | Content rules for reminders and pages-read notices. |
| PrintSheet, Sticker | §10 | Print layouts. |

**ConfirmDialog.** Asks first before anything destructive or hard to undo (delete pages, delete an aircraft, revoke a link, discard
changes). Web: centred dialog 440px wide, leaf, radius.m, padding 24px, menu shadow, scrim `rgba(15,16,20,.5)`; title type.heading 20px;
body 16px naming exactly what goes ("Delete pages 30 to 32? The 7 entries on them are deleted too. This cannot be undone."); actions right
aligned: secondary "Cancel" (focused first, Decision) and alarm "Delete 3 pages". Typed confirmation for deleting an aircraft (TextInput
"Type N734DM to confirm"; the alarm button stays disabled until it matches). `role="alertdialog"`, focus trapped, Escape cancels. Native:
SwiftUI `.confirmationDialog` (action sheet style) or `.alert` with a `.destructive` role button; Compose `AlertDialog` with the alarm text
colour on the confirm button.

---

## 13. Open questions

1. **Control edge colour.** Decision here: `color.control-border` #7d828a for input, select, checkbox, radio, toggle-off and segmented outer
   borders (3.87:1), because `color.rule-2` is 1.96:1 and fails WCAG 1.4.11. It darkens the look of forms. The lead should confirm or pick
   another value in 01-design-tokens.md.
2. **Alarm text ink.** Decision here: `color.alarm-text` #c42e15 for due-soon StatusMark text, field errors and the phone doubt note, because
   `color.alarm` text is 4.16:1 on leaf-2 and 3.92:1 on alarm-bg. Also the soft AlarmSlip text #7a1707 has no token. Both need tokens.
3. **Mat colour.** #2a2c31 is used for SourceMat, PageCrop and the phone camera but is not in the token list. Proposed `color.mat`.
4. **Highlight colours.** The ScanViewer highlight (`rgba(255,214,10,.42)`, edge #c99700) comes from the shared mock stylesheet and is not
   a token. Proposed `color.highlight`, `color.highlight-edge`. The lead should decide if a yellow highlighter fits the ink-and-vermilion
   palette or should become an ink outline.
5. **Type role mapping (§2.7).** Assumed from the CSS; 01-design-tokens.md must confirm sizes per role, especially type.heading (20px in
   leaves, 22px in sheets and the review desk, 24px for hangar names).
6. **SectionTab height rule (§3.4).** The √n weighting and the 300px cap are a proposal; 03-information-architecture.md may define counts
   differently.
7. **Planned visit (§4.7). Resolved:** named `planned` to match 09's visit states; solid stroke with leaf-2 fill (10-line-map.md §2, §6).
8. **Responsive collapse of the spread (§3.11).** The 1180px and 900px thresholds and the mat-as-drawer behaviour under 900px are proposals;
   04-web-screens.md owns them.
9. **Phone DueRow mark (§5.8).** This file adds the compact StatusMark before the state word in phone rows (the mockup shows the word only
   for due soon). Confirm with 06-mobile-screens.md.
10. **Copy differences between platforms. Resolved** in 12-copy-and-voice.md §7: the review outcome is "Confirm 1178.2" on the web and
    "Looks right" on the phone sheet (both announce "Confirm reading, 1178.2"); "Mark done" and "Save flight" are different actions and stay.
11. **Squawk severity "Ground". Resolved:** kept as the owner's own label (12-copy-and-voice.md §3); the app never turns it into a verdict.
12. **Dark appearance. Resolved:** a dark theme ships (01-design-tokens.md §3, 13-build-plan.md phase 6) and follows the system setting
    with an override in Settings › Appearance. Scanned pages are never inverted. Until phase 6, native apps may pin light appearance.
13. **Single-letter shortcuts. Resolved:** 11-accessibility-and-motion.md §4 owns the master list and the Settings toggle.
14. **Motion values.** Durations are referenced to 11-accessibility-and-motion.md; the few fixed values here (tooltip 150 ms delay, skeleton
    300 ms delay, toast 6 s and 10 s, stepper repeat 400 ms) should be checked there.
15. **Web below 900px.** Whether the web shows phone components (PhoneTabBar, PhoneHeader) at small widths or keeps a compact rail is not
    decided here.
