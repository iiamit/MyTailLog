# Competitive DESIGN research — GA aircraft-owner record / maintenance apps

Captured **2026-11-18**. Scope: commercial products aimed at general-aviation owners and
small operators, plus the pilot-side apps owners already live in (as design references).
Subject of the redesign (referred to below as "the product"): an owner app that digitizes
paper aircraft logbooks with AI, tracks inspections / ADs / equipment / W&B / hours /
squawks, answers questions with page citations, and produces hand-off documents.

## 0. Method, evidence levels, caveats

How each fact was obtained is tagged where it matters:

- **[O] Observed** — read directly from the live page HTML/CSS (fonts, hex values, nav
  labels, copy, prices) or seen in a product screenshot I opened and looked at.
- **[C] Claimed** — stated by the vendor in marketing, store listing, FAQ or press copy;
  not independently verified. No accounts were created; no private workflow was tested.
- **[R] Review** — from an App Store / Google Play user review or a third-party article.
- **[I] Inferred** — my reading / extrapolation as a designer. Treat as hypothesis.
- **[K] Prior knowledge** — general knowledge of a well-known product, not re-verified today.

Caveats:

- Hex values come from CSS frequency counts of the marketing site (and, where I could open
  them, product screenshots). Marketing palette is not always the in-app palette.
- App UI descriptions are based on the specific screenshots listed in section 7. I viewed
  roughly 15 images; anything about screens I did not see is tagged [C] or [I].
- Sites not reachable today: `adlog.com` (no response), `generalaviationnews.com` article on
  the "Aircraft Compliance" app (HTTP 403), `mooneyspace.com` thread (bot wall), Aviation
  Consumer "Virtual MX Records" (paywalled after the intro). PlaneLogiX is a client-rendered
  SPA; current pricing could not be read.
- Prices are public US-dollar prices on the capture date and may change.
- A prior text analysis of SquawkFree and Runup exists in the repo
  (`docs/competitive-squawkfree.md`); this file does not repeat its feature tables, it adds
  the design read and updates.

---

## 1. Landscape at a glance

| # | Product | Segment | Platforms | Price (public) | AI scan of handwritten logs | NL "Ask" with citations | Share / hand-off |
|---|---|---|---|---|---|---|---|
| 1 | **BetterPlane** | Solo Part 91 owner | iOS, Android (web "coming") | $119/yr per aircraft after 1-mo trial; monthly ~$11.99 [R]; lifetime option | Yes, self-serve ("AirWrenchAI") | No (keyword search) | Role-based members; transfer records to new owner; PDF export |
| 2 | **Runup** | GA piston owner | Web only (no store listing found) | Free (10+5 pages); $16/aircraft/mo single; $24 twin; $49 one-time sales portal | Yes, self-serve, per-field confidence | No (full-text search) | Mechanic read-only link; buyer "Sales Portal" with analytics |
| 3 | **Maggneto** | Piston owner + A&P | iOS (private rollout / waitlist), web marketing | Not public | Yes [C] | Demoed on homepage; listed as "in development" on roadmap | "Shared access" on roadmap |
| 4 | **HobbsMate** | Owner + partnerships | Web, iOS, Android | Free; Plus $10/mo ($108/yr); Multi-owner $40/mo ($400/yr), per aircraft, AI metered | Yes ("scanned logbooks", "extraction compare") [C]; signature feature is photo-reading the tach/Hobbs | "HobbsMate Intelligence" chat [C] | Viewer roles; cost splits |
| 5 | **SquawkFree** | Owner + flight schools | Responsive web | $4.99/mo owner; $55/mo school; $3/aircraft/mo ADS-B add-on; digitization $299/aircraft | No — human service (OCR + human verify, 1–2 weeks) | No | Per-tab permissions |
| 6 | **Coflyt** | Owner + partnerships + clubs | iOS, Android, web | $24/mo or $170/yr (1 aircraft, 1 seat); Plus $43/mo; Business $120/mo | No | No | "Add your A&P"; Share My Aircraft |
| 7 | **AirLogbooks** | Owner + pilot + mechanic | Web | $100/aircraft/yr, volume discounts | No (paid import service) | No ("AI-summarized ADs", "AI-generated due dates" [C]) | Public link + QR code, time-limited, revocable |
| 8 | **Bluetail** | Bizav; piston tier exists | Web + mobile upload | From $75/mo/aircraft piston (annual), 3 users; Fleet from $150 | Yes (AI ingestion; pro scanning network) | "Ask Bluetail" (answers "with proof") | Secure share links |
| 9 | **TBX + LogIQ** (airworthy.com) | IAs / shops; free owner tier via Garmin | Web + mobile | $49/mo (6-mo commit), $499/yr; "TBX Basic for Garmin" free | Yes (LogIQ: Define → Scan → Verify) | Yes ("Answers with Sources") | Shop-centric |
| 10 | **Crewchief GA** | Owner (managed service) | iOS, Android, web | $49/mo or $499/yr piston single; $79/$799 multi; logbook scan + analysis included | Service-assisted (their staff analyze) | "AskCrewchief" text + voice (June 2026) [C] | Share with mechanic; affiliate shops |
| 11 | **PlaneLogiX** | Owner + shops (since 2014) | Web SPA | Not readable today (historical: free tier; $129.95/yr in 2019) [R] | Human transcription service | No | List-for-sale; mechanic notifications; e-signatures |
| 12 | **Savvy Aviation** | Owner advisory service | Web platform | SavvyAnalysis $189/yr single; SavvyMx $899/yr single [O] | n/a (engine-monitor data, borescope images) | n/a (human analysts; "GADFly" AI anomaly detection) | Ticket system with shops |
| 13 | FlightGuard | Owner / club, FAA + EASA | iPhone, iPad | Subscription, 7-day trial | "AI-assisted logbook scanning" for flight times [C] | No | PDF plans/reports; co-owner sync |
| 14 | FlightBoss | Owner / partners | iPhone, Android | Subscription, 14-day / 1-mo trial | No | No | Squawk to mechanic |
| 15 | aeroLogbook | Shared single-engine | iPhone, iPad, Apple Watch | Yearly sub, 1-mo trial | No | No | iCloud sharing |
| 16 | AV1ATE Tracker | Solo owner | iPhone, iPad | $9.99 one-time | No | No | None |
| 17 | LogVault (pre-release dev site) | Owner / seller | Web | Not public | Yes [C] | No | Read-only share, "sale-ready PDF" |
| 18 | JSSI AviatorMX, Veryon Tracking, Quantum MX | Turbine owner-operators / operators / shops | Web | ~$1,750/yr+ (Veryon) [R]; $79/mo (Quantum MX) [R] | No | No | Contrast only |
| 19 | Adlog | Paper binder system | Paper | Not retrieved | n/a | n/a | Contrast only [K] |
| P1–P5 | ForeFlight, Garmin Pilot, LogTen, MyFlightbook, Flighty | Pilot-side design references | — | — | — | — | — |

Two things changed versus the earlier repo analysis: (1) self-serve AI logbook extraction
with side-by-side review is now table stakes among 2025–2026 entrants (BetterPlane, Runup,
Maggneto, HobbsMate, TBX LogIQ, LogVault, Bluetail); (2) cited natural-language answers are
no longer unique either — TBX LogIQ, Bluetail and Crewchief ship or advertise it, and
Maggneto leads its homepage with it.

---

## 2. Deep profiles (the six most relevant)

### 2.1 BetterPlane — betterplane.com

**What / who / price.** Mobile app that digitizes paper maintenance logbooks and tracks
what is due, built by a solo founder-owner in Texas for individual Part 91 owners. [C]
$119/year per aircraft after a one-month trial ("$9.92/mo"), 30-day money-back; monthly and
lifetime options exist; "T-Hangar" plan = 1 aircraft, "Box-Hangar" = 2–3; priced per hangar,
not per seat. [O] App Store 4.9 from 21 ratings. [O]

**Capabilities.** [C unless noted]
- Camera scan (multi-page) and PDF import; AI extraction of entries, tach / total time, AD
  compliance and next-due, hour-based intervals; review step side-by-side with the page;
  the photo is "always the source of record".
- Logbooks organized as Airframe / Engine / Propeller / Avionics plus user folders. [R]
- Search by AD number, part number, date, logbook, keyword, partial word.
- "Annunciator" status panel; tracking with alert templates (annual / condition, ELT,
  transponder, VFR/IFR checks, oil, custom); dual-limit alerts in beta; push + email + SMS.
- Flight logging: tach and Hobbs per flight, fuel used, oil added per engine; fuel-burn and
  oil-consumption trends; monthly flight hours; per-cylinder compression history; CSV export.
- Components each tied to their own time source (twins, separate tachs); TSMOH per engine.
- Squawks (Sept 2026). AD tracking in "Preview" (AD matches + logbook mentions); automatic
  AD tracking and "Aircraft Insights" in internal testing (Oct 2026).
- Documents with expiration dates (insurance, registration); replicated across two cloud
  providers, nightly backup.
- Members and invites with view / edit / manage roles; records transfer to the next owner;
  logbook PDF export; demo mode; FAA registry auto-fill from tail number.
