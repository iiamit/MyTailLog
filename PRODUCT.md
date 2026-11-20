# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One product on three platforms: the web app (`apps/web`), a native iPhone and iPad app in SwiftUI (`apps/ios`, iOS/iPadOS 18+), and a native Android app in Jetpack Compose (`apps/android`, Android 10 / API 29+). The two native apps share a Kotlin Multiplatform core (`apps/core`) for due rules, map layout, sync and the local database. All three keep the same visual identity (DESIGN.md); the phones use their own platform's navigation, sheets, gestures, pickers, widgets and notifications. The Capacitor app (`apps/mobile`) stays in service until both native apps reach parity.

## Users

Solo owner-pilots of piston GA aircraft: one aircraft, decades of paper airframe, engine, prop and avionics logbooks, and an A&P/IA they work with at annual. Their job is knowing what's due (annual, transponder, pitot-static, ELT, recurring ADs, oil) and having the records ready when a mechanic, IA, buyer or insurer asks.

Secondary audiences, reached through the owner: the people a plane is shared with (co-owners, viewers, editors), and recipients of a record room link (buyer, pre-buy mechanic, IA, insurer) who have no account.

Flight schools, clubs, fleets and MRO shops are out of scope.

## Product Purpose

MyTailLog turns paper logbooks into a searchable, gap-auditable, compliance-forecasting index. The owner photographs or uploads pages, AI reads them into structured entries, the owner confirms them beside the original scan, and the app tracks inspections, ADs, equipment, weight & balance and hours, then reminds them before things come due.

Success for the current quarter is acquisition: new owners who sign up, add an aircraft and reach "status ready" (a known annual date plus current hours) in their first session.

## Positioning

All four are core and every page may lean on them:

- **Cites the source page.** Every value and every "Ask" answer links back to the scanned page it came from, and nothing moves compliance until the owner confirms it.
- **Free and open source.** MIT licensed, no subscription. AI reading has a daily allowance; about 50 pages per rolling 24 hours on the shared key; owners can add their own Anthropic or OpenAI key for more.
- **The owner keeps the data.** Nobody else handles the books. Full export, scans included, and re-import.
- **Works in the hangar.** Records open offline on iPhone, iPad and Android; pages can be scanned on the phone and sync later.

## Operating Context

- Used at a desk (web) to digitize and review, and at the aircraft (phone, often one-handed) to check status, log hours and oil, and scan pages.
- Rituals the product serves: the annual inspection with an IA, a pre-buy, insurance renewal, selling the aircraft.
- Hand-offs produce documents: the printable maintenance summary, the pre-buy dossier, and record room links.
- Integrations: MyFlightBook (hours), Dropbox and Google Drive backups, CSV import, an OAuth API.

## Capabilities and Constraints

- **Legal boundary:** the physical logbooks are the legal record under 14 CFR 91.417. MyTailLog is an index and decision-support layer, never an airworthiness determination or a maintenance sign-off. Every surface that shows derived data must say so where it matters, and copy must never imply otherwise.
- **Review rule:** unreviewed OCR never moves a compliance signal; the owner confirms first.
- **Out of scope:** eSignatures, parts procurement and inventory, work orders, flight scheduling, multi-fleet management.
- **Terminology:** tach, hobbs, airframe hours; annual; AD/SB; squawk; A&P, IA; W&B; Documents (the Records Vault in the current web design); record room.
- **Demo aircraft:** every new account gets a fictional 1978 Cessna 172N, N734DM.

## Brand Commitments

- Name: MyTailLog; domain mytaillog.com.
- Voice: plain, aviation-literate, honest about limits (it states the daily AI allowance rather than overstating "free", and says what the app is not).

## Evidence on Hand

- The demo aircraft N734DM and the screenshots in `apps/web/src/screenshots/`: the new design (`v2-status`, `v2-review`, `v2-map`, `v2-entry`, `v2-hangar`, `v2-wb`) and the current one (review, hub, status, ask, timeline, W&B).
- Usage numbers (sign-ups, aircraft, pages) exist and may be published, but only figures the owner supplies; never estimate them.
- No testimonials, customer quotes, press or case studies. Do not fabricate any.

## Product Principles

1. The paper is the truth: show the source page, and never let the index pretend to be the record.
2. Status in the first session: a new owner should see what's due before being asked to digitize decades of books.
3. Built for one owner and one aircraft, not a fleet.
4. Respect the owner's data and attention: no lock-in, no third-party tracking, no overstated claims.
5. Works where the aircraft is: offline, on a phone, one-handed.
