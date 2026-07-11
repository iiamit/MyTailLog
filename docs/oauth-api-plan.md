# OAuth API provider — build plan

Turns MyTailLog into an **OAuth 2.1 Authorization Server + Resource Server** so
third-party apps (MyFlightBook and others) can, with a user's per-aircraft
consent, pull airworthiness/inspection/AD data. Complement to the existing MFB
integration (there we're the *client* pushing hobbs/tach; here we're the
*provider* they pull from).

## Decisions (locked)
- **Data shared:** everything **except log entries** — see scopes below.
- **Consent granularity:** **per-aircraft** (the user picks which aircraft an app sees).
- **Authorization Server:** **Panva `oidc-provider`** (reference-grade), not hand-rolled.
- **Onboarding:** **self-serve** — a developer portal + dynamic client registration.
- **MFB:** **bidirectional** — coordinate so it's a smooth two-way sync.

## Flow — Authorization Code + PKCE (OAuth 2.1)
1. Developer self-registers an app in the portal → `client_id` (+ secret for
   confidential/server apps), exact redirect URIs, requested scopes.
2. App → `/oauth/authorize` → user signs in (Supabase Auth) → **consent screen**
   ("App X wants *read* access to *airworthiness* for *N9363V*") → user selects
   which aircraft + approves.
3. Redirect with code → app exchanges (code + PKCE verifier + secret) at
   `/oauth/token` for a short-lived access token (signed JWT) + refresh token
   (opaque, revocable).
4. App calls `/api/v1/...` with the bearer token; the Resource Server validates
   and returns only granted aircraft/scopes.
5. User manages/revokes in Profile → **Connected apps**.

## Scopes (read-only v1, per-aircraft)
| Scope | Data | Source tables |
|---|---|---|
| `airworthiness:read` ⭐ | AD/SB compliance (ref, title, status, next-due date/hours, recurring); inspection & maintenance forecast (annual/oil/ELT/xpdr/pitot-static + custom, with next-due); current hobbs/tach; airworthy/attention summary | `ad_compliance`, `ad_reference`, `maintenance_item`, hours |
| `aircraft:read` | Tail, year/make/model, serials, home base | `aircraft` |
| `equipment:read` | Installed components (name, make, PN/SN, install/removal, life limits) | `component` |
| `hours:read` | Current hobbs/tach + recent readings | `hours_reading`, aircraft |
| `oil:read` | Oil-analysis samples + trend | `oil_analysis_sample` |
| `weightbalance:read` | Current empty weight/arm/moment, max gross | `weight_balance` |

**Excluded:** `entries:read` (the transcribed log history) — per decision. **Never
shared:** scanned images, user email/PII beyond the grant, other users' data, any
aircraft not in the grant. **No writes** in v1 (least privilege).

## Data model (migration 0033 — this PR)
- **`oidc_payloads`** — Panva `oidc-provider`'s adapter storage (Clients, Grants,
  Sessions, AccessTokens, AuthorizationCodes, RefreshTokens, Interactions, …).
  Server-only (service role); RLS denies `authenticated`.
- **`oauth_client`** — self-serve registered apps (portal source of truth):
  `client_id`, `client_secret_hash`, name, `redirect_uris[]`, `scopes[]`,
  `owner_id` (the developer), `is_confidential`. Secret hashed at rest; shown once.
  RLS: developers CRUD their own.
- **`oauth_aircraft_grant`** — the per-aircraft consent: one row per (account,
  client, aircraft) with `scopes[]`, `revoked_at`. RLS: the aircraft owner
  manages their own. The Resource Server authorizes against this.
- **`oauth_access_log`** — audit: which client read which aircraft/scope, when.
  Service-role writes; owner reads their own.

## Security (the crux — same rigor as N1/H1)
- OAuth 2.1: auth code + PKCE only (no implicit/password grants).
- Exact-match redirect-URI allowlist per client (anti open-redirect).
- Client secrets + refresh tokens **hashed at rest** (reuse `src/lib/crypto.ts`
  hashing); short-lived access tokens (~1h); refresh rotation; revocation.
