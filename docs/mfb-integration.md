# MyTailLog ↔ MyFlightBook — bidirectional integration

**Status:** draft for coordination with the MyFlightBook team.
**Owner (MyTailLog):** Ian Amit. **Scope:** two-way, read-only data sync between
a shared owner/operator's MyFlightBook (MFB) logbook and their MyTailLog (MTL)
maintenance records.

MTL is an aircraft **logbook digitization + maintenance/airworthiness tracker**;
MFB is a **pilot logbook**. They describe the same aircraft from two angles
(flying vs. maintenance), joined by **tail number**. Neither writes to the other.

---

## The two directions

| Direction | Data | Who is the OAuth client | Status |
|---|---|---|---|
| **A. MFB → MTL** | Latest recorded **hobbs / tach** per aircraft | **MTL** (client of MFB) | ✅ live |
| **B. MTL → MFB** | **Airworthiness** (AD/inspection status, due dates), equipment, hours, oil, W&B | **MFB** (client of MTL) | 🟡 ready on MTL side; needs MFB to build the client |

"Bidirectional" = A + B. This doc assumes A stays as-is and specifies B — what
MFB needs to consume MTL's new OAuth 2.1 API.

---

## Direction A — hours (MFB → MTL), already live

Per **MyTailLog help → MyFlightBook**. Each MTL user registers **their own** MFB
OAuth app (client id + secret, stored encrypted) under Profile → MyFlightBook,
connects, and MTL pulls their MFB aircraft + recent flights, matching **by tail
number** and recording the latest hobbs/tach as an `hours_reading`. Endpoints and
parsing live in `src/lib/myflightbook.ts`; the sync in `src/lib/mfbSync.ts`
(manual button + daily cron).

No change requested here — included for the full picture. Open question for MFB
below (A1) on whether a cleaner per-app credential is preferable to per-user apps.

---

## Direction B — airworthiness (MTL → MFB), new

MTL is now an **OAuth 2.1 Authorization Server + Resource Server**. MFB becomes an
OAuth **client** that, with each aircraft owner's consent, reads that aircraft's
airworthiness data from MTL.

### 1. Discovery
- OAuth AS metadata (RFC 8414): `https://mytaillog.com/.well-known/oauth-authorization-server`
- OIDC discovery: `https://mytaillog.com/api/oidc/.well-known/openid-configuration`

Both advertise the endpoints, scopes, and `code_challenge_methods_supported: ["S256"]`.

### 2. Register a client
Two options — **MFB's preference is open question B1**:
- **Self-serve:** register at `https://mytaillog.com/developers` (any MTL account).
  Pick **Confidential (server-to-server)** to get a `client_id` + `client_secret`.
- **We provision:** MTL creates the confidential client and hands MFB the
  credentials out of band.

Redirect URI(s) are an **exact allowlist** (https only, no wildcards) — MFB
supplies its callback URL(s).

### 3. Authorization — Authorization Code + PKCE (OAuth 2.1)
```
GET https://mytaillog.com/api/oidc/auth
  ?response_type=code
  &client_id=...              # MFB's client
  &redirect_uri=...           # MFB's registered callback
  &scope=openid airworthiness:read
  &code_challenge=BASE64URL(SHA256(verifier))
  &code_challenge_method=S256
```
The MTL owner signs in, **picks which aircraft to share**, and is redirected back
with `?code=…`. Consent is **per aircraft** and revocable (MTL Profile →
Connected apps).

### 4. Token exchange (confidential client → HTTP Basic + PKCE)
```
curl -X POST https://mytaillog.com/api/oidc/token \
  -u CLIENT_ID:CLIENT_SECRET \
  -d grant_type=authorization_code \
  -d code=THE_CODE \
  -d redirect_uri=MFB_CALLBACK \
  -d code_verifier=THE_VERIFIER
```
Add `scope=offline_access` at authorize time to receive a **refresh token** for
long-lived, unattended pulls. Access tokens are ~1h; rotate via the refresh token.

