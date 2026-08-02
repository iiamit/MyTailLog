# Competitive analysis — SquawkFree

Full-site review of **squawkfree.com**, captured **2026-08-01**. Every public
page was read (`/`, `/myfbo`, `/logbook-digitization`, `/faq`, `/whats-new`,
`/about`, `/blog` + 15 posts, `/terms`, `/privacy`), plus their CSS tokens and
rendered layout.

The primary deliverable is the [**backlog**](#the-backlog) at the end. Everything
before it is the evidence.

---

## 1. Snapshot

| | |
| --- | --- |
| **Positioning** | "A digital backup and tracking companion for your aircraft logbooks… **alongside your paper logbooks, not instead of them**" |
| **Launched** | **July 5, 2026** — public launch. Their `/whats-new` has exactly two entries. |
| **Based** | Ohio. "We're pilots and aircraft owners." No company name, no team page. |
| **Stack** | Next.js (Turbopack) on Google Frontend → Firebase; Firebase Auth; Google Cloud Storage with signed time-limited URLs; Mapbox; Flightradar24 data feed; FAA DRS |
| **Audience** | Two: solo/co-owners **and** flight schools / clubs / FBOs |
| **Pricing** | Premium **$4.99/mo** ($54.89/yr) · Flight School **$55/mo** ($605/yr) · Flight Intelligence add-on **$3/aircraft/mo** · Logbook Digitization **$299/aircraft** one-time + optional **$5.99/mo** |
| **Trial** | 60 days, no credit card → then **read-only, not locked out**. Data kept ≥2 years after cancellation. |
| **Storage** | 5 GB (Premium) / 25 GB (Flight School) — storage is the plan lever |

### The strategic read

**Their positioning statement is nearly word-for-word ours.** "Alongside your
paper logbooks, not instead of them" is the same disclaimer discipline as our
"index and decision-support layer, not the legal record." We are aimed at the
same owner with the same honesty about what the software is.

Where we diverge is the axis of investment:

- **They went ops-broad.** Scheduling, dispatch, invoicing, membership dues,
  weather briefings, five-role RBAC, currency tracking. The flight-school plan is
  11× the owner plan — that's where the revenue thesis lives.
- **We went records-deep.** AI extraction with per-field confidence, review UI,
  duplicate detection, equipment reconstruction from the logs, W&B revisions, oil
  wear-metal trending, records-gap audit, Ask-your-logbook, an OAuth 2.1 provider.

**The single most important asymmetry:** *SquawkFree has no automated extraction.*
Their digitization is a **manual human service** — $299/aircraft, up to 300 pages,
**1–2 week turnaround**, "a human reviews every single entry." That is our entire
core product, automated, self-serve, and free at the point of use.

That cuts both ways and it's worth being clear-eyed:

- **In our favour:** their unit economics on digitization are labour. Ours are a
  vision-model call. They cannot drop that price; we can. Minutes vs. 1–2 weeks.
- **In theirs:** "a human checked every entry" is an easier promise to sell to a
  nervous owner than "a model read it and flagged what it wasn't sure about." They
  are selling *certainty*; we are selling *speed and volume*. Our review UI with
  per-field confidence is the answer, and we under-sell it.

They are ~4 weeks old and moving fast. Treat this as a live, well-executed
competitor, not a curiosity.

---

## 2. Their feature inventory

### Included on every paid plan

| Feature | Detail |
| --- | --- |
| **Maintenance records** | Any type — annuals, 100-hr, oil changes, overhauls, repairs. Each record supports **parts tracking, mechanic info, and document attachments**. |
| **FAA AD search & compliance** | Direct **FAA DRS** integration. Search by **make / model / keyword** from the aircraft's AD tab. One-click import. Mark one-time or recurring, set interval, log compliance date + method. Results show model applicability lists ("Models: 150A, 150B… +214 more"). |
| **Hours-based due projection** | Reads current tach from the latest flight-log entry; for a recurring AD at, say, 500 h, shows hours remaining **and a projected calendar date** from recent utilization + upcoming bookings, with a **confidence indicator**. |
| **Pre-flight checklists** | Customizable, or start from a built-in template (C172S, 50+ items by section). Step through pass/fail with notes → saved to a **permanent inspection history**. |
| **Squawk tracking** | Log a discrepancy, assign **severity**, track discovery → resolution with full history. |
| **Manual flight logging** | Unlimited on every plan. |
| **Scheduling** | Visual calendar, 15-minute slots, day/week views, conflict detection, owner master schedule across all aircraft. |
| **Document storage** | Logbook pages, STCs, 8710s, invoices, inspection reports — GCS, signed URLs, linked to aircraft or maintenance records. |
| **Shared access** | Invite co-owners / instructors / renters by email with **per-tab granular permissions** (flights, maintenance, scheduling, documents…). |
| **Analytics** | Flight hours, fuel-burn trends, maintenance costs. |
| **Data export** | ZIP per-aircraft / per-account / per-org. Always JSON + CSV; optionally **ForeFlight Logbook CSV, MyFlightbook CSV, printable PDF maintenance summary**, and original document files. **Async job, link emailed + shown in-app.** Exportable even while read-only. |

### Flight School plan only

Organization dashboard (fleet status, tach hours, flight counts, member currency
+ medical); **weather briefing** (METAR/TAF/PIREP/SIGMET/AIRMET/winds aloft,
configurable airports and PIREP radius); **dispatch → invoice** (tach/hobbs +
rental and instruction rates → itemized invoice → card payment); **monthly
membership dues with auto-charge, retries, exemptions**; **CFI availability
scheduling with dual conflict detection** (aircraft *and* instructor); **five
roles** (Owner / Admin / Dispatcher / CFI / Member); **pilot certificate, medical
class + expiry, flight review, IPC currency** tracking.

### Flight Intelligence add-on ($3/aircraft/mo)

ADS-B-derived automatic flight import — daily sync creates **pending** entries
pre-filled with departure, destination, route, duration; user adds tach/hobbs and
accepts. Enrichment: **touch-and-go counts** (four T&Gs = one flight with four
landings, not four entries), taxi-out / airborne / taxi-in splits, runway usage,
pattern-work detection, event timeline, **3D track replay**. Opt-in per aircraft.

They disclose *why* it costs extra: **"relies on a paid Flightradar24 data feed."**
And the limitation: raw GPS tracks retained **30 days** per the provider's terms;
derived data is permanent.

---

## 3. Feature comparison

Legend: ✅ have · 🟡 partial · ❌ don't have · ⛔ deliberate non-goal

| Capability | SquawkFree | MyTailLog |
| --- | --- | --- |
| **Automated AI extraction from scans** | ❌ (manual service, $299, 1–2 wk) | ✅ vision-LLM, per-field confidence, minutes |
| Review UI (page image beside editable entries) | ❌ (their humans do it) | ✅ |
| Duplicate detection | ❌ | ✅ |
| Camera capture w/ edge-detect + deskew, offline queue | 🟡 photo upload + capture guide | ✅ |
| Five logbook types incl. "Other" | 🟡 airframe + engine | ✅ airframe/engine/prop/avionics/other |
| **Ask your logbook (NL Q&A w/ citations)** | ❌ | ✅ |
| Equipment reconstructed from the logs | ❌ (manual) | ✅ |
| W&B revision history + stale flag | 🟡 stored as a document | ✅ auto-applied from a scanned sheet |
| Oil analysis — lab report → wear-metal trending | ❌ | ✅ |
| Oil consumption / burn-rate | ❌ | ✅ |
| Records-gap audit | ❌ | ✅ |
| AD compliance tracking | ✅ DRS, make/model/keyword search | ✅ Federal Register + DRS fallback |
| AD discovery by **model** + applicability list | ✅ | 🟡 by manufacturer only |
| A&P AD-report scan as ground truth | ❌ | ✅ |
| **Hours-based due → projected calendar date + confidence** | ✅ | ❌ |
| Maintenance forecast (Part 91 recurring) | ✅ | ✅ |
| Squawks (severity, open→resolved) | ✅ | ✅ |
| **Pre-flight checklists + inspection history** | ✅ | ❌ |
| **ADS-B automatic flight import** | ✅ (paid add-on) | ❌ |
| Flight logging | ✅ manual, unlimited | ⛔ (we track *hours*, not flights) |
| Hobbs ↔ tach reconciliation | 🟡 both captured | ✅ dedicated engine |
| MyFlightBook integration | 🟡 export CSV only | ✅ **bidirectional OAuth** |
| **OAuth 2.1 provider + developer portal + public API** | ❌ | ✅ |
| Records Vault (certs, registration, POH, STCs, 337s) | 🟡 generic doc storage | ✅ typed |
| Entry ↔ document attachment | ✅ | 🟡 schema exists, editor UI deferred |
| Export: JSON / CSV / ZIP / print | ✅ | ✅ |
| Export: **ForeFlight CSV / MyFlightbook CSV / PDF summary** | ✅ | ❌ |
| ZIP re-import round trip | ❓ not stated | ✅ |
| Sharing | ✅ per-tab granular | 🟡 viewer / contributor |
| Ownership transfer | ❓ | ✅ |
| **BYO AI key + usage/cost visibility** | n/a | ✅ |
| Reminder emails w/ configurable lead time | 🟡 alerts on dashboard | ✅ |
| Native offline mobile app | ❌ (responsive web) | 🟡 planned (Capacitor + sync engine shipped) |
| **Self-hostable / open source** | ❌ | ✅ MIT |
| Scheduling / dispatch / invoicing / dues | ✅ | ⛔ |
| Weather briefing | ✅ | ⛔ |
| Org RBAC (5 roles) | ✅ | ⛔ |
| Pilot currency + medical tracking | ✅ | ❌ |
| **Public pricing / billing** | ✅ | ❌ (no billing at all) |
| Public changelog page | ✅ | 🟡 `CHANGELOG.md` only |
| SEO content engine | ✅ 15 posts in 15 days | ❌ |

**Net:** we are decisively ahead on *what happens to a record after it's captured*
and on *openness*. They are ahead on *what happens around the aircraft* — ops,
scheduling, money — and on **three genuinely on-thesis things we're missing:
calendar-date projection, checklists-as-records, and passive hours capture.**

---

## 4. Design commentary

### Worth stealing

**Monospace for data, inline, inside running prose.** Their type system is
Barlow Condensed (display) + Inter (body) + **JetBrains Mono (data)**, and the
mono face is used *inside sentences*: "…separated your touch-and-goes at `KDLZ`,
and flagged `AD 2024-01-09` as due in `38.4 hours`." Tail numbers, AD numbers,
tach readings, airport identifiers all render in mono. It is the single best
detail on the site — it makes the copy read like an instrument, and it silently
signals "this product knows what these strings are." Their CSS also carries
`tabular-nums`. **This belongs in our glass-cockpit token set.**

**The hero is a scenario, not a slogan.** "*Your annual is next month.*" Second
person, present tense, and then four *specific* facts — a real airport, a real AD
number, a real hours figure. No "streamline your maintenance workflow." It sells
the moment of relief rather than the feature list. This is the strongest
copywriting on the site and it's a template we should lift directly.

**Real product screenshots, alternating left/right.** Dark-UI captures
(`ad-compliance.png`, `ad-search.png`, `flight-intelligence.png`) against a light
page — high contrast, unmistakably "real software," no illustrated abstractions.

**Palette and restraint.** Slate `#212E39` header, sky `#2C97DE` accent, cool
near-white `#F1F5F8` ground, `#D5DCE2` hairlines. **Hard square corners
throughout** — no `rounded-lg` anywhere — plus generous `py-24`/`py-32` vertical
rhythm and wide uppercase eyebrow labels (`tracking-[0.08em]`–`[0.14em]`). Sober,
panel-like, and it stays out of the way of the screenshots.

**Small delights, not motion soup.** Two custom keyframes total: `logo-fly-in`
and `wind-vrb-sway` (the wind sock on their runway diagram). Restraint.

### Weak points

- **The mascot fights the aesthetic.** A cartoon parrot in aviator shades sits
  above an otherwise sober instrument-panel design. It reads as two different
  products.
- **Light-mode only.** The CSS ships a `.dark` variant that the marketing site
  never applies; `theme-color` is hard-coded `#ffffff`. A hangar-and-cockpit
  audience is exactly the audience that wants dark.
- **Crowded nav** — 7 links + 2 CTAs. "FLIGHT SCHOOLS" and "WHAT'S NEW" wrap to
  two lines at desktop width.
- **`/pricing` is a footgun.** The nav "Pricing" link points at `/#pricing`, but
  `/pricing` is a real authenticated app route — anyone typing or sharing it gets
  a sign-in form instead of prices. (Not in the sitemap, so no SEO damage.)
- **`og:image` is generic stock** (`above_clouds.jpg`) rather than a product shot,
  wasting every social share.

---

## 5. Content commentary

**The FAQ is their best asset and it is doing the work of a product page.** ~16k
characters, organized by section, and it answers the uncomfortable questions
plainly: what happens when the trial ends, what happens if I cancel, do members
need their own subscription, does this replace paper logbooks (*"No"*). It is
simultaneously their highest-value SEO surface and their sales page. **We have
`/help` but nothing that answers the *commercial and trust* questions.**

**Their honesty is a deliberate tactic and it works.** Three examples worth
copying as a pattern:

1. *Why an add-on costs extra:* "Flight Intelligence relies on a paid
   Flightradar24 data feed, and credit usage scales with the number of tracked
   aircraft. Charging per enabled aircraft lets us recover that cost honestly."
2. *A limitation stated before you hit it:* raw GPS tracks are retained 30 days
   per the provider's terms; derived data is permanent.
3. *What projections are and aren't:* "estimates to help you plan, not a
   substitute for your own recordkeeping."

We already do this in `/help` and in the README's "explicitly out of scope." We
should do it in **marketing** copy too — it's disarming, and it's cheap for us
because the constraints are already documented.

**`/about` is four sentences and does more trust-work than most landing pages:**
where they're based, that they're owners, *why* the price is what it is ("paper
logbooks cost almost nothing to maintain, and a digital one shouldn't cost much
more"), the export promise, and the hosting facts. No team photos, no mission
statement.

**`/myfbo` is a textbook competitor-displacement page.** MyFBO is shutting down;
they built a dedicated landing page offering **free white-glove migration in any
format — "CSV exports, spreadsheets, PDFs, screenshots, even paper records"** —
with a 3-step process, a list of exactly what moves over, and urgency framed
around the incumbent's data becoming unreachable. This is the highest-leverage
page on their site and it cost them a few hours.

**The blog is a keyword farm, and it's aimed at us.** Fifteen posts published one
per day from July 18 to Aug 1, all on commercial-intent terms — "best aircraft
maintenance software," "best FAA audit software," "aircraft maintenance
tracking," "faa ad search," "hobbs vs tach time." The meta descriptions are
formulaic to the point of self-parody ("Discover the best X… Try it free!") and
the posts list competitors by name. It's obviously machine-produced at volume, and
it is nonetheless occupying the exact search terms an owner uses when they go
looking for what we built. One post ("Aircraft Insurance in Georgia") reads
hand-written and is markedly better than the rest.

**`/whats-new` is thin but structurally right** — dated entries tagged
New / Improved / Fixed. Two entries so far.

---

## The backlog

Ordered by (value to an owner) ÷ (effort), filtered by fit with our thesis.
Effort: **XS** <½ day · **S** ~1 day · **M** a few days · **L** a week+.

### Tier 1 — do now

---

#### T1-1 · Project hours-based due items to a calendar date, with confidence
**Effort: S–M** · *Their best idea, and we have better input data than they do.*

Turn "due in 38.4 hours" into "due around **March 14**, ± based on how much
history we have." Compute a utilization rate (hours/day) from the trailing
`hours_reading` series, project every hours-based item (100-hr, hour-interval
ADs, oil, component TBO) onto the calendar, and render a confidence indicator
derived from sample count, time span, and variance.

- **Why us:** they estimate from ADS-B airborne time and bookings. We have
  *actual logged tach/hobbs readings* plus the `meter_reset` and hobbs↔tach
  reconciliation work already shipped (0036, 0046). Our rate is the real one.
- **Why it matters:** an owner plans in dates, not hours. This is the number that
  turns the forecast from a report into a decision.
- **Where:** `lib/maintenance.ts` (`effectiveNextDue`), surfaced on `/status`,
  `/maintenance`, and in the reminder emails (`lib/reminders.ts`).
- **Guardrail:** label it an estimate, show the input window, and never let it
  override a date-based limit. One unit test on the rate math and the
  low-sample-count path.

---

#### T1-2 · Export to ForeFlight Logbook CSV, MyFlightbook CSV, and a PDF maintenance summary
**Effort: S** · *Neutralizes their loudest trust claim with a stronger version.*

They lead with "your records are never locked in." We are MIT-licensed and
self-hostable — a categorically stronger promise — and we currently offer fewer
export *formats* than they do. Add the two industry CSVs and a printable PDF
maintenance summary to `/aircraft/[id]/export`, and say the portability thing
loudly on the landing page and in `/help`.

- **Where:** `api/aircraft/[id]/export/route.ts`, `lib/backup/`.
- **Note:** we already have the ZIP round-trip *and re-import*, which they don't
  advertise. That's the better story — tell it.

---

#### T1-3 · Ship the entry ↔ document attachment editor UI
**Effort: S–M** · *Already deferred once; now two competitors ship it.*

Schema landed in 0041 (Records Vault + attachments). SquawkFree advertises
"each record supports document attachments," and AirLogbooks does too. This is
the last mile on a feature we already paid for.

- **Where:** review/timeline entry editor + `/documents`.
- Needs the browser verification pass that got it deferred.

---

#### T1-4 · Public `/whats-new` changelog page
**Effort: XS** · *We already maintain the source.*

Render `CHANGELOG.md` at `/whats-new` with New / Improved / Fixed tags and dates.
Trust signal, SEO surface, and it costs a page component. Add it to the standing
"keep `/help` in sync" rule.

---

### Tier 2 — do next

---

#### T2-1 · Passive hours estimation from ADS-B
**Effort: L** · *Their flagship differentiator, reduced to the part that serves maintenance.*

Do **not** rebuild Flight Intelligence. Build the one thing that matters to a
maintenance tracker: **"you've flown ~4.2 hours since your last recorded reading —
your 100-hr margin is smaller than the dashboard shows. Record a meter reading?"**

- **Source:** a free/community ADS-B feed (OpenSky Network, adsb.fi, ADSB.lol)
  keyed on the ICAO hex, which we can derive from the N-number — we already have
  an FAA registry lookup at `/api/registry`. **Avoids their Flightradar24 cost
  entirely**, which is the whole reason theirs is a paid add-on.
- **Job:** extend the existing daily cron (`api/cron/daily`) to accumulate
  airborne time since the last `hours_reading`.
- **Honest limits, stated in-product:** ADS-B airborne time is neither tach nor
  hobbs; coverage has gaps; not every GA aircraft broadcasts ADS-B Out. This is an
  *estimate that prompts a real reading* — never a logged value, never written to
  `hours_reading` without confirmation.
- **Why it's the right shape for us:** it closes the loop with the hobbs↔tach
  reconciliation engine and makes the T1-1 projection self-maintaining, without
  us becoming a flight-logging app.

---

#### T2-2 · Pre-flight / inspection checklists that open squawks
**Effort: M** · *Their version is a checklist app. Ours should be a records feature.*

Customizable checklists with a built-in template library (C172-style, sectioned),
stepped pass/fail with notes, saved to a permanent dated inspection history.

**The differentiator: a failed item creates a squawk directly**, pre-filled with
the item, the date, and who found it — and the squawk closes against the log entry
that resolves it. That chain (checklist → squawk → maintenance entry → record) is
the thing we can build and they can't, because they don't have the records layer
underneath.

- **Where:** new table + `/aircraft/[id]/checklists`, joining to `squawk` (0043).

---

#### T2-3 · Person-level currency and expiry tracking
**Effort: M** · *Reuses the reminder engine we already have.*

Pilot certificates, medical class + expiry, flight review, IPC. It's adjacent to
the aircraft thesis, but "what expires when, and warn me early" is *exactly* the
engine we already built for annuals and ADs — this is mostly new rows and a UI.

- **Where:** `profile` + `lib/reminders.ts`.
- **Scope discipline:** the *individual's* currency only. Not org-wide
  member-currency dashboards — that's the flight-school product.

---

#### T2-4 · Squawk parity pass
**Effort: XS–S**

Verify our squawks carry a full discovery → resolution audit trail (not just a
status flip) and can link to the resolving log entry. Theirs advertises "full
history." Likely a small gap; confirm before building.

---

### Tier 3 — evaluate

---

#### T3-1 · AD discovery by model, not just manufacturer
**Effort: M**

`/compliance/explore` currently searches the Federal Register by *manufacturer*
(airframe make + installed equipment makes). Theirs searches DRS by **make +
model + keyword** and renders the applicability model list on each result
("Models: 150A, 150B… +214 more"), then one-click imports with recurrence
interval and next-due in tach hours. Ours is a broader net; theirs is a sharper
one. Worth tightening — but the A&P-AD-report-as-ground-truth feature we already
have is the more valuable half, and they have no equivalent.

---

#### T3-2 · Per-aircraft storage usage display
**Effort: S**

They use storage quotas (5 GB / 25 GB) as the honest plan lever. Independent of
whether we ever monetize, showing storage used per aircraft is directly relevant
to the Storage→GCS migration and the egress work, and it's honest about a real
cost.

---

#### T3-3 · A displacement / migration page of our own
**Effort: S (page) + M (importer)**

`/myfbo` is the highest-leverage page on their site. Our equivalents:

1. **"Coming from a digitization service"** — make the contrast explicit and
   factual: $299/aircraft and 1–2 weeks for a human transcription, versus upload
   and review in minutes, with per-field confidence showing you exactly what to
   check. This is the sharpest wedge we have and we currently don't make the
   argument anywhere.
2. **An importer for a SquawkFree export** — they publish JSON + CSV. Being able
   to say "bring your data, we'll read it" costs one parser.

---

#### T3-4 · Content / SEO
**Effort: ongoing**

They published 15 keyword-targeted posts in 15 days and are occupying the terms
an owner searches when looking for what we built. This connects to the existing
launch-marketing plan. Note we have material they structurally cannot write: how
the extraction actually works, per-field confidence, the open API, self-hosting.
Fifteen thin posts beat zero good ones on search; four good ones plus a real FAQ
probably beat fifteen thin ones on conversion.

---

#### T3-5 · A commercial/trust FAQ, separate from `/help`
**Effort: S**

`/help` documents *how features work*. It doesn't answer: what does this cost,
what happens to my data, who can see it, what happens if the project stops, can I
self-host, is my Anthropic key safe. Their FAQ answers the equivalent questions
and it's doing real sales work. Much of our copy already exists in the README,
`SECURITY.md`, and memory — this is mostly assembly.

---

### Deliberate non-goals

Not because they're bad features — because they're a different product, and
chasing them would blunt the one we have.

| | Why not |
| --- | --- |
| **Scheduling / booking calendar** | Flight-school ops. Commodity, crowded, and it pulls us toward per-seat B2B. |
| **Dispatch → invoicing, membership dues, card payments** | We have no billing at all. Building a *billing product* before we have a *paid product* is backwards. |
| **Weather briefing** | Fully commoditized; ForeFlight/1800wxbrief already win. Zero connection to records. |
| **Org RBAC with 5 roles** | Our viewer/contributor + OAuth grants cover the owner and co-owner cases. Five roles exist to serve schools. |
| **3D track replay, runway usage, fuel-burn analytics** | Flight-ops analytics, not maintenance. Also the part of theirs that needs a paid data feed. |
| **Human-in-the-loop digitization as a service** | It's a labour business, not a software one. Our answer to "is the extraction right?" is the confidence-scored review UI — invest there instead. |

---

## Two things to take away

1. **Our moat is real and we under-sell it.** Automated extraction with per-field
   confidence, Ask-your-logbook, oil trending, equipment reconstruction, an open
   API, and MIT self-hosting — none of which they have, and the first one is a
   $299 manual service on their side. The gap isn't capability, it's that
   nothing on our landing page makes an owner *feel* the minutes-vs-two-weeks
   difference.

2. **Three of their features are genuinely on our thesis and we should just take
   them:** calendar-date projection with confidence (T1-1), checklists that feed
   squawks (T2-2), and passive hours capture (T2-1). The rest of their surface
   area is a flight-school business we should stay out of.
