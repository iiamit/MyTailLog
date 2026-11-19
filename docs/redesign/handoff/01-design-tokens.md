# 01 · Design tokens

> The machine-readable tokens now live at `packages/shared/tokens/tokens.json` (moved there at phase 0, 13 §3). Generated outputs: `apps/web/src/ui/tokens.css`, `apps/ios/MyTailLog/DesignSystem/Tokens.swift`, `apps/android/core-design/src/main/kotlin/com/mytaillog/design/Tokens.kt` (`node packages/shared/scripts/build-tokens.mjs`; `--check` in CI).

The complete visual vocabulary of direction D: colour (light and dark), type, space, size, radius, elevation, iconography and the logbook inks used by the map. The machine-readable copy is `tokens.json` in this folder (W3C Design Tokens format); generate CSS custom properties, a Swift `enum`/`Color` asset catalog and a Compose `object` from it rather than retyping values. The mockups' CSS (`docs/redesign/b/system.css`, `d/system.css`) uses the same values under short names; the mapping is given in §9.

Contents: 1 Colour roles · 2 Light palette · 3 Dark palette · 4 Logbook inks · 5 Typography · 6 Space and layout · 7 Radius, borders, elevation · 8 Icons · 9 Mockup CSS mapping · 10 Rules · 11 Platform notes

## 1. Colour roles
| Role | What it paints | Never used for |
|---|---|---|
| cover | The rail (web), phone tab-bar ground, the dark mat behind scanned pages | Text on leaves |
| leaf / leaf-2 | Working surfaces; leaf-2 for wells, selected rows, table heads | Boards |
| ink / ink-2 / ink-3 | Text and drawn marks on leaves. ink-2 secondary text, ink-3 meta text and labels | Large fills |
| rule / rule-2 | Dividers (rule) and control borders (rule-2) | Text |
| section.* | One hue per tab and the board of the open section | Status, logbook lines, buttons on leaves (except `hue` button) |
| section-ink.* | That section's hue darkened for text and links on a white leaf | Status |
| on-section.* | Text on a section board | — |
| alarm | Overdue (solid), due soon (ring), errors, destructive confirm | Decoration, branding, anything not urgent |
| line.* | The four logbook inks on the map, LineChips and logbook-scoped citations | Status, sections |

Green and amber are not part of the palette. Status is ink plus vermilion.

## 2. Light palette (default)
| Token | Hex | Contrast notes |
|---|---|---|
| color.cover | #17191e | on-cover 15.8:1 |
| color.cover-2 | #24272e | Rail buttons |
| color.on-cover | #f2f1ec | |
| color.on-cover-2 | #a9adb6 | 7.8:1 on cover |
| color.mat | #2a2c31 | The SourceMat behind scans (slightly lighter than cover so the page edge reads) |
| color.leaf | #ffffff | |
| color.leaf-2 | #f4f4f1 | |
| color.ink | #15171b | 18.1:1 on leaf |
| color.ink-2 | #454a52 | 9.0:1 |
| color.ink-3 | #636973 | 5.5:1 on leaf, 5.0:1 on leaf-2 |
| color.rule | #d9dad5 | |
| color.rule-2 | #b8bab4 | Decorative borders only (1.96:1 on leaf: never the boundary of a control) |
| color.control-border | #7d828a | Edges of inputs, selects, checkboxes, radios, toggles, secondary buttons (3.87:1 on leaf, 3.51:1 on leaf-2) |
| color.alarm | #dd3418 | 4.6:1 on leaf; white text on alarm 4.6:1 |
| color.alarm-bg | #fde9e4 | Soft alarm slip; text #7a1707 (on-alarm-bg) on it |
| color.alarm-text | #c42e15 | Alarm-coloured text: due-soon words, field errors (5.6:1 on leaf, 4.79:1 on alarm-bg). color.alarm is for marks and fills, not text |
| color.highlight | rgba(255,214,10,.42), edge #c99700 | Highlighter over source ink on scanned pages (both themes) |
| color.focus / focus-inner | #15171b / #ffffff | Double focus ring: 2px focus-inner inside 2px focus, visible on every surface including the yellow Logbooks board (02-components.md §2) |