- Extras: "Aircraft for Sale" page, a sister fleet-statistics site, a public help center,
  monthly product updates that double as service-bulletin notices.

**Design language.** [O]
- Marketing site: Tailwind; **Lora** (serif) for body, **Racing Sans One** (italic retro
  display) for the wordmark and headings. Palette: dark brown `#4a3b2e` text, rust
  `#c45d3e` accent, deep navy `#13222d`, parchment `#f0e5c8`. Hard offset "print" shadows
  (`4px 4px 0`), a torn-edge graph-paper texture, pill buttons.
- App (from two App Store screenshots and one site screenshot): parchment/cream surfaces;
  cards with a **deep-navy header band and a white italic display title** ("Annunciator",
  "Overview", "Tracking"); aircraft hero photo across the top with the **tail number drawn
  as a white placard with a black keyline**; initials avatar top right; round floating
  action buttons.
- Store screenshots are framed on a navy gradient with white slab-serif captions:
  "Aircraft Status in One Glance", "Never Miss Maintenance".
- Tone: first-person founder story, emotionally anchored; hangar vocabulary throughout
  (hangars, T-hangar plans, "from the hangar" release notes).
- How aviation is expressed: literally and skeuomorphically — an annunciator panel of
  glowing lamps, a registration placard, racing-stripe typography, aged-paper color.

**IA and navigation.** [O from screenshots]
- Mobile only. Bottom bar with three text tabs: **Overview · Logbooks · Documents**.
- Home = aircraft photo, then the **Annunciator**: a 5-column grid of LED lamps (green with
  glow = current, amber = attention) labeled in 5–6 letter caps: ANNUAL, REGIST, XPNDR,
  ELTBAT, ELT, FVINSP, INSRNC, OIL, MAG, VOR, IFR, AIRFLT, BRKDPH; "TAP TO LOCATE" under it.
  Then "Overview": aircraft, TTAF, tach.
- **Tracking** list: sort by Priority / Name / Added; each row = LED dot, item name, due
  value (month/year or a tach reading), and a **horizontal red→yellow→green gradient bar
  with a blue triangle marker and a number above it** ("19.0" on a 0–366 "Days Remaining"
  scale; "49.0" on a 0–50 "Hours Remaining" scale).

**Key workflows.** [C]
- Onboarding: tail number → registry auto-fill → enter tach or total time → tracking.
  "Setup checklist" and tutorial guides in the help center; demo mode before sign-up.
- Digitize: scanning tips shown at scan start; multi-page capture; review per page.
- Share: one-tap A&P invite; mechanic sees due items, logbooks, documents.
- Export: any logbook to PDF; flight / oil / compression logs to CSV.

**Designer's read.**
- Good: the only competitor with a recognisable identity; the annunciator is instantly
  legible to a pilot and scales to many items in little space; the marker-on-a-scale bar
  shows *margin*, not just state; one price with every feature removes plan anxiety; the
  tail-number placard is a small, ownable detail.
- Weak: the retro skeuomorphism trades data legibility for charm — serif body plus italic
  display plus glow effects is heavy for a records tool, and reads hobbyist next to the
  "this is evidence" job. Lamp abbreviations are cryptic (FVINSP, BRKDPH). Status relies on
  hue alone, including a red–green gradient (poor for color-vision deficiency). Three tabs
  bury squawks, flights and search. Phone-only for reviewing long handwritten entries is a
  real constraint; web is promised, not shipped. [I]
- Reviews are uniformly positive and small in number; praise centers on speed of first
  import ("60+ years of logs in about an hour") and founder support. [R]

**URLs.** Home https://betterplane.com/ · screenshots: same page (sections "Know Before You
Fly" … "Built for Busy Mechanics") · help https://betterplane.com/help/ · updates
https://betterplane.com/updates · App Store https://apps.apple.com/us/app/id6701693347 ·
Play https://play.google.com/store/apps/details?id=com.chromolylabs.betterplane.android

---

### 2.2 Runup — runuppro.com

**What / who / price.** Web app for GA piston owners: scan paper logbooks, AI extracts
entries, owner reviews beside the source, search, AD tracking, mechanic and buyer access.
Free tier (1 single-engine aircraft, 10 logbook + 5 records pages); Pro $16/aircraft/mo
(single), $24 (twin); Sales Portal $49 one-time per aircraft. [O]

**Capabilities.** [C] (feature tables are in the repo doc; additions since then)
- Per-field confidence on extracted entries; detected ADs tagged on the entry; maintenance
  type tags; attach 8130-3s and balance reports to entries.
- AD dashboard from an uploaded compliance report; review / dismiss / not-applicable.
- **Time validation**: recalculated engine and prop times shown beside written values;
  red flag on mismatch and on out-of-sequence entries; independent per-engine tracking.
- Chronological **Ledger** mixing entries, invoices, 337s, supplements, color-coded.
- Mechanic portal (scoped read-only link, revoke); Sales Portal with contact-gated tiers
  and engagement analytics.
- New since September: **bulk Form 337 stack upload** (one file up to 150 pages, auto-split
  into individual 337s, merge/split/edit, duplicates and other-tail forms skipped);
  all-pages scrolling view per record. July: **dark mode**; **"Ambient Airport"** (live
  nearby traffic drifting over a faint runway diagram behind the dashboard, from a
  community ADS-B feed); full account export built in the background and emailed;
  background OCR with bell + email notification.

**Design language.** [O]
- Next.js + Tailwind v4. Fonts: **Inter Tight** (UI), **IBM Plex Mono** (data), Geist /
  Geist Mono, **Racing Sans One** for the two-tone "Run up" wordmark. `theme-color #0d1220`.
- Palette: navy-black `#0d1220`, raised surfaces `#161c2e` / `#1a2034`; warm off-white
  `#e7e3d8` text; taupe `#9a9788` / `#6a6b5e` for muted labels; blues `#2a78d6` / `#195d9e`;
  flag red `#f87171`; amber `#b45309`; rose `#db2777`; green `#008300`. Corners are square
  (`border-radius: 0` dominates).
- Every marketing image ships in a light and a dark variant, shown per theme.
- Density is high: 11–12px uppercase micro-labels, mono numerals, hairline dividers, small
  outlined chips. It looks like a compliance console, not a consumer app.
- Tone: owner-to-owner, dry. Pricing is explained as fuel ("about 15 minutes of cruise a
  month… the fuel math tracks real avgas prices, it updates itself weekly").
- Aviation is expressed through vocabulary and data (tach, SMOH, AD numbers in mono), plus
  one flourish (Ambient Airport). No stock photography.

**IA and navigation.** [O from product screenshots]
- Web: a single **top tab bar** — Ledger · Logbooks · ADs · Records · Mechanic Portal ·
  Sales Portal — with ALERTS (count badge), a "PIREP" link and the tail number + account at
  right. No sidebar.
- AD screen: title + "Report current as of …"; actions REVIEW (with count) / UPLOAD NEW
  REPORT / Reset; a strip of **seven KPI tiles** (Open, Needs Review, Due <30 days, Due <20
  hrs, Complied Recurring, One-time / N/A / Superseded, Total Tracked), each with a colored
  top hairline and a "?" tooltip; filters; then a dense table (checkbox, AD number as a blue
  mono link, title, component chip — AIRFRAME blue, ENGINE rose —, status in green caps,
  method such as "RECURRING 100H", source, linked-entry count), with collapsible groups for
  complied / not applicable / superseded / compliance reports.
- Ledger: full-text entries stacked vertically; each has a header strip (type chip, date,
  tach, TTSN in mono), blue tag chips, signer name + certificate at lower right; invoices
  render as compact one-line rows with the amount.
- Extraction view: scanned form at left; at right a white card "AIRFRAME · Extracted entry"
  with mono fields DATE / AFTT / DESCRIPTION / DETECTED ADs (green chips) / MECHANIC / CERT
  NUMBER / IA, each with a green check at the right edge.

**Designer's read.**
- Good: the most credible "serious records tool" in the set; monospace for anything that is
  a reading or identifier; explicit per-field verification marks; honest footer disclaimer
  on every page; light/dark parity; real screenshots only; the avgas price gag and Ambient
  Airport show personality without clutter.
- Weak: desktop-first and table-heavy with no native app — a solo owner at the hangar gets
  a shrunken console. Seven equal KPI tiles don't say what to do next. The ledger is a wall
  of text with little typographic relief. All-caps micro-labels everywhere flatten
  hierarchy. Contact-gating buyers is a sales pattern imported into a trust context. [I]

**URLs.** Home https://runuppro.com/ · screenshots https://runuppro.com/features (direct
images: `/marketing/{light|dark}/{ocr-hero,scan-in-app,compliance,instant-search,time-validation,ledger,mechanic-access,sales-portal}.webp`)
· pricing https://runuppro.com/pricing · changelog https://runuppro.com/whats-new · no
App Store / Play listing found.

---

### 2.3 Maggneto — maggneto.com

**What / who / price.** Logbook digitization + maintenance tracking for single- and
twin-engine piston aircraft, for owners and A&Ps; private rollout behind a waitlist;
pricing not public. iOS listing exists (id6776865924, one rating). [O]

