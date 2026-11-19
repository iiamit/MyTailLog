# 10 · The line map

The line map is direction D's signature: each logbook drawn as a line through time, entries as stops, a visit that signed several books as an interchange, missing years as a dashed gap, and the future dotted with what is due as rings. It appears in three sizes, all rendered by one component family from one derived data model: the **Spine** (a strip under every board head), the **RouteMap** (Logbooks › Map and every history view), and the **LineAhead** (Status, Plan ahead, Annual prep, the phone home, widgets). This file is the source of truth for the map's data model, scales, layout, drawing, labels, interaction, accessibility and rendering on web, iOS and Android. Component props and states are summarised in 02-components.md; the data and APIs that feed the map are in 09-data-and-api.md.

Contents: 1 Vocabulary · 2 Data model (MapModel) · 4 Scales and time axes · 5 Lanes and layout · 6 Drawing rules · 7 Labels · 8 The three sizes · 9 Interaction · 10 Accessibility · 11 Rendering per platform · 12 Performance · 13 Print · 14 Acceptance criteria · 15 Open questions

## 1. Vocabulary
| Term | What it is | Drawn as |
|---|---|---|
| Line | One logbook (Airframe, Engine, Propeller, Avionics). Volumes of the same logbook form one line. The Other logbook is not drawn (14-decisions.md M1). | 6px stroke in its logbook ink (color.line.*), round caps |
| Stop | One day in one logbook (the entries of that date in that book), confirmed or not | Circle on the line: leaf fill, ink stroke 2.5px, r = 5 (routine) or 9 (major) |
| Major stop | Overhaul, major repair or alteration (337), installation of equipment, replacement of engine or propeller, first entry of a book | r = 9 |
| Unconfirmed stop | A stop whose lowest trust is read by AI | Same circle with a dotted stroke (dash 2 2.5) |
| Interchange | One maintenance visit recorded in two or more logbooks (an annual signing airframe, engine and propeller) | Vertical capsule 20 wide, rx 10, spanning the lanes it touches, leaf fill, ink stroke 2.5px; small dots where it crosses each line it includes |
| Gap | A stretch of a line with no pages | 2px dashed stroke (6 6) in the line's ink, butt caps, with a short label; "no pages exist" gaps a thin solid stretch |
| Squawk marker | An open or resolved squawk | Diamond 8×8 on its line: filled ink (open), hollow (resolved) |
| Today | The present moment | 1.5px ink vertical line across all lanes, labelled "Today" at the axis |
| Future | Any time after today | The line continues as a dotted stroke (dot every 11 units, 6px dots) |
| Ring | A tracked item coming due, placed on the line of the logbook that will record it | Circle r = 7, stroke 3: ink (current), alarm (due soon), solid alarm fill (overdue), dashed ink-3 (no record) |
| Visit capsule | A suggested, planned or in-shop visit bundling rings | Interchange capsule, leaf-2 fill: suggested dashed (4 4) ink; planned solid ink; in the shop solid section-ink 3px |
| Era band | A span worth seeing behind one line (engine and propeller time since overhaul; latest only by default) | 20-unit tall band behind the line in the line's ink at 8% opacity |
| Window | The part of time the current screen covers (used on the Spine and by range selection) | Rectangle in `section-ink` at 12% fill with a 1.5px `section-ink` stroke (never the raw section hue on a leaf) |
| Scale break | Where the long-history scale changes to the recent-and-future scale | 1px dashed rule (3 5) in color.rule across all lanes; lines skip 10–20 units across it |

