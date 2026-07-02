# Aircraft Logbook Digitization & Maintenance Tracker - Product Plan

## Design principle (state this in the app itself)

This tool is an index and decision-support layer, not the legal record. The
physical logbooks remain the system of record per 14 CFR 91.417. The app
never claims to be a substitute for official maintenance records or an
airworthiness determination. Say this in the ToS and on the aircraft
dashboard. It limits liability and keeps the scope honest.

## Core entities

- **User** - auth identity, can own or co-own multiple aircraft, can be
  granted read/contribute access to an aircraft they don't own (A&P/IA,
  partner, prospective buyer during prebuy).
- **Aircraft** - tail number, make/model, serial number, engine serial(s),
  prop serial(s), enrollment date, hobbs/tach at enrollment.
- **Logbook** - one of {airframe, engine, prop}, belongs to an aircraft (or
  a specific engine/prop for multi-engine aircraft).
- **Page/Image** - raw upload, linked to a logbook, stores original image,
  OCR text, extraction confidence, review status (unreviewed / confirmed /
  disputed).
- **LogEntry** - the structured record extracted from a page: date,
  hobbs/tach, description, work performed, parts installed/removed,
  signature name, mechanic cert number, linked page/image, linked AD/SB
  references, confidence score.
- **AD (Airworthiness Directive)** - master reference (AD number, applicable
  model/component, recurring or one-time, compliance interval in hours or
  calendar months) plus a per-aircraft compliance record (method used, date
  or hours complied, next due).
- **SB (Service Bulletin)** - optional, same shape as AD but non-mandatory.
- **W&B record** - empty weight, arm, moment, useful load, revision date,
  linked to the equipment change (if any) that triggered it.
