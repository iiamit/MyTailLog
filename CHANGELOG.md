# Changelog

Notable changes to MyTailLog, newest first. Versions are calendar-based
(`APP_VERSION`, shown in the app header). Started 2026-07; earlier history is in
the git log.

## 2026.07

### Added — Open API & integrations
- **OAuth 2.1 API.** MyTailLog is now its own **Authorization Server + Resource
  Server** (Panva `oidc-provider`, Authorization Code + PKCE). Third-party apps can
  read an aircraft's **airworthiness / AD / inspection status, equipment, hours,
  oil, and weight & balance** — read-only, and **only with the owner's per-aircraft
  consent**. Endpoints under `/api/v1`; RFC 8414 discovery at
  `/.well-known/oauth-authorization-server`.
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
- **Fixed a critical cross-tenant authorization gap** in the OAuth grant path: the
  per-aircraft grant now verifies **aircraft ownership** at both write and read
  time (RLS + app-layer + a read-time recheck), so a token can only ever read
  aircraft its owner consented to. The Resource Server authorizes every request
  explicitly (RLS does not apply to OAuth tokens).
- Confidential client secrets are **encrypted at rest** (AES-256-GCM), same as
  MyFlightBook credentials and users' own Anthropic keys; pinned the GCM auth-tag
  length.
- Added **Semgrep** and **Dependabot** to CI; **SHA-pinned** all GitHub Actions.

### Earlier in 2026.07
- **Oil analysis** — import a Blackstone/AVLab lab report (PDF or photo); AI reads
  every sample and charts wear metals over time against the lab's universal average.
- **Find duplicates** — flags likely-duplicate scans and entries (by date, tach, and
  work text) so re-captures don't pile up.
- **Bring-your-own Anthropic key** with usage/cost transparency, and shared-key cost
  caps.

For the full engineering history, see the git log and `docs/`.