Sections (board fill, text on board, text-on-leaf ink):
| Section | color.section | color.on-section | color.on-section-2 | color.section-ink |
|---|---|---|---|---|
| status | #2a3dbe | #ffffff | rgba(255,255,255,.92) | #2a3dbe |
| books (Logbooks) | #edbb1b | #1c1600 | rgba(28,22,0,.72) | #7a5c00 |
| maint (Maintenance) | #0b6b6a | #ffffff | rgba(255,255,255,.92) | #0b6665 |
| aircraft | #2f7533 | #ffffff | rgba(255,255,255,.92) | #2c6e30 |
| docs (Documents) | #85491f | #ffffff | rgba(255,255,255,.92) | #824a22 |
| share | #6b44b8 | #ffffff | rgba(255,255,255,.92) | #5a36a3 |
| setup (sign-in, onboarding, camera) | #3a3f46 | #ffffff | rgba(255,255,255,.92) | #3a3f46 |
White text on every section except books passes 5.6:1 or better; books uses dark text (10.1:1).

## 3. Dark palette (night hangar; phone follows the system setting, web offers Light, Dark, Match system)
Dark is not an inversion. Leaves become a warm charcoal, boards darken one step, and the scanned page stays a scanned page.
| Token | Hex |
|---|---|
| color.cover | #0d0e11 |
| color.cover-2 | #1a1c21 |
| color.on-cover | #eceae4 |
| color.on-cover-2 | #9ba0a9 |
| color.mat | #0b0c0e |
| color.leaf | #1c1e23 |
| color.leaf-2 | #24272d |
| color.ink | #eceae4 (13.9:1) |
| color.ink-2 | #c4c7cd |
| color.ink-3 | #9ca1aa (6.4:1 on leaf) |
| color.rule | #33363d |
| color.rule-2 | #4a4e57 |
| color.control-border | #6b7079 (3.35:1 on leaf) |
| color.alarm-text | #ff7357 |
| color.alarm | #ff7357 (6.2:1 on leaf); text on alarm fill #1a0a06 |
| color.alarm-bg | #3a1d17; text on it #ffb3a3 |
| color.focus / focus-inner | #eceae4 / #1c1e23 |
| Sections | status #2433a3 · books #c99a0e (text #1c1600) · maint #0a5f5e · aircraft #296a2d · docs #784119 · share #5d3aa3 · setup #2c3036; on-section white except books |
| Section inks on dark leaf | status #9aa6ff · books #e6c25a · maint #5fc9c6 · aircraft #7cc982 · docs #e0a27a · share #b9a0f0 |
Scanned page images are never tinted or inverted in dark mode. The highlight over ink keeps its light-mode yellow (see 02-components.md, ScanViewer).

## 4. Logbook inks (the map)
| Token | Light | Dark | Logbook |
|---|---|---|---|
| color.line.airframe | #23318f | #9aa6ff | Airframe (all volumes) |
| color.line.engine | #a8326b | #f08cbc | Engine |
| color.line.propeller | #4a4f57 | #c3c7ce | Propeller |
| color.line.avionics | #0f7fa6 | #5ccbe9 | Avionics |
| color.line.other | #8a8f97 | #8a8f97 | Other (W&B sheets, 337s, misc) |
All inks pass 4.5:1 on leaf in both themes, so they can be used for the line name labels. Twin-engine aircraft (future): engine 2 uses #c45f8f light / #f7b0d2 dark and the same dashed pattern rules.

## 5. Typography
Two families, loaded from Google Fonts on the web and bundled in the native apps (both are under the SIL Open Font License):
- **font.app: Libre Franklin** (400, 500, 600, 700, 800). The app's voice: every label, control, heading and number.
- **font.paper: Literata** (opsz 7–72; 400, 500, 700). Only text transcribed from a scanned page: entry narratives, quotes in answers, citation excerpts in documents, the PaperInput while editing a transcription.
- Numbers always use tabular figures (`font-variant-numeric: tabular-nums`; iOS `.monospacedDigit()`; Android `fontFeatureSettings = "tnum"`). No monospace face anywhere.

