# Changelog

Notable changes to MyTailLog, newest first. Versions are calendar-based
(`APP_VERSION`, shown in the app header). Started 2026-07; earlier history is in
the git log.

## 2026.07

### Added — Native iOS app (offline-first, beta)
- **Offline logbook in your pocket.** A native iPhone/iPad app (Capacitor) that
  syncs an aircraft once, then works **fully offline** — browse every log entry,
  document, and original scanned page with no signal — and **captures** new
  logbook pages offline that upload when you're back online. Currently in
  TestFlight beta. Built on a **self-hosted** sync engine (a Postgres change feed
  → `/api/sync/pull` → on-device SQLite + a filesystem scan cache), no third-party
  vendor. See [`docs/mobile-and-sync.md`](docs/mobile-and-sync.md).

### Fixed — meter & status accuracy
- **Oil change no longer shows falsely overdue** when its last-done was recorded
  in tach but it counts down on hobbs, and a stray/mis-keyed hours reading (e.g. a
  duplicate MyFlightBook value) can no longer hijack "current hours."
- **100-hour inspection no longer shows falsely overdue** — a normal gap between
  the maintenance date and the nearest hours reading is no longer mistaken for a
  meter mismatch, and the annual reset is preserved.
- **Backup export/import fixed** — exports no longer swap pages and log entries
  (a restore of an old backup could fail); re-export to get a clean archive.

### Changed — infrastructure
- **Blob storage moved to Google Cloud Storage** (off Supabase Storage's free-tier
  egress cap; consolidated onto GCP). Access still gated by RLS through the app's
  serving routes.
- **Monorepo.** The repo is now `apps/web` (this app) + `apps/mobile` (the iOS app)
  + `packages/`. No user-facing change.

### Added — Records, squawks & engine health
- **Records Vault** — a categorized home for the aircraft's permanent records
  (airworthiness certificate, registration, radio station authorization, POH/AFM,
  weight & balance, **STCs**, 337s, 8130-3s, ICAs, manuals), stored alongside the
  logbook scans. Upload PDFs or photos up to 25 MB; a document can also be
  attached to a specific maintenance entry.
- **Squawks** — pilot-reported discrepancy tracking. Anyone with access can report
  an issue with a severity (including a shared pilot); editors resolve, reopen, or
  delete. Open until a mechanic clears it.
- **Oil consumption** — log each oil top-off ("added 1.5 qt") with the tach/hobbs
  and see your **burn-rate trend** (hours per quart) between top-offs — separate
  from the lab wear-metal analysis.

### Added — Open API & integrations
- **OAuth 2.1 API.** MyTailLog is now its own **Authorization Server + Resource
  Server** (Panva `oidc-provider`, Authorization Code + PKCE). Third-party apps can
  read an aircraft's **airworthiness / AD / inspection status, equipment, hours,
  oil, and weight & balance** — read-only, and **only with the owner's consent**.
  Endpoints under `/api/v1`; RFC 8414 discovery at
  `/.well-known/oauth-authorization-server`.
- **Account-wide sharing.** Consent defaults to sharing **all your aircraft**
  (including any you add later, so an app keeps working as your fleet grows), with
  "only the ones I pick" still available. A brand-new account can authorize an app
  before adding any aircraft (it just sees an empty list until you add one).
- **Self-serve developer portal** (`/developers`) — register public (PKCE) or
  confidential (client-secret) apps, with docs at `/developers/docs`.
- **Connected apps** in Profile — see and revoke any app's access at any time.
- **Bidirectional MyFlightBook** — MyTailLog pulls your hobbs/tach *from* MFB, and
  MFB (or any consented app) can pull airworthiness *from* MyTailLog. Integration
  guide: [`docs/mfb-integration.md`](docs/mfb-integration.md).

### Changed — platform
- Upgraded to **Next.js 16** (Turbopack is now the default build; `middleware` →
  `proxy`), **React 19.2**, and **TypeScript 6**. ESLint moved to flat config
  (`eslint.config.mjs`).

### Security
- **MyFlightBook credentials moved out of browser reach.** The per-user MFB
  OAuth `client_secret` and access/refresh tokens (already encrypted at rest)
  were readable as ciphertext by the browser role through row-level security,
  which scopes rows but not columns. They now live in a private schema Postgres
  doesn't expose, reachable only through `SECURITY DEFINER` functions — the same
  lockdown applied earlier to users' Anthropic keys. No re-entry or key rotation:
  the ciphertext and encryption key are unchanged. Any credential still stored as
  legacy plaintext (from before at-rest encryption existed) is now re-encrypted
  automatically on first use.
- **Fixed a critical cross-tenant authorization gap** in the OAuth grant path: the
  per-aircraft grant now verifies **aircraft ownership** at both write and read
  time (RLS + app-layer + a read-time recheck), so a token can only ever read
  aircraft its owner consented to. The Resource Server authorizes every request
  explicitly (RLS does not apply to OAuth tokens).
- Confidential client secrets are **encrypted at rest** (AES-256-GCM), same as
  MyFlightBook credentials and users' own Anthropic keys; pinned the GCM auth-tag
  length.
- Added **Semgrep** and **Dependabot** to CI; **SHA-pinned** all GitHub Actions.
- **Full-app security audit hardening.** Closed an AI-budget race (atomic
  reservation replacing a check-then-act), moved BYOK Anthropic-key ciphertext
  into a private schema reachable only via `SECURITY DEFINER` functions (a
  browser-role read was possible before), scoped `form-action` to the consent
  flow, patched sharp/libvips CVEs, gated the maintenance forecast to
  owner-confirmed entries, split the document table's write policy to editors-only
  (a read-only viewer could previously write documents), and added an executable
  RLS-isolation regression suite plus broad unit coverage.

### Earlier in 2026.07
- **Oil analysis** — import a Blackstone/AVLab lab report (PDF or photo); AI reads
  every sample and charts wear metals over time against the lab's universal average.
- **Find duplicates** — flags likely-duplicate scans and entries (by date, tach, and
  work text) so re-captures don't pile up.
- **Bring-your-own Anthropic key** with usage/cost transparency, and shared-key cost
  caps.

For the full engineering history, see the git log and `docs/`.