- **MaintenanceItem** - recurring items: annual (91.409), 100-hour if
  applicable, oil change interval, transponder/altimeter/pitot-static check
  (91.411/91.413, 24 calendar months), ELT battery (91.207), VOR check if
  IFR, life-limited parts, plus informational items like engine TBO and prop
  overhaul (not regulatory for Part 91 - flag these as advisory, not
  mandatory, so the UI doesn't conflate them with legal requirements).

## Feature set, phased

**Phase 1 - capture and read**
- Account creation, aircraft enrollment (single-tenant to start, see
  Architecture below for the data model that makes this extend cleanly).
- Mobile capture app (see below) for guided page photography.
- Upload flow with batch support, ordered by logbook type and page sequence.
- OCR + extraction pipeline (see below).
- Logbook viewer: original image and extracted fields side by side, with
  inline correction. This is the feature that makes the OCR usable, because
  handwriting extraction will not be reliable enough to trust unreviewed.
- Full-text and structured search across all three logbooks.

**Phase 2 - track compliance**
- AD linkage: match log entries to AD numbers, track compliance status per
  aircraft, flag recurring ADs approaching their next due hours/date.
- Standard maintenance forecasting: annual due date, transponder/pitot-static
  24-month cycle, ELT battery, oil change interval based on hours since last
  entry.
- Dashboard: "next due" list sorted by urgency (overdue, due soon, upcoming).

**Phase 3 - W&B and ownership**
- W&B revision history, flagged against equipment-change entries that lack a
  corresponding W&B update.
- Multi-owner support (partnerships, clubs) with per-user permissions.
- Export: PDF bundle (for insurance, prebuy, sale), CSV/API access.

**Phase 4 - notifications and community**
- Email/push reminders for upcoming items.
- Shared AD reference database (community-maintained, not per-user private
  data) so users benefit from each other's AD research without exposing
  aircraft-specific records.
- Possibly: anonymized benchmarking (e.g., typical annual cost for type).

## Mobile capture app

Worth building, because extraction quality is bounded by capture quality far
more than by model choice. A generic camera roll photo (skewed, glare,
partial page, inconsistent resolution) degrades both classic OCR and
vision-LLM extraction. A guided capture flow fixes this at the source
instead of compensating for it downstream.

Capture app should do, at minimum:
- Live edge/corner detection of the page, auto-crop to the page boundary.
- Perspective correction (deskew) before upload.
- Blur and glare detection, reject the shot and reprompt before it ever
  reaches the OCR pipeline - this is the cheapest place to catch a bad image,
  before you've spent an API call on it.
- Minimum resolution enforcement.
- Metadata capture at time of shot: which aircraft, which logbook (airframe/
  engine/prop), sequential page order within a capture session - this
  removes a whole class of manual sorting later.
- Batch capture mode for digitizing a full logbook in one sitting.
- Offline queue with background sync, since hangars have poor signal.

Build choice: a **PWA using the device camera with client-side edge
detection** (e.g., a JS library like jscanify or OpenCV.js) gets you 90% of
the value with none of the app-store friction - no $99/year Apple developer
account, no review cycle, no separate iOS/Android codebases, and it fits a
solo open-source project much better than a native app. A native app
(React Native/Flutter) is a reasonable Phase 2+ upgrade if the project gets
contributors and the PWA camera API proves limiting, but it's not the right
place to spend effort first.

## OCR and extraction - hybrid pipeline

Two-stage approach, matching the type of content on each page:

1. **Classic OCR (Tesseract or PaddleOCR) for printed/typed text** - typed
   entries, inspection stickers, printed AD/SB reference numbers, tabular
   headers. Fast, free, self-hostable, no per-page API cost.
2. **Vision-LLM for handwritten entries** - fed the cropped page image plus
   a fixed JSON extraction schema (date, hobbs/tach, description, AD/SB
   refs, parts, signature name, mechanic cert number), returning a
   confidence score per field.
3. **Routing logic**: a lightweight classifier (or simply: try OCR first,
   check output confidence/character-recognition rate, fall through to
   vision-LLM if it's low, or if a per-page flag from the capture app marks
   it handwritten) decides which pipeline a given page or field goes
   through. Mixed pages (typed header, handwritten notes) get both, merged
   by field.
4. **Validation gate**: any field below a confidence threshold is never
   auto-accepted. The review UI shows the source image crop next to the
   field and prompts the user to confirm or correct it. Fields the system
   can't extract at all (illegible, ambiguous) get an explicit "needs your
   input" prompt rather than being silently left blank - blank fields are
   easy to miss, prompted fields aren't.

This keeps the per-page cost low (most printed content costs nothing to
process) while reserving the paid vision-LLM calls for the pages that
actually need them.

## AD tracking: FAA source + community enrichment

- **Primary source**: FAA's AD data (regulatory.faa.gov / the FAA's AD
  distribution files) as the authoritative baseline for AD number,
  applicability, and compliance requirements. This needs a scraper/parser
  since there's no clean structured API, and it needs to be kept in sync as
  FAA publishes updates.
- **Community enrichment layer**: a separate, moderated table where users
  can add practical detail the FAA data doesn't carry well - common
  compliance methods owners actually use, typical costs, links to STC'd
  alternatives that satisfy an AD, gotchas specific to a model/serial range.
  Keep this layer clearly distinguished from the FAA baseline in the UI, so
  a user always knows which fields are regulatory fact versus crowd-sourced
  context. Moderation queue for changes to prevent bad edits from
  propagating into someone else's compliance tracking.
- Per-aircraft compliance status (method used, date/hours complied, next due)
  stays private data tied to that aircraft, not part of the shared/community
  layer.

## Competitive landscape

**PlaneLogix** - service-heavy, not self-serve. Human staff hand-transcribe
logbooks (word-for-word), $6.95-$60+/month scaling with how much they do for
you. Notable features: stores 337s/8130s/STCs as first-class documents
alongside logbook entries, not just log entries; optional physical binder
that's kept in sync and shipped to you; CW/PCW/DNA status marking for AD/SB
compliance (Complied With / Previously Complied With / Does Not Apply);
public record generation (shareable read-only link, distinct from full
account access); read-only vs read/write invite permissions for mechanics,
partners, buyers; FBO integration so a shop can pull your history instantly
during an AOG; per-model maintenance tracking templates; API access.

