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
- **P1c (done):** consent/interaction screen (per-aircraft selection) +
  "Connected apps" management. See "P1c notes" below.
- **P2 (done):** Resource Server — all read scopes (airworthiness, aircraft,
  equipment, hours, oil, weightbalance), token+scope+aircraft enforcement, audit
  log, rate limit, **leak-proofing test**. See "P2 notes".
- **P3 (done):** self-serve developer portal (`/developers` — register/list/
  delete public+PKCE clients, RLS-scoped), `/.well-known/oauth-authorization-server`
  (RFC 8414), and `/developers/docs`. See "P3 notes".
- **P4 (started):** confidential client support (server-to-server apps like MFB) —
  see "P4 notes". Remaining: register MFB as a client + joint test + bidirectional
  sync coordination (needs MFB's participation).

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

## P1c notes (as built)
- **Client store:** `oidc_payloads` adapter special-cases the `Client` model to
  read `oauth_client` and map it to oidc client metadata. v1 clients are
  **public + PKCE** (`token_endpoint_auth_method: 'none'`) — we store only a
  secret *hash*, so confidential (`client_secret`) auth for server apps like MFB
  is deferred to **P4**. PKCE already binds the code to the exchanger.
- **Consent:** `interactions.url` → `/oauth/consent/[uid]`. The page (RSC) reads
  the pending Interaction via the service client (server-only) to render the app
  name + requested scopes + the user's **owned** aircraft as checkboxes. Submit
  posts to `/oauth/consent/[uid]/decide` (route handler — oidc's
  `interactionDetails`/`interactionFinished` need Node req/res via the bridge).
  The user is already authed via Supabase, so we resolve login **and** consent in
  one `interactionFinished({ login, consent })`. The oidc `Grant` carries the
  requested scopes; the per-aircraft restriction is recorded separately in
  `oauth_aircraft_grant` (the RS authz boundary) with the authed client (RLS).
- **Connected apps:** Profile lists active grants grouped by app (client display
  names resolved via the service client, since `oauth_client` RLS is owner-scoped
  to the developer, not the grantee). Revoke = delete the caller's
  `oauth_aircraft_grant` rows for that client — access stops immediately because
  the RS gates on those rows. Token-layer revocation (killing the refresh token)
  needs the stored grantId; deferred.
- **E2E:** `e2e/oauth-flow.spec.ts` registers a public client + drives
  /auth → consent → code → token exchange, and asserts the grant row.

## P2 notes (as built — first cut)
- **Choke point:** `src/lib/oauth/resource.ts` — the ONLY place that authorizes
  `/api/v1`. `authenticate()` validates the Bearer via
  `provider.AccessToken.find` (opaque tokens); `requireScope()` checks the
  token's scopes; `requireAircraft()` checks the aircraft is in an active
  `oauth_aircraft_grant` for `(account, client, scope)` and throws **404 (not
  403)** so a grant for A can't even confirm B exists. All data reads go through
  the **service client filtered by aircraft id** (RLS does not apply to OAuth
  tokens — the N1 lesson). `logAccess()` writes `oauth_access_log`; `rateLimit()`
  is a per-client in-memory bucket (ponytail: per-instance; move to a shared
  counter if needed — `API_V1_RATE_PER_MIN`, default 120).
- **Endpoints:** `GET /api/v1/aircraft` (grant-scoped list; identity always,
  full details with `aircraft:read`) + per-aircraft
  `/airworthiness` (AD + inspection status, urgency, current hours, summary),
  `/equipment` (components), `/hours` (current + recent readings), `/oil`
  (samples, oldest→newest, for trending), `/weightbalance` (current + revisions).
  Each is `guard(request, id, scope)` (= authenticate → requireScope →
  requireAircraft) + a service-client query filtered to the aircraft + audit.
- **Leak-proofing E2E** (`e2e/oauth-resource.spec.ts`): token granted only
  aircraft A; asserts B (a real aircraft with an AD) returns 404 across endpoints
  and its data never appears, the list excludes B, an un-requested scope (`oil`)
  → 403, and no token → 401.

## P3 notes (as built)
- **Portal** `/developers` (+ nav item in AccountShell): register an app (name,
  redirect URIs, scopes), list, delete — all via server actions on `oauth_client`
  with **owner-scoped RLS** (no service client). Redirect URIs are validated to an
  exact allowlist (https, or http on localhost; no fragments/wildcards). Apps are
  **public + PKCE** (`is_confidential=false`, no secret shown). Scope constants +
  labels live in `src/lib/oauth/scopes.ts` (shared with the consent screen, no
  oidc-provider import). Edit-in-place deferred (delete + re-register for now).
- **Discovery** `/.well-known/oauth-authorization-server` (RFC 8414) at the root,
  built from `oauthIssuer()` + `OAUTH_SCOPES`; complements oidc-provider's OIDC
  discovery at `${issuer}/.well-known/openid-configuration`.
- **Docs** `/developers/docs`: discovery URLs, the auth-code+PKCE steps, the
  `/api/v1` endpoints, and the scope table.
- **E2E** `e2e/oauth-portal.spec.ts`: RFC8414 responds; register→see→delete an
  app; invalid redirect URI rejected. `/help` gains a "Developer API" section.

## P4 notes (as built)
- **Migration 0034** replaces the never-used `oauth_client.client_secret_hash`
  with `client_secret_cipher`. Confidential secrets are stored **encrypted**
  (AES-256-GCM via `src/lib/crypto.ts`, same as MFB/BYOK secrets), NOT hashed —
  oidc-provider must reproduce the secret to authenticate the client, so it's
  reversible; the `ENCRYPTION_KEY` lives in Secret Manager (DB-only leak safe).
  **Apply 0034 to prod + test before deploy/CI** (the adapter selects the column).
- **Portal:** a "Confidential (server-to-server)" checkbox issues a `client_secret`
  (`randomBytes(32)` base64url), shown **once** at creation; "Rotate secret" on
  the app re-issues it. Public apps are unchanged (PKCE only).
- **Adapter:** confidential clients map to `token_endpoint_auth_method:
  'client_secret_basic'` with the decrypted secret; a confidential client with no
  secret fails closed. Public clients stay `'none'`.
- **Docs:** `/developers/docs` gains a confidential-app section (Basic auth token
  request). **E2E** `e2e/oauth-confidential.spec.ts`: register confidential via
  portal → capture secret → full flow → token with the secret (200) → wrong
  secret (401).
- **MFB bidirectional:** we already push hobbs/tach to MFB as a *client*; MFB
  pulling airworthiness *from us* is now possible via a confidential client + the
  P2 `/api/v1` API. Actual onboarding + two-way sync needs MFB's side (external).

## Open items to verify before P1b
- Pin `oidc-provider` v9 API: the exact `Adapter` interface (find/upsert/destroy/
  revokeByGrantId/consume) and `oidc_payloads` columns — adjust the migration if
  the reference schema differs (additive).
- Running oidc-provider inside Next route handlers (it's an http framework) —
  mount via a catch-all `/oauth/[...oidc]` handler bridging Web ↔ Node req/res.