## 2. Data model (MapModel)
The data model, derivation rules and API are owned by **09-data-and-api.md** (§3.4 line ahead, §3.5 suggested visits, §3.7 map model, §3.8 gaps, §4.6 `GET /api/aircraft/{id}/map`, §4.10 widget snapshot). Where this file and 09 differ on what exists, 09 wins; this file owns how it is drawn. The model is served by the API for the web and recipient views, and **built locally by the phones from their synced mirror** with the same rules, checked against the shared fixtures `map-*.json` (09 §3.7, 13 §2). The shape the layout engine consumes:
```
MapModel {
  range: { from, to, scaleBreak|null }            // scaleBreak = today − 12 months
  lines: [{ logbook: airframe|engine|prop|avionics|other, logbookId, volumes:[{id,label,from,to}] }]   // lane order as listed
  stops: [{ id, logbook, date, entryIds[], trust: ai_read|confirmed|signed, pageIds[], label|null, major: bool }]
  interchanges: [{ id, date, stopIds[], trust, label|null }]
  gaps: [{ id, logbook, from, to, status: open|asked_previous_owner|no_pages_exist, unconfirmedPages }]
  eras: [{ logbook, from, to|null, label, anchorEntryId }]
  squawks: [{ id, date, open: bool, line }]
  rings: [{ itemKey, line, date, kind: calendar|projected, status: overdue|due_soon|current, label }]
  visits: [{ id|suggestionKey, state: suggested|planned|in_shop, weekOf, itemKeys[], label }]
  undatedEntries: number
}
```
Presentation rules that follow from 09:
- **A stop is one (logbook, date)**, aggregating that day's entries in that book; its trust is the lowest of its entries. `major` is true when any entry is an overhaul, major repair or alteration, an installation or replacement of engine or propeller, or the first entry of the book; majors draw at r 9.
- **An interchange** is stops on two or more books on the same date that share a mechanic certificate number or agree on tach within 0.5 h (09 §3.7). Its trust is the lowest of its stops.
- **Unconfirmed stops** (`ai_read`) are drawn with a dotted stroke and never place or move a ring, a visit or the Verdict (00 §3 rule 2). Rings are computed only from confirmed and signed entries.
- **Rings** sit at `date` (the date of the limit that comes first: a calendar due date or a projected date). Overdue items sit at today with the overdue ring. Items with no date (no record, or no projection basis) are **not drawn**; they are listed under the line: "Not on the line: {label}, needs a date". **Documents are never drawn on a book line**; they appear only in the due list (09 §3.4).
- **Gaps**: `open` and `asked_previous_owner` draw dashed; `no_pages_exist` draws as a thin (3) solid stretch labelled "No pages exist (you marked this)"; `dismissed` and `filled` are not drawn. Gaps before a book's first page read "No pages yet before {year}".
- **Eras**: only the latest era per line is shaded by default; earlier eras appear when one book is filtered.
- **Squawks** appear on the Spine and RouteMap as small diamonds on their line (open: filled ink; resolved: hollow).
- **Visits**: suggested visits draw as dashed capsules labelled "Suggested"; planned (booked) visits as solid-stroke capsules with leaf-2 fill labelled "Planned"; `in_shop` solid with a 3px `section-ink` stroke; done visits become ordinary interchanges. Each carries the week ("Week of Dec 7").
- **Undated entries** are not drawn; the map footer says "{n} entries without a date" and links to them.
- **Horizons** (09 §3.4): Status 12 months; Status during the annual month 60 days; widget 60 days; Plan ahead 24 months; Annual prep today to the annual's due date + 14 days.
- **Dates** are calendar dates evaluated in the aircraft's time zone (09 open question 7 until a `time_zone` column exists).