**Bluetail** - AI-powered, aimed at Part 91/135 business aviation, not
budget GA. Closest to our OCR/vision-LLM approach conceptually (Feb 2026
launch of AI logbook auto-organization from handwritten or typed uploads).
Notable features: unified airframe+engine timeline in one view; upload in
any order, auto-sorted chronologically; "conformity report" upload that
auto-flags missing data, incorrect entries, and gaps against expected
records; click any compliance item to jump straight to its source document;
back-to-birth record reconstruction for prebuy/sale.

**Veryon Tracking** (formerly Flightdocs) - enterprise fleet/MRO platform,
wrong tier for a solo GA owner (work orders, parts procurement, flight
scheduling, 24/7 analyst team, and an in-app eSignature workflow we're
deliberately not adopting - see non-goals below). One idea worth borrowing
anyway: utilization-based forecasting, projecting next-due dates from actual
flying pace rather than calendar assumptions, plus a "Due List" with
color-coded urgency.

**Positioning gap this plan can fill**: all three are subscription services
where a human (PlaneLogix) or an enterprise-tier product (Bluetail, Veryon)
does the work for you, priced for either casual annual fees or fleet
budgets. None offer a free, self-hosted, owner-run tool with automated
vision-LLM extraction sized for a single piston GA owner. That gap is the
plan's reason to exist - don't let scope creep pull it toward Veryon's
enterprise feature set.

## Refinements from competitive review

**Add to Core entities:**
- **Document** - a first-class record type separate from LogEntry, covering
  FAA Form 337 (major repair/alteration), 8130-3 (conformity/airworthiness
  tags), STCs, and ICAs. These get referenced by AD compliance and W&B
  records but aren't themselves logbook page entries - every competitor
  treats these as distinct from log entries, and conflating them into
  LogEntry would make search and AD-linkage messier than it needs to be.
- **Component** - individual part/component lifecycle (part number, serial
  number, install date/entry, removal date/entry, life limit if any),
  distinct from the free-text parts field on LogEntry. This is what makes
  "what's currently installed and what's its remaining service life"
  queryable instead of buried in narrative text - PlaneLogix calls this out
  as a separate feature for exactly that reason.

**Add to Phase 1:**
- Unified cross-logbook timeline view (airframe + engine + prop merged by
  date), not just three separate per-logbook views. A single annual visit
  usually touches all three logbooks on the same date, and every competitor
  treats the merged view as core, not an add-on.

**Add to Phase 2:**
- Completeness/gap audit: compare what's present against the FAA minimum
  retention baseline (91.417(b)) and flag suspected gaps (missing annual for
  a given year, an AD marked recurring with no compliance record since its
  last interval). This is Bluetail's "conformity" feature and it's high
  value for exactly the 50-year-old-logbook problem you started with.
- CW/PCW/DNA status vocabulary for AD/SB tracking instead of a binary
  complied/not-complied flag - PlaneLogix's convention, and it's the right
  level of granularity (an AD can be superseded, not applicable to a
  specific serial range, or complied with via an earlier unrelated
  modification).
- Aircraft type templates: crowd-sourced default AD/SB/maintenance-item
  profile by make/model/serial range, applied at enrollment so a new user
  isn't starting from zero. Ties directly into the community AD-enrichment
  layer already planned.

**Add to Phase 3:**
- Utilization-based forecasting: let due-date projections use actual hours
  flown (from hobbs/tach entries over time) rather than a static estimate,
  so "next annual" or "next 100-hour" reflects how much the aircraft is
  actually flying.

**Add to Phase 4:**
- Public read-only shareable link, separate from the AircraftShare invite
  model - useful for a sale listing without granting an account.
