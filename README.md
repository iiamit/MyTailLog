# MyTailLog

Aircraft logbook digitization & maintenance tracker for piston GA owners.

> **This tool is an index and decision-support layer, not the legal record.**
> The physical logbooks remain the system of record per **14 CFR 91.417**.
> MyTailLog does not replace official maintenance records, does not constitute
> an airworthiness determination, and is not a maintenance sign-off. Every
> maintenance/AD due date it shows is derived from OCR/extraction and must be
> confirmed against the physical logbook before you rely on it.

## What it is

A free, self-hostable tool that turns 50 years of paper airframe/engine/prop
logbooks into a searchable, gap-auditable, compliance-forecasting index — sized
for a **single piston GA owner**, not a fleet. It fills the gap left by
PlaneLogix (human transcription service), Bluetail, and Veryon (enterprise
tiers): none offer a free, owner-run tool with automated vision-LLM extraction.

## Status

**Pre-alpha. Currently building Phase 1 (capture → extract → review → search).**

| Phase | Scope | State |
|-------|-------|-------|
| 1 | Capture, OCR/extraction, review, search + unified timeline | 🚧 in progress |
| 2 | AD/SB tracking, maintenance forecasting, gap audit | ⏳ planned |
| 3 | W&B, multi-owner sharing, exports | ⏳ planned |
| 4 | Notifications, community AD layer, public share links | ⏳ planned |

Detailed build order lives in [`logbook-app-plan.md`](./logbook-app-plan.md).

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind** — frontend, API routes,
  and the capture PWA in one deployable unit (Vercel / Fly.io / Render free tier).
- **Supabase** — Postgres + auth + object storage, free tier, itself open
  source so the whole thing can be self-hosted later without a rewrite.
- **Classic OCR (Tesseract/PaddleOCR)** — printed text, zero marginal cost.
- **Vision-LLM** — handwritten entries only. See Costs.

## Costs

Everything here targets **zero marginal cost** except one line item:
**vision-LLM calls for handwritten entries**. For a personal backlog of a few
hundred to a few thousand pages this is a small, bounded, one-time cost (cents
per page), then a trickle for new entries. **Bring your own API key**
(`ANTHROPIC_API_KEY`).

## Getting started

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env.local   # fill in Supabase + API keys

# 3. Set up the database (requires the Supabase CLI + a project)
#    Applies supabase/migrations/*.sql
supabase link --project-ref <your-project-ref>
supabase db push

# 4. Run
npm run dev                  # http://localhost:3000
```

See [`supabase/README.md`](./supabase/README.md) for the schema and the
single-owner data-isolation model (row-level security from day one).

## Deploy (Firebase App Hosting + Supabase)

MyTailLog runs as a Next.js server on **Firebase App Hosting** (which provisions
a Cloud Run service, builds on every GitHub push, and serves through a global
CDN) on top of the **Supabase** project that hosts the database, auth, and
storage. Config lives in [`apphosting.yaml`](./apphosting.yaml).

**Prerequisites:** a Firebase project on the **Blaze** (pay-as-you-go) plan —
App Hosting requires it — and the Firebase CLI (`npm i -g firebase-tools`).
Blaze is metered but includes generous no-cost allowances; a personal
deployment stays at ~$0 (set a budget alert, since Blaze has no hard cap).

**1. Create the secrets** (Cloud Secret Manager; values never enter git):
```bash
firebase apphosting:secrets:set NEXT_PUBLIC_SUPABASE_URL
firebase apphosting:secrets:set NEXT_PUBLIC_SUPABASE_ANON_KEY
firebase apphosting:secrets:set ANTHROPIC_API_KEY
```
`apphosting.yaml` references these by name and grants the build/runtime service
accounts access.

**2. Create the App Hosting backend** — Firebase console → **App Hosting** →
*Get started* → connect the GitHub repo and the `main` branch. Every push to
`main` triggers a build + rollout. (`apphosting.yaml` sets scale-to-zero,
`maxInstances: 2`, 1 vCPU / 1 GiB.)

**3. Point Supabase auth at the domain** (this is what makes magic links land on
the site instead of `localhost`):
- Supabase dashboard → **Authentication → URL Configuration**
  - **Site URL**: `https://mytaillog.com`
  - **Redirect URLs**: `https://mytaillog.com/auth/callback` (add the temporary
    `*.web.app`/`*.run.app` URL too until the custom domain is live).
- Enable email confirmation for password sign-up under
  **Authentication → Providers → Email**.

**4. Custom domain** — App Hosting → your backend → **Add custom domain** →
`mytaillog.com` → add the DNS records it shows at your registrar. Google
provisions a managed TLS cert automatically.

**5. Migrations** — this deployment reuses the existing Supabase project, so the
schema is already applied. For a fresh project, run `supabase/migrations/*.sql`
in order via the dashboard SQL Editor.

### Cost & known ceilings

- **App Hosting / Cloud Run:** scale-to-zero → ~$0 idle; Cloud Run's free tier
  (2M req, 180k vCPU-s, 360k GiB-s/mo) covers personal traffic. Blaze has **no
  hard spend cap** — set a **budget alert**. Container image storage in
  Artifact Registry may cost a few cents/month.
- **Request timeout:** Cloud Run's default (300s) covers extraction and
  full-history scans — no Vercel-style 60s cap. (`maxDuration` in the API routes
  is a Vercel-only hint, ignored here.)
- **Supabase Storage (free = 1 GB):** scans live here; thumbnails are tiny,
  originals are the bulk. One aircraft usually fits; the in-app `.zip` backup
  lets you offload, and Supabase Pro raises this to 100 GB.
- **Supabase pause (free = after 7 days idle)** and **no automatic backups** —
  resume from the dashboard; back up with the in-app export, or go Pro.

### Alternative: Vercel

The app also deploys to **Vercel** (import the repo, set the same env vars from
[`.env.example`](./.env.example)). Note the Vercel **Hobby** tier caps functions
at **60s** (large full-history scans may 504 — raise `maxDuration` to 300 on
Pro) and is non-commercial.

## Data isolation & privacy

Every record (aircraft, logbook, entry) belongs to exactly one owning user and
is invisible to everyone else, enforced by Postgres row-level security — not
just app code. Aircraft records (tail numbers, serials, owner names, home base)
are treated as **sensitive personal data**. A future `aircraft_share` table
grants explicit read/contribute access without a full multi-tenant permission
system; the schema is designed for it but the sharing UI is deliberately not
built yet.

## Explicitly out of scope

eSignatures (keeps us in "index of the physical record" territory, avoiding
AC 120-78A), parts procurement/inventory, work orders, flight scheduling, and
MRO multi-fleet management. These are Veryon's territory, not this project's.

## License

[MIT](./LICENSE)
