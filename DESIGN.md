---
name: MyTailLog
description: Aircraft logbook digitizer and maintenance tracker, drawn as a dark glass-cockpit instrument panel.
colors:
  accent: "#5aa9ff"
  accent-soft: "#16324e"
  annunciator-green: "#43d38a"
  annunciator-amber: "#f4b13c"
  annunciator-red: "#ff6156"
  night-bg: "#0a0d13"
  panel: "#111823"
  panel-2: "#161f2b"
  raise: "#1c2836"
  line: "#232f3e"
  line-2: "#33475a"
  ink: "#e9eef5"
  dim: "#94a3b6"
  faint: "#5d6b7d"
  book-avionics: "#b98cff"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "27px"
    fontWeight: 600
    lineHeight: 1
  title:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0.1px"
  body-dense:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.16em"
  readout:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontFeature: "'tnum' 1"
rounded:
  sm: "6px"
  control: "9px"
  md: "8px"
  panel: "12px"
  pill: "9999px"
spacing:
  gutter: "24px"
  page-y: "32px"
  panel: "20px"
  row: "8px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.night-bg}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  input:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.control}"
    padding: "8px"
  nav-item-active:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: MyTailLog

## Overview

**Creative North Star: "The Glass Cockpit"**

MyTailLog looks like a modern avionics display read at night: a near-black panel, quiet blue-grey type, monospaced readouts for every number, and color that appears only when something needs attention. The owner glances at it the way a pilot scans a primary flight display. What's due is found in a second, and nothing decorative competes with it.

The system is dense and flat. Panels are separated by hairline borders rather than shadows, type sits at 10 to 13.5px for working screens, and a faint 44px instrument grid with one soft accent glow sits behind everything. Status colors borrow from annunciator lights (green, amber, red) and mean the same thing everywhere. The sky-blue accent marks the one primary action and the current place in the navigation.

On screen the web app is dark only. Print re-points the same tokens to a light ramp so summaries and dossiers come out as clean paper. The mobile app follows the same tokens and adds a light theme.