- **The Resource Server enforces authz explicitly — RLS does NOT apply** (the
  OAuth token is not a Supabase JWT). Every endpoint checks: token valid → scope
  covers it → aircraft ∈ grant, then queries via the service client filtered to
  that aircraft. This is the N1 lesson; it gets the same adversarial test:
  **a grant for aircraft A must never return aircraft B** (contract + E2E), added
  to `secure-by-default`.
- Rate limiting on `/api/v1` (reuse the AI-gate pattern) + the audit log.
- Plain-English consent = informed consent.

## Phased build
- **P1a (done, PR #21):** data-model migration + DB types + the plan.
- **P1b (done):** Panva `oidc-provider` v9 wired to Next; Supabase adapter over
  `oidc_payloads`; `findAccount` → `sub`; JWKS via `OIDC_JWKS`; scopes config.
  See "P1b mount notes" below.
- **P1c:** the consent/interaction screen (per-aircraft selection) + "Connected
  apps" management UI in Profile.
- **P2:** Resource Server — `airworthiness:read` first, token+scope+aircraft
  enforcement, audit log, rate limit, **leak-proofing tests**; then the other scopes.
- **P3:** self-serve developer portal (register/rotate clients) +
  `/.well-known/oauth-authorization-server` discovery + developer docs.
- **P4:** onboard MFB (register + joint test), then bidirectional-sync coordination.

## New env/secrets (later phases)
`OIDC_JWKS` (signing keys for access tokens/JWKS) — server-only secret in Secret
Manager + `.env.local`. `oidc-provider` `cookies.keys` secret for its session cookies.

## P1b mount notes (as built)
- **oidc-provider v9** is a Koa/Node-http framework; App Router hands us a Web
  `Request`. We mount it as an App Router catch-all `src/app/api/oidc/[...path]`
  and bridge with **`fetch-to-node`** (`toReqRes`/`toFetchResponse`) — chosen
  over a Pages API route, which would have flipped Next into hybrid
  navigation-compat types (nullable `useSearchParams`/`useRouter`/`usePathname`
  app-wide). Runtime is `nodejs`; oidc-provider must never hit the edge.
- **Issuer = `${NEXT_PUBLIC_SITE_URL}/api/oidc`.** oidc-provider's routes are
  root-relative, so the route strips the `/api/oidc` prefix into `req.url` and
  sets `req.originalUrl` to the full path — that pair is how `urlFor` derives the
  mount prefix, so advertised endpoints come back under `/api/oidc/*`. Verified
  against `/.well-known/openid-configuration` + `/jwks` (unit-tested via E2E
  `e2e/oauth.spec.ts`).
- `fetch-to-node` leaves `req.socket` null; we `defineProperty` a stub
  (`{encrypted:false, remoteAddress}`) since Koa reads `socket.encrypted`/
  `remoteAddress`. `provider.proxy = true`: TLS terminates upstream, so the real
  scheme/host come from `x-forwarded-proto`/`-host` (prod) and default to
  http/localhost in dev.
- Posture: `responseTypes: ['code']`, PKCE required, `devInteractions` off,
  revocation + introspection on, registration off (the portal owns clients).
- **Secrets:** `OIDC_JWKS` (RS256 JWKS — `node scripts/gen-oidc-jwks.mjs`).
  Cookie signing reuses `ENCRYPTION_KEY` unless `OIDC_COOKIE_SECRET` is set.
  Missing `OIDC_JWKS` → `/api/oidc/*` returns 503, rest of app unaffected.
- **Deferred to later phases (not yet wired):** clients are still `clients: []`
  — the `oauth_client`→oidc-client mapping (and confidential-secret handling)
  lands with the **P3** portal; the `interactions.url` points at
  `/oauth/consent/:uid`, built in **P1c**. So the authorize flow is not yet
  end-to-end; discovery/JWKS/token infra is.

## Open items to verify before P1b
- Pin `oidc-provider` v9 API: the exact `Adapter` interface (find/upsert/destroy/
  revokeByGrantId/consume) and `oidc_payloads` columns — adjust the migration if
  the reference schema differs (additive).
- Running oidc-provider inside Next route handlers (it's an http framework) —
  mount via a catch-all `/oauth/[...oidc]` handler bridging Web ↔ Node req/res.
