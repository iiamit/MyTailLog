# 11 · Accessibility and motion

The owners MyTailLog serves are often over 50, often outdoors or in a dim hangar, often wearing reading glasses they left in the car. Accessibility here is the main design constraint, not a compliance pass. Target: **WCAG 2.2 AA everywhere, AAA for body text contrast where the palette allows**, plus the platform guidelines (Apple Human Interface Guidelines, Material 3 accessibility) on the native apps. This file sets the rules; each screen spec (04, 06) states its own focus order and names, and 10-line-map.md §10 covers the map.

Contents: 1 Baseline · 2 Text and contrast · 3 Targets and reach · 4 Keyboard (web) · 5 Screen readers · 6 Forms and errors · 7 Scanned pages and the paper voice · 8 Colour, status and the map · 9 Outdoor and night use · 10 Cognitive load · 11 Motion · 12 Haptics and sound · 13 Testing · 14 Acceptance criteria

## 1. Baseline
- Web: semantic HTML first (`nav`, `main`, `header`, `button`, `a`, `table`, `dialog`), ARIA only where no element exists (tabs, composite map, combobox, live regions). Every page has one `h1` (the BoardHead title) and a skip link "Skip to the board" as the first focusable element.
- iOS: SwiftUI with accessibility labels, values, hints and traits on every custom view; supports VoiceOver, Voice Control, Switch Control, Full Keyboard Access, Dynamic Type to AX5, Bold Text, Increase Contrast, Reduce Transparency, Reduce Motion, Smart Invert (scanned pages opt out with `accessibilityIgnoresInvertColors`).
- Android: Compose with `semantics` on every custom element; supports TalkBack, Switch Access, Voice Access, font scale to 200% (non-linear scaling, Android 14+), high-contrast text, remove animations, physical keyboards and mice on tablets and Chromebooks.
- Supported widths: web 320 to 2560 CSS px (reflow at 400% zoom without horizontal scroll, except the scanned page viewer and the map, which pan in their own region); phones from 320pt (iPhone SE) and 360dp; tablets in both orientations and split view.