## 4. Scales and time axes
All three sizes use a horizontal time axis (the phone RouteMap uses the same mapping turned vertical, §8.4).
**Piecewise scale with one break** (RouteMap and Spine):
- Segment H (history): from `bounds.firstDate` to `B = today − 12 months`, linear.
- Segment R (recent and ahead): from `B` to `bounds.horizonDate` (default today + 12 months; up to 24), linear.
- Width shares: RouteMap H 61% / R 39% (H:R = 500:180 in a 820-wide viewBox with a 10–20 unit break); Spine H 79% / R 21% (790:200 in 1000). These ratios keep the last two years readable while showing fifty years.
- A 1px dashed rule marks the break; lines are interrupted for the break width; tick labels: decades in H ("1980", "1990" …), "Nov 2025" at the start of R, "Today", and the horizon year.
- If the history is shorter than 5 years, use a single linear scale (no break).
**Linear scale** (LineAhead): from `today − 7 days` (a short stub of solid line showing the present) to `horizonDate`; horizons per §2 (Status and phone home 12 months, annual month and widgets 60 days); Plan ahead 24 months with the first 6 months at double scale (a 2:1 piecewise linear scale, no break rule), fixed (no presets; 14-decisions.md D5). Month ticks at the 1st of each month; label every other month at small widths so labels are ≥ 40px apart.
**Zoom (RouteMap only):** the owner can zoom into any range down to 6 months wide. Zooming replaces the piecewise scale with a single linear scale over the selected range plus the R segment collapsed to a 40px "→ today" stub, so today stays reachable. Zoom presets: Whole life, Last 10 years, Decade picker, Custom (drag on the axis).

## 5. Lanes and layout
- Lanes in fixed order airframe, engine, propeller, avionics; only lines that exist get a lane. The Other logbook gets no lane on any map (its entries are in Pages, the list view and search). Lane y spacing: RouteMap 80 units, LineAhead 45 units (web) / 36 (phone), Spine 8 units, phone vertical map 40 units between columns.
- A line starts at its `startDate` (avionics starting in 2019 begins there) and ends at today (solid) then continues dotted to the horizon. A line whose logbook ended (engine replaced and old book closed) ends at its last stop with a round cap; the replacement starts a new line in the same lane at the replacement stop, drawn with a short step (a 45° offset of 14 units) so the change of book is visible.
- Name column: line names in their inks, type.map, left-aligned in a 90-unit column (RouteMap), 84 (LineAhead), none on the Spine (the Spine is unlabelled; its accessible name lists the lines).
- Interchange capsules span from 12 units above the first lane they touch to 12 below the last; if lanes in between are not part of the visit (an annual that skipped avionics), the capsule still spans them but the dots appear only on the lines included.
- Collision of stops: when two stops on one line are closer than 8 rendered px, merge them into a cluster stop (r = 7, label count "3") which on hover lists its entries and on click zooms to the cluster's range. Majors and interchanges are never merged; a routine stop under a capsule is hidden by the capsule.
- Rings closer than 14 rendered px on one line are offset vertically by ±8 units alternately (never merged; each due item must stay individually reachable).

## 6. Drawing rules
| Element | Stroke | Fill | Notes |
|---|---|---|---|
| Line (history, recent) | 6 (Spine 3), line ink, round cap and join | none | |
| Line (future) | 6 dots spaced 11 (Spine 3 dots spaced 7), line ink | none | `stroke-dasharray: 0.1 11` with round caps |
| Gap | 2, dash 6 6, butt caps, line ink | none | Label "no pages, 1983 to 1991" centred below at type.map-tick colour ink-3 |
| Stop | 2.5 ink | leaf | r 5 / 9; unconfirmed dashed 2 2.5 |
| Interchange | 2.5 ink | leaf | width 20, rx 10; selected 4 |
| Visit capsule | 2.5 ink dash 4 4 | leaf-2 | width 20, rx 10; planned visits use a solid stroke with leaf-2 fill |
| Ring current | 3 ink | leaf | r 7 |
| Ring due soon | 3 alarm | leaf | r 7 |
| Ring overdue | 3 alarm | alarm | r 7 (on the phone r 7, Spine r 3.5) |
| Ring no record | not drawn on the line | | Listed under the line as "Not on the line: {label}, needs a date"; the dashed ring appears only as the StatusMark in lists |
| Gap, no pages exist | 3 solid, line ink at 60% | none | Label "No pages exist (you marked this)" |
| Squawk marker | 1.5 ink | ink (open) / leaf (resolved) | Diamond 8×8 centred on the lane |
| Today | 1.5 ink | | Spans lanes + 12 above and below |
| Era band | none | line ink 8% | height 20 centred on the lane, rx 4 |
| Window | 1.5 section-ink | section-ink 12% | rx 3 |
| Selection (stop) | 2 section-ink ring at r + 4 | none | plus the stop's own stroke at 3.5 |
Status meaning is carried by the ring's stroke style and fill, never by the line's ink. In dark mode use the dark token values; leaf fills become dark leaf.

