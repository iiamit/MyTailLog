# Competitive design research: enterprise MRO, open-source/hobbyist, and adjacent references

Scope: the three groups NOT covered by the direct-GA-competitor researcher (no Coflyt, PlaneLogiX, SquawkFree, Savvy, Bluetail, ForeFlight, Garmin Pilot, LogTen, Flighty-as-competitor).
Research date: 2026-11-18.

## 0. Method and evidence legend

Every claim below carries one of these tags. Treat anything not tagged [O] as needing a second look before it is quoted externally.

- **[O] Observed** this session: I loaded the vendor page / repo / screenshot image and looked at it (rendered in a browser pane, or read the page text).
- **[V] Vendor claim**: stated on the vendor's own marketing page; read this session but not independently verified.
- **[K] Prior knowledge**: from my general knowledge of the product; NOT re-observed this session. Could be out of date.
- **[I] Inferred**: my interpretation or extrapolation.

Limits that matter:

- **CAMP could not be viewed.** The browser pane refused campsystems.com ("not allowed due to safety restrictions"), so CAMP's visual description is [K]/[I] only. Its page text and screenshot file names were read [O].
- Enterprise products are login-gated. Everything visual comes from marketing screenshots, which are staged and often old (WinAir's is dated 2018 in the image itself).
- Group 3 (adjacent references) is mostly [K]. I verified a handful (Flighty, Konfuzio, Rossum bounding boxes, ProBikeGarage, CARFAX, Grocy, KitFlight) and say so inline.
- Approximate hex values in section (d) are by-eye estimates [I], not sampled from source artwork.

---

## 1. GROUP 1 — Enterprise / fleet / MRO maintenance tracking

Six products with the most visible UI: Traxxall, Veryon Tracking (Flightdocs), CAMP, WinAir, FL3XX, Quantum MX. Short notes on AMOS and EBIS at the end.

### 1.1 Traxxall (JSSI Traxxall)

**What / target / pricing.** Maintenance tracking for corporate flight departments, charter operators and management companies; business jets, turboprops, helicopters. "Supporting over 4,000 aircraft worldwide" [V]. Quote-based, per aircraft, bundled with a human analyst [V]. Now part of JSSI; traxxall.com redirects to jetsupport.com/traxxall [O].

**Capabilities** [V]: Dashboards, Due List, Status Report, Core Templates; eSignature, Work Plans, Unscheduled Maintenance, Logbooks, Checklists; Inventory Manager (parts, orders); reporting, document management, PDF/Excel export, API. "Traxxall 360" (2020) advertised drag-and-drop customizable dashboards and reports [O, AIN headline]. Due List has "projection customization for all units of measure" [O, press release via search].

**Design language** [O — marketing screenshot of fleet + aircraft dashboards]:

- Light mode. Deep navy top bar and a navy left icon rail with a text label under each icon (Dashboard, Due List, Status, Holding Area, Work Planner). White/very light grey canvas.
- **Fleet dashboard**: a row of four full-width solid colour tiles in traffic-light order — red, orange, yellow, green — each a count (overdue / in tolerance / due / "in the green" [I for the exact labels; colours observed]). Below, a row of small white summary cards (Flight Logs, Snags, Actuals, Work Plans, Holding Area), each with two or three tiny outlined count boxes.
- **Fleet schedule grid**: aircraft as rows (tail number + type + a red aircraft glyph), days as columns, coloured dots in cells. A legend of nine dot colours: Work Plan, Flight, Inspection, Package, AD, Snag, SB, Part, MX Part. Effectively a Gantt/heat-grid.
- **Aircraft dashboard**: a semicircular **gauge** (red → yellow → green arc with a needle) next to the words "In The Green!" and a days-until-due line. Under it "Earliest Due" as **four outlined boxes: Days, Hours, Landings, APU** — the nearest limit in each unit, side by side.
- "Your Analyst" card with a human avatar, phone, email — the service relationship is given dashboard real estate.
- A full-width navy **date strip** (one cell per day for ~30 days) with coloured dots under dates that have something due.
- "Last Actuals" table: Airframe / Engine 1 / Engine 2 / APU with hours and landings. "Compliance Documents" card listing pending states (Pending Analyst Review, Closed, Pending Customer Feedback) and an upload button.
- Typography: geometric sans, small; density medium-high; tables and tiles, no illustration.

**Navigation / IA.** Fleet selector in the top bar → aircraft. Left rail by task type. Dashboard is the hub; Due List and Status Report are the workhorses [I].

**Pros.**
- "Earliest Due" in four units at once is the clearest enterprise answer to the multi-unit problem. Directly portable to Days / Tach hours (and Hobbs if tracked).
- The 30-day date strip gives a "when" picture without a full calendar.
- The colour order red→orange→yellow→green has a named middle state ("tolerance") rather than only OK/not OK.

**Cons.**
- The gauge is decoration: a needle on a red-yellow-green arc restates one number and takes a third of the hero area.
- Nine dot colours in a legend is beyond what anyone decodes at a glance; colour is the only channel (fails colour-blind users).
- Four saturated tiles shout equally; green "all fine" gets the same weight as red "overdue".
- Built around a fleet and an analyst. A single-aircraft owner would see mostly empty chrome.

URL with screenshot: https://jetsupport.com/traxxall/ (image: `.../jssi-traxxall-aircraft-and-fleet-dashboard-1536x675.webp`).

### 1.2 Veryon Tracking (formerly Flightdocs) and Veryon Work Center

**What / target / pricing.** Maintenance tracking + inventory + work orders + flight ops for business/general aviation, helicopter and commercial fleets. Quote-based; vendor claims "up to 40% cheaper than the competition" and 24/7/365 support [V]. EBIS is now part of Veryon [O].

**Capabilities** [V]: eLogbooks, eSignature, non-routine work, work orders, AD/SB monitoring with automated revision updates, due list, reliability; "Veryon AIRE" AI agents/assistant; mobile app with View Due List, Add Non-Routines, Create Maintenance Items, AI Assistant, Report Times, Update Utilizations, Add Compliance, Manage Logbooks.

**Design language** [O — two marketing screenshots: Work Center work order on a laptop; mobile/tablet app trio]:

- Web: light mode. Black top bar with a yellow chevron logo; a second row of large rectangular **module tabs** (Maintenance, Inventory, Work Center, Operations, Admin, Documents). Page title as breadcrumb ("Work Orders / DEMO 7X-2305-003") with a purple status dropdown pill ("In Progress").
- A row of four solid **stat tiles** with big numerals: blue "To Do", purple "In Progress", green "Done", orange "My Open Assignments". Beside them two **progress bars**: "18/22 Completed Items — 82%" (green) and "29.25 Actual / 17 Estimated Hours — 172%" (yellow, i.e. over-run shown as >100%).
- Line-item table with a dark navy header. Columns: ATA/Mfg Code/Type, Description, Compliance, Intervals, Next Due, Assigned To, Status. **Each of Compliance / Intervals / Next Due is a stacked triplet: "H: … / M: … / L: …"** (hours / months / landings) plus a date. Type shown as a small outlined "AD" chip. Status as a green "Completed" pill with a "View Compliance" link under it. Sub-tabs above the table (Line Items, Additional Details, Attachments, Work Performed, Parts, Linked Orders, eLogbooks).
- Mobile: dark charcoal UI. Home is a **2×2 grid of solid colour tiles with large numerals** — red "Past Due 9", orange "Coming Due 6", purple "Discrepancies 4", purple "MELs" — then a grid of icon buttons (Due List, Maintenance Items, Non-Routine, Aircraft Times) and a "Call Customer Service" row. Tablet "Pilot Dashboard" repeats the tile strip (Past Due, Tolerance, Coming Due, Discrepancies, MELs) above a card list where each item shows Next Due and **Remaining as "H: / M: / D:"**. Work order detail uses two **donut rings** (53% complete, 25% hours).
- Typography: Open Sans-like humanist sans; uppercase table headers; density high.

**Pros.**
- The H/M/L triplet cell is honest about multi-unit limits and is consistent across Compliance, Interval and Next Due. A reader learns it once.
- Mobile home answers "anything red?" in one glance; counts are tappable entry points.
- Aircraft-tail selector pinned at top of the phone screen.
- Reviewers call the due list its core strength [O, review-site summary].

**Cons.**
- Purple, blue, orange, green, red, yellow tiles on one screen: colour means "category" in one row and "severity" in the next.
- Triplets show raw numbers with no indication of which unit is limiting; users report engine items show hours remaining but no estimated date in the list [O, review-site summary]. That is exactly the calendar-vs-hours gap an owner app must close.
- Marketing imagery is stock-photo + device mock-up; no distinctive identity beyond the yellow chevron.

URLs: https://veryon.com/flightdocs-maintenance ; screenshots `.../Veryon/Work-Center-0623-min.png` and `.../Content/Blogs/MX-Tracking-Mobile-0923.png` on veryon.com.

### 1.3 CAMP Systems (CAMP AHM "MTX")

**What / target / pricing.** The incumbent for business aviation; "the only solution recommended by every major airframe OEM", "more than 50k users … every month", aircraft on CAMP "realize a 5% resale price premium on average" [all V]. Quote-based with analyst service. Owned by Hearst [O, logo on page].

**Capabilities** [V]: 24/7 analysts; automatic OEM revision application; AD/SB Manager; "Smart due lists" (adjust time windows, filter task types, **alter the aircraft utilization assumption**, project penalty-driven due times); eWork Order + ezSign; MTX Calendar; Document Manager; ezVault; Fleet Analytics; iCAMP mobile app; engine health monitoring integration. Their own one-line framing of the product: it "answers one question: **'Can I fly on that day?'**" [V, verbatim].

**Design language.** Not observed (site blocked in the browser pane). The page's four product images are named "Fleet Dashboard", "Aircraft Dashboard", "Global Aircraft Times", "Module Menu" [O, file names only]. From prior knowledge [K, medium-low confidence]: legacy CAMP is a dense desktop-web application of grey/blue data grids, many columns, PDF due-list reports as the real output; the AHM generation added a darker blue shell, card dashboards and a module launcher. Do not rely on this without a visual check.

**Pros** [I from vendor text]. "Can I fly on that day?" is the best problem statement in the category — a date-and-utilisation question, not a list. The adjustable utilisation assumption makes hour-based items forecastable in calendar terms. The resale-premium claim shows records-as-asset is a selling point at the top of the market.

**Cons** [K/I]. Analyst-mediated; the customer does not own the workflow. Report-centric (the due list is a document you print). Nothing in the positioning speaks to a single piston owner.

URL: https://www.campsystems.com/maintenance (screenshots on page; not viewed).

### 1.4 WinAir (Version 7)

**What / target / pricing.** Aviation management software "est. 1988" for operators, heli-ops, MROs, CAMOs: maintenance, inventory, compliance [V]. Packages by operation type; quote-based. Dashboards sold as add-on modules [O, AIN summary via search].

**Design language** [O — "Dashboard Screenshot 01", timestamped 2018-11-21 in the image]:

- Dark charcoal application chrome with a light-blue "WinAir dashboards" wordmark; a "CONFIGURE" link; pager at the bottom ("1: Page 1").
- Four **"gadget" panels** in a 2×2 grid, each with a coloured header bar and "SHOW CRITERIA" link, a white chart body, and a "Last Refreshed" footer: horizontal bar chart "Defects – per aircraft" (red and amber bars), grouped column chart "Outstanding PO line items – top 5 vendors by value", a pie chart "Defects – per flight hours" with a 13-item legend of ATA chapters, and "**Aircraft Flight Readiness**" — a list grouped by aircraft type with tail numbers each preceded by a coloured dot (legend: Task in Progress / Task in Tolerance Complete / Tasks Not Yet Released / Ready for Flight).
- Charting-library defaults: saturated primaries, drop shadows, legends bigger than the data.

**Pros.** "Flight readiness" as a named concept with a dot per tail is the right primitive. "Last refreshed" timestamps on every panel build trust in the data's age.

**Cons.** Classic BI-dashboard look: pie chart with 13 slices, rainbow legends, panels of equal weight with no hierarchy. Designed for a wall monitor in a maintenance control office. Dated.

URL: https://winair.ca/ (image `.../2019/01/Dashboard-Screenshot-01.png`).

### 1.5 FL3XX (maintenance module inside a charter-ops platform)

**What / target / pricing.** Charter/operator management platform (sales, dispatch, crew); maintenance is a module that tracks hours/cycles itself or syncs the due list from CAMP, Flightdocs/Veryon, Traxxall every 3 hours [O, knowledge base]. Subscription, quote-based.

**Capabilities** [O, KB text]: maintenance event list per aircraft showing remaining hours, cycles or days; **forecast of remaining time at the moment of each scheduled flight**, computed from the aircraft's actual schedule (estimated flight times, estimated landings, calendar days between flights); when insufficient remains, aircraft overall status and maintenance status go RED; a user can "acknowledge" to turn it green/OK without changing the numbers; sales is warned when selling a leg with a maintenance conflict; alerts for expiring aircraft documents.

**Design language** [O — KB screenshot of the Aircraft module]: light, form-like. "Aircraft N475WB" underlined heading; "Maintenance" label with a small green **"OK" badge**. Table columns: Description, Profile Type (Airframe/APU), Task Type, Update Type (Calendar/Interval), Last Update, **Remaining**, Due Every, Next Due, Max Next Due. Every cell is a grey rounded input-looking box. Remaining reads as plain text: "Days Left: 34", "Hours Left: …", "Cycles Left: 20".

**Pros.** Status is computed **per future flight**, not per today — the most sophisticated forecasting idea in the set, and the one most relevant to "will my annual run out before the trip?". Plain-language "Days Left: 34". "Max Next Due" column makes tolerance explicit.

**Cons.** Acknowledge-to-green hides a real red behind a click — a pattern to avoid in an owner tool. Everything looks like a disabled form field; no visual priority.

URLs: https://www.fl3xx.com/product/fl3xx/maintenance-module ; https://www.fl3xx.com/kb/aircraft-maintenance-status-calculation (screenshot on page).

### 1.6 Quantum MX (FLY Online Tools)

**What / target / pricing.** Work-order, inventory and document software for small A&P shops and Part 145 repair stations, since 2013. **$79 / $109 / $189 per month** by number of teams and storage; unlimited users; 30-day free trial [O, pricing section]. Browser-only, "no app required" [V].

**Capabilities** [V]: work orders with checklists and timers, estimates/invoices, customer portal for online work authorisation, parts ordering and inventory traceability, **document generation: logbook entries, parts condition tags, release forms, 8130s**, QuickBooks Online integration, FAA registry import by tail number.

**Design language** [O — home hero mock-up, low resolution]: light Bootstrap-era admin UI. Grey left sidebar, white canvas, a row of four white stat tiles each with a coloured footer strip (orange, red, blue, green), then an "In Work" multi-column list of work orders. Marketing site is a grey gradient with device outlines. Tablet shows a "Logbook Entry" form; phone shows a bar chart.

**Pros.** The only Group-1 product with public self-serve pricing. Generates the mechanic-side documents (logbook entry stickers, parts tags) that the owner's records are later built from — a natural interchange point [I].

**Cons.** Generic admin-template look; no identity. Shop-side, so no owner view beyond the portal.

URL: https://www.quantum-mx.com/

### 1.7 Brief notes (not examined in depth)

- **AMOS (Swiss-AS)** — airline-grade MRO suite. [K] Java client heritage, extremely dense multi-pane forms, programme codes ("APN" numbers) as navigation, grey UI. The far end of the density spectrum; nothing trickles down directly except the vocabulary (task cards, work packages).
- **EBIS** — now folded into Veryon [O]. [K] Heavy-fleet/helicopter MRO; grid-centric.
- **Aircraft Maintenance Systems, SOMA, AvPro** — not examined; expect the same grid + traffic-light pattern [I].

### 1.8 Group 1 pattern table

| Product | Mode | Chrome colour | Status visual | Multi-unit handling | Observed? |
|---|---|---|---|---|---|
| Traxxall | Light | Navy rail + bar | 4 solid tiles R/O/Y/G; gauge; date strip with dots | "Earliest Due": Days · Hours · Landings · APU boxes | [O] |
| Veryon | Light web, dark mobile | Black bar, yellow logo | Solid count tiles; pills; progress bars; donuts | H / M / L stacked triplet in each cell | [O] |
| CAMP | Unknown | Unknown | Due-list report | Adjustable utilisation assumption → projected dates | [V]/[K] |
| WinAir | Dark chrome, white panels | Charcoal + blue headers | Dot per tail with 4-colour legend; BI charts | Not shown | [O] |
| FL3XX | Light | Neutral grey | Green "OK" badge; RED aircraft | "Days/Hours/Cycles Left" text; per-flight forecast | [O] |
| Quantum MX | Light | Grey sidebar | Stat tiles with colour footers | n/a (shop tool) | [O] |

---

## 2. GROUP 2 — Open-source / free / hobbyist

### 2.1 MyFlightbook

**What / target / pricing.** Free pilot logbook (web + iOS + Android), running since 2006; "100,000+ pilots", 27.9M flights in 390.2K aircraft at the time of viewing [O, home page]. Donation-supported. Source for the website/service is public on GitHub (ericberman/MyFlightbookWeb, C#/ASP.NET + MySQL, 67 stars; GitHub's API reports no detected licence [O] — I recall it being GPL but did not confirm [K]).

**Capabilities relevant here.**
- [O, feature chart] "Track aircraft inspections, other aircraft deadlines"; "Deadlines for aircraft"; 16 print layouts and customisable PDF; sign flights; share read-only or editable access with instructors.
- [O, FAQ] Aircraft are **shared records across users**: maintenance updates recorded by one pilot are reflected for every pilot who flies that tail. Maintenance shows up inside the pilot's **Currency** list once the maintenance record has been edited. Custom Deadlines (time-only) also appear in Currency. Text shortcut: typing `VORCHK-…` in a flight's comments sets the aircraft's last VOR check and writes a maintenance note.
- [K] The aircraft edit page has a fixed maintenance block: last Annual, Transponder, Pitot-static, Altimeter, ELT, VOR check, 100-hour, last oil change (hours) and engine time, registration renewal, each with a computed next-due, plus a change log of who edited what. No AD tracking, no scanned-logbook handling, no weight & balance.

**Design language** [O, home page]: light. Sky-blue/teal bars and logo; grey bold Open Sans-like headings; centred single column; a small icon-plus-text top menu (Home, Logbook, Aircraft, Airports, Training, Profile); green arrow bullets; cookie banner. Visually mid-2000s: gradients-free but table-layout feel, small type, no spacing system. [K] Currency/maintenance lines are plain text rows coloured green (OK), blue (getting close), red bold (expired).

**Navigation / IA.** Pilot-centric: Logbook → Aircraft → Airports → Training → Profile. Maintenance is a sub-section of an aircraft's edit form, surfaced elsewhere as currency lines.

**Pros.** Free, durable (20 years), trusted, exhaustive on pilot logging. Folding aircraft due items into the same "am I current?" list the pilot already checks is a genuinely good IA idea: **one list for "can I legally fly today" covering pilot and aircraft**. Comment-shortcut logging is clever one-handed input.

**Cons.** Maintenance is an afterthought: fixed item list, calendar-only for most, no hours forecasting, no documents. The interface is functional but visually neglected; density without hierarchy. Not owner-oriented.

URLs: https://myflightbook.com/logbook/mvc/pub ; https://myflightbook.com/logbook/mvc/pub/FeatureChart ; https://myflightbook.com/logbook/mvc/faq ; https://github.com/ericberman/MyFlightbookWeb

### 2.2 Simple Aircraft Manager (marbindrakon/simple-aircraft-manager)

The closest open-source functional overlap found. **Flag for the direct-competitor researcher if not already covered.**

**What / target / pricing.** Self-hosted, free, public domain (The Unlicense). Django 5.2 + DRF backend; **PatternFly 5 + Alpine.js + Chart.js from CDN, no build step** [O, docs]. For "individual owners and small-medium sized flying clubs with an emphasis on making it easy to share information with outsiders (mechanics, prospective buyers)" [O, README]. Created Feb 2026, 6 stars, README states the codebase was AI-generated [O]. Also ships a desktop app with local/custom AI providers [O, docs TOC].

**Capabilities** [O, README + docs]: fleet cards; components with TBO/replacement intervals and hierarchy; squawks with priority incl. "Ground Aircraft"; ADs/bulletins (mandatory vs advisory) with recurring due and compliance history; inspection types with recurrence; **logbook with AI-assisted transcription from scanned pages** (Claude API or self-hosted Ollama; upload-only mode without a provider; multi-image or archive upload sorted by filename); document collections with multi-page viewer; major repairs & alterations with an ICA indicator; oil/fuel consumption and oil-analysis trend charts; **public read-only share links without an account**; roles (owner/pilot); OIDC; MCP "AI agents"; per-aircraft feature flags; plugin system.

**Airworthiness status logic** [O, docs — worth copying as a spec baseline]: three states. Green "Airworthy"; Orange "Caution" = anything within **10 flight hours or 30 calendar days**; Red "Grounded" = overdue mandatory bulletin **or a mandatory bulletin with no compliance record at all**, a grounding squawk, an overdue required inspection, or a replacement-critical component past its interval. Worst issue wins. An "Airworthiness Issues" card lists severity, category, title, and a plain description ("Overdue by 15 hours", "Due in 8 hours").

**Design language** [O — dashboard screenshot]: stock PatternFly. Black masthead with hamburger, product name, and three text links (Dashboard, Tools, API). Light grey page, white cards in a 4-up grid. Each aircraft card: tail number + small role chip; a **status badge top-right** (solid red "Grounded" with ✕, solid green "Airworthy" with ✓); optional photo; label/value rows; **hours as a large blue numeral**; a grey status chip ("AVAILABLE", "MX"); a red "11 grounding" count line; two buttons — primary blue "Update Hours" and outline "Details". Grounded cards get a **red left border** and the "Update Hours" button is **disabled**. Aircraft detail is 8 tabs with sub-tab toggles (Overview, Squawks, Health, Components, Compliance, Maintenance, Documents, Settings) and an aircraft switcher with status dots.

**Pros.**
- Status rule is written down, deterministic, and explained in the UI in words.
- "No compliance record = red" is the honest default.
- Share links, feature flags per aircraft, and upload-only mode are thoughtful.
- Icon + colour + word on every status badge (not colour alone).

**Cons.**
- Looks exactly like a Red Hat admin console. Zero aviation character; the big blue hours numeral is the only emphasis.
- Disabling "Update Hours" when grounded punishes the user for the app's own (possibly wrong) inference; they had to add a feature flag to turn it off.
- Eight tabs + sub-tabs is fleet-software IA applied to one aeroplane.
- Fixed 10 h / 30 d thresholds regardless of item (30 days is too short a warning for an annual that needs a shop slot booked).
- No visible review-beside-scan step in the docs I read: import "transcribes into structured entries" [O]; whether the owner confirms each beside the scan was not established.

URLs: https://github.com/marbindrakon/simple-aircraft-manager ; https://docs.simple-aircraft.app/ (screenshot `_images/dashboard.png`).

### 2.3 Aircraft Maintenance Log (mbegich/aircraft-maintenance-log)

**What.** Static PWA (Vite + React + TS) on GitHub Pages; no server, no account, data in the browser only; no licence file detected; 0 stars; single-commit project (Oct 2026) [O].

**Capabilities** [O, README]: aircraft profile with Hobbs and Tach and "for hire"/"IFR" flags that switch items on; maintenance items with calendar-month/day and/or hour intervals, **"whichever comes first"**, optional **end-of-calendar-month rule**, fixed due-date override (ELT battery); preloaded FAA items each with its CFR reference; electronic logbook; "Find A&P"; `.ics` calendar export; browser notifications; backup export.

**Design language** [O — dashboard screenshot]. The best due list in the open-source set:

- Royal-blue top nav with emoji icons (Dashboard, Aircraft, Maintenance, Logbook, Find A&P, Data). White canvas, system sans.
- Three summary cards with a thick coloured left border and a big number: **1 Overdue** (red), **2 Due soon (≤30 days or ≤10 hrs)** (amber — the threshold is printed on the card), **5 OK** (green).
- One aircraft panel: tail number bold, "demo" chip, make/model, then right-aligned "**Hobbs 2456.3 · Tach 2104.7 as of Sep 30, 2026**" and an "Update hours" button.
- Item rows sorted worst-first. Each row: coloured left band + tinted background (red tint, amber tint, white), a small caps status pill (OVERDUE / DUE SOON / OK), item name bold with the regulation in small grey beneath ("14 CFR 91.171"), and on the right two lines — "Due Sep 19, 2026" / "11 days overdue"; or for dual-limit items "**Due Oct 30, 2026 at 2151.2 tach**" / "**due in 30 days · 46.5 hrs left**". A "Log completion" button on every row.
- Footer legend defines the three states in a sentence and adds "Always verify against your official logbooks and regulations."

**Pros.** Shows both limits and both remainders on one line. Threshold printed where the count is. Regulation cited per item. "As of" date on the hours. One obvious action per row. Calendar-month rule modelled correctly.

**Cons.** Emoji as iconography; default blue; no hierarchy between an overdue VOR check (VFR-irrelevant) and an overdue annual (grounding). No projected date for hour-limited items (it shows hours left but not when you will get there). No documents or scans.

URLs: https://github.com/mbegich/aircraft-maintenance-log ; live https://mbegich.github.io/aircraft-maintenance-log/

### 2.4 The Thrifty Pilot — Aircraft Maintenance Logbook

**What.** Native offline Windows desktop app (Python 3.13, PySide6/Qt, SQLite, ReportLab); 1.1.0-rc1 "evaluation candidate", unsigned installer; custom licence; 0 stars (Oct 2026) [O].

**Capabilities** [O, README]: multiple aircraft; components and transfer events; draft autosave; **immutable finalized entries with append-only amendments**; **physical-signature blocks and managed signed scans**; discrepancy tracking; manual AD/SB records; date/hour/cycle reminders; parts and expenses; multipage PDF and native print; a Timeline view.

**Design language** [O — dashboard-dark screenshot]: dark navy Qt UI. Left column: brand in caps, then a bordered list of 15 nav items (Dashboard, Aircraft, Logbook, Maintenance Items, Schedules, ADs, Service Bulletins, Components, Component History, Parts, Expenses, Reports, Settings & Backups, Timeline). Main: aircraft selector, teal "New Maintenance Entry" button, title "Dashboard" with the line "**Keep the record clear. Keep the history intact.**", three wide buttons (Add Discrepancy, View Maintenance Schedule, Print Logbook Entry), then a text panel: tail, type, "2345.6 airframe hours • 1 open maintenance items", Tach/Hobbs, backup status, "Maintenance ahead", "Recent records" as underlined links with a state suffix ("• Historical import requiring verification"). Footer: "**Local records • No telemetry • Status indicators do not determine airworthiness**".

**Pros.** The strongest *record-integrity* thinking found: finalise-then-amend, signed scans, backup status on the dashboard, "historical import requiring verification" as a first-class state. The footer disclaimer is the right legal posture stated calmly.

**Cons.** Almost no visual hierarchy — it is a text document in a dark box. 15 flat nav items. Windows-only.

URL: https://github.com/thethriftypilot/AircraftMaintenanceLogbook

### 2.5 SlingologyMX

**What.** Owner-centric web app for Experimental/Amateur-Built owners; Apache-2.0; TypeScript (built on Lovable); 2 stars; public instance closed April 2026, self-host only [O]. Landing page: pale blue gradient, round aircraft-illustration logo, tagline "Built by Experimental Owners. Free to use. Your data stays yours. No lock-ins. **Paper logs remain the master.**" [O].

**Capabilities** [O, README]: maintenance records as *metadata only* (date, TTAF, engine/prop time, category, reference to a scan, costs split into labour/parts/other with linked financial transactions); directives (AD/SB/SL) with trigger method time/cycles/calendar/one-time/mixed and statuses Open / Compliant / Completed / Not Applicable / Resolved; equipment; planning.

**Design note.** Its explicit principle — the system tracks metadata and planning signals, **not logbook prose**; paper is the source of truth — is the opposite bet from an OCR-digitising product, and worth answering in positioning: the scan *is* the paper, kept beside every extracted value [I].

URL: https://github.com/AlchemyGeek/SlingologyMX ; https://slingologymx.lovable.app

### 2.6 avManage (jdfrey1/avmanage-public)

MIT, Node/Express + React PWA + PostgreSQL, Docker; for one shared aircraft (owner + lessees/co-owners); created Oct 2026, 0 stars [O]. Notable capabilities [O, README]: Hobbs/flight-timer readings **optionally read from a photo of the meters**; squawks where an open *major* squawk grounds the aircraft and blocks reservations; hour-based intervals counted on the flight timer; date-based inspections; **logbook import and search**; invoices split into line items and linked to logbook entries; ARROW documents with an optional "**ask the documents**" chat; per-pilot `.ics` feed. Not viewed visually. Shows that "ask your documents" and photo-of-the-tach are becoming table stakes among new hobby projects.

### 2.7 Other open-source projects (brief)

| Project | What | Design note | Evidence |
|---|---|---|---|
| vsimakhin/web-logbook (MIT, 123★, Go + React) | EASA-style **pilot** logbook; single binary + SQLite; exports a formatted EASA PDF you print and sign | MUI light theme; left icon nav; a dense data grid that reproduces the paper logbook's **two-level grouped column headers** and per-page / running **totals rows** — "paper form as data grid" done properly | [O] screenshot |
| fiffty-50/openPilotLog (GPL-3, 21★, Qt/C++) | Airline pilot logbook; author's motive is escaping subscription lock-in | Native Qt tables | [O] README only |
| Penaz89/AVLedger (GPL-3, Go) | Logbook for maintenance *engineers* (EASA AME experience log); SQLite; fast PDF export; auto-backup into detected cloud-sync folders | Light/dark wordmark; "minimalist" positioning | [O] README only |
| Airnxt/ad-check, EASA AD extraction repos | Scripts/pipelines that parse AD PDFs for applicability | No UI; data tooling | [O] repo list |
| AhmedTMM/LoggerAi | Hackathon agent that parses logbooks to a go/no-go | Not examined | [O] repo list |

Search of GitHub for "aircraft maintenance tracker", "aircraft logbook", "airworthiness directive", "aircraft maintenance logbook", "general aviation maintenance" returned nothing above ~7 stars in the owner-maintenance niche [O]. **The open-source owner-maintenance space is essentially empty and very young** (most relevant repos were created in 2026).

### 2.8 Builder logs (Experimental / homebuilt)

- **EAA Builders Log** (eaabuilderslog.org) — free for EAA members; web [O]. Home is a 2000s-style page: login box, carousel of project photos, "8 closest airplane projects" to your location with builder name and last-updated date [O]. [K] Entries are date + hours + category + text + photos, publicly browsable; the community/social-proof angle (see other builders' logs of the same kit) is its real value. Design: dated, table-based.
- **KitLog Pro** (kitlog.com) — Windows desktop app plus MyKitLog.com web posting; site is a GIF-header 2000s layout with server-outage announcements on the home page [O]. [K] Entries with photos, expense tracking, printable log for the FAA inspector/DAR. Design: legacy desktop.
- **KitFlight** (iOS/iPadOS/macOS; pay-once; local + iCloud) [O, Kitplanes]. Speech-to-text entries "when your hands are busy"; **photo annotation with numbered callouts**; contributors; attachments gallery by category; CSV/JSON export; import from EAA Builders Log and MyKitLog. Screenshot [O]: iOS dark mode, amber accent, "Project Insights" card with a **sentence headline** ("Your weekday focus peaks on Tue with total 528hrs 46min of work logged"), two big stats, and a 7-square intensity strip. The only product in Group 2 with contemporary native polish.

### 2.9 Spreadsheets owners actually use

No canonical free AD-compliance spreadsheet surfaced in search [O]; forum posts confirm the common pattern is **MyFlightbook for time-based items + a personal spreadsheet for everything else** [O, MooneySpace via search]. [K] The typical owner sheet: one tab "Status" (item, last done date, last done tach, interval months, interval hours, next due date, next due tach, remaining, conditional-format red/yellow/green); one tab "AD list" mirroring the shop's AD compliance record (AD number, subject, applicability, method of compliance, one-time/recurring, date/hours complied, next due, signature reference); one tab for equipment/serials; one for costs. Strengths: total flexibility, sortable, printable, mechanic-readable, zero lock-in. Weaknesses: no link to the scanned source, formulas break, no notifications, calendar-month rule usually wrong, phone-hostile.

Design implication [I]: **the spreadsheet is the incumbent.** A table view that feels as direct as a sheet (sort, filter, inline edit, export CSV) is a requirement, not a nice-to-have.

### 2.10 General open-source CMMS

**Atlas CMMS (Grashjs/cmms)** — "Jira for technicians"; self-hosted, Docker; web + React Native mobile; GPLv3 core [search listings; one directory says AGPL — check repo]. Work orders, preventive maintenance with triggers, **meters**, assets, locations, parts, requests, analytics [O, README].
Design [O — work-orders screenshot]: dark navy left sidebar (logo, "Powered by Intelloop", nav with count badges: Work Orders 77, Preventive Maintenance, Analytics, Requests, Assets, Locations, Parts/Inventory, Meters, People & Teams, Vendors, Categories); white canvas; view switcher tabs **List / Calendar / Column (kanban)**; filter chips; MUI data grid with status as a coloured ring + word (On Hold amber, In Progress green, Open grey), priority as a red "HIGH" pill, worker avatars. Periwinkle-blue primary.
Pros: clean, modern, three views of the same data. Cons: generic SaaS template; asset = equipment in a building; no notion of airworthiness, calendar-month rules, or regulated records; team-assignment IA is irrelevant to a solo owner.

**openMAINT** — property/facility CMMS on CMDBuild; AGPL [K]. Screenshot too small to read in detail [O]: Ext-JS style, orange accents, tree nav + grid + detail tabs. Enterprise-Java look. Not suitable as a reference.

**Grocy** — self-hosted household ERP (stock, chores, tasks, batteries, equipment) [O]. Not aircraft software, but owners do bend it to "chores with intervals".
Design [O — desktop screenshot]: Bootstrap; grey left nav; "Stock overview" with a strip of **four status chips that are both legend and filter** ("1 product is expired", "2 products are overdue", "4 products are due within the next 5 days", "2 products are below defined min. stock amount"), each chip's colour matching the **full-row background tint** in the table below (red / grey / yellow / blue). Per-row green action buttons. Their own copy: "**One hand, 3 seconds, no problem**" for input forms [O].
Transferable: legend = filter = count in one control; whole-row tinting for scanability; the one-hand/3-second input standard.

---

## 3. GROUP 3 — Adjacent best-in-class references

Format per reference: **Pattern** → **Why it works** → **Maps to**. Tags as in section 0; most are [K].

### 3(i) Vehicle / asset maintenance for individual owners

**Fuelly / aCar, Drivvo** [K]
- Pattern: the home action is "add fill-up"; the first field is the **odometer**, pre-focused with a numeric keypad and the previous reading shown; everything else is optional. Reminders are defined as "every N km **or** M months, whichever first". Drivvo uses a floating action button that fans out into Refuelling / Expense / Service / Reminder.
- Why: the meter reading is the one fact you have standing next to the machine; making it the cheapest possible input keeps the dataset alive.
- Maps to: one-handed hangar logging — open app → tach keypad with last value and live delta ("2104.7 → 2106.2, +1.5") → done. Optional photo of the tach for the record (avManage reads meters from a photo [O]).

**CARFAX Car Care** [O, App Store text] [K for layout]
- Pattern: a "customized dashboard" of service categories (oil, tires, filters, inspections), each with its own due state; service history auto-populated from shops; recall alerts pushed; estimated car value shown beside maintenance.
- Why: ties upkeep to **asset value** — the same motive as a pre-buy dossier. Recalls ≈ ADs: an external authority issues them, the app matches them to your VIN.
- Maps to: AD feed matched to make/model/serial as "recall-style" alerts; record room that opens with a history summary a buyer can trust.

**ProBikeGarage (and Strava gear)** [O, App Store text] [K for visuals]
- Pattern: every component has its own usage counter fed automatically by rides (Strava sync); each shows a **horizontal wear bar** filling toward a service threshold in the unit that matters for that part (hours for a fork, km for a chain); alert on crossing. Components can be moved between bikes and keep their history.
- Why: per-component counters in native units; the bar is a remaining-life gauge readable in a list; history follows the part, not the vehicle.
- Maps to: equipment list (ELT battery, vacuum pump, mags, prop, engine TBO) with a thin life bar per item; hours-driven items update automatically when tach is logged; serialised components keep history if swapped.

**Boat-owner apps** [K, generic]
- Pattern: engine-hours-based service + seasonal checklists (haul-out, winterise) + document locker for registration/insurance.
- Maps to: seasonal framing ("before annual", "before winter") for checklists; ARROW-style document locker with expiry.

### 3(ii) Document digitisation + human-in-the-loop review

**Rossum, Konfuzio, Docsumo, Mindee-style validation screens** [O for Rossum bounding-box docs and Konfuzio review docs; K for layout]
- Pattern: document image on one side, extracted fields in a sidebar. Each field is tied to a **bounding box** on the page; hovering a box names its field, clicking a value jumps to its field, and the box can be re-drawn to correct the value (Rossum [O]). Per-field **Accept / Decline / Mark as missing**, plus "**Accept all**" for a set, appearing on hover over unrevised data (Konfuzio [O]). [K] Low-confidence fields are flagged so the eye goes there first; keyboard moves to the next unconfirmed field; a document cannot be exported until required fields are confirmed.
- Why: verification cost is dominated by eye travel between source and value. Binding them spatially and letting the keyboard drive makes a confirm ~1 second. "Mark as missing" is a distinct, positive assertion ("I looked; it is not there").
- Maps to: scan review desk — left: page image with boxes; right: entry fields (date, tach, description, signer, cert number). Enter = confirm and advance; a field the model is unsure of is visibly different; "not on page" is a real state; "accept remaining on this page" for clean typed stickers.

**Adobe Scan, Genius Scan, Apple Notes scanner** [K]
- Pattern: live edge detection with an auto-shutter, perspective correction, a filmstrip of captured pages with reorder/retake, batch mode that keeps the camera open.
- Why: capture stays in flow; the retake decision happens while the book is still open on the bench.
- Maps to: phone capture of logbook pages — auto-capture, page counter ("page 37"), blur/glare warning before leaving the page, gutter-shadow handling for bound books.

**Receipt/expense apps (Expensify SmartScan, Ramp, Dext)** [K]
- Pattern: photograph now, extraction happens in the background, the item sits in a "needs review" state with the 3–4 extracted facts shown over the thumbnail; one tap to confirm.
- Why: separates capture (hangar, phone) from review (desk) — two moments, two devices.
- Maps to: exactly this product's desk/hangar split. Snap in the hangar → "12 pages waiting for review" on the desktop.

**FamilySearch Full-Text Search, Ancestry record viewer, Transkribus** [K; FamilySearch's own page returned 403 this session, the feature's existence confirmed via search]
- Pattern: handwritten page image beside a machine transcript; selecting a transcript line highlights the corresponding region of the image and vice-versa; search hits are highlighted **on the image**; the viewer carries a film-strip of adjacent pages and a full citation (collection, volume, page, image number) with a copyable source reference; corrections are suggested by users and versioned.
- Why: for handwriting, trust comes only from seeing the ink. Line-level sync makes disagreement cheap to spot. The always-visible citation is what makes a transcript usable as evidence.
- Maps to: side-by-side review; logbook search that lands on the highlighted line of the scanned page; every extracted entry carries "Airframe Log 2, p. 41, entry 3".

**Readwise / Reader, NotebookLM, Perplexity** [K]
- Pattern: every AI sentence ends in a numbered **citation chip**; hover shows the quoted source passage; click opens the source scrolled to and highlighting that passage. Readwise keeps the highlight permanently linked to its location in the book.
- Why: the answer is checkable in one gesture; unchecked answers are visibly so.
- Maps to: "Ask your logbooks" — chips that preview a **cropped image of the scanned lines** (not just text), then open the page at that region; an explicit "no entry found" answer when nothing supports a claim.

### 3(iii) Compliance / "what's due" status with excellent information design

**Vanta / Drata** [O for the product-page description via search; K for detail]
- Pattern: a headline percentage of controls OK with separate progress bars for tests and documents; each control is a row with status, owner, and the **evidence** that satisfies it; failing/"needs attention" items are counted and filterable; "upcoming" tests are a separate category with a rollout date.
- Why: status is always *because of* evidence, and evidence has an age. A reviewer (auditor) can be given a read-only view of exactly that mapping.
- Maps to: each inspection/AD row shows what satisfies it (link to the logbook entry scan) and when; record room = auditor view. Caution [I]: a "% compliant" number is wrong for airworthiness — one overdue item is 100% of the problem. Use counts and a verdict, not a percentage.

**Oura readiness, Apple Health/Fitness summaries** [K]
- Pattern: one headline state, then a short list of **contributors** each with its own mini bar and a plain-language label ("Pay attention"), sorted so the weakest shows; tapping a contributor explains it and shows its trend. Apple Fitness rings: three concentric progress rings readable at thumbnail size, reused in widgets and on the watch.
- Why: a single verdict for the glance, with the reasons one level down. Language is advisory, not alarmist.
- Maps to: aircraft status-at-a-glance: a verdict word ("Nothing due for 61 days / 38 hrs") + contributor rows (Annual, Transponder, Pitot-static, ELT, ADs, Oil). Lock-screen/home-screen widget with the same primitive.

**Things 3** [K]
- Pattern: time is grouped by horizon, not by date field: Today / This Evening / Upcoming (next days individually, then by month) / Someday. Deadlines show as a small flag with "3 days left". The "Magic Plus" button is draggable into the list to insert at a position. Generous whitespace, one accent colour, checkbox shapes that differ by type.
- Why: horizons match how people plan; countdowns are phrased in remaining time, not dates.
- Maps to: due list grouped Overdue / This month / Next 90 days / This year / Later, with hour-limited items placed by their *projected* date and labelled with both ("~Mar 2027 · 38 hrs left").

**Linear** [K]
- Pattern: keyboard-first (command palette, single-key actions), dense single-line rows with a fixed column rhythm (status icon, ID, title, labels, date), tiny purposeful status icons (dotted circle → half → full), triage inbox that forces accept/decline, cycles with a burn-up chart.
- Why: rows scan like a table but read like a list; status is a shape as well as a colour.
- Maps to: desktop review queue (triage inbox for extracted entries); status glyphs that work in monochrome and in print; command palette ("go to annual", "log hours").

**Flighty** (as a design reference, not as a competitor) [O — Apple "Behind the Design" and a design teardown read this session]
- Pattern: the stated analogy is the **airport departure board** — "those airport boards have one line per flight … they've had 50 years of figuring out what's important" (Ryan Jones, via Apple). One line per item, fixed fields, colour-coded status. A set of context-aware "smart states" changes what the card shows as the event approaches (24 h before, 3 h before, at gate, in flight). Goal: "boringly obvious". Offline-first. Live Activities carry the single most important fact to the lock screen.
- Why: borrowing a mature real-world information format gives instant legibility *and* a distinctive identity in one move.
- Maps to: due list as a departure board (ITEM · DUE · REMAINING · STATUS); item cards that change content by proximity (far: just the date; 60 days out: "book the shop"; 10 hrs out: "plan flights"; overdue: what it grounds); works offline in a hangar.

**Apple Weather 10-day, calendar heat strips** [K]
- Pattern: each day's range drawn as a bar positioned on a shared scale, so the column of bars is a chart.
- Maps to: each due item as a bar on a shared **time axis** (today → +24 months), so the list doubles as a forecast; hour-limited items drawn with a fuzzy end reflecting utilisation uncertainty.

### 3(iv) Archival / records / provenance UIs

**Museum online collections (Rijksmuseum, Cooper Hewitt, V&A, Smithsonian Open Access)** [K]
- Pattern: object page = very large zoomable image on a neutral ground; a "tombstone" label (title, maker, date, medium, dimensions, **accession number**) in quiet typography; provenance as a dated chain of custody; persistent citable URL; download/licence statement; related objects.
- Why: restraint signals value — the object is the hero, the interface recedes; identifiers and provenance make it citable.
- Maps to: logbook page viewer and record room — deep-zoom scan on a neutral mat, a label block (Logbook · page · date range · signer), stable per-page URL/ID, custody chain (owners, engine changes) as provenance.

**Stripe Atlas / document vaults, DocSend, Dropbox/Notion sharing** [K]
- Pattern: a short list of canonical documents with status (signed, filed), each downloadable; share links with expiry, revocation, optional passcode, and a **view log** (who opened what, when); the guest sees a clear "shared with you, read-only" frame with the owner's identity and a table of contents.
- Why: the sharer keeps control and gets a signal of the reader's interest; the reader gets an orderly binder, not a folder dump.
- Maps to: record room — cover page (aircraft, as-of date, what is included), sections (Status, ADs, Inspections, Logbooks, 337s/STCs, W&B, Equipment), expiry and revoke, view log, "as of" timestamp on every figure.

**CARFAX-style history report** [K]
- Pattern: a summary band of badges at the top (owners, accidents reported, service records count), then a chronological table by owner period.
- Maps to: pre-buy dossier front page — factual badges only where the data supports them ("Logs digitised from 1974", "Annuals recorded: 49 of 52 years", "Open ADs: 0 of 37 applicable") with every badge linking to its evidence. Gaps shown, not hidden [I].

**Photos-style deep timelines (Apple Photos Years/Months/Days, GitHub contribution graph)** [K]
- Pattern: zoom levels over the same timeline; a density mini-map so decades compress without losing the shape of activity.
- Maps to: logbook timeline spanning 50+ years — a year strip with entry-density ticks, era bands (engine since overhaul, ownership periods, paint/interior), pinch/scroll from decades to a single entry.

### 3(v) Distinctive, non-generic visual identity in a technical domain

**Teenage Engineering** [K] — instrument-panel grids; a tiny palette (white/light grey, black, one or two signal colours — orange, sometimes blue/yellow); mono/technical type with part-number style labels; pictogram icons drawn on a pixel grid; functions printed next to controls like silkscreen. Lesson: label everything like hardware; let numerals be the graphics.

**Linear / Vercel Geist / Railway** [K] — near-monochrome, hairline borders, one accent, a real monospace for data, tight radii, dark mode as a first-class design not an inversion. Lesson: discipline reads as "serious tool". Risk: this is now the *default* look of developer SaaS; adopting it wholesale would be generic in 2026.

**Things 3** [K] — warmth through whitespace, a single blue, custom checkbox shapes, motion that explains structure. Lesson: calm is a feature for anxiety-inducing obligations.

**Raycast / Arc** [K] — command-first; colour used as user-owned identity (Arc spaces). Lesson: the aircraft itself (paint scheme colours, tail number) could be the one personal accent.

**Panic (Nova, Playdate)** [K] — playful colour + exacting type; hardware-style product pages. Lesson: a technical tool can have charm in its details (empty states, 404s) without compromising seriousness.

**Stripe Press** [K] — books as objects: cloth-and-foil covers, serif text faces, generous margins. Lesson: printed outputs (dossier, summary) can be *typeset* documents, not screen dumps.

**Bloomberg Terminal** [K] — black ground, amber primary text, function-key colour bands, extreme density that experts love because every position is stable. Lesson: stable positions + colour-as-meaning scale to expert density.

**Garmin G1000/G3X Touch, Dynon SkyView** [K] — see territory 4 in section (d). Lesson: pilots already carry a rigorous colour grammar in their heads; reusing it is free comprehension, misusing it is a hazard.

**Airbus B612 typeface** [K] — an open-source (OFL) type family commissioned by Airbus and designed for cockpit-screen legibility, with a mono companion. A real piece of aviation material culture that can be shipped in a web app; worth evaluating for numerals and data.

**FAA sectional charts, Jeppesen plates, placards, paper logbooks, departure boards** — treated as full territories in section (d).

---

## 4. SYNTHESIS

### (a) The enterprise "category look" and its failure modes

**The look** (observed across Traxxall, Veryon, WinAir, FL3XX, Quantum MX; assumed for CAMP):

1. **Navy or charcoal chrome around a white data canvas.** Left rail or top module tabs named after departments (Maintenance, Inventory, Work Center, Operations).
2. **A row of saturated count tiles** in traffic-light order — Past Due (red), Tolerance (orange), Coming Due (yellow), OK (green) — often joined by purple/blue tiles for discrepancies and work orders.
3. **The due list as a wide grid**: ATA code, description, last compliance, interval, next due, remaining, each split by unit (hours / months-or-days / landings-or-cycles), with status pills at the right.
4. **Dashboard furniture**: gauges, donuts, pies, progress bars over 100%, a calendar/Gantt grid with coloured dots and a long legend.
5. **A human analyst** presented in the UI (photo, phone number) — the software is the front end of a service.
6. Generic humanist/geometric sans, uppercase column headers, stock-photo marketing, device mock-ups. Mobile apps are a tile launcher into the same lists.

**What is genuinely good and trickles down:**

- A named intermediate state ("tolerance"/"coming due") between OK and overdue.
- Showing the nearest limit in every unit at once (Traxxall "Earliest Due"; Veryon H/M/L).
- Forecasting against a utilisation assumption (CAMP) and against actual planned flights (FL3XX).
- CAMP's question — "Can I fly on that day?" — as the organising idea.
- "Last refreshed"/"as of" stamps; compliance documents as a tracked queue.

**Failure modes (to avoid):**

- **Colour does all the work, and means different things in adjacent rows** (severity in one tile strip, category in the next; nine dot colours in a legend). Inaccessible and unlearnable.
- **Equal visual weight for everything.** Green tiles as loud as red ones; four chart panels of the same size; no "the one thing" hierarchy.
- **Units shown, limiting unit not identified.** The triplet tells you three numbers and leaves you to work out which bites first and *when* in calendar terms. Users complain about exactly this.
- **Decoration posing as data**: needle gauges, 13-slice pies, >100% bars.
- **Fleet-and-department IA.** With one aircraft and one user, most of the navigation and half the tiles are permanently empty.
- **Status you can click away** (FL3XX acknowledge-to-green) or that is produced by an unseen analyst — the user does not learn *why* an item is green.
- **Records are abstracted away from their source.** None of the observed screens shows the original paper entry beside the tracked item; trust rests on the vendor.
- **No identity.** Swap the logos and the products are interchangeable; nothing looks like aviation except the stock photos.
- **Report-as-product.** The real deliverable is still a PDF due list designed for a letter-size printout, not a decision.

### (b) What open-source / free tools get right and wrong

**Right:**

- **Honest, written-down status rules.** Simple Aircraft Manager documents its exact logic (10 h / 30 d; no compliance record = red; worst wins). mbegich prints the threshold on the card itself.
- **Both limits on one line**: "Due Oct 30, 2026 at 2151.2 tach · due in 30 days · 46.5 hrs left" (mbegich). Calendar-month rule modelled correctly.
- **Regulation cited per item** ("14 CFR 91.413") — builds trust and teaches.
- **Data ownership as a first principle**: local-first, SQLite/one file, export always, no account (AVLedger, web-logbook, Thrifty Pilot, mbegich, KitFlight, SlingologyMX).
- **Record integrity**: finalise-then-amend, signed-scan management, backup status on the dashboard, "historical import requiring verification" (Thrifty Pilot).
- **Calm legal posture**: "Status indicators do not determine airworthiness"; "Paper logs remain the master".
- **Print fidelity**: web-logbook reproduces the EASA logbook grid and prints a signable PDF; MyFlightbook offers 16 print layouts.
- **Sharing without accounts** (Simple Aircraft Manager), and aircraft status in the pilot's own currency list (MyFlightbook).
- **Low-friction input ideas**: comment shortcuts (MyFlightbook `VORCHK`), speech-to-text and photo call-outs (KitFlight), meter reading from a photo (avManage), "one hand, 3 seconds" (Grocy).

**Wrong:**

- **Framework-default visuals.** PatternFly, MUI, Bootstrap, Qt defaults, emoji as icons. Every project looks like its component library; none looks like it belongs in a hangar.
- **No hierarchy among due items.** A lapsed VOR check and a lapsed annual render identically.
- **Fixed, global warning thresholds** (30 days / 10 hours) regardless of how much lead time the item needs.
- **Hours remaining without a projected date.** Nobody converts hours to "about when" using the owner's own flying rate.
- **Punitive enforcement** (disabling hour logging when "grounded").
- **Enterprise IA copied down** (8 tabs with sub-tabs; 15 flat nav items) or, at the other extreme, a single wall of text.
- **The scan is a file attachment, not a working surface.** Where AI transcription exists it is described as import; I found no open-source example of a deliberate confirm-beside-the-scan review flow or of citations back to a region of a page.
- **Phone experience is an afterthought** (responsive tables) except KitFlight, which is native and Apple-only.
- **Fragility**: single-maintainer, months old, 0–6 stars, public instances shut down (SlingologyMX), server-loss notices on the home page (KitLog). Longevity is itself a design/positioning issue for anything holding 50 years of records.
- MyFlightbook, the one durable project, treats maintenance as a form section and has not had a visual redesign in a very long time.

### (c) Twenty transferable design / UX ideas from Group 3 (tagged by where they apply)

1. **Departure-board due list.** One line per item, fixed columns ITEM · DUE · REMAINING · STATUS, tabular numerals, status as a word. *(Flighty / airport boards)* → **Status at a glance; phone home screen; printed status sheet.**
2. **Proximity-aware item cards ("smart states").** The same item shows different content as it approaches: far = date only; ~90 days = "book the shop"; ≤10 hrs = "plan flights around this"; overdue = what it restricts (e.g. "IFR only" for pitot-static). *(Flighty)* → **Due items; notifications.**
3. **"Can I fly on that day?" scrubber.** Pick a date and expected hours flown by then; items that would lapse turn amber/red in place. *(CAMP's framing; FL3XX per-flight forecast)* → **Forecasting across calendar and hours.**
4. **Dual-limit bar with the limiting unit marked.** Two thin stacked bars per item (calendar, hours) on their own scales; the one that bites first is emphasised and labelled "limiting"; hours converted to a projected date from the owner's trailing utilisation, shown with "~". *(ProBikeGarage wear bars; Traxxall Earliest Due; Veryon H/M/L)* → **Due list; inspections; equipment life.**
5. **Shared time axis.** Draw every due item as a mark on one today→+24-months axis so the list is also a chart; hour-limited items get a soft-edged end. *(Apple Weather range bars)* → **Forecast view; dashboard.**
6. **Verdict + contributors, never a percentage.** Headline in words ("Nothing due for 61 days or 38 hrs"), then contributor rows sorted worst-first with advisory language. *(Oura readiness; Apple rings)* → **Aircraft status; widget.**
7. **Horizon grouping.** Overdue / This month / Next 90 days / This year / Later; countdown phrasing ("31 days left") rather than bare dates. *(Things 3)* → **Due list; reminders.**
8. **Evidence-backed rows.** Every requirement shows what satisfies it (thumbnail + "Airframe Log 3, p. 12") and how old that evidence is; a requirement with no evidence is its own state. *(Vanta/Drata controls)* → **Inspections; ADs; record room.**
9. **Field ↔ bounding-box binding.** Hover a field, its region lights on the scan; click a region, focus jumps to its field; redraw a box to re-extract. *(Rossum, Konfuzio)* → **Side-by-side scan review.**
10. **Keyboard-first confirm with three explicit outcomes.** Accept (Enter) / Edit / "Not on page"; "accept remaining on this page"; focus lands on the least-confident field first. *(Konfuzio accept/decline/missing; Linear triage)* → **Scan review desk.**
11. **Capture now, review later, on another device.** Hangar phone session ends with "23 pages captured"; desktop opens to "23 pages waiting", each showing the 3–4 extracted facts over its thumbnail. *(Expensify/Dext; Adobe Scan batch)* → **Digitising flow; desk/hangar split.**
12. **Line-synchronised transcript.** Selecting transcript text highlights the ink; search hits are highlighted on the image itself; adjacent-page film strip. *(FamilySearch, Transkribus)* → **Logbook reader; search.**
13. **Image citation chips.** Each sentence of an answer ends in a numbered chip; hover shows a *cropped picture of the cited handwriting*; click opens the page at that region; unsupported claims say so. *(NotebookLM, Perplexity, Readwise)* → **Ask your logbooks; maintenance summary footnotes.**
14. **Museum object page.** Scan on a neutral mat with deep zoom; a quiet label block (logbook, page, dates, signer, certificate no.); stable ID/URL per page. *(Rijksmuseum, Cooper Hewitt)* → **Page viewer; record room.**
15. **Zoomable decades timeline with a density strip and era bands.** Year ticks sized by entry count; bands for engine-since-overhaul, ownership, major alterations (337s) as landmarks. *(Apple Photos; GitHub graph)* → **Logbook timeline spanning decades.**
16. **Meter-first quick log.** App opens (or a widget deep-links) to a tach keypad with the last value and a live delta, plausibility check ("+312 hrs — sure?"), optional photo of the tach. *(Fuelly/aCar/Drivvo; avManage)* → **One-handed hangar logging.**
17. **Thumb-zone action sheet.** One large bottom button → three actions: Log hours · Add squawk · Scan page. Squawk = photo first, dictated note second, numbered call-outs on the photo. *(Drivvo FAB; Things Magic Plus; KitFlight)* → **Mobile IA; squawks.**
18. **Legend = filter = count.** A single strip of status chips ("1 overdue · 2 due soon · 5 OK · 1 unknown") that filters the list below and whose colours match row tints. *(Grocy)* → **Due list; AD list; equipment.**
19. **Binder-style share with control.** Cover page with "as of" date and contents; sections in buyer order; link expiry, revoke, view log; persistent "read-only, shared by owner" frame. *(Stripe Atlas vault; DocSend; museum citation)* → **Record room.**
20. **Evidence badges on the dossier cover.** A band of factual, linked badges ("Annuals recorded 49 of 52 years", "37 applicable ADs: 37 with compliance entries", "Gaps: 1981–1983") — gaps stated plainly. *(CARFAX report header)* → **Pre-buy dossier.**

Additional, lower priority:

21. **Typeset print outputs** — documents designed as paper first (ruled columns, numbered blocks, signature lines, page x of y), not screen prints. *(web-logbook PDF; Stripe Press)* → **Maintenance summary; dossier; status sheet for the mechanic.**
22. **Status as shape + word + colour** — glyphs that survive monochrome printing and colour-blindness. *(Linear status icons)* → **Whole status system.**
23. **"Unknown / not verified" as a fourth state** with its own hatched treatment, never defaulting to green. *(Thrifty Pilot; SAM "no record = red")* → **Status system; freshly imported aircraft.**

### (d) Eight candidate visual-language territories rooted in aviation material culture

Each is described by its real typographic, colour and layout traits so a designer can build from it. Hex values are approximate [I].

**1. The paper logbook ledger (ruled columns, pasted stickers, rubber stamps)**
- *Artefact* [K]: hardbound aircraft/engine/propeller logs. Pages pre-printed with a header strip (aircraft make/model/serial/registration) and a column ruling: DATE | TACH or RECORDING TIME | TODAY'S FLIGHT | TOTAL TIME IN SERVICE | wide "DESCRIPTION OF INSPECTIONS, TESTS, REPAIRS AND ALTERATIONS" | signature / certificate type & number. Modern entries are frequently **typed adhesive stickers** from the shop pasted over the ruling, often slightly crooked, with the shop's letterhead. Annual sign-offs carry the regulatory sentence ("I certify that this aircraft has been inspected in accordance with an annual inspection and was determined to be in airworthy condition"), a signature, and "A&P / IA" plus certificate number — often a **rubber stamp**.
- *Type*: column heads in small bold condensed caps; body in ballpoint handwriting (blue/black), typewriter or laser Courier/Times on stickers; stamps in rounded-rect or oval frames with uneven inking.
- *Colour*: cream/ivory paper (≈ #F4EEDC), pale blue or green hairline rules (≈ #A9C4D6 / #B5CDB0), red margin rule, blue-black ink (≈ #1F2A5A), stamp red (≈ #B5342B) and stamp violet (≈ #4B3F8F).
- *Layout*: strict vertical column grid; entries of unequal height separated by a horizontal rule; running totals carried forward at page foot.
- *Interface translation*: entry list as ruled ledger rows with a fixed time gutter; confirmed entries get a "stamp" mark (who/when); typed-sticker card style for digital entries; tabular numerals; running totals in the footer. Risk: skeuomorphic kitsch — use the grid and the stamp logic, not paper textures.

**2. Data plates and placards (stamped metal, engraved lettering)**
- *Artefact* [K]: the fireproof identification plate riveted to the airframe/engine: etched field labels (MODEL, SERIAL NO., TYPE CERT., PRODUCTION CERT., DATE OF MFR) with **steel-stamped** values — characters of slightly uneven depth and baseline. Cockpit and exterior placards: engraved laminate or decals, all caps, single-stroke rounded lettering (the Gorton engraving style specified for aircraft panels, MS 33558), white on black or black on white, red for limitations/emergency. "EXPERIMENTAL" in 2-inch block letters. Fuel filler placards stating grade and capacity.
- *Type*: monoline rounded-terminal caps with wide tracking; no lowercase; numerals with open shapes. Open alternatives in the same family of forms exist (routed/engraver gothics; DIN-like faces).
- *Colour*: brushed aluminium/stainless greys (≈ #B9BDC1, #7E848A), black fill (#111), placard white (#F5F5F2), limit red (≈ #C8102E).
- *Layout*: label-above-value cells inside a thin keyline; four corner rivet holes; everything centred or left-aligned in boxes; extremely terse wording.
- *Interface translation*: the aircraft identity header as a data plate (make / model / serial / registration / engine in label-over-value cells, stamped-style mono numerals); section headers as placards; limit values in red only. Works in both light and dark. Distinctive and under-used.

**3. Sectional-chart cartography**
- *Artefact* [K]: FAA VFR sectional. Base: hypsometric tints from pale green lowlands through buff/tan to brown; blue hydrography; **yellow** city areas; grey shaded relief. Overlay: two aeronautical inks — **magenta** and **blue** — carrying almost all aeronautical meaning (towered airports blue, non-towered magenta; Class B solid blue, Class C solid magenta, Class D dashed blue, Class E vignettes/dashes in magenta or blue; magenta dashed isogonic lines; blue/magenta airway and navaid data). Large blue **Maximum Elevation Figures** in each quadrangle: big numeral for thousands with a smaller raised numeral for hundreds.
- *Type*: compact sans serif in several weights; italics for water features; airport data blocks as tight stacked lines (name, CT frequency, ATIS, elevation L length, UNICOM); boxed frequencies.
- *Colour*: aero magenta ≈ #A3338B; aero blue ≈ #2B5FA8; city yellow ≈ #FCE94F; terrain green ≈ #CFE0B4 → tan ≈ #EAD7A6 → brown ≈ #C99B63; water ≈ #BFE0EE; paper white.
- *Layout*: dense layered information where colour assigns the layer; line *style* (solid/dashed/vignette) encodes class; legends in the margin.
- *Interface translation*: a two-ink system — blue for facts/records, magenta for things that need attention or are user-set — on pale terrain tints as section backgrounds; MEF-style big/small numerals for "hours remaining"; dashed vs solid borders to encode certainty (confirmed vs AI-extracted). The most colourful territory; instantly "pilot" without being cockpit-dark.

**4. EFIS / PFD glass (tapes, bugs, colour grammar)**
- *Artefact* [K]: Garmin G1000/G3X Touch, Dynon SkyView. Black background; attitude indicator blue over brown; **vertical tapes** for airspeed and altitude with a rolling-drum current-value window; trend vectors; **bugs** (pilot-set targets) as cyan notches; engine strip with arc gauges or horizontal bars with green normal band, yellow caution band, red line, white pointer; softkey row along the bottom edge; annunciations at the top.
- *Colour grammar* (consistent with FAA display guidance): **red** = warning/limit, **amber/yellow** = caution, **green** = normal/engaged/safe range, **cyan** = pilot-selected values, **magenta** = active GPS/flight-plan target, **white** = current values and scales. Approx.: black #000; sky ≈ #1D6FD1; ground ≈ #7A4B21; green ≈ #18E018; cyan ≈ #19E6F2; magenta ≈ #F03CF0; amber ≈ #FFBF00; red ≈ #FF2B2B.
- *Type*: condensed, high-x-height sans with strongly differentiated numerals; Airbus's open-source B612 was drawn for this context.
- *Layout*: fixed positions; a tape is a number line with "now" in a window and limits as coloured bands on the scale.
- *Interface translation*: each due item as a **horizontal tape** — now-pointer, green band, amber approach band, red line at the limit, cyan bug for a planned date (e.g. booked annual). Dark hangar mode. Strongest functional metaphor for "remaining". Risks: dark-dashboard cliché; and misusing magenta/cyan would be read as *wrong* by pilots — follow the grammar exactly or avoid it.

**5. Parts tags and the authorised release certificate (yellow / green / red tags, 8130-3)**
- *Artefact* [K]: card-stock hang tags with a reinforced eyelet and wire or string, attached to every part in a shop. Industry convention (not regulation): **yellow = serviceable**, **green = repairable/unserviceable awaiting repair**, **red = rejected/scrap** (white/other colours for identification vary by shop). Pre-printed fields: PART NO., SERIAL NO., DESCRIPTION, REMOVED FROM (N-number), REASON, TSN/TSO, W.O. NO., INSPECTOR, DATE — filled by hand or stamp. FAA Form 8130-3 "Authorized Release Certificate / Airworthiness Approval Tag": landscape, **numbered blocks 1–14** (form tracking number, organisation, work order, item, description, part number, quantity, serial number, status/work, remarks, then paired left/right certification blocks 13a–e and 14a–e).
- *Type*: small bold caps field labels, large handwritten/stamped values; tag title in heavy condensed caps reversed out of a colour bar.
- *Colour*: tag yellow ≈ #F5D21F; tag green ≈ #3F9B5B; tag red ≈ #D2362B; manila ≈ #E7D3A1; black print.
- *Layout*: portrait tag with clipped top corners and an eyelet; a colour header band; stacked ruled fields.
- *Interface translation*: equipment/component cards as tags with a status header band — a status system that is *native to maintenance* rather than borrowed traffic lights, and that carries a word ("SERVICEABLE") with the colour. Squawks as red/green tags. Caveat: tag green means "needs repair", which collides with green = good elsewhere; if used, always pair colour with the printed word, or adopt only the tag *form*.

**6. FAA forms and certificates (337, 8100-2, 8050-3)**
- *Artefact* [K]: Form 337 "Major Repair and Alteration": numbered items — 1 Aircraft (nationality & registration mark, serial no., make, model, series), 2 Owner, 3 For FAA Use Only, 4 Type (repair/alteration checkboxes by unit), 5 Unit Identification, 6 Conformity Statement, 7 Approval for Return to Service, 8 Description of Work Accomplished on the reverse. Standard Airworthiness Certificate (Form 8100-2): small landscape certificate with an ornamental border, six numbered blocks (registration marks; manufacturer and model; serial number; category; authority and basis for issuance; terms and conditions), displayed in the aircraft. Registration certificate (AC Form 8050-3).
- *Type*: tiny sans caps **labels in the top-left corner of each cell**, values typed in a typewriter/Courier face; item numbers; form number and revision date bottom-left; OMB control number top-right; checkboxes as small squares.
- *Colour*: black on white or pale tinted stock; signatures in blue ink; occasional light-blue or green security tint; engraved-style border on certificates.
- *Layout*: a fully boxed grid of unequal cells; nothing floats; instructions in fine print.
- *Interface translation*: the house style for **every printable and shareable document** — maintenance summary, pre-buy dossier, status sheet — and for detail panes on screen (numbered blocks, corner labels, typed values, form number + "as of" date in the footer). Reads as official, prints perfectly in monochrome, and is completely unlike SaaS cards.

**7. Flight progress strips and departure boards**
- *Artefact* [K]: ATC paper strips — long narrow slips (roughly 1 × 8 in) printed in a monospace/dot-matrix face with **fixed fields in fixed positions** (callsign, type, squawk code, time, altitude, route), annotated by hand, slotted into coloured plastic holders and racked in a bay in sequence; controllers physically "cock" a strip sideways to flag it. Split-flap (Solari) departure boards: rows × fixed character cells, white (or yellow) grotesque caps on black, a status column (ON TIME / DELAYED / BOARDING), sometimes one coloured lamp per row.
- *Type*: monospace or fixed-cell grotesque caps; numerals dominate.
- *Colour*: strip paper off-white/buff with black print and red/blue pencil; holders in a few flat colours; boards black #0B0B0B with white #F2F2F2 or amber ≈ #FFB000.
- *Layout*: one item = one strip = one line; order in the rack *is* priority; position within the strip is meaning.
- *Interface translation*: due items and squawks as strips in a sequenced rack (sorted by urgency, offset to flag); the phone home screen as a departure board. Naturally one-handed (large rows), naturally monochrome-safe. Pairs well with territory 6 for print.

**8. Hangar and ramp (signage, streamers, shadow boards, inspection lacquer)**
- *Artefact* [K]: safety-yellow and black hazard striping; ANSI-style signs with a coloured signal-word header (DANGER red, WARNING orange, CAUTION yellow, NOTICE blue) over black-on-white text; stencilled lettering on equipment and floors; **"REMOVE BEFORE FLIGHT"** streamers — red ribbon, white bold condensed caps; tool **shadow boards** and two-colour foam cut-outs where a missing tool shows as a bright void; orange/yellow **torque-seal** lacquer stripes across fasteners (a broken stripe = disturbed); safety wire; chalk and paint-pen marks on parts.
- *Type*: heavy condensed gothic caps and stencil forms; signal words reversed out of colour bars.
- *Colour*: safety yellow ≈ #FFD100; black; streamer red ≈ #D71920; notice blue ≈ #0057B8; torque-seal orange ≈ #FF6A13; concrete grey ≈ #BFC2C4.
- *Layout*: header band + body; diagonal stripes for edges of danger; absence made visible (shadow board).
- *Interface translation*: the alert/empty-state vocabulary — signal-word banners for squawks and grounding items; a "REMOVE BEFORE FLIGHT" streamer for anything that must be cleared before the next flight; shadow-board empty states ("no annual on record" shown as a labelled void); a torque-stripe tick for "confirmed, undisturbed since". Best as an accent system layered on territories 1, 2 or 6 rather than a whole theme.

**Bonus, not counted: Jeppesen "briefing strip" and the POH.** [K] Jeppesen approach plates put a standard strip of boxes across the top in the order a pilot briefs them (communications, then procedure essentials, then minimum safe altitude), followed by plan view, profile view and a minimums table — an IA lesson: **order information in the sequence it is used**. Light-aircraft POHs contribute section tab indices (Limitations, Normal Procedures, Performance, Weight & Balance), checklist typography (ITEM ........ ACTION with dot leaders), and the weight-and-balance envelope chart — the natural visual for the W&B feature.

**Combining territories [I].** The most defensible non-generic system pairs a *structural* territory with an *accent* territory: e.g. **6 (FAA forms) for layout and print + 2 (data plate/placard) for identity and headers + 3 (sectional two-ink) for colour**; or **1 (ledger) for the records side + 7 (strips/board) for the status side + 8 (hangar) for alerts**. Territory 4 (EFIS) is the strongest single metaphor for remaining-life but the most likely to converge with every other "dark aviation dashboard".

---

## 5. Source URLs

Group 1
- Traxxall: https://jetsupport.com/traxxall/ (dashboard image viewed) · https://www.ainonline.com/aviation-news/business-aviation/2020-10-27/traxxall-introduces-next-gen-mx-tracking-program · https://www.aviationpros.com/aircraft-maintenance-technology/mros-repair-shops/press-release/55039212/traxxall-technologies-traxxall-enhancements-driven-by-customer-feedback
- Veryon: https://veryon.com/flightdocs-maintenance (two screenshots viewed) · https://www.veryon.com/ebis · reviews: https://www.capterra.com/p/142475/Veryon-Tracking/
- CAMP: https://www.campsystems.com/maintenance (text read; images not viewed)
- WinAir: https://winair.ca/ (dashboard screenshot viewed) · https://aviationweek.com/mro/emerging-technologies/winair-enhances-its-maintenance-software-offerings
- FL3XX: https://www.fl3xx.com/product/fl3xx/maintenance-module · https://www.fl3xx.com/kb/aircraft-maintenance-status-calculation (screenshot viewed) · https://www.fl3xx.com/kb/camp · https://www.fl3xx.com/kb/traxxall
- Quantum MX: https://www.quantum-mx.com/ (hero and pricing viewed)

Group 2
- MyFlightbook: https://myflightbook.com/logbook/mvc/pub · https://myflightbook.com/logbook/mvc/pub/FeatureChart · https://myflightbook.com/logbook/mvc/faq · https://github.com/ericberman/MyFlightbookWeb · forum context: https://mooneyspace.com/topic/43735-looking-for-ideas-on-how-others-track-maintenance-requirements
- Simple Aircraft Manager: https://github.com/marbindrakon/simple-aircraft-manager · https://docs.simple-aircraft.app/ · https://docs.simple-aircraft.app/user-guide/airworthiness.html · https://docs.simple-aircraft.app/user-guide/dashboard.html
- Aircraft Maintenance Log: https://github.com/mbegich/aircraft-maintenance-log · https://mbegich.github.io/aircraft-maintenance-log/
- Thrifty Pilot: https://github.com/thethriftypilot/AircraftMaintenanceLogbook
- SlingologyMX: https://github.com/AlchemyGeek/SlingologyMX · https://slingologymx.lovable.app
- avManage: https://github.com/jdfrey1/avmanage-public
- web-logbook: https://github.com/vsimakhin/web-logbook · openPilotLog: https://github.com/fiffty-50/openPilotLog · AVLedger: https://github.com/Penaz89/AVLedger · AD tooling: https://github.com/Airnxt/ad-check-airnxt
- Builder logs: https://eaabuilderslog.org/ · https://www.kitlog.com/ · https://www.kitplanes.com/kitflight-modernizes-the-aircraft-builders-log/
- CMMS: https://github.com/Grashjs/cmms · https://www.openmaint.org/en · https://grocy.info/

Group 3 (verified this session)
- Flighty: https://developer.apple.com/news/?id=970ncww4 · https://blakecrosley.com/guides/design/flighty
- Rossum: https://knowledge-base.rossum.ai/docs/interactive-bounding-boxes-in-rossum · Konfuzio: https://help.konfuzio.com/document-validation-ui/review-documents/review-data/index.html · Docsumo: https://support.docsumo.com/docs/reviewedit-screen
- FamilySearch full-text search: https://www.familysearch.org/en/blog/what-is-full-text-search (403 to scripted fetch; existence confirmed via search)
- ProBikeGarage: https://apps.apple.com/us/app/probikegarage-bicycle-tracker/id1422489202 · CARFAX Car Care: https://apps.apple.com/us/app/carfax-car-care/id552472249
- Vanta: https://vanta.com/products/automated-compliance · https://help.vanta.com/en/articles/11345481-what-is-an-upcoming-test

Not verified this session (prior knowledge only): Fuelly/aCar, Drivvo, Strava gear, Adobe Scan, Genius Scan, Expensify/Dext, Ancestry, Transkribus, Readwise, NotebookLM, Perplexity, Oura, Apple Health/Fitness/Weather/Photos, Things 3, Linear, Raycast, Arc, Teenage Engineering, Panic, Stripe Press/Atlas, DocSend, Bloomberg Terminal, Garmin G1000/G3X, Dynon SkyView, B612, museum collection sites, and all physical-artefact descriptions in section (d).