Web scale (px, line-height, weight):
| Role | Size / LH / weight | Used for |
|---|---|---|
| type.board-title | 30 / 1.1 / 800, letter-spacing -0.01em | Section name on the board ("Status") |
| type.lede | 22 / 1.35 / 400; lead phrase 800 | The Verdict sentence |
| type.heading | 20 / 1.25 / 800 | Leaf headings |
| type.section | 16 / 1.5 / 700 | HungSection headings in the margin column |
| type.body | 16 / 1.6 / 400 | Everything readable |
| type.body-strong | 16 / 1.4 / 700 | Row titles, values |
| type.small | 14 / 1.45 / 400 | Secondary lines under row titles |
| type.caption | 13 / 1.4 / 600 | Citations, LineChips, legends, meta |
| type.label | 13 / 1.2 / 700, colour ink-3 | Table column heads, field labels |
| type.paper | 17 / 1.6 / 400 Literata | Transcribed text |
| type.paper-small | 15 / 1.5 / 400 Literata | Transcribed excerpts inside rows |
| type.map | 13 / 1 / 600 (labels), 12 / 1 / 500 (axis ticks) | Text inside the map at rendered size |
| type.button | 15 / 1 / 700 (m), 14 / 1 / 700 (s) | Buttons |
| type.tab | 16 / 1.2 / 700 + 13 / 1.3 / 500 subline | SectionTab |
Minimum anywhere: 13px. Map text is specified at rendered size; when an SVG is scaled, compensate (see 10-line-map.md §7).

Phone scale (pt on iOS, sp on Android) and Dynamic Type mapping:
| Role | Default | iOS text style | Android type role |
|---|---|---|---|
| type.board-title | 28 / 800 | .largeTitle (custom font, weight heavy) | headlineMedium |
| type.lede | 20 / 400, lead 800 | .title3 | titleLarge |
| type.heading | 18 / 800 | .headline (scaled) | titleMedium |
| type.body | 16 / 400 | .body (scaled to 16) | bodyLarge |
| type.body-strong | 16 / 700 | .body bold | bodyLarge bold |
| type.small | 14 / 400 | .subheadline | bodyMedium |
| type.caption | 13 / 600 | .footnote | labelMedium |
| type.paper | 17 / 400 Literata | .body with Literata | bodyLarge Literata |
| tab label | 12 / 700 (the only exception to 13, inside a 50pt tab with an icon) | .caption2 | labelSmall |
All phone text scales with Dynamic Type / font scale up to the accessibility sizes; layouts must reflow (see 11-accessibility-and-motion.md).

## 6. Space and layout
Base unit 4. Tokens: space.1 = 4, space.2 = 8, space.3 = 12, space.4 = 16, space.5 = 20, space.6 = 24, space.7 = 28, space.8 = 32.
Web shell (desktop ≥ 1280 wide):
| Measure | Value |
|---|---|
| Rail width | 216px |
| Rail padding | 18px top, 14px left, 16px bottom; tabs stop 12px short of the board edge, the open tab runs flush into the board |
| SectionTab | min-height 50px; height proportional to section content (see 02-components.md) within 50–180px |
| Board padding | 0 22px 22px |
| BoardHead | min-height 70px; title baseline 14px above the board's top edge of the leaves |
| Spine | 52px tall (6px + 40px + 6px), 10px below it before the leaves |
| Leaves gap | 10px |
| Leaf split | left : right = 1.62 : 1 (records screens); 1 : 1 (review desk); single leaf (settings, forms) |
| Leaf padding | 26px top, 30px sides, 28px bottom (22–28 on dense screens) |
| HungSection | margin column 118–148px, gap 22px |
| Content measure | prose max 68ch |
| Table row | min-height 48px; cell padding 11px 12px 11px 0 |
Phone: screen margins 16pt/16dp; the PhoneLeaf sits 8pt in from the screen edges with radius.s top corners; row min-height 58pt; buttons 52pt tall; tab bar 50pt + safe area.
Tablet: list-detail at ≥ 700pt wide; three panes for review at ≥ 1000pt.