- Printable PDF binder export (a self-serve equivalent to PlaneLogix's
  physical binder, without the fulfillment/shipping logistics a solo
  project shouldn't take on).

**Explicitly out of scope: eSignatures.** New entries stay on paper, signed
by the mechanic as usual, then scanned like everything else. This keeps the
app permanently in "index of the physical record" territory instead of
becoming a party to the record itself, which avoids AC 120-78A signature
requirements entirely. It's also just simpler: a re-scan after every annual
or AD compliance event is a five-minute phone-camera task, not a workflow
change for a mechanic who may not want to sign into a stranger's app.

**Explicit non-goals** (keep out of scope; Veryon's territory, not this
project's): parts procurement/inventory management, work order management,
flight scheduling/dispatch, MRO shop multi-fleet management. Adding these
would turn a solo open-source GA tool into a worse clone of an enterprise
product neither of us wants to maintain.



**Data isolation model**: not full multi-tenant with orgs/teams. Simpler:
every record (aircraft, logbook, entry) belongs to exactly one owning user
by default and is invisible to everyone else. A separate `AircraftShare`
(or similar) table grants explicit read or contribute access to another
user for a specific aircraft - this covers A&P/IA collaborators, co-owners,
and prebuy access without building a full permissions system. Ownership
transfer (selling the aircraft) is then just re-pointing the aircraft's
owning-user field, with the option to leave the seller with a permanent
read-only historical copy if they want one - useful, since owners often
want to keep their own flying/maintenance history even after selling.

**Stack aimed at zero marginal cost for a solo/patient-zero deployment:**
- **Auth + Postgres + object storage**: Supabase free tier bundles all
  three (500MB DB, 1GB storage, auth included) and is itself open source,
  so the same architecture can later be self-hosted if the project outgrows
  the free tier - avoids a rewrite later.
- **Backend/app hosting**: something with a real free tier and no
  cold-start pain for a low-traffic solo project - Fly.io or Render free
  tier, or Vercel if the frontend framework fits it.
- **Classic OCR**: self-hosted (Tesseract/PaddleOCR), zero marginal cost,
  runs in the same free compute tier.
- **Vision-LLM calls**: the one piece that isn't free. For a personal
  backlog of a few hundred to a few thousand pages, this is a small bounded
  one-time cost (cents per page), then a trickle for new entries going
  forward. Worth stating plainly in the README so contributors and users
  running their own instance know this is the one line item they'll pay
  for, and can bring their own API key.

**GitHub, solo build, open for contribution:**
- Public repo from the start, README stating current phase and scope
  honestly (avoids the common open-source trap of overpromising).
- CONTRIBUTING.md and issue templates once Phase 1 is stable enough that
  outside contributions are more helpful than disruptive - premature
  contributor infrastructure on a pre-alpha solo project usually just adds
  overhead.
- Schema and extraction-prompt versioning from day one, since both will
  change as patient-zero data reveals what the format actually needs -
  matters more here than in a typical CRUD app, because bad schema
  decisions are expensive to migrate once real logbook data is in it.

## Risks and open issues

- **False confidence in extracted data.** An owner or A&P glancing at a
  wrong AD-due date because OCR misread "1200 hrs" as "7200 hrs" is a real
  failure mode with safety consequences. Every AD/maintenance due-date
  derived from extraction needs to show its source image and confidence,
  and probably a "confirmed by owner" flag before it drives a reminder.
- **Multi-owner data sensitivity.** Aircraft records include serial numbers,
  tail numbers, owner names, and home base - enough to be useful for theft
  or targeting. Treat this as sensitive personal data even though it's not
  regulated like health data.
- **Liability framing.** Since this could influence real airworthiness
  decisions, the disclaimer (tool is not the record of record, does not
  replace 91.417 records, does not constitute a maintenance sign-off) needs
  to be prominent, not buried in ToS.
- **Scope creep vs MVP.** AD tracking, W&B, multi-owner, and notifications
  are each substantial. Recommend shipping Phase 1 (capture, extract,
  review, search) as a usable standalone tool before committing to the AD
  data-source decision, since that decision shapes a lot of downstream
  architecture.

## Build order for Claude Code

Ship in this sequence. Each step should be usable on its own before moving
to the next - don't build the whole schema up front.

1. **Repo scaffold**: public GitHub repo, README stating current phase and
   scope honestly, license (pick a permissive one - MIT or Apache 2.0),
   Supabase project (Postgres + auth + storage) wired up, basic deploy to
   Fly.io/Render/Vercel free tier.
2. **Schema v1**: User, Aircraft, Logbook, Page/Image, LogEntry, Document,
   Component. Single-owner data isolation from the start (every row scoped
   to owning user), even though only one user exists right now - this is
   the cheapest point to get it right.
3. **Capture PWA**: camera access, edge detection/auto-crop, deskew, blur/
   glare rejection, metadata tagging (aircraft/logbook/sequence) at capture
   time, offline queue.
4. **Upload + OCR/extraction pipeline**: classic OCR for printed text,
   vision-LLM for handwritten, routing logic, confidence scoring, fields
   below threshold routed to review instead of auto-accepted.
5. **Review UI**: image and extracted fields side by side, inline
   correction, explicit "needs your input" prompts for low-confidence or
   unextractable fields.
6. **Search + unified timeline**: full-text and structured search, plus the
   merged cross-logbook (airframe/engine/prop) timeline view.
7. **AD/SB tracking**: FAA AD data ingestion, CW/PCW/DNA status per
   aircraft, next-due flagging for recurring items.
8. **Maintenance forecasting dashboard**: standard Part 91 recurring items
   (annual, transponder/pitot-static, ELT battery) plus advisory items
   (TBO, overhaul), due list sorted by urgency.
9. **Gap/completeness audit**: flag suspected missing years or missing AD
   compliance records against the 91.417(b) retention baseline.
10. **W&B tracking, community AD layer, aircraft type templates, exports**:
    once the core loop (capture -> extract -> review -> search -> forecast)
    is solid on your own logbooks.

Explicitly deferred/non-goals for this build: eSignatures, parts
procurement/inventory, work order management, flight scheduling/dispatch,
public shareable links and multi-owner sharing (design the schema so these
extend cleanly later, per the AircraftShare model already in this plan, but
don't build the UI for them yet).

Feed Claude Code this document plus the design principle, entity list, and
OCR/AD sections above as the spec for step 1-2 - the rest of the plan can
follow once that foundation is running against your own three logbooks.

## Findings from patient-zero testing

Notes captured as steps 3-8 are built against a real set of logbooks.

**Steps 3-4 (capture/upload + extraction) - validated on real pages:**
- Cover pages and aircraft/engine/prop general-information pages correctly
  produce no maintenance entries (empty entries array), while still capturing
  their printed text. The extractor must not hallucinate entries from
  non-entry pages.
- A single scanned image is frequently a **two-page spread** (two facing
  logbook pages). Detection works (`page.detected_page_count`); the entries
  from both halves come back correctly. Physically splitting one spread image
  into two `page` rows is deferred - entries are already separated logically,
  and the review UI flags the spread. Revisit if the merged-image page record
  proves limiting.
- Pages **mix printed and handwritten content within the same entry** - typed
  work descriptions, printed inspection/337/8130 stickers, and pre-printed
  AD/SB numbers alongside handwritten dates, hobbs/tach, and signatures. This
  is not the clean "printed page vs handwritten page" split the OCR-routing
  section assumed. Implication for the deferred classic-OCR routing: routing
  should be per-field/per-region, not per-page, or simply keep vision as the
  primary extractor (its transcription already covers both). Extraction prompt
  updated (schema v1) to extract both kinds and merge them into the right
  fields.

**Change to Phase 1 / step 5 (Review UI):** the review screen must show the
**page image alongside the extracted raw text**, not just the parsed fields.
Because entries combine printed and handwritten content and confidence varies
per field, the owner needs to see the source image and the model's full
transcription together to confirm, correct, or add data accurately. Low-
confidence and unextractable fields get explicit "needs your input" prompts.