## 2. Text and contrast
| Rule | Value |
|---|---|
| Minimum text size | 13px web / 13pt phone. Exceptions at 12, weight ≥ 600, contrast ≥ 4.5:1: map ticks, the phone tab label, KeyHint chips, count badges and the "first" badge (14-decisions.md A4) |
| Body text | 16px web; iOS `.body` text style (17pt at the default size); Android `bodyLarge` 16sp |
| Text contrast | ≥ 4.5:1 for all text, ≥ 7:1 for body text on leaves (ink #15171b on #fff is 18:1; ink-3 #636973 on #fff is 5.6:1, so ink-3 is never used for body text, only secondary labels) |
| Non-text contrast | ≥ 3:1 for component boundaries, focus rings, status marks, map lines against the leaf, input borders (rule-2 #b8bab4 is 1.96:1 and is decorative only; controls use color.control-border #7d828a, 3.87:1; alarm-coloured text uses color.alarm-text #c42e15) |
| Text on section boards | Use each section's on-board token (01-design-tokens.md); Logbooks yellow uses dark text #1c1600; all others white at 92% |
| Line height | ≥ 1.5 for body, ≥ 1.25 for headings; paragraph spacing ≥ 1.5× font size |
| Line length | ≤ 72 characters for prose on leaves |
| Text spacing override | Layout must survive WCAG 1.4.12 overrides (letter 0.12em, word 0.16em, line 1.5) without clipping |
| Truncation | Never truncate an entry title, an item name, a due date or a status word. Wrap. Truncate only file names, with the full name in the accessible name and a tooltip |

Dynamic Type and font scale: all phone text uses text styles (06-mobile-screens.md maps every label). At accessibility sizes, two-column rows (label left, value right) stack into one column, the due table's columns become a stacked card per row, and the tab bar labels may hide on iOS (system behaviour) but the large content viewer must show them.

## 3. Targets and reach
- Web: interactive targets ≥ 24×24 CSS px with spacing (WCAG 2.5.8), and ≥ 40×40 for primary actions, rail tabs and table row actions. Map elements have a 24px hit target regardless of drawn size.
- iOS ≥ 44×44pt; Android ≥ 48×48dp. Map stops and rings use expanded hit areas; when two hit areas overlap, the nearer centre wins and a disambiguation sheet appears if within 6pt of both.
- Thumb reach (phone): primary actions sit in the bottom third (AddButton, sheet buttons, Review desk's Confirm). No primary action only in the top bar. Destructive actions never sit where the thumb rests for the primary action.
- Gloves and cold: the camera shutter and the "Log a flight" stepper buttons are 64pt / 64dp.
- Dragging is never the only way (WCAG 2.5.7): the DateScrubber has a date field and arrow buttons; reordering lists has Move up / Move down actions; map range selection has From/To fields; the crop handles on scans have a "Fit to page edges" button and numeric nudges.

## 4. Keyboard (web)
- Everything operable by keyboard; no keyboard traps; visible focus on every focusable element: the double ring from 02-components.md §2 (2px `color.focus-inner` inside 2px `color.focus`), which meets 3:1 on leaves, the cover and every section board.
- Focus order follows reading order: skip link → aircraft switcher → rail tabs (in order) → rail foot → board head → spine → sub-tabs → left leaf → right leaf.
- Rail: a `nav` with links (not ARIA tabs, since each is a page). Sub-tabs inside a board are links too (each has its own URL), in a `nav` labelled with the section name, the current one marked `aria-current="page"`.
- Global shortcuts (the routed table with scopes is in 03-information-architecture.md §8; shown in a "Keyboard shortcuts" sheet on `?`, every shortcut has a visible menu equivalent, single-character shortcuts can be turned off in Settings › Accessibility per WCAG 2.1.4):
| Keys | Action |
|---|---|
| `/` | Focus search |
| `g` then `s` / `l` / `m` / `a` / `d` / `h` | Go to Status, Logbooks, Maintenance, Aircraft, Documents, Share |
| `n` | New (opens the Add menu: log flight, add entry, scan pages, add squawk) |
| `?` | Show shortcuts |
| Review desk: `Enter` | Confirm field and move to next |
| Review desk: `j` / `k` | Next / previous field |
| Review desk: `Ctrl/⌘ + Enter` | Confirm entry |
| Review desk: `e` | Edit the focused field |
| Review desk: `[` / `]` | Previous / next page |
| Review desk: `a` / `x` | Confirm the field as read / mark it not on this page |
| Review desk: `Shift + Enter` | Confirm the page and go to the next (works inside inputs) |
| `Ctrl/⌘ + K` | Same as `/`, works inside inputs |
| `g` then `t` | Go to the hangar |
| `j` / `k` (lists) | Next / previous row in the focused table; the right leaf follows |
| `m` | Mark done for the selected due row or open item |
| `[` / `]` (entry) | Previous / next stop on this line |
| Scan viewer: `+` / `−` / `0` | Zoom in / out / fit |
| Map | see 10-line-map.md §10 |
- Dialogs and sheets: focus moves to the dialog's heading on open (destructive confirmations focus the safe action, "Cancel" or "Keep …"), is trapped inside, returns to the invoking control on close; Esc closes unless there are unsaved changes, in which case it asks.
- Tables (due table, entries, queue): real `<table>` with `<th scope>`; row actions are buttons inside cells; clicking a row is a convenience, the row's first cell is a link.

## 5. Screen readers
- Names come from visible text. Icon-only buttons have names ("Open the scanned page", not "View").
- Status is announced as words: "Annual inspection, due soon, due December 31, first limit calendar, 43 days left". StatusMark exposes its word; TrustMark exposes "read by AI, not yet confirmed" / "confirmed by you" / "signed by a mechanic".
- The Verdict is an `h2` directly after the board title and is the first thing read.
- Live regions: sync state ("3 changes waiting to sync"), AI reading progress ("Reading page 4 of 12"), toasts (polite), errors (assertive, only for blocking errors). Never announce more than once per 5 seconds for progress.
- Paper voice: transcribed text is wrapped in an element with `lang` set if known and a description prefix "Logbook says:" for screen readers, so owners hear the difference between the record and the app's conclusion (visually carried by Literata).
- PageCite: "Airframe logbook, volume 2, page 41, opens the scanned page".
- iOS rotors: Headings, Links, plus custom rotors on Status ("Due items"), Logbooks ("Entries", "Unconfirmed"), Review desk ("Fields to check"). Android: headings via `semantics { heading() }`, custom actions on rows (Confirm, Open page, Snooze) so TalkBack users never need to swipe to reveal.
- Charts and maps always have a list alternative (10-line-map.md §10).

## 6. Forms and errors
- Every input has a persistent visible label (never placeholder-only); hints sit under the label, not inside the input.
- Hours fields: numeric keypad with decimal (`inputmode="decimal"`, iOS `.decimalPad`, Android `KeyboardType.Decimal`), accept comma or point, unit shown as a suffix inside the field ("h").
- Dates: native date pickers on phones; on the web a text field accepting "12/31/2026", "Dec 31 2026", "2026-12-31" with a calendar button; the parsed date is echoed below the field ("Thursday, December 31, 2026").
- Validation on blur and on submit, never on each keystroke. Error text under the field, in alarm colour with an alert icon and the word "Error:" for screen readers; the field gets `aria-invalid` and `aria-describedby`. On submit with errors, focus moves to an error summary at the top of the form listing each error as a link.
- Plausibility warnings (not errors): a tach reading lower than the last one, a date in the future, a value 10× the usual — shown as a quiet note with "Use it anyway", never blocking (the owner knows their aircraft; meters get replaced).
- Unsaved changes: forms keep a draft locally (web: sessionStorage per form; phones: local DB) and restore it with a notice "Restored your unsaved draft from 10:42".
- Time limits: none, except one-time codes (with a resend). Sessions do not expire mid-form; on expiry the form is preserved and the owner signs in again in a sheet.

## 7. Scanned pages and the paper voice
- Scanned pages are images of handwriting; their accessible alternative is the transcription. ScanViewer exposes "Scanned page 41 of the airframe logbook, 6 entries, transcription available" and a "Read transcription" button that moves focus to the transcribed entries.
- Highlight of the source ink (the box around the words an entry came from) is drawn in the section ink at 2px plus a 20% fill, and announced ("highlighted: entry dated Aug 22, 2011").
- Zoom: pinch, double-tap, keyboard `+`/`−`, and a zoom slider; maximum 600%. Contrast boost toggle ("Enhance faded ink") applies a curve filter for faded pencil; it never alters the stored scan.
- The Review desk lets owners confirm by field with the page zoomed to the field's region automatically, so a low-vision owner does not hunt across the page.

## 8. Colour, status and the map
- Never colour alone: StatusMark shapes (dot, ring, solid, dashed ring) plus the word; TrustMark shapes (dotted, filled, diamond); map lines identified by lane position and name; section identity by tab label and position, not only colour.
- The palette is tested for protanopia, deuteranopia and tritanopia: the four logbook inks remain distinguishable in lightness steps (01-design-tokens.md shows the luminance of each); if a pair fails for a user, the map's list view and line names carry identity.
- Increase Contrast (iOS) / high-contrast (Android) / `prefers-contrast: more` (web): ink-3 becomes ink-2, rules become rule-2 → ink-3, board colours darken one step, focus rings thicken to 3px, the dashed "no record" ring becomes a dashed ring with a "?" glyph inside.
- Windows High Contrast / `forced-colors: active`: use system colours; status marks keep their shapes (use `currentColor`), the map draws in CanvasText with dash patterns intact.

## 9. Outdoor and night use
- Outdoor: both themes hold up in sun; the light theme is the design reference and the default when the system is light. The phone's Status hero (Verdict + next due) uses 22pt semibold minimum. No information depends on thin 1px lines.
- Night hangar: the dark theme (01-design-tokens.md) follows the system setting, overridable in Settings › Appearance (Match system, Light, Dark; default Match system). The camera screen is always dark. Scanned pages are never inverted in the dark theme; they sit on the dark mat as they do in light.
- Glare-proof scanning: the camera shows a live "Too dark", "Glare on the page", "Hold steady" coach with words and icons, not colour.

## 10. Cognitive load
- One primary action per view (00-product-principles.md §4.4).
- Consistent placement: the Verdict at the top, the page on the right (or one tap away), the add button bottom right on phones.
- No jargon beyond the owner's vocabulary; terms like "interchange" and "record room" have a first-use explanation (a one-line hint, dismissible, remembered per user).
- Undo instead of confirm wherever the action is reversible (archive an entry, snooze an item, remove a photo): a toast with "Undo" (6 s without an action, 10 s with one, 20 s when a screen reader is running; pauses while hovered or focused; F6 reaches it — 02-components.md §8.1). Irreversible actions (delete aircraft, revoke a record room link, delete scans) confirm with a dialog naming exactly what will happen.
- Progress is shown in plain numbers: "Read 34 of 120 pages. About 2 days left at the daily allowance."
- Errors say what happened and what to do: "Couldn't read this page. The photo is too blurry. Retake it, or type the entry yourself."

## 11. Motion
Motion explains where something came from and where it went. It is short, it never loops, and it never delays input.
### 11.1 Tokens
| Token | Value | Use |
|---|---|---|
| motion.duration-fast + ease-out | 120ms, ease-out [0.2,0.8,0.2,1] | Hover, press, focus, selection rings, toggles, chip changes |
| motion.duration-base + ease-in-out | 200ms, ease-in-out [0.45,0,0.25,1] | Leaf swaps, sub-tab panel changes, sheet/dialog open, map zoom, scrubber snap |
| motion.duration-slow + ease-in-out | 320ms, ease-in-out | Board colour change between sections, first appearance of the line ahead |
| Native | iOS: `.snappy` / `.smooth` springs (duration 0.25–0.35, bounce 0); Android: `spring(dampingRatio = 1f, stiffness = Spring.StiffnessMediumLow)` and Material motion tokens | Use platform defaults for navigation push/pop, sheets, tab switches |
### 11.2 Choreography
| Moment | Web | iOS | Android |
|---|---|---|---|
| Change section (rail tab) | Board background cross-fades to the new section colour (slow); leaves fade+rise 8px (base); the spine's window slides to its new range (base) | Tab switch: system (no animation between tabs); section colour applies instantly | Navigation bar switch: fade through (Material) 200ms |
| Open a record from a list | Right leaf content cross-fades (base); the scanned page fades in when loaded, never a layout jump (reserve its box) | Push navigation; on iPad split view the detail column cross-fades | Shared-axis X transition; list-detail pane on tablets |
| Select a map element | Selection ring scales from r to r+4 (fast); the right leaf swaps (base) | Ring scales (snappy); sheet rises (system) | Same with spring |
| Confirm a field (Review desk) | Field's TrustMark morphs dotted → filled (fast), row slides up by its height (base) to bring the next field into place | Same, plus success haptic | Same, plus confirm haptic |
| Confirm an entry | Leaf content slides left 24px and fades (base), next entry comes in from the right; the page's progress bar advances | Same, using matchedGeometryEffect for the progress bar | Same, AnimatedContent |
| Due status changes (sync arrives) | No animation on the mark; a quiet "Updated just now" note appears in the board head for 4 s | Same | Same |
| Toast | Rises 12px and fades in (base), leaves by fading (fast) | System-style banner from the top or a bottom toast above the tab bar | Snackbar |
| Sheet / dialog | Fade backdrop + rise 16px (base) | System sheet with detents | ModalBottomSheet |
| Loading | Skeleton blocks in leaf-2, no shimmer; a progress line for known progress | Redacted placeholders (`.redacted(reason: .placeholder)`) | Placeholder blocks |
| Camera capture | Shutter flash 80ms white overlay at 60%; captured thumbnail flies to the queue counter (base) | Same with haptic | Same |
| AI reading in progress | Page thumbnails get a thin progress line; no spinners on individual entries; never animated "AI sparkles" | | |
### 11.3 Rules
- Nothing animates for longer than 320ms except progress that tracks real work.
- No parallax, no scroll-jacking, no bouncing, no confetti, no looping or attention-seeking animations; the overdue ring does not pulse.
- Animations never block input; a second click during a transition goes to the destination.
- Animate `opacity` and `transform` only on the web; never animate layout properties of large regions.
- Reduced motion (`prefers-reduced-motion: reduce`, iOS Reduce Motion, Android remove animations / animator duration scale 0): replace movement with instant changes or a 120ms cross-fade; the map zooms instantly; the shutter flash is replaced by a border flash; no flying thumbnails.
- Reduce Transparency: sheets and bars become opaque.

## 12. Haptics and sound
- iOS: `.success` on entry confirm and on a flight logged; `.selection` on scrubber detents (monthly) and segmented control changes; `.warning` when a save fails; `.impact(.light)` on shutter. Android: `HapticFeedbackConstants.CONFIRM`, `CLOCK_TICK` for scrubber, `REJECT` on failure, `VIRTUAL_KEY` on shutter.
- Haptics respect the system setting and an in-app toggle (Settings › Accessibility › Haptics).
- No sounds except the system camera shutter where the platform requires it.

## 13. Testing
- Automated: axe-core in Playwright on every web screen in light, dark and forced-colours; jest-axe on components; iOS `XCUIApplication().performAccessibilityAudit()` in UI tests; Android Accessibility Test Framework checks in Espresso/Compose tests (`enableAccessibilityChecks`).
- Manual per release: keyboard-only pass on the web's top 10 flows (07-flows.md); VoiceOver (macOS Safari, iOS) and NVDA (Windows Firefox/Chrome) passes on Status, Review desk, Logbooks › Map list view, record room; TalkBack pass on Android; 200% / AX5 text pass on phones; 400% zoom reflow on web; reduced motion pass.
- Usability check with three owners over 60 before each major release, including one with a vision impairment, on the phone outdoors.
- Contrast checks against tokens are automated (a unit test computes every text/background pair declared in tokens.json and fails below 4.5:1).

## 14. Acceptance criteria
- [ ] axe reports zero serious or critical violations on every web screen in light and dark.
- [ ] iOS accessibility audit and Android ATF checks pass on every screen.
- [ ] Every interactive element is reachable and operable by keyboard (web), Full Keyboard Access (iPad) and Switch Access (Android).
- [ ] At AX5 / 200% font scale no text is clipped or overlapped and no action becomes unreachable.
- [ ] Every status, trust level and map element is announced with its word, date and source.
- [ ] Every drag interaction has a non-drag alternative.
- [ ] Reduced motion removes all movement animations on all three platforms.
- [ ] Every scanned page has a reachable transcription.
- [ ] Focus is never lost after a dialog closes, an item is confirmed, or a list re-sorts.