**Capabilities.** [C]
- Digitize logbooks, receipts and work orders; fields carry a "confidence hint".
- Hobbs and tach logging after each flight; maintenance schedule by date, hours or both
  with up-to-date / due-soon / overdue; oil tracking with burn rate (quarts per hour);
  AD tracking against airframe, engine, appliances; components with TSMOH and life limits
  (cylinders, magnetos, prop); fleet view; digital maintenance logbook with sign-offs,
  costs, attachments.
- Roadmap: plain-English questions across the history; newly-issued AD alerts matched to
  the tail number; shared access.
- SEO utilities on the same domain: FAA registry lookup, N-number availability checker,
  reservation guides, maintenance glossary, model pages.

**Design language.** [O]
- Next.js + Tailwind v4. **Geist** + **Geist Mono**, with **Caveat** (handwriting) as an
  accent. Palette is Apple-system: blue `#0a84ff`, green `#34c759`, orange `#ff9500`, on
  Tailwind grays, with warm paper `#fbfaf6` and a navy `#1f3a5f`.
- Homepage hero is an interactive **"Ask AI" demo** with five example chips. Each answer is
  followed by "Based on N records. Check it before relying on this." and source cards
  ("Engine log · Example page 42 — View"). Below it: "The original. The useful record." — a
  side-by-side of the source page (relevant passage outlined) and the structured entry.
