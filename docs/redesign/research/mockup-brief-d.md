# Build brief: direction D, "Tabbed Binder"

Direction D is direction B (the tabbed records binder) with direction C's line diagram bound into it.
The owner chose B's design and layout, and wants C's timeline for looking back and planning forward.
You build ONE page of mockups for D, named in your task.

## Read first, in this order
1. `docs/redesign/research/mockup-brief.md`
   The original brief. Sections 1 (files, figures, technical rules, screenshot checking), 2 (mock data),
   3 (product rules), 4 (what changes), 6 (direction B's contract) and 7 (craft rules) all apply to you.
   Its section 5 screen lists do NOT apply; your list is below.
2. `docs\redesign\d\system.css` (imports `../b/system.css` and adds the map vocabulary) and
   `docs\redesign\d\index.html` (the settled D screens: web Status with the spine and the line ahead,
   web Logbooks › Map, phone Status, phone vertical map). Match them exactly in look, markup and SVG conventions.
3. Direction B's finished pages, to reuse layouts for screens that are B plus the map:
   `docs\redesign\b\web1.html`, `docs\redesign\b\web2.html`, `docs\redesign\b\mobile.html`. You may copy and adapt their markup.
4. `docs\redesign\c\web1.html`, `c\web2.html` and `c\mobile.html` show how C used the diagram on each screen. Borrow ideas, never C's
   midnight look, C's capsule buttons, C's Encode Sans or C's line colours.

## D's contract (on top of B's)
- Everything about B holds: cover rail with tabs sized by content, section boards (`sec-…`), white leaves, the page on the dark mat
  (`b-leaf mat`), Libre Franklin for the app and Literata (`.paper`) only for text transcribed from paper, ink-and-vermilion status
  (black dot current, vermilion ring due soon, solid vermilion overdue, dashed ring unknown), trust marks `b-truth`.
- The map is always drawn in ink on a white leaf, never on a coloured board. Use the `d-map` SVG classes from d/system.css
  (`ln air|eng|prop|avi`, `future`, `gap`, `thin`, `stop`, `stop unconf` for read-by-AI, `cap`, `cap plan` for a planned or suggested
  visit, `cap sel`, `ring` / `ring soon` / `ring bad` / `ring unk`, `today`, `win` for the bracket of what a view covers, `axis`;
  text classes `s`, `f`, `nm`, `alarm`, `paper`). Logbook inks are `--l-air`, `--l-eng`, `--l-prop`, `--l-avi`; use `d-line` chips to
  tag a row with its book. Line colours never mean status; status rings use B's marks.
- Three places the map lives:
  1. The spine (`d-spine`): one strip under the board head on every app screen, the whole life 1978 to 2027 with a scale break at
     Nov 2025, today marked, and a `win` bracket over what the current screen covers. Copy it from d/index.html and move the bracket.
  2. The route map in Logbooks › Map (and wherever history is browsed): stops open their page on the right leaf; interchanges open
     every page of that visit, one tab per book; gaps are dashed and offer to scan.
  3. The line ahead in Status (and Plan ahead): due items as rings on their book's line, suggested shop visits as `cap plan`.
- SVG rules: horizontal lines at fixed y per book, 6px stroke (3px thin in the spine), labels horizontal at one size (12 to 13px),
  never rotated, never overlapping a cap, a stop or another label. Check every label in the screenshot.
- Phone: the map runs vertically, one column per book, newest at the top (see `d-m-map`). The line ahead on the phone is horizontal
  (see `d-m-status`).
- Figure ids: `d-w-<slug>` web, `d-m-<slug>` phone, `d-t-<slug>` tablet.

## Page skeleton differences
Top nav: add `<a href="../d/index.html">D · Tabbed Binder</a>` after C (relative `index.html` inside d/), current page marked.
Second nav: `<a href="index.html">Direction overview</a><a href="web.html">Web screens</a><a href="mobile.html">Phone and tablet</a>`.
Fonts link: copy from d/index.html.

## web.html : "Web screens" (20 figures)
Each screen: B's shell with the spine. Where a screen is B's screen plus the spine, adapt B's markup (do not redesign it).
Group "Getting in": D01 Hangar (two aircraft, each with a small spine of its life as its card's header strip). D02 New aircraft with
nothing scanned: the map shows only today and the line ahead from the setup answers, with the lines in the past drawn as dashed
"no pages yet" and a call to scan the first book.
Group "What is due": D03 Status in annual month (line ahead zoomed to the next 60 days with the annual interchange and everything
that rides along). D04 Plan ahead: 24 months, a draggable date marker set to Mar 1, 2027 with what will have lapsed by then listed
beside it (this replaces Forecast and Pick a date), and two suggested visits as `cap plan` with "Book this visit". D05 Item detail
(transponder): its own history drawn as stops on the avionics/airframe line every 24 months back to 2008, intervals labelled, one
late renewal flagged, with the page on the right leaf. D06 ADs and SBs register with a small line per recurring AD showing its
compliance stops. D07 Squawks (B's) with each squawk's stop shown on the spine.
Group "The records": D08 Logbooks › Map, one book filtered (Engine): era bands for "since overhaul", the 2005 overhaul selected,
right leaf the overhaul page. D09 A decade zoom (2005 to 2015) with every stop labelled by date. D10 The gap selected (1983 to 1991):
left leaf explains what the other books show for those years (engine and prop entries exist, so the aircraft flew), right leaf shows
the last airframe page before and first after; actions: scan missing pages, mark "no pages exist", note asked previous owner.
D11 Entry detail reached from a stop (B's entry detail with the spine bracketing that stop and a "previous / next stop on this line"
control). D12 Search and Ask: "When was the engine last overhauled?" with matching entries lit as stops on the map and the cited
answer.
Group "From paper to index": D13 Add pages queue: incoming pages drawn as hollow (`unconf`) stops landing on their line, with reading
progress and the daily allowance (31 of 50). D14 Review desk (B's spread) with the spine showing where this page lands in time and
"this page fills 1984 in the airframe gap". D15 First read: the first scanned book drawn as its line with the events the reader found
(overhauls, repeated repairs, gaps), each linked to a page.
Group "The aircraft": D16 Hours and engine: the engine line with time since overhaul, a written-versus-calculated check, oil changes
as stops.
Group "Hand-offs": D17 Annual prep: the line ahead zoomed to the annual, every item that rides along, open squawks, recurring ADs, and
"share with your IA". D18 Share hub: audience presets, and the record room link preview with the map as its cover. D19 Record room as
the recipient sees it: no rail, a light binder with the map first, then tabs. D20 Pre-buy dossier (print, light paper): page 1 is the
aircraft's life as a line map with every gap and overhaul labelled and footnoted to pages.

## mobile.html : "Phone and tablet" (19 phone figures, 3 tablet)
Group "A glance": M1 Status (copy d-m-status). M2 Lock-screen widget: the line ahead for the next 60 days in a small widget plus a
notification that carries the whole answer.
Group "The map": M3 Logbooks map (copy d-m-map). M4 Stop tapped: a bottom sheet with the entry (paper voice), trust mark and the
page thumbnail, "Open page". M5 Interchange tapped: the visit's three pages as swipeable cards, one per book. M6 Gap tapped: what the
other books show for those years and "Scan these pages". M7 Map filtered to one book (Engine) with the overhaul era.
Group "Planning": M8 Plan ahead: a date scrubber along the horizontal line ahead, set to Mar 1, 2027, with what lapses by then.
M9 Suggested visit: the proposed interchange opened, items in it, "Book this visit" and "Send to AeroCheck". M10 Item detail
(transponder) with its own stops in a vertical line.
Group "After a flight": M11 Log a flight confirm (B's, with the oil ring visibly moved nearer on a mini line ahead). M12 Saved:
"Oil change now 7.3 h away" with the line ahead updated.
Group "Scanning": M13 Camera with page edges and count. M14 The queue with hollow stops landing on the airframe column of a mini
vertical map. M15 Notification "6 pages are read. 2 need a look." M16 Review a page: the page fills the screen, a small spine at top
shows where it lands in time.
Group "Finding": M17 Search and Ask with results as stops on a mini map and the cited answer.
Group "Sharing": M18 Share: who is it for, with the record room preview whose cover is the map. M19 Link made: QR, expiry, copy.
Tablet (1024 × 768): T1 Status: line ahead plus due list on the left, page on the right. T2 Map with the right pane showing the
selected interchange's pages. T3 Plan ahead with the date scrubber and the list.
Phone rules from BRIEF.md section 5 apply (44px targets, 16px body, nothing under 13px, bottom tabs on top-level screens, back on
pushed screens, sync state visible).

## Captions
Mark everything that is new versus direction B in the caption ("New in D: …"). Each section's prose says what the map adds there.
Screens not drawn here work as in direction B; say so once in the page's lede.

## Report back
As BRIEF.md section 8 asks, plus any mock data you invented.
