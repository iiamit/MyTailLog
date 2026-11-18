# 00 · Product principles

MyTailLog turns an aircraft owner's paper logbooks into a searchable index, tells them what is coming due, and hands the right records to the right person. This redesign (direction D, "Tabbed Binder") keeps every capability the product has today, adds the ones competitors have taught owners to expect, and rebuilds the interface around two ideas owners already understand: the tabbed records binder, and a line map of the aircraft's life. This file states who the product is for, what it must never do, and the principles every screen is judged against. When another document in this package is silent, decide by these principles.

Contents: 1 Who it is for · 2 What the product does · 3 Non-negotiable rules · 4 Design principles · 5 The direction in one page · 6 What is out of scope · 7 How to resolve conflicts

## 1. Who it is for
- **Primary:** the solo owner-pilot of one piston aircraft (sometimes two), often 50 or older, with decades of paper airframe, engine, propeller and avionics logbooks, and an A&P or IA they see at the annual.
- **Where they use it:** at a desk on the web to digitize, review and prepare hand-offs; at the aircraft on a phone, often one-handed, outdoors in glare or in a dim hangar, often offline, to check status, log a flight or oil, scan pages, and file a squawk.
- **Secondary, reached through the owner:** co-owners and partners (editor role), the owner's mechanic and IA (viewer role or a record room link), buyers and pre-buy mechanics, insurers. Recipients of a record room link have no account.
- **Out of scope as users:** flight schools, clubs, fleets, MRO shops.

## 2. What the product does
1. **Digitize:** photograph or upload logbook pages; AI reads them into entries; the owner confirms each entry beside the scanned page.
2. **Know what is due:** inspections, ADs, recurring items, document expiries, by date and by hours, with the earlier limit named and hours projected to dates.
3. **Plan:** see the next 12 to 24 months on the logbook lines, pick a date to see what will have lapsed, bundle items into one shop visit.
4. **Find and prove:** search or ask questions across fifty years of entries; every answer and every number links to the page it rests on.
5. **Hand off:** a record room link, a pre-buy dossier, a maintenance summary, a squawk link for the mechanic, each built for the person receiving it.
6. **Keep the data:** full export with scans, re-import, scheduled backups to the owner's own storage, an open API, MIT licence.

## 3. Non-negotiable rules
These are product truth. A screen that breaks one is wrong regardless of how it looks.
1. **The paper is the record.** The physical logbooks are the legal record under 14 CFR 91.417. MyTailLog is an index and decision support. It never declares an aircraft airworthy, legal, grounded or compliant, and never implies a maintenance sign-off. It says what the records show ("nothing tracked is overdue", "lapsed 7 days ago", "due Dec 31").
2. **Unconfirmed readings never move anything.** An entry read by AI but not confirmed by the owner never changes what is due, a forecast, a reminder, the line ahead, a shared record room, a dossier or an exported status. It is shown, marked as unconfirmed, and offered for review.
3. **Three levels of trust, shown everywhere a value appears:** read by AI (dotted mark), confirmed by you (filled dot), signed by a mechanic (diamond). See 02-components.md, TrustMark.
4. **Every derived value can be traced to its page.** Due dates, last-done dates, hours, answers, dossier lines and summary lines carry a page citation (PageCite) that opens the scanned page with the source ink highlighted.
5. **Both limits, the earlier one named.** Items with a calendar and an hours limit show both; the one that comes first is labelled "first". Hours are projected to "about <date>" from recent use and never override a calendar limit. Calendar-month items (annual, transponder, static system, ELT) fall due at the end of the month.
6. **Status is never colour alone.** Every status has a shape and a word (see 02-components.md, StatusMark).
7. **Offline first on the phone.** Everything works offline except the online-only list in 09-data-and-api.md §5.3 and 05-mobile-architecture.md §6.5 (AI reading, Ask, enrolling an aircraft, backups and imports, Find ADs, signing an authored entry, making or revoking share and mechanic links, inviting people, transfer and delete); these say so and never queue. Changes are saved on the device, queued, and synced; the owner can always see what is waiting; conflicts are never resolved silently.
8. **Honest about limits.** The AI reading allowance (about 50 pages a day, shared) is stated, never hidden. No invented accuracy figures, testimonials or user counts anywhere in the product or its marketing.
9. **Owner's data and attention.** No third-party tracking or advertising SDKs, no dark patterns, no lock-in. Notifications carry the whole answer and are rate-limited (at most one push and one email digest a day for due reminders; 14-decisions.md D7).

