# MyTailLog

Aircraft logbook digitization & maintenance tracker for piston GA owners — live at **[mytaillog.com](https://mytaillog.com)**.

> **This tool is an index and decision-support layer, not the legal record.**
> The physical logbooks remain the system of record per **14 CFR 91.417**.
> MyTailLog does not replace official maintenance records, does not constitute
> an airworthiness determination, and is not a maintenance sign-off. Every
> value it shows is derived from AI extraction or data you entered, and must be
> confirmed against the physical logbook before you rely on it.

## What it is

MyTailLog turns decades of paper airframe / engine / prop / avionics logbooks
into a **searchable, gap-auditable, compliance-forecasting index** — sized for a
single piston GA owner (and the people they share a plane with), not a fleet. You
photograph or upload your logbook pages, AI reads them into structured entries,
and the app tracks inspections, ADs, equipment, weight & balance, and flight
hours — then reminds you before things come due.

## Screenshots

*The demo aircraft every new account gets — a fictional 1978 C172N.*

![Aircraft overview — status badges, logbooks, and review queue](docs/screenshots/hub.png)

| Status at a glance | Review: page beside extraction |
|---|---|
| ![Status grid](docs/screenshots/status.png) | ![Review screen](docs/screenshots/review.png) |

| Ask your logbook (cited answers) | Timeline & search |
|---|---|
| ![Ask your logbook](docs/screenshots/ask.png) | ![Timeline](docs/screenshots/timeline.png) |

## Features

**Capture → extract → review**
- Camera capture with automatic document edge-detection / deskew / crop, or
  upload scans (PDF / JPEG / PNG). Offline-friendly: pages queue on-device and
  upload when back online.
- Vision-LLM extraction into structured entries (date, hours, work, parts,
  AD/SB refs, signature) with **per-field confidence**; a review screen shows the
  page image beside editable entries and flags low-confidence fields.
- Five logbook types — airframe, engine, prop, avionics, and **Other**.

**"Other" A&P documents (auto-applied)**
- Scan a **Weight & Balance sheet** → it creates a new W&B revision.
- Scan an **AD compliance report** → it becomes the ground truth for your AD
  state, corroborates matching tracked ADs (with a "✓ A&P report" badge), and
  adds any it lists that you weren't tracking.

**Understand & forecast**
- **Ask your logbook** — plain-English questions answered from your entries, with
  the source entries cited.
- **Timeline & search** across all logbooks; **Status** grid (color-coded, at a
  glance); **Maintenance forecast** (Part 91 recurring items, hours- and
  date-based); **AD/SB compliance** with official FAA reference lookup (Federal
  Register + DRS fallback); **Installed equipment** reconstructed from the logs;
  **Weight & Balance** history with a stale-since-last-equipment-change flag;
  **Records gap audit**.

**Flight hours & reminders**
- **MyFlightBook integration** (per-user OAuth) pulls your latest hobbs/tach so
  the forecast reflects real hours.
- A **daily job** auto-syncs hours (once/day) and emails **reminders** before due
  items — annual, oil, ADs, and more, each with a configurable lead time.

**Own your data**
- Print/PDF and CSV exports, plus a full **`.zip` backup** (records + scans) you
  can **re-import**.
- **Sharing** (viewer / contributor), **ownership transfer**, and delete.
- In-app **Help** documenting every feature and how the pieces affect each other.

## Architecture

- **Next.js 15 (App Router) + TypeScript + Tailwind** — server components, server
  actions, and route handlers in one deployable unit; a capture PWA (service
  worker + IndexedDB queue) for offline capture.
- **Supabase** — Postgres + Auth + object Storage. **Row-level security is the
  enforcement boundary**, funneled through a single `has_aircraft_access()` /
  `can_edit_aircraft()` choke point; every table and storage object is scoped to
  the users who own or are shared on the aircraft.
- **Anthropic** — a strong vision model (`claude-opus-4-8`) for handwriting/image
  extraction (`EXTRACTION_MODEL`), and a cheap text model (`claude-haiku-4-5`) for
  text-only reasoning — Q&A, equipment/maintenance detection (`TEXT_MODEL`).
- **All image processing is browser-side** (thumbnails, PDF rasterization, zip
  build/read) — the server never touches image bytes, keeping hosting at ~zero
  marginal cost.
- **Firebase App Hosting** (Cloud Run) for the app, **Cloud Scheduler** for the
  daily job, and **Resend** for reminder email. **FAA data** comes from the
  Federal Register API (source of truth) with a reverse-engineered DRS fallback.

Data model (Postgres, migrations `supabase/migrations/000*`): `aircraft` →
`logbook` → `page` → `log_entry`, plus `ad_compliance` / `ad_reference`,
`component` / `equipment_proposal`, `maintenance_item`, `weight_balance`,
`scanned_document`, `document`, `aircraft_share`, `mfb_connection` /
`hours_reading`, `reminder_log`, and `profile`.

## Costs

Targets **~zero marginal cost**: Firebase App Hosting (scale-to-zero) and Supabase
free tiers cover a personal deployment, and all image work is client-side. The
one metered line item is **LLM calls** — bounded (cents per page for the one-time
backlog, then a trickle) and split so the cheap model does the high-volume text
work. **Bring your own `ANTHROPIC_API_KEY`.**

## Getting started (local)

```bash
npm install
cp .env.example .env.local     # fill in Supabase URL + anon key, ANTHROPIC_API_KEY, etc.
# Apply supabase/migrations/*.sql in order via the Supabase dashboard SQL editor
npm run dev                    # http://localhost:3000
```

See [`.env.example`](./.env.example) for all config (required vs optional) and
[`supabase/README.md`](./supabase/README.md) for the schema + RLS model.

## Deploy (Firebase App Hosting + Supabase)

MyTailLog runs as a Next.js server on **Firebase App Hosting** (Cloud Run, builds
on every GitHub push, global CDN) over a **Supabase** project. Config is in
[`apphosting.yaml`](./apphosting.yaml).

**Prerequisites:** a Firebase project on the **Blaze** plan (App Hosting requires
it; metered but ~$0 at personal scale — set a budget alert) and the Firebase CLI.

**1. Secrets** (Cloud Secret Manager, referenced by name in `apphosting.yaml`):
```bash
firebase apphosting:secrets:set NEXT_PUBLIC_SUPABASE_URL
firebase apphosting:secrets:set NEXT_PUBLIC_SUPABASE_ANON_KEY
firebase apphosting:secrets:set ANTHROPIC_API_KEY
# For the daily reminder/sync cron (optional but recommended):
firebase apphosting:secrets:set SUPABASE_SECRET_KEY   # Supabase → API Keys → "Create secret key"
firebase apphosting:secrets:set RESEND_API_KEY        # for reminder email
firebase apphosting:secrets:set CRON_SECRET           # random string; gates the cron endpoint
```

**2. Backend** — Firebase console → **App Hosting → Get started** → connect the
GitHub repo + `main` branch. Every push to `main` builds and rolls out.
(`apphosting.yaml` sets scale-to-zero, `maxInstances: 2`, 1 vCPU / 1 GiB.)

**3. Supabase auth URLs** (fixes magic links landing on `localhost`):
Supabase → **Authentication → URL Configuration** → **Site URL**
`https://mytaillog.com`, **Redirect URLs** `https://mytaillog.com/auth/callback`.
Configure custom SMTP (e.g. Resend) to lift the built-in email rate limit.

**4. Custom domain** — App Hosting → **Add custom domain** → add the DNS records;
Google provisions a managed TLS cert.

**5. Migrations** — run `supabase/migrations/*.sql` **in order** via the dashboard
SQL editor (the repo isn't CLI-linked). Enum-adding migrations (e.g.
`0004`/`0017`) must be run and committed **before** the migration that uses the
new value.

**6. Daily reminders (optional)** — create a **Cloud Scheduler** job that does a
daily `POST https://mytaillog.com/api/cron/daily` with header
`Authorization: Bearer <CRON_SECRET>`.

### Cost & known ceilings
- **App Hosting / Cloud Run:** scale-to-zero → ~$0 idle; Cloud Run free tier
  covers personal traffic. Blaze has no hard cap — set a budget alert.
- **Request timeout:** Cloud Run default 300s covers extraction and full-history
  scans (`maxDuration` in the routes is a Vercel-only hint, ignored here).
- **Supabase free:** 1 GB storage (scans), 500 MB DB, pauses after 7 days idle,
  no automatic backups (use the in-app `.zip` export, or Supabase Pro).

The app also deploys to **Vercel** (Hobby caps functions at 60s and is
non-commercial); Cloud Run avoids both.

## Data isolation & privacy

Every record belongs to the users who own or are shared on its aircraft, enforced
by Postgres row-level security — not just app code. Aircraft records (tail
numbers, serials, owner names, home base) are treated as **sensitive personal
data**. Sharing is by email with viewer/contributor roles; a per-user secret
(MyFlightBook OAuth tokens) is stored server-side only and never sent to the
browser. The one elevated code path — the daily cron — uses a Supabase secret API
key scoped to that endpoint behind a shared-secret gate.

## Explicitly out of scope

eSignatures (keeps us in "index of the physical record" territory, avoiding
AC 120-78A), parts procurement/inventory, work orders, flight scheduling, and MRO
multi-fleet management.

## License

[MIT](./LICENSE)