## 7. Labels
- One size: 13px at rendered size for labels (type.map-label), 12px for axis ticks. When an SVG is scaled to fit, compute the scale factor `k = renderedWidth / viewBoxWidth` and set font-size to `13 / k` user units (the mockups' `.d-map.z` class does this by hand); never let rendered label text fall below 12px.
- Candidate positions per labelled element, in order: above the line (baseline 12 units above the lane minus the element radius), below the line, then for ring clusters a leader-less list in the row beneath the axis. Left-anchored at the element's x + 8 by default; end-anchored at x − 8 when the label would cross the right edge or a capsule.
- Priority (highest kept first when space runs out): overdue rings, due-soon rings, today's label, visit capsules, interchanges, major stops, gaps, current rings, routine stops (never labelled on RouteMap at whole-life zoom).
- Greedy placement: sort by priority, place each at the first candidate whose bounding box does not intersect any placed label, any capsule, any stop or ring (+3 units padding) or the axis; if none fits, drop it and add it to the "more" count shown in the map's footer ("4 more items: see the list").
- Never rotate text, never overlap, never truncate mid-word; maximum label length 32 characters, longer titles use their short form (`shortTitle` from the server).
- Line names never move; axis ticks drop every other tick when closer than 40px.

## 8. The three sizes
### 8.1 Spine (every board, web and tablet)
- Height 52px including padding; the SVG is 40px tall, full board width minus the label column (~110px) and the "Open the map" link (~130px).
- Draws: all lines thin (3), gaps, interchanges as 8×24 capsules with 1.5 stroke, today, rings (r 3.5) in the R segment, and the window. No labels inside the SVG; left label "N734DM / 1978 to 2027"; right link "Open the map" (or "Whole life" when already on the map).
- The window brackets what the current screen covers (Status: today to horizon; an entry: that stop ±1 month; a filtered list: the filter's range; Review desk: the date of the page under review; Plan ahead: today to the scrubbed date).
- Interaction: click a point before today → open Logbooks › Map zoomed to ±2 years around it; click a point after today → open Status › Plan ahead with the scrubber at that date (03-information-architecture.md §7.2); drag the window edges on map screens to change the range; hover shows the date under the pointer ("Mar 2011").
- Draw at real pixel size on every platform (compute the scale from the measured width; never stretch the SVG with `preserveAspectRatio="none"`, which turns rings into ellipses at wide widths).
### 8.2 RouteMap (Logbooks › Map, Map one book, Decade, Gap, Ask results, Entry context, First read, dossier cover)
- ViewBox 820 × (lanes × 80 + 72). Name column 0–90, H segment 100–600, break 600–620, R segment 620–800, right margin 20.
- Draws everything in §1. Legend (MapLegend) above, right-aligned: pages, no pages yet, ahead, one visit, several books.
- Filters: All books or one book (others drawn at 25% opacity, not removed, so interchanges still read). Search results: matching stops get a 2px section-ink selection ring and non-matching stops drop to 40% opacity.
- Below the map: the selection's detail (HungSection) — for a stop its entry, for an interchange one row per book, for a gap the evidence and actions, for a range a list of entries.
### 8.3 LineAhead (Status, Plan ahead, Annual prep, Hangar card, phone home, widgets, tablet)
- Web Status: viewBox 680 × 226; lanes at y 40, 85, 130, 175; name column 0–84; today at x 110; horizon at 672; month ticks at y 222.
- Draws: a short solid stub before today, dotted future, rings, visit capsules (suggested dashed, planned solid), the annual capsule, today. Labels per §7.
- Plan ahead adds the DateScrubber: a vertical 2px ink line from the top lane −20 to the axis with a pill at the bottom ("Mar 1, 2027", type.caption on ink, white text, radius 4), a shaded window from today to the scrubber (section-ink 12%), and rings that would lapse by that date drawn as overdue (solid alarm) with their labels prioritised.
- Phone home: viewBox 354 × 168, lanes 36 apart, labels limited to the suggested visit and the annual; everything else is in the list below.
- Widgets: no labels except "Today" and the horizon month; rings and capsules only (see 06-mobile-screens.md, widgets).
### 8.4 Phone RouteMap (vertical)
- One column per book, newest at the top, so scrolling down goes back in time. Columns at x 58, 98, 138, 178 (40 apart) in a 358-wide viewBox; book initials at the top ("Air", "Eng", "Prop", "Avi").
- Time scale from top: future (horizon → today) 70 units, recent (today → today − 12 months) ~110 units, break, history at ~8 units per year. The year axis runs down the left (x 0), labels at decades.
- Labels sit in a column to the right (x 208+), one line each, left-aligned at the y of their element, priority rules as §7 with vertical collision boxes.
- The map scrolls vertically inside the leaf; the year labels and book initials stick (pinned header and pinned left axis).
- Tap a stop → bottom sheet with the entry (M-BOOKS-02); tap an interchange → swipeable cards, one per book (M-BOOKS-03); tap a gap → gap sheet (M-BOOKS-04). Pinch to zoom time; double-tap to zoom to a decade.

## 9. Interaction (web)
| Input | On a stop | On an interchange | On a gap | On a ring or capsule | On empty map |
|---|---|---|---|---|---|
| Hover | Tooltip: date, book, title (paper voice for the excerpt), trust mark, tach | Tooltip: "Annual, Aug 22, 2011, three books" | Tooltip: span and evidence summary | Tooltip: item, due, left, status word | Crosshair date readout on the axis |
| Click | Select; right leaf shows the page with the entry's ink highlighted; detail under the map | Select; right leaf shows the visit's pages with one tab per book (Airframe p. 41, Engine p. 14 …) | Select; right leaf shows the last page before and the first after; actions under the map | Select; detail opens the item (W-STATUS-04) or the visit | Clear selection |
| Double-click | Open the entry (W-BOOKS-10) | Zoom to ±1 year | Zoom to the gap | Open the item | Zoom in one step around the point |
| Drag on the axis | — | — | — | — | Select a range; the list below filters to that range; "Zoom to this range" button appears |
| Wheel / trackpad pinch with Ctrl or ⌘ | Zoom time around the pointer | | | | |
| Keyboard | see §10 | | | | |
Selection is reflected in the URL (`?stop=<entryId>`, `?visit=<id>`, `?gap=<id>`, `?from=YYYY-MM&to=YYYY-MM`) so a selection can be linked and survives reload (see 03-information-architecture.md).
LineAhead: hovering a ring shows the tooltip; clicking a ring selects the row in the due table and opens its page; clicking a visit capsule opens the visit (W-STATUS-03 with the visit selected); the DateScrubber is draggable and keyboard operable.
Motion: selection rings and window changes animate 120ms ease-out; zoom transitions animate the scale over 200ms ease-in-out; respect reduced motion (instant). See 11-accessibility-and-motion.md.

## 10. Accessibility
- Every map is a `role="group"` with an accessible name ("Route map of N734DM's logbooks, 1978 to 2027") and a visible "Show as list" toggle that swaps the drawing for an equivalent table (lines, stops with dates and trust, interchanges, gaps, rings). The list is the accessible source of truth; the drawing is an enhancement.
- Keyboard model (composite widget, roving tabindex): Tab enters the map on the selected element (or the most recent stop); ← / → previous or next element on the same line in time order (stops, interchanges, gaps, rings); ↑ / ↓ move to the nearest element in time on the line above or below; Home / End first and last element of the line; Page Up / Page Down jump one year (one month on LineAhead); Enter selects (same as click); Shift+Enter opens; + / − zoom; 0 reset zoom; L toggles the list view; Esc clears selection then leaves the map.
- Each focusable element has an accessible name: "Annual inspection, August 22, 2011, Airframe, Engine and Propeller, confirmed by you, page 41"; rings: "Oil and filter change, due about December 12, 9.7 hours left, due soon, Engine".
- Focus indicator: a 2px focus ring (color.focus) at r + 6 around stops and rings, around capsules as a rounded rectangle; never rely on the selection colour alone.
- Status is shape plus fill plus the word in the name; line identity is position plus name; nothing depends on telling the inks apart.
- Native: expose each element as an accessibility element with label, value and traits; VoiceOver custom rotor "Stops", "Due items", "Gaps"; TalkBack custom actions "Next stop on this line", "Open page". Provide the list view toggle in the toolbar.
- Dynamic Type: labels in native maps scale with the content size category up to xxLarge; above that the map hides labels and the list below carries them.

## 11. Rendering per platform
- **Web:** React component rendering SVG; layout computed in a pure TypeScript module (`map-layout.ts`) that takes MapModel + size + options and returns positioned primitives and placed labels, unit-tested with snapshot fixtures (N734DM, a 2-aircraft hangar, an aircraft with nothing scanned, a twin, a 5,000-entry stress case). Use `vector-effect: non-scaling-stroke` where scaled. Above 2,000 stops, render stops to a `<canvas>` layer under an SVG layer for capsules, rings and labels.
- **iOS:** SwiftUI `Canvas` for lines, stops and rings, with `accessibilityChildren` providing the elements; capsules and labels as SwiftUI views in an overlay for hit-testing; positions from the KMP core's layout module (05 §21). Widgets use the same layout at widget sizes with static rendering.
- **Android:** Compose `Canvas` with `drawLine`, `drawCircle`, `drawRoundRect`; `Modifier.semantics` with custom actions on an invisible node per element; Glance widgets render a pre-rasterised bitmap from the same layout (Glance cannot draw paths), regenerated by WorkManager when the model changes.
- Two layout implementations, one behaviour: `map-layout.ts` on the web and the map layout module of the Kotlin Multiplatform core on both phones (05-mobile-architecture.md §4.2, §21). Both run the shared `map-*.json` fixtures in CI and must place every primitive within 0.5 units of each other.

## 12. Performance
- Layout of 1,000 stops in under 8 ms on a mid-range phone; first paint of the RouteMap under 100 ms after data is available.
- The server sends the model pre-sorted by line and date; the client caches layouts per (model version, size, zoom).
- Hover hit-testing uses a spatial index (a simple grid bucket of 16px cells).

## 13. Print
The dossier (W-SHARE-03) and maintenance summary (W-SHARE-04) print the RouteMap on paper: light theme only, no window, no today pill, every gap and major stop labelled with a footnote number that resolves to a page citation at the foot of the page, lines at 4px, labels at 9pt. The SVG is embedded so it prints sharp.

## 14. Acceptance criteria
- [ ] One MapModel per aircraft, served by the API and cached for offline; web and phones draw identical positions for the same model and size.
- [ ] No label overlaps another label, a stop, a ring or a capsule in the five fixture aircraft at the three sizes and at 1024, 1280, 1440, 1920 widths, phone 375 and 430 widths, and tablet.
- [ ] Unconfirmed stops are visibly dotted and never change rings, visits or the Verdict.
- [ ] Every element is keyboard reachable on the web and screen-reader reachable on iOS and Android, with names as in §10.
- [ ] "Show as list" exists on every map and shows the same elements.
- [ ] Selection, range and zoom are encoded in the URL on the web and restored on reload.
- [ ] Rendered label text is never below 12px at any size the map is drawn.
- [ ] The spine's window matches what the screen shows on every screen that has a spine.

## 15. Open questions
- Twin-engine and multi-propeller aircraft: lanes for engine 2 and propeller 2 are reserved (§4 tokens) but the interchange rules for asymmetric work need a product decision.
- Ownership eras (not in 09's model today): worth adding later, hidden by default in shared record rooms.
