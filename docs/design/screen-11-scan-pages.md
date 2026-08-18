# Addendum: Screen 11 — Scan pages

Written against `design_handoff_ios_redesign/README.md` (direction "Verdict first"). Same tokens, same
type scale, same voice. Nothing here introduces a new color, radius or family.

## Why this exists

The approved handoff specifies ten screens. Screen 7 (Records — Scans) specifies the **Scan FAB** and
what it should look like, but not the screen the FAB opens. That screen shipped unchanged from the old
build, so it is now the only surface in the app still speaking the old language:

- It opens as a `‹ Back` stack screen — the structure the redesign removed.
- It **asks which aircraft**, from inside an aircraft context whose header already carries the tail
  number. The answer is on screen while the question is being asked.
- Its primary button is `📷  Scan pages` — the emoji screen 7 explicitly calls out for replacement.
- It says **"queued"**, **"pending"**, and **"routes to vision extraction"**. The handoff's rule is that
  the UI never names the offline queue and never uses an internal term where an owner's word exists.

## Presentation

**A sheet, not a push.** It is opened by the FAB on Scans, does one job, and returns you to the grid it
came from. This follows the same call as the squawk composer in screen 5: modal for a single act of
capture, so the list underneath is never replaced.

Detents: large. The sheet's own scroll view; drag indicator visible. Dismiss returns to Scans with the
grid refreshed if anything was captured.

**The aircraft is context, not a question.** The sheet inherits the aircraft from the tab it was opened
from and shows the tail number as trailing metadata in its title row, exactly as every other screen
does. There is no aircraft picker.

*Fleet-level entry:* if a path exists that opens capture without an aircraft in context, the sheet's
first step is an aircraft list using the **switcher sheet's row idiom** (screen 2's picker — tail in
Space Grotesk 15/700, type in `dim`, status chip trailing), never the old pill row.

## Layout

Sheet container: `surface`, top corners radius 20, 1 pt `hairline`, 20 pt horizontal padding, bottom
padding `20 + safe area`.

1. **Grabber** — 36 × 4, radius 2, `hairline`, centered, 10 pt top margin.

2. **Title row** — "Scan pages" (Space Grotesk 19/700, `ink`) with trailing tail number (12.5, `faint`).
   Bottom margin 18.

3. **"WHICH LOGBOOK"** section label (12/600 uppercase 0.08em `faint`), bottom margin 8.

   **Logbook chips** — same styling as the filter chips in screen 3: radius 9, padding 7 × 12, 12/600,
   7 pt gap, wrapping. Selected = `accent` fill with `onAccent` label; unselected = `surface` +
   `hairline` with `dim` label. Labels are the logbook's own title, falling back to its type:
   Airframe · Engine · Propeller · Avionics.

   Beneath the chips, a single line (12, `faint`): **"Adds to the end — 24 pages so far."** This is
   where the page-ordering model becomes visible. Scanning appends; re-sequencing is a deliberate
   separate act on the web, and saying so here stops anyone believing they must shoot in order.

   *No logbooks:* the chip row is replaced by one `surface` + `hairline` row, radius 14, padding
   13 × 15 — "No logbooks yet" (14.5/600) over "Create one in the web app and it will appear here."
   (12, `faint`). The primary button is disabled.

4. **Handwritten row** — `surface`, 1 pt `hairline`, radius 14, padding 13 × 15, top margin 16.
   Leading text column: "Handwritten entries" (14.5/600, `ink`) over "Reads cursive as well as typed
   entries. Turn it off for printed pages and they come back faster." (12, `faint`, line-height 1.45).
   Trailing: 42 × 26 switch, `accent` when on, `surfaceRaised` when off, 20 pt white knob.

   > The old label was "Handwritten page (routes to vision extraction)". The routing is ours; what the
   > owner is choosing is whether the pages have handwriting on them, and the cost of the choice is
   > time. Say that.

5. **Primary button** — 52 pt, radius 15, accent gradient, `onAccent` label: `camera.viewfinder`
   (18 pt) + **"Scan pages"** (16/600). Top margin 18. Disabled when no logbook is selected.
   While the scanner is opening or pages are being saved the label becomes the progress text and the
   button is inert.

   Beneath it, centered (12, `faint`, max width 250): **"Apple's scanner finds the page edges. Shoot
   the whole stack in one go — up to 24 pages."** This is the sentence that tells someone they do not
   have to come back here twenty times, and it names the capability the OpenCV build never delivered.

6. **"ON THIS PHONE"** section label, top margin 22, shown only when something is held locally.

   **Held card** — `surface`, 1 pt `hairline`, radius 16, padding 14, 12 pt gap:
   - **Thumbnail strip** — horizontally scrolling, 38 × 50, radius 5, 1 pt `hairline`, 6 pt gap, most
     recent first. Proof the photograph worked, at the size the page viewer already uses for its strip.
   - **Count line** — "3 pages saved on your phone" (13.5/600, `ink`) over "They upload on the next
     sync. Send them now if you have signal." (12, `faint`).
   - **Secondary button** — 46 pt, radius 13, `surfaceRaised` + `hairline`, `accent` label 14/600:
     **"Upload 3 pages"**. During upload the label counts: "Uploading 2 of 3". On completion the card
     empties and a transient line reads "3 pages uploaded — they'll appear once they're read."

   There is exactly one primary button on the screen; upload is deliberately secondary, because
   scanning more is the more common next act and the upload happens by itself anyway.

7. **Result line** — any error or completion message, 13, `dim`, top margin 14. Errors say what failed
   and what to do, never a raw exception.

## Copy changes

| Old | New |
|---|---|
| `Capture page` (title bar) | **Scan pages** |
| `📷  Scan pages` | `camera.viewfinder` + **Scan pages** |
| `Handwritten page (routes to vision extraction)` | **Handwritten entries** + the plain description above |
| `1 page queued — scan more, or upload.` | **1 page saved on your phone** |
| `3 pending` | **3 pages saved on your phone** |
| `⤴ Upload 3` | **Upload 3 pages** |
| `Queued pages upload when you have signal; the server extracts them and they sync back into your logbook.` | **They upload on the next sync. Send them now if you have signal.** |
| `Uploaded 3.` | **3 pages uploaded — they'll appear once they're read.** |
| `No logbooks — create one on the web first.` | **Create one in the web app and it will appear here.** |

## SF Symbols

| Element | Symbol |
|---|---|
| Primary button | `camera.viewfinder` |
| Upload button | `arrow.up.circle` (optional; the label carries it) |

## Behaviour

- Scanning is VisionKit's own document camera, with its crop editor left in the flow. Up to 24 pages
  per session; they are held in the order it returns them.
- Every capture is local-first. The sheet never blocks on the network and never reports failure for
  being offline — offline is the expected case in a hangar.
- Uploading is idempotent on the client-generated page id, so a retry after a dropped connection cannot
  double-insert.
- The sheet stays open after a successful scan. Shooting a second logbook means changing the chip, not
  reopening the sheet.

## Open question

Page **re-sequencing** is web-only. The line "Adds to the end" is honest about it, but if a scan lands
out of order the owner has to remember to fix it later. A long-press-to-reorder on the Scans grid would
close that loop on the phone; it is out of scope here and worth its own pass.