## 4. Design principles
Use these to decide between two acceptable options.
1. **Answer first.** Every home screen opens with a sentence that says what the records show (the Verdict), then the evidence. Nothing on the screen competes with that sentence.
2. **The page is always one step away.** If a screen states a fact from the records, the page that proves it is visible on the right leaf (web, tablet) or one tap away (phone).
3. **Where it is kept, and when it happened.** Tabs answer "where": Status, Logbooks, Maintenance, Aircraft, Documents, Share. Lines answer "when": the spine on every board, the route map in Logbooks, the line ahead in Status. Every record has both a tab and a place on a line.
4. **One primary action per view.** The one thing most owners need next is the filled button; everything else is secondary or quiet. Destructive actions are quiet and ask first.
5. **Readable by a 60-year-old in a hangar.** Body text 16px (web) / 16pt (phone) minimum, nothing below 13px, contrast 4.5:1 for text, 44pt / 48dp touch targets, primary actions within thumb reach on the phone, a light theme and a dark theme for the night hangar, following the system setting by default.
6. **Plain words.** The owner's vocabulary: tach, hobbs, annual, AD, squawk, A&P, IA, W&B. Buttons say what happens. See 12-copy-and-voice.md.
7. **Calm by default, loud only when it matters.** The single alarm colour (vermilion) is reserved for overdue, due soon and errors. Green and amber are not used for status.
8. **Native where it counts.** The phone apps use each platform's own navigation, sheets, gestures, pickers, widgets and notifications, while keeping D's look (coloured tabs, white leaves, ink map, the paper typeface). See 05-mobile-architecture.md.

## 5. The direction in one page
- **The binder (from direction B).** A dark cover rail on the left carries six coloured section tabs, each tab's height proportional to how much the section holds. Opening a section floods the board (the area right of the rail) with that section's colour. Work happens on white leaves laid on the board, usually two: the record on the left, its source page on a dark mat on the right.
- **Two voices.** Libre Franklin is the app speaking. Literata appears only for words transcribed from a scanned page, so the owner can always tell what the logbook says from what the software concluded.
- **Ink and vermilion.** Status uses ink marks and one alarm colour: black dot current, vermilion ring due soon, solid vermilion overdue, dashed ring no record.
- **The map (from direction C), drawn in ink on white.** Each logbook is a line in its own printer's ink; each entry a stop; a visit that signed several books an interchange; a stretch with no pages a dashed gap; the future dotted, with what is due as rings.
  - **The spine:** a strip one finger high under every board's title: the whole life, today marked, the part the current screen covers bracketed. Click to travel in time.
  - **The route map:** Logbooks opens on it. Stops open their pages on the right leaf; interchanges open every page of the visit.
  - **The line ahead:** Status shows the next 12 months on the lines, with suggested shop visits drawn as dashed interchanges. Plan ahead stretches it to 24 months with a date scrubber.
- Mockups: `docs/redesign/d/index.html`, `d/web.html`, `d/mobile.html`; screens not redrawn for D are B's (`docs/redesign/b/*.html`) with the spine added.

## 6. Out of scope
eSignature of maintenance by mechanics inside the product beyond the existing authored-entry signing, parts procurement and inventory, work orders, flight scheduling and dispatch, fleet management, billing, weather, pilot currency and medical tracking (a later addition that does not change this structure), cost of ownership.

## 7. How to resolve conflicts between documents
Precedence: (1) this file's rules, (2) 14-decisions.md (the register of resolved conflicts), (3) 09-data-and-api.md for data truth, (4) 10-line-map.md for anything drawn on the map, (5) 02-components.md for component behaviour, (6) the screen specs 04 and 06, (7) the mockups. Exact copy is owned by 12-copy-and-voice.md, accessibility and motion by 11, token values by 01 and tokens.json, web routes and shortcuts by 03, native architecture by 05. Mockup data is illustrative and invented; where two mockups disagree on a fact (a page number, a date), the data model wins and either is acceptable.