### 5. Read the API
```
Authorization: Bearer ACCESS_TOKEN

GET /api/v1/aircraft                              # the aircraft this token may see
GET /api/v1/aircraft/{id}/airworthiness           # AD + inspection status, due, urgency, current hours, summary
GET /api/v1/aircraft/{id}/equipment               # installed components
GET /api/v1/aircraft/{id}/hours                   # current hours + recent readings
GET /api/v1/aircraft/{id}/oil                     # oil-analysis samples (trending)
GET /api/v1/aircraft/{id}/weightbalance           # current W&B + revisions
```
Errors: `401` bad/expired token · `403` missing scope · `404` aircraft not in
this token's grant (a grant for aircraft A never reveals aircraft B). Rate limit
~120 req/min per client (tunable). Every read is audit-logged for the owner.

Full developer guide: `https://mytaillog.com/developers/docs`.

### Scopes (read-only, per aircraft)
| Scope | Data |
|---|---|
| `airworthiness:read` ⭐ | AD/SB compliance, inspection forecast, next-due, current hours, airworthy summary |
| `aircraft:read` | Tail, make/model, serials, home base |
| `equipment:read` | Installed components (PN/SN, install/removal, life limits) |
| `hours:read` | Current hobbs/tach + recent readings |
| `oil:read` | Oil-analysis samples + wear-metal trend |
| `weightbalance:read` | Empty weight/arm/moment, max gross |

**Never shared:** transcribed log entries, scanned images, user PII beyond the
grant, or any aircraft not consented. **No writes.**

---

## Joining the two sides: tail number

Both directions match on tail, normalized as **uppercase, alphanumerics only**
(`N9363V`, `N-9363-V`, `n9363v` → `N9363V`; see `normalizeTail`). MFB should
apply the same normalization when correlating an MFB aircraft with an MTL
aircraft returned by `GET /api/v1/aircraft` (which includes `tail_number`).

There is **no shared user identity** between the systems: the join is the
aircraft (by tail) plus the owner's explicit consent on each side. A user
connects MFB→MTL under their MTL profile (Direction A) and authorizes MFB→read
under the consent screen (Direction B); the two are independent grants.

---

## Suggested consumption pattern (Direction B)

- Pull `GET /api/v1/aircraft` once per grant to learn `{id, tail_number}`, cache
  the id↔tail map.
- Refresh `airworthiness` on a cadence (e.g., daily, or on the aircraft's MFB
  page view) — the `summary.overdue` / `summary.due_soon` counts and per-item
  `urgency` (`overdue` | `due_soon` | `upcoming` | `none`) are ready to surface.
- Treat responses as a snapshot; MTL is the source of truth for airworthiness.

---

## Security & privacy

- OAuth 2.1: authorization code + PKCE only; no implicit/password grants.
- Confidential client secrets are encrypted at rest on MTL; MFB stores its own
  secret securely and never exposes it to a browser.
- Consent is **per aircraft** and owner-revocable at any time (revocation cuts
  API access immediately).
- Least privilege: request only the scopes MFB will use.

---

## Open questions / coordination checklist (for MFB)

- **B1. Client provisioning:** self-serve at `/developers`, or MTL-provisioned
  credentials? Supply redirect URI(s).
- **B2. Scopes:** which of the six does MFB want for v1? (Airworthiness alone, or
  the full set?)
- **B3. Surface:** where does MTL airworthiness appear in MFB (aircraft page
  badge? maintenance tab?) — informs cadence + which fields matter.
- **B4. Cadence & refresh:** polling interval; want `offline_access` refresh
  tokens for unattended pulls? Is 120 req/min/client enough?
- **B5. Tail normalization:** confirm MFB can match on `[A-Z0-9]`-normalized
  tails; flag any registries where that's ambiguous.
- **B6. Reciprocity (Direction A):** keep MTL's current per-user pull of
  hobbs/tach, or would MFB prefer a cleaner shared-app credential / a push?
- **B7. Environments:** need a staging/sandbox MTL for MFB's integration testing,
  or is a throwaway confidential client on prod sufficient?

---

## Brand assets

For a "Connect MyTailLog" button, a connected-apps listing, or a partner page,
logos live at `https://mytaillog.com/brand/` (SVG + transparent PNG; mark-only and
full lockup, light- and dark-background variants). Use the **light-background**
lockup on MyFlightBook's site. See `public/brand/README.md` for colors, type, and
clearspace.

## MTL-side status

Everything for Direction B is shipped and CI-tested (authorize → consent → token
→ `/api/v1`, including the "grant for A never returns B" leak-proofing and
confidential-secret verification). Reference: `docs/oauth-api-plan.md`. Remaining
work is **coordination** with MFB (this checklist) + a joint end-to-end test.