**Key Characteristics:**
- Dark only on screen; light only for print (and the mobile app's light theme).
- Flat, bordered panels; depth comes from tonal steps, not shadows.
- Every number (tach, hobbs, hours, dates, counts) in a tabular monospaced readout.
- Annunciator colors reserved for status; the accent reserved for action and location.
- Small, precise working type; one display face for headings.

## Colors

A night-panel ramp of blue-greys, one sky-blue accent, and three annunciator lights.

### Primary
- **Cockpit Sky Blue** (accent): the primary button fill, links, focus borders, the active nav item's ident, and the accent glow in the page backdrop. One per view for actions.
- **Deep Sky Wash** (accent-soft): count badges and selected states; the accent's quiet companion.

### Secondary
- **Annunciator Green** (annunciator-green): current, done, confirmed, healthy.
- **Annunciator Amber** (annunciator-amber): due soon, needs review, warnings.
- **Annunciator Red** (annunciator-red): overdue, errors, destructive actions.

Each light has a 12% wash (`rgba(…, 0.12)`) for tinted backgrounds behind status text.

### Tertiary
- **Logbook colors**: each logbook type keeps one color across timelines and coverage bars: airframe uses the accent blue, engine amber, prop green, avionics **Avionics Violet** (book-avionics), other the dim grey.

### Neutral
- **Night Sky** (night-bg): the page background, behind the instrument grid.
- **Panel** (panel): the base surface for cards and sections.
- **Panel Step** (panel-2): inputs, hover rows, chips, the top of raised panels.
- **Raise** (raise): the highest tonal step, for menus and pressed states.
- **Hairline** (line) and **Strong Hairline** (line-2): borders and dividers; line-2 for dots and emphasized edges.
- **Ink** (ink): headings and primary text.
- **Dim** (dim): body copy and secondary text.
- **Faint** (faint): labels, metadata, empty states.

### Named Rules
**The Annunciator Rule.** Green, amber and red mean status and nothing else. Never use them for decoration, branding or categories.

**The One Accent Rule.** The sky-blue accent marks the primary action and where you are. If two things on a screen are accent-filled, one of them is wrong.

## Typography

**Display Font:** Space Grotesk (with sans-serif)
**Body Font:** Instrument Sans (with system-ui)
**Label/Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** A slightly technical grotesk for headings over a neutral, readable UI sans, with a monospaced face for every number, like the labels and readouts on an instrument panel.

### Hierarchy
- **Display** (600, 27px, line-height 1): page titles (`h1`) on every app page.
- **Title** (600, 15–17px): section and panel headings, sheet titles.
- **Body** (400, 13.5px, line-height ~1.6): intro paragraphs and readable copy; keep to roughly 65ch (`max-w-xl`/`max-w-2xl`).
- **Body dense** (400, 12–13px): list rows, tables, forms.
- **Label** (10px, uppercase, 0.16em tracking, faint): the eyebrow above titles, stats and sections.
- **Readout** (JetBrains Mono, 11–12px, tabular numerals): tach, hobbs, hours, dates, counts and IDs.

### Named Rules
**The Readout Rule.** If it is a number someone compares (hours, dates, counts), it is set in the monospaced readout with tabular figures.

## Layout

Pages are a single centered column with a 24px side gutter and 32px top and bottom padding. Width follows the job: `max-w-3xl` for guided flows and forms, `max-w-4xl` for documents like the summary and record room, `max-w-5xl` to `max-w-6xl` for overviews and dashboards. Inside, panels stack or sit in simple 2–4 column grids (`md:grid-cols-3`, `sm:grid-cols-4`) that collapse to one column on phones. Rows inside panels use 8–10px vertical padding with hairline dividers.

Aircraft pages sit inside a left sidebar shell grouped by task (Status, Log, Records, Workflows, Manage). On small screens it collapses to a top bar.

## Elevation & Depth

The system is flat. Depth comes from tonal steps (night-bg → panel → panel-2 → raise) and 1px hairline borders, not from shadows. The only box-shadows are motion cues: the pulsing accent ring on a "pin" marker, and focus outlines.

### Named Rules
**The Hairline Rule.** Separate surfaces with a 1px border in line, or a tonal step. Don't add drop shadows to cards.

## Shapes

Corners are gently rounded and get smaller as elements get smaller: 12px on panels and cards, 9px on primary and secondary buttons, 6–8px on inputs, nav items and rows, and full pills for chips and status dots. Status dots are 8px circles. There are no sharp corners and no decorative shapes.

## Components

### Buttons
Precise and quiet: one filled action per view, everything else outlined or text.
- **Shape:** gently rounded (9px).
- **Primary:** sky-blue fill with night-sky text, 13.5px semibold, 10px × 16px padding. Hover drops to 90% opacity; disabled to 50%.
- **Secondary:** transparent with a hairline border and dim text that brightens to ink on hover.
- **Text actions:** accent-colored links ("Copy", "Open ↗", "Set the annual date →") for in-row actions; red text for destructive ones (Revoke, Delete).

### Chips
- **Style:** pill, transparent, 1px strong hairline (line-2) border, dim 12.5–13px text, 4px × 12px padding.
- **State:** interactive chips brighten to an accent border and ink text on hover.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** panel; the "raised" variant fades from panel-2 at the top to panel.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px hairline.
- **Internal Padding:** 20px.

### Inputs / Fields
- **Style:** panel-2 fill, 1px hairline border, 6px radius, 8px × 12px padding, ink text.
- **Focus:** the border switches to the accent; no glow.
- **Error / Disabled:** errors are red text below the field (with `role="alert"`); disabled controls drop to 50% opacity.

### Navigation
- **Style:** the aircraft sidebar lists items in 13px dim text under 10px uppercase group labels. Each item leads with a 3-letter waypoint-style ident in 10px mono (the "ident" chip).
- **Hover:** a faint panel wash and ink text.
- **Active:** panel-2 background, a strong-hairline border, ink text, the ident turned accent, and `aria-current="page"`. Count badges sit at the right in the readout face (accent-soft for counts, amber wash for items needing attention).
- **Tabs** inside a page (record room, hubs) are 13px text links; the current tab gets the panel-2 background and ink semibold text.

### Status Row (signature)
The core pattern of the product: an 8px annunciator dot, the item label in 13px, and the due readout right-aligned in the monospaced face ("Mar 31, 2027", "12.4 hrs"). Rows are divided by hairlines and the whole row links to the page that manages it.

### Coverage Bar (signature)
One horizontal bar per logbook, in that logbook's color, spanning first to last dated entry on a shared year axis, with gaps of 24+ months cut out of it. It shows at a glance which years of the records are digitized.

## Do's and Don'ts

### Do:
- **Do** keep the web app dark on screen and let the print styles re-point tokens for paper.
- **Do** set every hour, date and count in the JetBrains Mono readout with tabular figures.
- **Do** use the annunciator dot plus text for status, so color is never the only signal.
- **Do** separate panels with 1px hairlines (line) and tonal steps.
- **Do** keep working type between 10px and 13.5px and headings in Space Grotesk.

### Don't:
- **Don't** use green, amber or red for anything but status.
- **Don't** fill more than one action per view with the accent.
- **Don't** add drop shadows, glows or gradients to cards and buttons.
- **Don't** introduce a light theme on the web screen.
- **Don't** add a fourth typeface; display, UI and mono cover every role.
