# Completed competitive work plan (T1 ×4, T2-1, T3-1)

> Historical plan, not an active backlog. All six work packages have shipped as
> of August 2026: utilization projections, printable/shareable maintenance
> summaries, entry attachments, What's New, ADS-B reconciliation, and AD
> discovery. The prerequisites below are retained as operational context.

| Package | Status | Shipped surface |
| --- | --- | --- |
| WP1 | Shipped | `lib/utilization.ts` and maintenance status projections |
| WP2 | Shipped | `/aircraft/[id]/summary`, print/PDF, and redacted sharing |
| WP3 | Shipped | Entry/document links and reverse document view |
| WP4 | Shipped | `/whats-new`, stable release anchors, and RSS |
| WP5 | Shipped | `lib/adsb/reconcile.ts` and opt-in ADS-B suggestions |
| WP6 | Shipped | `/aircraft/[id]/compliance/explore` |

Derived from [`competitive-squawkfree.md`](competitive-squawkfree.md). Six work
packages. Each ships as **its own PR**; nothing merges until CI is green and any
migration has been applied to **both** the prod and test Supabase projects.

---

## 0. Prerequisites (user action required)

| # | What | Why | Blocks |
| --- | --- | --- | --- |
| **P1** | **OpenSky Network account + API client.** Sign in → Account → create an API client → save `client_id` / `client_secret`. | **Verified 2026-08-02: `GET /flights/aircraft` returns `403` anonymously.** Basic auth was removed in March 2026; the flights endpoint now requires the OAuth2 client-credentials flow. (`/states/all` still works anonymously — but it only gives live position, not history, so it's useless to us.) | WP5 |
| **P2** | Add `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` to `apphosting.yaml` secrets + GitHub Actions secrets. | Cron job runs server-side. | WP5 |
| **P3** | Apply migrations `0048` (ADS-B) and `0049` (AD discovery, if needed) to **prod and test** before the respective PR merges. | Standing rule — CI e2e runs against the test project. | WP5, WP6 |

**Optional but valuable:** OpenSky's credit tier is per-endpoint. Anonymous 400/day,
**standard account 4,000/day**, active ADS-B feeder 8,000/day. A `<24 h` window on
`/flights/*` costs **4 credits**, so one nightly call per aircraft = **~1,000
aircraft/day on a free standard account**. No cost pressure for a long time.

---

## 1. Work packages

### WP1 · Utilization-rate projection ("due in 38.4 h" → "due ≈ March 14")
**Backlog: T1-1 · Effort S–M · No migration · Foundational — do first**

**New:** `apps/web/src/lib/utilization.ts`

```ts
type Utilization = {
  hoursPerDay: number;
  sampleCount: number;
  spanDays: number;
  confidence: "high" | "medium" | "low" | "none";
  windowStart: string; windowEnd: string;
  meter: "tach" | "hobbs";
};
computeUtilization(readings: HoursReading[], resets: MeterReset[]): Utilization
projectDueDate(hoursRemaining: number, u: Utilization): { date: Date; confidence } | null
```

**Design:**
- Trailing **365-day** window over `hours_reading`.
- **Prefer tach.** Hour-based limits (100-hr, TBO, hour-interval ADs) are written
  against engine time. Fall back to hobbs and label it — reuse `lib/hobbsTach.ts`
  rather than re-deriving the relationship.
- **Exclude any interval spanning a `meter_reset`** (0046). A replaced tach makes
  the naive delta meaningless — this is the single most likely source of a
  wildly wrong projection.
- Confidence ladder: `none` (<2 readings or <14 d span) → `low` (≥2 readings,
  ≥30 d) → `medium` (≥4, ≥90 d) → `high` (≥6, ≥180 d). At `none`, render exactly
  what we render today (hours only) — never guess from one data point.

**Render:** `/aircraft/[id]/status`, `/aircraft/[id]/maintenance`, the AD
compliance rows, and the reminder emails (`lib/reminders.ts`).

**Guardrails (non-negotiable):**
- Never override a **calendar** limit — an annual is a date, not a projection.
- Always show `≈`, the confidence, and the window the rate came from.
- Copy must say it's a planning estimate, not a determination. Consistent with
  the "index, not the legal record" line.

**Tests:** unit tests on the rate math, the meter-reset exclusion, the
low-sample-count path, and the tach-vs-hobbs preference.

---

### WP2 · Export: PDF maintenance summary
**Backlog: T1-2 (revised) · Effort S · No migration**

> **Scope correction from the original backlog item.** T1-2 proposed adding
> **ForeFlight Logbook CSV and MyFlightbook CSV** export. On inspection that is
> the wrong feature for us: both are **pilot flight-logbook** formats, and
> MyTailLog holds no flight records — only `hours_reading` datapoints and
> maintenance entries. Emitting those formats would mean **fabricating flights we
> don't have**, which is exactly the kind of thing the whole product refuses to
> do. Dropped deliberately.
>
> The competitor needs those exports because they *are* a flight-logging app. Our
> MyFlightBook story is already stronger and already shipped: a **bidirectional
> OAuth link**, not a CSV dump.

**What actually ships:**
- A **printable PDF maintenance summary** per aircraft — status grid, open
  squawks, AD compliance table, upcoming due items (with WP1 projections),
  installed equipment, current W&B. The thing you hand a buyer, an insurer, or an
  IA at annual.
- An **export manifest** (`README.txt` in the ZIP) documenting every file and
  column, so the archive is self-describing years later.
- Landing-page + `/help` copy stating the portability position plainly: MIT
  licensed, self-hostable, full ZIP export **and re-import**. That round trip is
  the strongest anti-lock-in claim available and we currently don't make it.

**Files:** `api/aircraft/[id]/export/route.ts`, `lib/backup/`, `/aircraft/[id]/export`.

---

### WP3 · Entry ↔ document attachment editor
**Backlog: T1-3 · Effort S–M · Schema already exists (0041)**

Ship the last mile of Records Vault: attach a vault document to a log entry, and
show "linked records" on the document. No schema work — 0041 landed the tables.

- Document picker in the entry editor (review + timeline).
- Reverse view on `/aircraft/[id]/documents`.
- Attachments surface in the timeline, the PDF summary (WP2), and the ZIP backup.

**Note:** this was deferred once for needing browser verification. It needs a real
e2e test this time, not a manual pass — extend `apps/web/e2e/documents.spec.ts`.

---

### WP4 · Public `/whats-new`
**Backlog: T1-4 · Effort XS · No migration**

Render `CHANGELOG.md` at `/whats-new`, grouped by version with New / Improved /
Fixed tags. Parse at build time; no new runtime dependency if one is already
present. Link it from nav + footer, add to sitemap, add `metadata`.

Fold into the standing "`/help` stays in sync" rule.

---

### WP5 · Passive hours from ADS-B, reconciled against MyFlightBook
**Backlog: T2-1 · Effort L · Migration 0048 · Depends on P1/P2**

The largest package. **Scope discipline: this is not flight logging and not
flight analytics.** No 3D replay, no runway usage, no touch-and-go detection. One
job only — *notice that the aircraft flew and the recorded hours don't reflect it.*

#### Getting the ICAO 24-bit address

**Do not hand-roll the N-number → hex encoder.** I tried; it produced `a11d9f`
for N172SP where the real address is `A12239`. The encoding has enough edge cases
(the 24-letter alphabet with I and O removed, variable-length suffixes) that a
subtly-wrong implementation would silently pull *another aircraft's* flights.
That failure is invisible and unacceptable.

Resolution order, each verified 2026-08-02:
1. **`aircraft.icao24`** if already set (user-entered or previously resolved).
2. **FAA registry** — the releasable aircraft database carries a *Mode S Code Hex*
   field. We already have `/api/registry`; extend it to surface that field.
3. **`api.adsbdb.com/v0/aircraft/{registration}`** — free, no key, returns
   `mode_s`. Confirmed working (`N172SP` → `A12239`). Fallback only.
4. **Manual entry** in aircraft settings, always available.

Cache the resolved hex on `aircraft`; never re-resolve per run.

#### Ingestion

- `lib/adsb/opensky.ts` — OAuth2 client-credentials token manager against
  `https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token`
  (tokens ~1800 s; cache and refresh with margin), then
  `GET /flights/aircraft?icao24=&begin=&end=` with a Bearer token.
  **The interval must not exceed 2 days** — chunk accordingly.
- Extend `api/cron/daily/route.ts`: for each **opted-in** aircraft with a known
  hex, pull the last 48 h, upsert flights. 4 credits per aircraft per day.
- Respect `X-Rate-Limit-Remaining`; on `429` read
  `X-Rate-Limit-Retry-After-Seconds` and stop the sweep rather than hammering.
  Log remaining credits so the ceiling is visible before it's hit.

#### Migration 0048

- `aircraft.icao24 text` (nullable), `aircraft.adsb_enabled boolean not null default false`.
- `adsb_flight` — `id`, `aircraft_id`, `icao24`, `first_seen`, `last_seen`,
  `est_departure_airport`, `est_arrival_airport`, `callsign`, `airborne_minutes`,
  `dismissed_at`, `created_at`. **Unique `(aircraft_id, first_seen)`** for
  idempotent re-runs.
- RLS mirroring the other child tables (`has_aircraft_access`), and a `log_change()`
  trigger so it flows through the sync engine to the iOS client.

#### Reconciliation against MyFlightBook — *the point of the feature*

`lib/adsb/reconcile.ts`. For the window since the most recent `hours_reading`:

1. Sum ADS-B airborne time (`lastSeen − firstSeen`) per flight.
2. Find `hours_reading` rows in the same window, **including their source** — MFB
   sync rows are already marked (`lib/mfbSync.ts`).
3. **If MFB (or a manual reading) already covers those dates → say nothing.**
   MyFlightBook is the pilot's own record and it wins. ADS-B is only ever the
   *fallback* observer.
4. **If ADS-B saw flying that no recorded reading accounts for → raise a
   suggestion**, scoped to the uncovered dates only:

   > ADS-B detected **3 flights totalling ≈4.2 h** since your last tach reading
   > (1,234.5 on 12 Jul). Your 100-hour inspection may be **≈4.2 h closer** than
   > shown.
   > **Suggested tach: 1,234.5 → 1,238.7** · [Record a reading] [Dismiss]

5. Accepting writes **one** `hours_reading` with `source='adsb_estimate'`,
   pre-filled but **fully editable** — the user confirms the number.

**Hard rules:**
- **Never auto-write a reading.** Confirmation always.
- An `adsb_estimate` reading is **never** treated as authoritative for compliance
  and never feeds the WP1 utilization rate — it would be circular.
- It *may* widen the forecast warning band ("you may be closer than shown"), which
  is the safe direction to be wrong in.
- **Opt-in per aircraft, off by default.** This is position data about a user's
  aircraft; nobody gets enrolled silently.

#### Honest limits, stated in the UI (not buried in help)

ADS-B airborne wall-clock is **neither tach nor hobbs** — it excludes taxi and
runup and it drifts from tach with RPM. Ground coverage has gaps. Not every GA
aircraft broadcasts ADS-B Out. Present it as *an estimate that prompts a real
reading*, exactly as the rest of the app treats machine-derived values.

**Tests:** unit tests on the reconciliation (MFB-covered → silent; uncovered →
suggestion; partial overlap → only the gap). E2E with a stubbed OpenSky client —
no live API in CI.

---

### WP6 · AD discovery by model
**Backlog: T3-1 · Effort M**

`/aircraft/[id]/compliance/explore` currently searches the Federal Register by
**manufacturer** (airframe make + installed equipment makes). Tighten it:

- Add **model** and **free-text keyword** to the query; query DRS where it gives
  better applicability data than the Federal Register.
- Render the **applicability model list** per result, so the user can see whether
  their variant is actually named.
- One-click **track this AD** → writes `ad_compliance` with recurrence
  (one-time / recurring), interval (hours or calendar), and next-due — which then
  flows straight into the WP1 projection.

**Keep** the existing manufacturer-wide search as the broad net, and keep the
A&P-AD-report-as-ground-truth path untouched — that's the half they have no
answer to.

---

## 2. Sequencing

```
P1/P2 (user) ─────────────────────────────┐
                                          ▼
WP1 projection ──┬──────────────► WP5 ADS-B  (uses WP1's display slots)
   (foundational)│
                 ├──► WP6 AD discovery      (feeds due items into WP1)
                 └──► WP2 PDF summary       (renders WP1 projections)

WP3 attachments ─── independent
WP4 whats-new  ─── independent
Marketing pages ── independent (already running)
```

**WP1 lands first.** WP2, WP5 and WP6 all render or feed its output; doing it
last means touching the same components twice.

**Conflict zones:** WP1, WP5 and WP6 all touch `/status` and `/maintenance`
rendering. Run the parallel ones in **isolated git worktrees** and land WP1 before
WP5's suggestion banner.

---

## 3. Agent assignment

| Agent | Packages | Isolation | Notes |
| --- | --- | --- | --- |
| **A** | WP1 | worktree | Land first. Pure computation + display; no schema. |
| **B** | WP4 + WP2 | worktree | Two low-risk, unrelated-file packages. |
| **C** | WP3 | worktree | Needs a real e2e test, not a manual pass. |
| **D** | WP5 | worktree | Largest. Blocked on P1/P2. Stub OpenSky in CI. |
| **E** | WP6 | worktree | Independent of WP1's internals. |
| **M** | Marketing pages | branch | Already running: `/faq`, `/switch/myfbo`, `/compare`. |

Every agent: branch → commit → push → **open a PR, do not merge**. All three CI
checks (`check`, `e2e`, `semgrep`) must be green.

---

## 4. Security checklist (standing rule)

Per the secure-by-default checklist, before any of these merge:

- **New tables** (`adsb_flight`) — RLS enabled, policy via `has_aircraft_access`,
  and an entry in `apps/web/e2e/rls-isolation.spec.ts`. RLS scopes **rows, not
  columns**.
- **New secrets** (`OPENSKY_*`) — server-only, never in a `NEXT_PUBLIC_` var,
  never reachable from the browser. They are app-level credentials, not
  per-user, so no ciphertext column is needed — but they must not land in
  `database.types.ts` or any client component.
- **New outbound calls** (OpenSky, adsbdb) — timeouts, failure isolation (one
  aircraft's failure must not abort the cron sweep), and no user data in the
  request. We send an ICAO hex, which is public registry data.
- **New route** — confirm the authorization path explicitly; RLS does not protect
  the OAuth resource server.