- App dashboard (one screenshot): stock light iOS. Large title "Dashboard", tail number,
  model; a card with HOBBS and TACH and an edit button; an Oil row ("Burning ~0.07 qt/hr",
  hours since change); "Maintenance Schedule" as white rounded rows — status dot, item name
  **with its regulation in parentheses** ("ELT Battery (91.207)", "Transponder Check
  (91.413)", "Pitot-Static / Altimeter (91.411)"), due date subline, right-aligned
  remaining value ("5 hrs" in orange, "101d", "148d", "360d"). Five-tab bottom bar:
  Dashboard · Oil · Hobbs · MX Logs · More.
- Tone: the most epistemically careful copy in the category. Example: "That is a useful
  history to discuss with your mechanic — not enough, by itself, to conclude the same fault
  happened twice." "This is your recorded schedule, not a complete maintenance
  determination."

**Designer's read.**
- Good: the answer pattern (claim → count of records → hedged caveat → tappable sources) is
  the best-written version of cited Q&A I found; regulation cites in item names teach
  without a help page; the remaining-value column in one unit per row is easy to scan.
- Weak: the app itself is default-iOS with no brand; the marketing promises more than the
  shipped product (the hero demo is a roadmap item); the homepage is very long; the SEO
  utilities dilute the proposition. [I]

**URLs.** Home https://maggneto.com/ · dashboard screenshot
https://maggneto.com/screenshots/dashboard.jpg · App Store
https://apps.apple.com/us/app/id6776865924

---

### 2.4 HobbsMate — hobbsmate.com

**What / who / price.** "Aircraft management" for sole owners and partnerships, extending
to clubs, schools and corporate. Web + iOS + Android. Basic free; Plus $10/mo or $108/yr;
Multi-owner $40/mo or $400/yr flat; all per aircraft; AI features are metered (Plus: 100
photo-log drafts, 200 chat requests, 50 receipt captures per month; 12 "AD Wizard" runs per
year). [O] App Store 5.0 from 10 ratings. [O]

**Capabilities.** [C]
- **Photo-based flight logging**: photograph the tach / Hobbs (and optionally a fuel slip)
  before and after; the app reads the meters, drafts the flight, the owner approves.
  Handles a needle covering a digit. Voice input (patent pending claim).
- One approval updates everything downstream: hours to annual, cost per hour, amount owed
  to a partner, PIC time in the pilot logbook.
- Scanned maintenance logbooks (airframe + engine volumes, page previews, "extraction
  compare"); squawks; inspections; aircraft hub.
- **AD Wizard**: FAA and EASA ADs ranked likely / possible / unlikely for the airframe.
- Pilot logbook with regulatory profiles (FAA, EASA, UK CAA, CASA, TCCA), currency cues,
  "what's left before your checkride", logbook health scan (gaps, duplicates).
- Expenses, receipt OCR, cost-per-hour analytics, partner splits, netting and settlements,
  shared scheduling. AI chat ("HobbsMate Intelligence"). Multi-country registry lookup.
  Aircraft listings.

**Design language.** [O]
- Tailwind v4 + daisyUI tokens. **Inter** / system sans; **Caveat** handwriting accent.
  Palette: navy `#003367`, sky `#a6c4de` / `#82abcf`, warm paper `#fbfaf6` / `#e7e2d6` /
  `#ddd8cc`, slate `#2b3a4a` / `#5f6874`, olive-gray `#6b6557`, rust `#a8452e`, orange
  `#ffa04a`.
- Hero: a real phone photo of a tachometer, next to a receipt-like card ("N5709U Logged ·
  Tach out 5708.1 · Tach in 5710.3 · 2.2 hours"). A mocked paper flight-log table with a
  smudged "57??.?" and a handwritten "who flew 8/21?" sells the before state.
- Features page uses emoji as section icons and SVG illustrations instead of screenshots;
  plan tags on every feature.
- Tone: short imperative lines. "Snap the tach. The flight logs itself." "Review, don't
  retype." "Everyone else gives you a better form to fill in. You get a draft to check."
  "You are still pilot in command of the record."

**Designer's read.**
- Good: the sharpest single interaction idea in the category — capture is a photo, the UI
  is a draft, the reward is a visible cascade of consequences. The copy is the best in the
  set. The "paper artifact with a gap in it" is a stronger problem image than a shoebox.
- Weak: five audiences on one site; the feature catalogue sprawls; emoji icons and
  illustrations hide what the product actually looks like; metered allowances (lifetime vs
  monthly vs rolling-year) are hard to hold in the head. [I]

**URLs.** Home https://hobbsmate.com/ · features (illustrations)
https://hobbsmate.com/features · pricing https://hobbsmate.com/pricing · App Store
https://apps.apple.com/us/app/id6754582980 · Play: linked from the site (not captured).

---

### 2.5 Coflyt — coflyt.com

**What / who / price.** The incumbent owner / partnership app (since 2019, Florida).
Inspection + maintenance + AD tracking, flight logging, scheduling, billing. "Coflyt"
$24/mo or $170/yr (1 aircraft + 1 seat; +$10/mo per extra aircraft); "Plus" $43/mo or
$430/yr (unlimited seats, reservations, payments); "Business" $120/mo (6,000 lb+). 30-day
trial. [O] App Store 3.9 from 54; Play 4.1, 1K+ downloads; iOS app last updated Oct 2024. [O]

**Capabilities.** [C]
- Aircraft status: required VFR / IFR inspections, oil interval, fuel status, custom
  inspections and intervals (landings, cycles on Business).
- Squawks organized by aircraft sub-system; share in real time with the "Ownership Circle"
  and the A&P.
- ADs imported from the FAA; "FAA Compliant Digital Logbooks"; document upload; exports;
  email + SMS notifications; advanced reporting.
- Flights with fuel and oil; custom flight purposes; **ForeFlight flight import**;
  **Garmin integration** (Nov 2026: flyGarmin flight logs, GPS track, airborne time,
  Hobbs/tach "straight from the panel", trend reports, squawks matched to flight data);
  AirSync; a blockchain-backed records vault partner; a parts retailer partner.
- Reservations, payments (Stripe), automatic transaction corrections, maintenance reserve.
- A "Switch from MyFBO" displacement page and an MRO shop product.

**Design language.** [O]
- Marketing: WordPress 5.4 + Elementor. **Poppins** + **Roboto**, but the page also loads
  Rubik, Playfair Display, Eczar, Taviraj, Great Vibes, Open Sans and Noto Serif. Hero is an
  indigo-violet overlay on a stock-style photo with an embedded YouTube video; CSS shows
  navy `#003177`, bright blue `#089bff`, red `#e21535`. Font Awesome glyphs as feature icons;
  testimonial carousel with headshots.
- App (two screenshots): Poppins; dark-navy top bar; a white card with tail number, type and
  an "Edit Aircraft" button; then a **2-column grid of solid tiles in several blues** —
  "Aircraft Status: Ready", "Schedule Status: Available Now", "Fuel Status: 100 Gallons"
  (bright blue), "Hobbs 7.2", "Tach 6.7" — then list rows: "Status" with a **yellow count
  badge and a red count badge**, "Squawks", "Logbooks". Bottom bar with five tabs:
  Aircraft · Flights · Reservations · Reports · Payments.
- Tone: "peace of mind", "at a glance", "simplified", exclamation marks.

**Usability complaints.** [R]
- "It feels like a website." "Somewhat buggy, not super user friendly."
- Accounting entries are not editable once posted; "weird workarounds".
- "Make the dashboard editable. I don't want to see widgets for which I have no
  subscription."
- Wants to scan logbook entries; pasted phone text-scan "makes for terrible formatting".
- "The AD finder isn't working now that the FAA switched their system."
- Card-entry field covered by the keyboard; no iPad landscape (added 2024).
- Play: "Need to tell us about having to subscribe before we download the app."

**Designer's read.**
- Good: "Ready" as a word, not a color; two severity count badges on the Status row give a
  triage number; integrations are the broadest in the set.
- Weak: the tile grid gives fuel quantity and airworthiness the same visual weight;
  blue-on-blue tiles carry no meaning; three of five tabs are partnership operations a solo
  owner never needs; the web-wrapper feel and stale release cadence show; the marketing
  site is visibly from 2019. [I]

**URLs.** Home https://coflyt.com/ (screenshot gallery on the page; direct images under
`https://coflyt.com/wp-content/uploads/2024/12/`) · features https://coflyt.com/features/ ·
pricing https://coflyt.com/app-pricing/ · App Store
https://apps.apple.com/us/app/coflyt/id1479355740 · Play
https://play.google.com/store/apps/details?id=com.coflyt.coflyt

---

### 2.6 AirLogbooks — airlogbooks.com

**What / who / price.** Web "digital logbook system" joining aircraft records and pilot
records, for owners, pilots and mechanics. $100 per aircraft per year (down to $80 at
10–20 aircraft); no per-user fees or tiers; free trial. [O]

**Capabilities.** [C]
- Log a flight once → aircraft total time, engine / prop time, AD countdowns, reminders,
  oil change and oil consumption update.
- AD compliance tracking; ADs "automatically summarized" with "AI generated due dates";
  recurring ADs feed the status indicator.
- "MX Minders" (recurring items), squawks, engine oil change tracking.
- Digital logbook entries with **FAA-compliant digital signatures and locked entries**;
  attachments including 8130-3; records vault.
- Pilot side: logbook, currency, medical, endorsements, CFI student / ACS tracking.
- **Sharing**: public link per aircraft plus **QR code**, choose what is visible,
  time-limited and revocable; a live public sample record is linked from the homepage.
- Paid "Import My Logbooks" and custom setup services (no self-serve AI extraction).
- Data stance in the FAQ: you own it; 90 days to export after cancelling; 90 days' notice
  aimed for on shutdown.

**Design language.** [O]
- **Inter** 400–800; white cards on pale gray; blue links; Material-style line icons.
- Aircraft screen: a 3-column grid of small stat tiles with a heavy left border (Make/Model,
  Airframe TT, Annual / Condition Inspection date, TSMOH "1539.96/2000.00h", Tach, TSPOH,
  ELT last inspection, Last VOR, Last 411/413), then stacked sections — "Engine Oil Change",
  "MX Minders", "AD Compliance (1 open AD)", "Squawks". Alerts are full-width tinted pills:
  red with a "!" icon ("VOR Check – Overdue"), amber ("Engine Oil – Due in 10 days or Due
  in 32.34 hours"), pale blue for scheduled ADs (AD number link, "Due in 239 days or Due in
  88.64 hours", date, checkbox). Pencil and checkbox on every row.
- **Readiness list**: one full-bleed, fully saturated **green / red / orange row per
  aircraft and per pilot**, with a thumbnail, the name, and white chips naming the
  offending items ("Squawk, VOR Check", "Engine Oil, 411-413 Check", "FAA Medical", "Day
  Landing").
- Tone: jokey FAQ ("$100 hamburger", "we do not turn your records into a hostage
  situation", "that third cup of FBO coffee"); slogans "Are You and Your Aircraft in the
  Green?" and "Perfection is impossible. Precision is the goal."

**Designer's read.**
- Good: aircraft and pilot readiness in one list answers the real pre-flight question; the
  chips say *why* a row is red without a tap; "X days or Y hours" shows both limits; the QR
  share is a practical hangar-side idea; the public sample record is a strong trust move.
- Weak: fully saturated traffic-light rows are loud and leave no room for nuance; nine
  equal stat tiles have no hierarchy; the overall look is an admin template; unrounded
  values like "32.34 hours" add false precision; humour carries too much of the trust
  argument. [I]

**URLs.** Home https://airlogbooks.com/ (screenshots on the page; direct images
`/assets/aircraft-readiness.png`, `/assets/flight-readiness.png`,
`/assets/aircraft-logbooks-section.png`) · pricing https://airlogbooks.com/pricing · no
native app found.

---

## 3. Other direct competitors (medium depth)

### 3.1 SquawkFree — squawkfree.com (design summary; features are in the repo doc)

- Owner plan $4.99/mo; school plan $55/mo; ADS-B "Flight Intelligence" $3/aircraft/mo;
  human digitization $299/aircraft up to 300 pages + optional $5.99/mo. [O]
- Update since the repo snapshot: Oct 8 2026 release adds image previews and per-page notes
  to digitization uploads, kept in job history. [O]
- Design [O]: Next.js + Tailwind; **Barlow Condensed** (display), **Inter** (body),
  **JetBrains Mono** (data, used inline in prose); slate `#212e39`, sky `#2c97de`, light sky
  `#5bbeff`, ground `#f1f5f8`, hairline `#d5dce2`; square corners; `theme-color #ffffff`.
- **New observation:** `#2c97de`, `#5bbeff` and `#212e39` are also the dominant values in
  ForeFlight's own site CSS (82, 36 and 33 occurrences). Whether deliberate or not,
  SquawkFree's palette reads as "ForeFlight-adjacent" to anyone who lives in that app. [O/I]
- App AD record (screenshot): charcoal dark UI; mono AD number; outlined green "Compliant"
  pill; inline facts "Recurring · 362d remaining · 100.0h remaining · Aircraft"; then
  small-caps section labels SUBJECT / DESCRIPTION / COMPLIANCE / NEXT DUE & INTERVALS (next
  due date, days remaining, next due tach, hours remaining, current tach, interval) / FAA
  REFERENCE ("View on FAA") / LINKED MAINTENANCE / NOTES. A raw "\n\n(Page 27866)" artifact
  is visible in the description text — unpolished imported data. [O]
- Hero copy is a scenario ("Your annual is next month."), not a slogan.
- Web nav: top bar with 7 links + 2 CTAs. Mobile: responsive web only.
- URLs: https://squawkfree.com/ · screenshots on the homepage
  (`/screenshots/ad-compliance.png`, `/ad-search.png`, `/flight-intelligence.png`) ·
  https://squawkfree.com/logbook-digitization · no store listings.

### 3.2 Bluetail — bluetail.aero

- Business-aviation records platform with a piston tier: from $75/month/aircraft (billed
  annually, 3 users, fewer than 3 aircraft); Fleet from $150. Scanning: on-site, 150+ local
  scan centers, or DIY upload with a 30-minute onboarding call. [O]
- Capabilities [C]: AI ingestion that classifies document type, extracts dates / part
  numbers / work orders, orders pages chronologically into "living logbooks", links
  supporting records; **MACH 2 search** (handwriting, signatures, form recognition); **Ask
  Bluetail** ("Every answer you need. With proof."); **Auto Research** (finds every AD, SB,
  inspection and component needing proof of compliance and cites the proving document);
  **Timeline view** (click an event to open the source); RecordSnap phone capture; secure
  share links; conformity as a service.
- Design [O]: WordPress + Elementor; **Poppins** (+ Roboto; Playfair Display present);
  accent blue `#0675e3` on white/black, orange `#ed7d31`; header carries a phone number and
  "Request demo". Product is shown as cropped vignettes on halftone-dot circles and
  "persona" illustrations rather than full screens. Dashboard vignette: four solid stat
  tiles (green Documents, blue Logbooks, yellow Shares, orange Users) over an "Airframe
  Data" table.
- Read [I]: enterprise voice ("actionable intelligence", "audit-ready"), demo-gated,
  priced out of reach for a single piston owner; but its *feature vocabulary* (answers with
  proof, living logbook, timeline) is the up-market version of this category and will set
  buyer expectations.
- URLs: https://bluetail.aero/ · https://bluetail.aero/owner-operator ·
  https://bluetail.aero/product/subscription-plans ·
  https://bluetail.aero/aircraft-records-ai-compliance · no consumer store listing captured.

### 3.3 TBX and LogIQ — airworthy.com

- AD-compliance and shop-management software descended from two 1990s AD-research tools;
  aimed at IAs and shops. $49/mo with 6-month commitment, $499/yr, $799/2 yr. [O]
  A free "TBX Basic for Garmin" tier gives owners aircraft profiles pulled from flyGarmin,
  an AD compliance library and a "Next Due Tracker". [C]
- **LogIQ** [C]: "Define → Scan → Verify" (pick logbook and category *before* the first
  photo; scan from phone or upload PDFs; each entry shown with the original page, flagged
  when it needs a closer look). "Every Page Itemized" (dates, times, mechanics, part and
  serial numbers, STCs, AD entries). "Answers with Sources". Maintenance timeline.
  "Identify Potential Discrepancies": reconcile tach, Hobbs and total time across entries to
  spot gaps and jumps; AD entries missing key details flagged; cross-check against public
  NTSB accident records. Section title: "AI That Shows Its Work".
- AD tooling worth noting [C]: search by AD, N-number, make/model or serial-number
  applicability; AD alerts by type; TCDS and STC search; export method-of-compliance text
  for logbook entries; saved MOC templates for recurring ADs.
- Design [O]: Webflow; deep navy `#051c2c`, blue `#0082f3`, purple `#5b3b7a` for LogIQ;
  8 / 16 px radii; customer-logo strip, big-number stats, testimonial wall.
- URLs: https://www.airworthy.com/ · https://www.airworthy.com/log-iq ·
  https://www.airworthy.com/ad-compliance · https://www.airworthy.com/for-garmin ·
  https://www.airworthy.com/pricing

### 3.4 Crewchief GA — crewchiefsystems.com

- Managed "aircraft asset intelligence": subscription includes a "thorough logbook scan and
  analysis" done by their staff, year-round monitoring by A&Ps, discounts at affiliate
  shops. Piston single $49/mo or $499/yr; piston multi $79 / $799. [O] App Store 4.8 from
  16. [O]
- Capabilities [C]: serial-number-specific ADs **and service bulletins** with documents;
  status, due dates and due times; squawk workflow; equipment lists; IFR equipment status;
  **VOR check log and nav-data update log**; flight-data upload; gap insights; Garmin,
  AirSync and FlightAware integrations (automated flight-log estimates); parts ordering;
  **AskCrewchief** by text or voice, across a fleet.
- App dashboard (screenshot) [O]: blue header "DASHBOARD" with a hamburger; identity row
  (tail, make, model); a 3×2 grid of times (Airframe TTIS, Tach, Engine TT, Engine
  SMOH/SPOH, Propeller TT, Propeller SPOH); a "STATUS SUMMARY" legend of six categories with
  colored dots (Core Maintenance, Safety, Additional Tracking, IFR Equipment, Pilot,
  Administrative); "Expand All"; an accordion per category with rows: icon, name, due date,
  "95 days left", and a **thin progress bar** (orange / green; pink when no data). Bottom
  bar: Dashboard · Flight Log · Squawks.
- Design [O]: **Outfit**; navy `#1b2752` / `#2d4085` with orange `#fb9335` / `#f76900`;
  stock photography of mechanics and cockpits; device mockups.
- Review [R]: "Slow to refresh data. Finicky with lots of bugs. Struggles with document
  management." Another: viewing everything about the plane before flying "is a game
  changer".
- URLs: https://crewchiefsystems.com/ ·
  https://crewchiefsystems.com/digital-products/for-pilots · App Store
  https://apps.apple.com/us/app/id1470882836 · Play
  https://play.google.com/store/apps/details?id=com.crewchief.crewchiefMobile

### 3.5 PlaneLogiX — planelogix.com

- Since 2014: human transcription of old logbooks plus a tracking platform. Tagline today:
  "the gold standard for digital aircraft maintenance records". [O]
- Capabilities [C, partly from a reseller page of uncertain age]: text-searchable records;
  tracking items with make/model templates; automated AD search; time and cycle log;
  "tracking item status grid"; scheduler that notifies mechanics by email or in-platform;
  e-signatures for shops; list aircraft for sale; **parts linked to tracking items** with a
  buy button; flight scheduling; MRO platform; homebuilt builder log. Added to Garmin's
  flyGarmin flight-log sharing in 2026. [R]
- Design [O]: client-rendered Vue app (Vueform), Tailwind; **Nunito**; primary green
  `#60bf8d`; default Tailwind indigo / emerald / red utility colors. Rounded, friendly, a
  little generic. I could not view product screens.
- Pricing: not readable (SPA). Historical press: free basic tier and $129.95/yr (2019). [R]
- URLs: https://planelogix.com/ · reseller overview
  https://www.aircraftspruce.com/catalog/stpages/planelogix.php · no native app found.

### 3.6 Savvy Aviation — savvyaviation.com

- Not a records app: an owner-advocacy service with a data platform. SavvyBasics (reports +
  breakdown assistance), SavvyAnalysis $189/yr single, SavvyQA, SavvyMx $899/yr single
  (dedicated A&P/IA account manager, estimate–approve–repair protocol, logbook-entry
  review). [O]
- Platform [C]: engine-monitor uploads turned into **Report Cards**, **Trend Reports** and
  exhaust-valve analytics; borescope image organization and annotation; AI anomaly
  detection supporting human analysts; ticket system for all owner–shop communication.
- Design [O]: WordPress + Divi; **Raleway**; near-black `#231f20`, red `#e51f26`, maroon
  `#841a25`, gold `#b99d33`, blue `#2098d1`; team-photo hero; counters; long testimonial
  walls. Tone: "Be the Owner In Command", "With Savvy at your six", "plain-English answers".
- Relevance [I]: owners pay 5–10× app prices for *judgment in plain English*. The report
  card (your engine vs the cohort) is a format no records app has borrowed.
- URLs: https://www.savvyaviation.com/ · https://www.savvyaviation.com/savvybasics/ ·
  https://www.savvyaviation.com/savvymx/

---

## 4. Smaller trackers and contrast products (short)

**FlightGuard** (iPhone/iPad; FAA + EASA) [C]: track by date, hours **and landings**;
forecast tasks from usage; interval tolerances; **bundle tasks to save hangar visits**;
"AD Smart Scan"; AI-assisted scan to capture times; life-limited components; PDF
maintenance plan / status report / AD report for the mechanic. Positioning line: "Know
what's due. Make time to fly." https://apps.apple.com/us/app/flightguard/id6736479190

**FlightBoss** (iPhone, Android) [C/R]: tracks ELT, annual, transponder, pitot, registration,
VOR, insurance and **GPS database currency**; squawk with photo sent to the mechanic; POH
uploaded by section. 3.8 from 10; complaint: "you can't edit or delete logs. If you make an
error you're stuck." https://flightboss.com/ ·
https://apps.apple.com/us/app/flightboss/id1556221444

**aeroLogbook** (iPhone, iPad, **Apple Watch**) [O/C]: the most platform-native app here —
iCloud sharing, home-screen widgets, Siri "add a flight log", Watch app for status and quick
logging. Home screen = full-bleed aircraft photo with glass buttons, then a stacked bar
chart "Recent Flights" by month and owner. Service items grouped **Past Due / Coming Soon /
Scheduled for Later**; on-condition items (tires, batteries); in-flight engine trend logs.
Single-engine only. 4.7 from 35; reviews mention small bugs.
https://apps.apple.com/us/app/aerologbook/id1304166683

**AV1ATE Tracker** ($9.99 once) [C]: "subscription-free alternative to legacy maintenance
tools"; offline-first, **no account**; health dashboard, Hobbs/tach, reminders by date or
hours. Sells on "clean, premium design" and "clarity, not clutter".
https://apps.apple.com/us/app/id6757898818

**LogVault** (pre-release; a dev deployment, treat as unconfirmed) [O]: JetBrains Mono +
Inter; navy `#0a1628`, emerald `#059669`. Ideas worth noting: a **"Records Completeness"
score tied to an "estimated resale value impact" in dollars**; "no account needed, your
data stays on your device" first run; "View as Digital Book"; compression-history table;
cost per flight hour; "sale-ready PDF" with the completeness score.
https://logvault-dev.pages.dev/

**Others seen but not profiled.** "Aircraft Compliance" app (debuted at AirVenture 2026;
"plain-language readiness picture" [R]; page blocked). A logbook-digitization / pre-buy
report product listed in a directory as "Tailcheck" (cross-references FAA / NTSB data,
title history, 337s, STCs [R]); unrelated to a $4.99 reminders app of similar name on the
App Store. A former nationwide logbook-scanning network's domain now redirects to JSSI
AviatorMX.

**Up-market contrast.** JSSI **AviatorMX** (light jets / turboprops owner-operators):
dashboard, forecast reports, compliance updates, flight logs; Gotham; navy `#162852` +
orange `#f8971d`. **Veryon Tracking** (ex-Flightdocs): Bai Jamjuree; a color-coded "Due
List" is the core screen; reviewers complain that hours-based engine items show hours
remaining but **no projected date**, and want next-due visible "without having to click on
each specific task" [R]. **Quantum MX**: shop software from $79/mo with a customer portal;
"no app required". **Adlog**: paper binder system with a mailed AD service — not reachable
today; relevant only as the thing owners trust because it is *ordered, tabbed and
physical* [K].

---

## 5. Pilot-side design references

### 5.1 ForeFlight — foreflight.com

- Fonts **proxima-nova** and **gesta** (Adobe Fonts); sky `#2c97de`, `#5bbeff`, slate
  `#212e39`, `#1e374f`; 3px radii. [O] App Store 4.4 from 3.3K (id333252638). [O]
- Logbook [C]: entries, drafts created from track logs or filed plans, "Drafts & Requests"
  inbox, quick-fill buttons that pre-stage the ending Hobbs / tach from the previous entry,
  currency summary, endorsements, route on the aeronautical map, web + mobile sync.
- Maintenance: I found no owner-maintenance tracker in the consumer logbook product page;
  the July 2026 **ForeFlight Scheduler** (schools, clubs, managers) adds "maintenance and
  inspection tracking". Owner-level tracking inside ForeFlight is therefore [I] absent or
  minimal — but the scheduler shows the direction.
- App design [K]: dark navy chrome, bottom tab bar with a "More" overflow, dense lists,
  cyan-blue accent, cautious use of color for hazard. Owners read it as the house style of
  "serious aviation software" — which is why two competitors echo its palette.
- https://foreflight.com/products/logbook/ ·
  https://apps.apple.com/us/app/id333252638

### 5.2 Garmin Pilot — garmin.com

- App Store 4.7 from 4.2K (id340917615). [O] Logbook auto-starts on takeoff roll and syncs
  with flyGarmin. [R]
- The relevant pattern is **flyGarmin flight-log sharing**: panel avionics upload each
  flight (track, engine data, total time) and the owner connects third-party services
  under "Flight Log Sharing > Available Providers". Named providers in 2026 coverage include
  Coflyt, TBX, PlaneLogiX, Crewchief, a training-analytics service and a records service
  ("one of 12"). [R] Hours capture is moving from typing to authorization.
- App design [K]: dark UI, icon-grid home, radial menu on the map, split screens.
- https://www.garmin.com/en-US/aviation/aircraft-flight-logs/ ·
  https://apps.apple.com/us/app/id340917615

### 5.3 LogTen (Coradine / Pilotbase) — logten.com

- Fonts **Gibson** (canada-type-gibson), **Roboto Mono**, PT Serif; blues `#1f74bb`,
  `#4bb5e5`, `#67c6ed`; charcoal `#353e49`; fully round pill buttons. [O] App Store 4.7 from
  10K (id837274884). [O]
- Capabilities [C]: iPhone / iPad / Watch / Mac; smart groups; 100+ report formats; duty and
  rest limits; goal tracking; import with "balance forward"; job matching.
- Design lessons [K/I]: Apple-native, heavily user-configurable fields; treats a logbook as
  a *career asset with milestones*, not a compliance chore ("Log flights. Celebrate
  milestones.").
- https://logten.com/ · https://apps.apple.com/us/app/id837274884

### 5.4 MyFlightbook — myflightbook.com

- Free, donation-supported, since 2006; App Store 4.9 from 1.1K (id349983064). [O]
- Its own feature chart confirms [O]: "Track aircraft inspections, other aircraft
  deadlines", custom deadlines, cloud backup to Dropbox / Google Drive / OneDrive (nightly),
  40+ print layouts, flight coloring rules, achievements / badges, telemetry attachment,
  flying clubs.
- Design [O/K]: a menu bar with nested dropdowns (Logbook · Aircraft · Airports · Training ·
  Profile), tables, forms. Zero polish, total trust: it is the proof that this audience
  rewards longevity, openness (import/export everything) and a single maintainer's
  responsiveness over visual design.
- https://myflightbook.com/logbook/ ·
  https://myflightbook.com/logbook/mvc/pub/FeatureChart ·
  https://apps.apple.com/us/app/id349983064

### 5.5 Flighty — flighty.com (benchmark for aviation-flavoured consumer design)

- Framer site; **Inter** for UI, **EB Garamond** for editorial headlines, **IBM Plex Mono**
  / Fragment Mono for data, a handwriting face for asides; near-black `#05010d` with deep
  violet `#120036` / `#250160`; 20px radii. [O] App Store 4.8 from 163K (id1358823008). [O]
- The homepage hero is a stack of **notifications as copy**: "Mom landed in New York —
  6:32am (22m early) and 88º", "Gate changed — Changed to ORD Terminal 2 • Gate 7". The
  product is sold through its messages, not its screens. [O]
- Principles (Apple "Behind the Design", and a third-party design teardown) [R]:
  - Borrow a proven real-world system: airport departure boards — "one line per flight…
    they've had 50 years of figuring out what's important".
  - **Context-aware states**: about 15 states across a trip, each showing only what matters
    then (day before, head to airport, at gate, in flight, landed, connection).
  - Data is "packed, wrapped and colored" so the user never interprets raw values.
  - "We want Flighty to work so well that it feels almost boringly obvious."
  - Assume offline; Live Activities / Dynamic Island keep the one key number present.
  - A retrospective layer ("Passport") turns records into something people want to share.
- https://flighty.com/ · https://developer.apple.com/news/?id=970ncww4 ·
  https://blakecrosley.com/guides/design/flighty ·
  https://apps.apple.com/us/app/id1358823008

---

## 6. Cross-product pattern tables

### 6.1 Navigation models

| Product | Web | Mobile |
|---|---|---|
| BetterPlane | none (marketing only) | Bottom bar, 3 tabs: Overview · Logbooks · Documents [O] |
| Runup | Top tab bar, 6 tabs, no sidebar [O] | Responsive web only [I] |
| Maggneto | marketing only | Bottom bar, 5 tabs: Dashboard · Oil · Hobbs · MX Logs · More [O] |
| Coflyt | Web app exists (not viewed) | Bottom bar, 5 tabs: Aircraft · Flights · Reservations · Reports · Payments [O] |
| Crewchief GA | Web dashboard (mockup only) | Hamburger + bottom bar, 3 tabs: Dashboard · Flight Log · Squawks [O] |
| AirLogbooks | Single long aircraft page of stacked sections [O] | Responsive web [I] |
| SquawkFree | Per-aircraft tabs (AD, flights, maintenance…) [C] | Responsive web |
| aeroLogbook | — | Photo home + tabs (Flights, Squawks, Service, Trends) [C] |
| ForeFlight / Garmin Pilot | Left rail / top nav | Bottom bar + "More" / icon grid [K] |

Pattern: nobody in the owner segment has both a considered desktop layout and a native
mobile app. Products are either phone-only (BetterPlane, Maggneto, FlightBoss, aeroLogbook,
AV1ATE) or desktop-web-first (Runup, SquawkFree, AirLogbooks, PlaneLogiX, TBX).

### 6.2 How aircraft status and due items are visualized

| Device | Who | Notes |
|---|---|---|
| Lamp grid ("annunciator") | BetterPlane | Many items, tiny footprint; cryptic labels; hue-only |
| Full-row solid traffic-light | AirLogbooks | Offending items named in chips; very loud |
| Single word tile ("Ready") | Coflyt | Plus severity count badges on the Status row |
| Colored dot + remaining value | Maggneto, Crewchief | "5 hrs", "101d"; quiet, scannable |
| Gradient bar with marker | BetterPlane | Shows margin on a scale; red–green gradient |
| Thin progress bar | Crewchief | Elapsed fraction of interval |
| KPI tile strip | Runup, Bluetail | Counts by bucket (open, due <30 days, due <20 hrs) |
| Tinted alert pills | AirLogbooks | Red / amber / blue rows, "days or hours" |
| Three text buckets | aeroLogbook, Maggneto | Past Due / Coming Soon / Later; Up to date / Due soon / Overdue |
| Text projection | SquawkFree | Hours item → projected calendar date + confidence |
| Calendar / timeline of the future | **nobody** | Timelines exist only for the *past* (Runup ledger, Bluetail, LogIQ) |
| Gauges / dials | **nobody** | Despite the cockpit talk, no one draws an instrument |

### 6.3 Onboarding

- Tail number → FAA registry auto-fill: BetterPlane, LogVault, HobbsMate, Maggneto (as a
  public utility), SquawkFree. Effectively standard.
- Demo before account: BetterPlane (demo mode), LogVault (on-device demo data), AirLogbooks
  (live public sample record), Maggneto (interactive answer demo on the homepage).
- Templates for recurring items by aircraft type: BetterPlane, PlaneLogiX, FlightBoss.
- Declare logbook + category before scanning: TBX LogIQ ("Define").
- Human-assisted setup: Crewchief (included), Bluetail (30-minute call), AirLogbooks and
  PlaneLogiX (paid import), SquawkFree ($299).
- Time-to-value claims: "60+ years of logs in about an hour" (BetterPlane), "paper to
  searchable in three steps" (Runup), "protect your aircraft in under 2 minutes" (LogVault).

### 6.4 Digitization and entry review

| Step | Convention | Variations |
|---|---|---|
| Capture | Phone camera or PDF upload | Multi-page scan (BetterPlane); background processing + notification (Runup); bulk 337 splitter (Runup); upload in any order, auto-sorted (Bluetail); page notes to a human team (SquawkFree) |
| Extract | Date, tach / TT, work text, mechanic, cert, ADs | Tags and detected ADs as chips (Runup); part and serial numbers, STCs (LogIQ); compression results (Runup); doc-type classification (Bluetail) |
| Review | Original at left, fields at right | Per-field check marks (Runup); "confidence hint" (Maggneto); auto-flag entries needing a closer look (LogIQ); "nothing is saved until you approve" (Runup, HobbsMate) |
| After | Full-text search | Time reconciliation and gap flags (Runup, LogIQ); cited Q&A (LogIQ, Bluetail, Crewchief, Maggneto demo) |

The side-by-side "handwritten 1994 annual next to typed fields" image is now the category's
stock hero (Runup, Maggneto, LogVault, BetterPlane, LogIQ all use a version of it).

### 6.5 AD tracking approaches

- Import the A&P's compliance report as ground truth: Runup.
- Search / import from FAA data by make / model / keyword: SquawkFree, Coflyt, TBX.
- Serial-number applicability, with documents: Crewchief, TBX (airframes only).
- Relevance triage (likely / possible / unlikely): HobbsMate "AD Wizard"; FlightGuard "AD
  Smart Scan" ("potentially relevant").
- Detect AD mentions inside scanned entries and link them: Runup, BetterPlane (preview),
  LogIQ.
- Service bulletins alongside ADs: Crewchief; BetterPlane publishes SB notices as updates.
- EASA ADs: HobbsMate, FlightGuard.
- New-AD alerts matched to the tail: TBX (by type), Maggneto (roadmap).
- Everyone hedges applicability in copy; nobody shows *why* an AD was judged applicable.

### 6.6 Hours capture

Typed after flight (all) → quick-fill from previous entry (ForeFlight, aeroLogbook) →
**photo of the meter** (HobbsMate) → EFB import (Coflyt from ForeFlight) → ADS-B inference
(SquawkFree; Crewchief via FlightAware estimates) → **avionics push** (flyGarmin sharing to
Coflyt, TBX, PlaneLogiX, Crewchief; AirSync to Coflyt, Crewchief, LogTen).

### 6.7 Sharing and hand-off

- Mechanic: one-tap invite with roles (BetterPlane); scoped read-only link (Runup);
  "Add your A&P" (Coflyt); squawk-to-mechanic (FlightBoss, Crewchief); mechanic signs
  locked digital entries (AirLogbooks, PlaneLogiX).
- Buyer: portal with tiers and analytics (Runup); public link + QR (AirLogbooks); sale
  listings (BetterPlane, HobbsMate, PlaneLogiX); "sale-ready PDF" with completeness score
  (LogVault); record transfer to the new owner (BetterPlane).
- Documents: PDF of each logbook (BetterPlane, Runup); maintenance plan / status / AD
  reports (FlightGuard); MOC text export (TBX); CSV everywhere. None of the exported
  documents I could see evidence of is *designed* — they are data dumps.

### 6.8 Typography and color census (from page source)

| Product | Type | Core palette | Corners |
|---|---|---|---|
| BetterPlane | Lora + Racing Sans One | brown `#4a3b2e`, rust `#c45d3e`, navy `#13222d`, parchment `#f0e5c8` | pills, hard shadows |
| Runup | Inter Tight + IBM Plex Mono (+ Racing Sans One logo) | navy-black `#0d1220`, off-white `#e7e3d8`, blue `#2a78d6` | square |
| Maggneto | Geist + Geist Mono + Caveat | iOS blue `#0a84ff`, green `#34c759`, orange `#ff9500`, paper `#fbfaf6` | large radii |
| HobbsMate | Inter + Caveat | navy `#003367`, sky `#a6c4de`, paper `#fbfaf6`, rust `#a8452e` | medium |
| SquawkFree | Barlow Condensed + Inter + JetBrains Mono | slate `#212e39`, sky `#2c97de`, ground `#f1f5f8` | square |
| Coflyt | Poppins + Roboto (+6 more) | indigo hero, navy `#003177`, blue `#089bff` | 4px |
| AirLogbooks | Inter | white, blue links, saturated green / red / orange | medium |
| Bluetail | Poppins (+ Playfair) | blue `#0675e3`, white, black | mixed |
| TBX | (Webflow, unresolved) | navy `#051c2c`, blue `#0082f3`, purple `#5b3b7a` | 8 / 16px |
| Crewchief | Outfit | navy `#1b2752`, orange `#fb9335` | mixed |
| PlaneLogiX | Nunito | green `#60bf8d` | rounded |
| Savvy | Raleway | black `#231f20`, red `#e51f26`, gold `#b99d33` | mixed |
| ForeFlight | Proxima Nova + Gesta | sky `#2c97de`, slate `#212e39` | 3px |
| LogTen | Gibson + Roboto Mono | blues `#1f74bb` / `#4bb5e5`, charcoal `#353e49` | pills |
| Flighty | Inter + EB Garamond + IBM Plex Mono | near-black `#05010d`, violet `#120036` | 20px |

Nine of twelve direct competitors are navy / blue. Three of the 2026 entrants pair a
neutral sans with a monospace for data. Two use the same handwriting font (Caveat) and two
use the same retro display font (Racing Sans One).

---

## 7. Screens I actually looked at (for anyone re-checking)

- BetterPlane: annunciator home (site + App Store shot 1), tracking list (App Store shot 2).
- Runup: `dark/compliance.webp`, `light/ocr-hero.webp`, `dark/ledger.webp`.
- Maggneto: `screenshots/dashboard.jpg`.
- SquawkFree: `screenshots/ad-compliance.png`.
- Coflyt: splash and aircraft home (two images in `wp-content/uploads/2024/12/`), site hero.
- Bluetail: `2023/05/Dashboard.png` vignette.
- Crewchief: `dashboard_iphone` mockup.
- aeroLogbook: App Store shot 1.
- AirLogbooks: `assets/aircraft-readiness.png`, `assets/flight-readiness.png`.

Everything else about in-app UI is from vendor text or reviews.

---

## 8. Synthesis

### (a) The category look — dominant conventions

1. **Navy-and-blue, white cards, traffic-light status.** Blue signals "aviation / trust";
   green-amber-red does all the semantic work, almost always by hue alone.
2. **Dashboard = stat tiles on top, due list below.** Tiles hold tach / Hobbs / total time /
   SMOH; the list holds inspections sorted by urgency with a dot, a name and a remaining
   value. Sections stack: maintenance, ADs, squawks.
3. **Mobile = bottom tab bar with 3–5 tabs** (Dashboard or Aircraft, Flights, Logbooks or
   MX, Squawks, More), aircraft photo and tail number at the top.
4. **Web = either a WordPress / Webflow marketing site in Poppins / Inter / Raleway, or a
   dense admin table.** The newer web apps add monospace for data and square corners to
   read as "instrument".
5. **The digitization story is always three steps** — scan, AI reads, you review — with a
   handwritten page beside typed fields as the hero image.
6. **The legal hedge is standard copy**: "alongside your paper logbooks, not instead of
   them", usually citing an FAA advisory circular.
7. **Founder-pilot voice and avgas-denominated pricing**: the product is introduced by an
   owner who had the problem, and the price is compared to fuel, a hamburger flight or an
   oil change.
8. **Paper as texture**: beige / parchment backgrounds and a handwriting font are the
   shorthand for "logbook".
9. **Per-aircraft pricing, no per-seat fees**, in a $50–$200/yr band for self-serve tools
   and $500+/yr once a human service is bundled.

### (b) Clichés everyone repeats

- "Peace of mind", "at a glance", "simplified", "all in one place".
- "Less time on paperwork, more time flying."
- The shoebox / crates / binders / coffee-stained pages.
- "Built by pilots, for pilots."
- "Logbooks are 40–60% (or 30–50%, or 25–60%, or 'up to 20%') of your aircraft's value."
- Traffic-light dots; "in the green".
- Cockpit metaphors applied to software (annunciator, dashboard, preflight, "at your six").
- Stock photo of a cockpit above clouds; propeller and paper-plane icons; device mockups.
- The $100-hamburger price joke.
- A three-step "how it works" row and a testimonial wall.
- "FAA compliant" used as a badge.
- The before / after handwritten-page hero.
- AI named as a proprietary engine ("AirWrenchAI", "MACH 2", "LogIQ", "Intelligence").

### (c) White space — approaches nobody here is using

1. **A state-aware home instead of a static dashboard.** Every product shows the same
   layout every day. None adapts to the airplane's situation — all clear; something lapses
   within your next few flights; annual month; in the shop; preparing a sale — the way
   Flighty's screen changes through a trip. This is the largest open idea.
2. **A plain-language verdict with reasons.** Products show lamps or "Ready". None composes
   a sentence such as "Legal for day VFR today. IFR lapses in 12 days: pitot-static due
   Nov 30", split by kind of operation, with each clause tappable to its evidence.
3. **One forward-looking runway that merges calendar and hours.** Timelines exist only for
   history. Nobody draws the next 12 months with hours-based items projected onto dates,
   an uncertainty band, and natural clusters ("do these three at the annual"). Operators'
   reviewers ask for exactly this from the incumbent tracker; FlightGuard only *claims*
   bundling.
4. **Provenance as a first-class, consistent visual primitive.** Citations appear on Ask
   screens and review screens, then vanish. No product carries a small page-crop / source
   chip beside every number everywhere — dashboard, reminder email, shared link, PDF.
5. **A visible tri-state for truth**: read by AI / confirmed by owner / signed by mechanic.
   Only one competitor shows per-field checks, and only at review time. A calm, systematic
   way to show certainty across the whole product is unowned.
6. **Editorial, typographic calm.** The field is split between admin-console density,
   stock-iOS neutrality and retro skeuomorphism. Nobody uses a restrained editorial system
   — real typographic hierarchy, generous measure, one accent — the way Flighty does for
   travel. A records product that reads like a well-set document would stand alone.
7. **Status encoding that does not depend on red / green.** Position, shape, wording and
   order could carry urgency; color would only reinforce. No competitor attempts it.
8. **Designed hand-off documents.** Exports are CSVs and generic PDFs. A typeset annual-prep
   packet, AD compliance record or pre-buy dossier — something a mechanic or buyer would
   recognise as competent paperwork — is open territory, and it is the artifact that
   leaves the app and markets it.
9. **Notifications as the product.** Reminders are "X is due" alerts. Nobody writes
   messages that carry the whole answer ("Annual due in 30 days. Last year's took 9 days
   at tach 3,240. Three ADs recur at this inspection."), nor uses lock-screen widgets, Live
   Activities or a watch face for the one number that matters. Only a small indie app has
   widgets and a Watch companion.
10. **A "first read" moment after the first scan.** Onboarding ends at an empty dashboard
    or a completeness percentage. No one hands the owner a short narrative of what the
    books just revealed — overhauls, repeat repairs, gaps — as the payoff for scanning.
11. **True two-surface design for one person.** A desktop reading / reviewing environment
    and a hangar-side phone capture tool, designed as a pair. Today it is one or the other.
12. **Honoring the physical book without kitsch.** Page order, volume spines, the feel of
    leafing through — hinted at by one pre-release ("view as digital book") and nobody else.
13. **Quiet aviation.** Aviation is expressed by lamps, stripes and stock cockpits. Nobody
    expresses it through the discipline pilots actually admire: checklists' terseness,
    chart-like information layering, tabular numerals, restrained caution colors.
14. **Hangar ergonomics.** One competitor ships dark mode "for late-night hangar sessions".
    None talks about one-handed capture, glare, greasy fingers, offline, large targets.

### (d) Capabilities competitors have that an owner-focused logbook digitizer may be missing — ranked

Ranked by (value to a solo piston owner) × (how many competitors now set the expectation).
Verify each against the product's current state before acting; some may already exist.

1. **Hours without typing.** Photo-read of the tach / Hobbs into a draft (HobbsMate);
   avionics push via flyGarmin sharing (Coflyt, TBX, PlaneLogiX, Crewchief); AirSync;
   ADS-B / FlightAware estimates (SquawkFree, Crewchief); EFB import (Coflyt ← ForeFlight).
2. **Written-versus-calculated time validation and a per-component time ledger**, including
   independent engines / props on twins (Runup, TBX LogIQ, BetterPlane components).
3. **SMS and push alerts, dual-limit ("whichever first") alerts** (BetterPlane, Coflyt,
   FlightBoss); **new-AD alerts matched to the aircraft** (TBX, Maggneto roadmap).
4. **Engine-health records**: per-cylinder compression history, oil-consumption and
   fuel-burn trends per engine, in-flight trend logs (BetterPlane, aeroLogbook, Maggneto);
   engine-monitor report cards and borescope image organization (Savvy).
5. **AD depth**: serial-number applicability and service bulletins with documents
   (Crewchief, TBX); relevance triage likely / possible / unlikely (HobbsMate); EASA ADs
   (HobbsMate, FlightGuard); method-of-compliance text export (TBX).
6. **Mechanic-side participation**: digital signatures with locked entries (AirLogbooks,
   PlaneLogiX, Coflyt's "FAA compliant digital logs"); squawk sent to the mechanic with
   photo (FlightBoss, Crewchief); automatic notice to the shop of upcoming work (PlaneLogiX).
7. **Bulk and background ingestion**: stack-of-337s splitter with duplicate / wrong-tail
   detection (Runup); upload in any order with automatic chronological filing and
   document-type classification (Bluetail); background processing with in-app + email
   completion notice (Runup).
8. **Sale tooling beyond a read-only link**: QR code on the share (AirLogbooks); buyer
   engagement analytics (Runup); records transfer to the next owner (BetterPlane); records
   completeness score with resale impact (LogVault); accident / registry / title
   cross-checks (TBX LogIQ, directory-listed pre-buy products); for-sale listings.
9. **Cost of ownership**: expenses, receipt OCR, cost per hour, maintenance reserve
   (HobbsMate, Coflyt, LogVault).
10. **Pilot readiness beside aircraft readiness**: medical, flight review, currency in the
    same go / no-go view (AirLogbooks, SquawkFree, HobbsMate).
11. **Small compliance logs owners actually keep**: VOR check log, nav-database currency,
    document expirations for insurance and registration (Crewchief, FlightBoss,
    BetterPlane); pre-flight checklists with history (SquawkFree).
12. **Platform reach**: Apple Watch, home-screen widgets, Siri (aeroLogbook); voice
    questions (Crewchief); no-account demo mode (BetterPlane, LogVault).
13. **Planning aids**: interval tolerances, landings / cycles as a tracking unit, bundling
    tasks into one hangar visit (FlightGuard, Coflyt Business); parts linked to tracked
    items (PlaneLogiX, Crewchief).
14. **Human services on top**: done-for-you digitization (SquawkFree, PlaneLogiX, Bluetail,
    AirLogbooks, Crewchief) and expert second opinions (Savvy) — a business choice more
    than a feature, but it defines what "certainty" costs in this market.

---

## 9. URL list (homepage · best screenshot page · App Store · Google Play)

| Product | Homepage | Best page for visuals | App Store | Google Play |
|---|---|---|---|---|
| BetterPlane | https://betterplane.com/ | https://betterplane.com/ (feature sections) | https://apps.apple.com/us/app/id6701693347 | https://play.google.com/store/apps/details?id=com.chromolylabs.betterplane.android |
| Runup | https://runuppro.com/ | https://runuppro.com/features | none found | none found |
| Maggneto | https://maggneto.com/ | https://maggneto.com/screenshots/dashboard.jpg | https://apps.apple.com/us/app/id6776865924 | not found |
| HobbsMate | https://hobbsmate.com/ | https://hobbsmate.com/features | https://apps.apple.com/us/app/id6754582980 | linked from site (not captured) |
| SquawkFree | https://squawkfree.com/ | https://squawkfree.com/ (`/screenshots/*.png`) | none (responsive web) | none |
| Coflyt | https://coflyt.com/ | https://coflyt.com/ (gallery) | https://apps.apple.com/us/app/coflyt/id1479355740 | https://play.google.com/store/apps/details?id=com.coflyt.coflyt |
| AirLogbooks | https://airlogbooks.com/ | https://airlogbooks.com/ (`/assets/*-readiness.png`) | none found | none found |
| Bluetail | https://bluetail.aero/ | https://bluetail.aero/owner-operator | not captured | not captured |
| TBX / LogIQ | https://www.airworthy.com/ | https://www.airworthy.com/log-iq | not captured | not captured |
| Crewchief GA | https://crewchiefsystems.com/ | https://crewchiefsystems.com/digital-products/for-pilots | https://apps.apple.com/us/app/id1470882836 | https://play.google.com/store/apps/details?id=com.crewchief.crewchiefMobile |
| PlaneLogiX | https://planelogix.com/ | https://www.aircraftspruce.com/catalog/stpages/planelogix.php | none found | none found |
| Savvy Aviation | https://www.savvyaviation.com/ | https://www.savvyaviation.com/savvybasics/ | n/a | n/a |
| FlightGuard | (store listing only) | App Store listing | https://apps.apple.com/us/app/flightguard/id6736479190 | not found |
| FlightBoss | https://flightboss.com/ | App Store listing | https://apps.apple.com/us/app/flightboss/id1556221444 | linked from site (not captured) |
| aeroLogbook | (store listing only) | App Store listing | https://apps.apple.com/us/app/aerologbook/id1304166683 | none (Apple only) |
| AV1ATE Tracker | (store listing only) | App Store listing | https://apps.apple.com/us/app/id6757898818 | none |
| LogVault (dev) | https://logvault-dev.pages.dev/ | same | none | none |
| JSSI AviatorMX | https://jetsupport.com/traxxall/aviatormx/ | same | — | — |
| Veryon Tracking | https://veryon.com/solutions/business-and-general-aviation/maintenance-tracking | same | — | — |
| Quantum MX | https://www.quantum-mx.com/ | same (Gallery) | — | — |
| ForeFlight | https://foreflight.com/ | https://foreflight.com/products/logbook/ | https://apps.apple.com/us/app/id333252638 | none (Apple only) [K] |
| Garmin Pilot | https://www.garmin.com/en-US/aviation/aircraft-flight-logs/ | App Store listing | https://apps.apple.com/us/app/id340917615 | exists; URL not verified |
| LogTen | https://logten.com/ | https://logten.com/ | https://apps.apple.com/us/app/id837274884 | none (Apple only) [K] |
| MyFlightbook | https://myflightbook.com/logbook/ | https://myflightbook.com/logbook/mvc/pub/FeatureChart | https://apps.apple.com/us/app/id349983064 | exists; URL not verified |
| Flighty | https://flighty.com/ | https://flighty.com/ ; https://developer.apple.com/news/?id=970ncww4 | https://apps.apple.com/us/app/id1358823008 | not verified |

Third-party sources used: Piper Flyer article on BetterPlane
(https://www.piperflyer.com/new-app-digitizes-handwritten-aircraft-logbooks-and-tracks-maintenance/),
iPad Pilot News on Coflyt (https://ipadpilotnews.com/?p=18149), Aviation Consumer intro
(https://www.aviationconsumer.com/aircraftreviews/virtual-mx-records-more-than-logging/),
Capterra / GetApp listings for Veryon and Quantum MX, a design teardown of Flighty
(https://blakecrosley.com/guides/design/flighty), and each product's store reviews.
