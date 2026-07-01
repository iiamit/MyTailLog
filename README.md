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