## 7. Radius, borders, elevation
| Token | Value | Used for |
|---|---|---|
| radius.s | 3px | Leaves, wells, slips |
| radius.m | 4px | Buttons, inputs, segmented controls, page thumbnails |
| radius.l | 5px | SectionTabs (left corners only on web; all corners on the phone's active tab) |
| radius.round | 50% | Status dots, stops, rings |
| border.hair | 1px rule | Row dividers |
| border.control | 1px control-border | Inputs, secondary buttons |
| border.strong | 2px ink | The rule under a HungSection's first group and under a phone group header |
Elevation: the system is flat. Leaves cast `0 1px 0 rgba(0,0,0,.25)` only. Phone bottom sheets use the platform's own sheet elevation. The AddButton on the phone casts `0 8px 18px -8px rgba(0,0,0,.7)`. No other shadows, no glows, no gradients (except the scanned page's own paper texture).

## 8. Icons
Lucide (web, v0.469 or later; stroke 2, 20px in rows, 16–18px in buttons, 22px in the phone tab bar). Native apps ship the same Lucide glyphs as vector assets (iOS asset catalog with preserved vector data, Android VectorDrawable) so the binder looks the same everywhere; platform symbols (SF Symbols, Material Symbols) only for chrome the OS draws or expects (share, system back, keyboard accessories, menus). See 02-components.md §2.6. Icons always accompany a word except in the phone tab bar and icon buttons with an accessible name. Never emoji or Unicode glyphs as icons.

## 9. Mockup CSS mapping
| Mockup custom property | Token |
|---|---|
| --cover, --cover-2, --on-cover, --on-cover-2 | color.cover … color.on-cover-2 |
| --leaf, --leaf-2, --ink, --ink-2, --ink-3, --rule, --rule-2 | same names under color. |
| --h-status, --h-books, --h-maint, --h-aircraft, --h-docs, --h-share | color.section.* |
| --board, --on-board, --on-board-2, --board-ink | the open section's color.section, on-section, on-section-2, section-ink |
| --alarm, --alarm-bg | color.alarm, color.alarm-bg |
| --l-air, --l-eng, --l-prop, --l-avi, --l-other | color.line.* |
| --f-app, --f-paper | font.app, font.paper |
| `.paper` class | type.paper |

## 10. Rules
1. Section hues fill boards and tabs only. On a leaf a section hue appears only as section-ink for links and as the `hue` button.
2. Logbook inks appear only on the map, LineChips, the logbook-coloured left key of PageCite, and the map legend.
3. Alarm appears only for overdue, due soon, errors and destructive confirmations.
4. The map is drawn on a leaf (white or dark charcoal), never on a coloured board.
5. Literata only for transcribed text. If the software wrote it, it is Libre Franklin.
6. Never put text below 13px or text contrast below 4.5:1 (3:1 for 24px+ bold and for non-text marks).

## 11. Platform notes
- **Web:** expose tokens as CSS custom properties on `:root` with `[data-theme="dark"]` and `prefers-color-scheme` overrides; section theming by a `data-section` attribute on the board container that remaps `--board*`. Tailwind is allowed if the theme reads these variables.
- **iOS:** an asset catalog with Any/Dark appearances for every colour token; a `Font` extension registering Libre Franklin and Literata with `relativeTo:` text styles; a `SectionTheme` environment value carrying the open section's colours.
- **Android:** a Material 3 `ColorScheme` is not enough on its own (it has no section or line roles); define a `MyTailLogColors` data class provided through a `CompositionLocal`, light and dark instances, and map the Material roles (surface = leaf, onSurface = ink, error = alarm, primary = ink) so stock components inherit sensible defaults.
