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
| **A. MFB → MTL** | **hobbs / tach** high-watermark push | **MFB** (client of MTL, `hours:write`) | 🟢 MTL endpoint live; MFB builds the push (sketch below). Old per-user pull still live, being retired |
| **B. MTL → MFB** | **Airworthiness** (AD/inspection status, due dates), equipment, hours, oil, W&B | **MFB** (client of MTL) | ✅ live (MFB pulls via `Update from MyTailLog`) |

"Bidirectional" = A + B. Both now run over the **same MTL grant** (MFB is the
OAuth client of MTL in both directions); A just adds the `hours:write` scope.

---

## Direction A — hours (MFB → MTL)

**Now: MFB pushes** (2026-07). MFB is already an MTL OAuth client (Direction B);
adding the **`hours:write`** scope lets it POST hobbs/tach to MTL with the same
grant. MFB's nightly job finds any aircraft whose latest ending hobbs/tach beat
its last-seen value and, for each MTL-tracking user, pushes to:

```
POST /api/v1/aircraft/{id}/hours          Authorization: Bearer <access_token>
{ "hobbs": 947.7, "reading_date": "2026-07-14", "external_ref": "<flight id>" }
```

**hobbs and tach are independent timelines.** They can advance on different
flights (log hobbs on one, tach on another; or different club pilots), so push
each meter as its **own** reading with that meter's date + flight id — not merged.
Send them in one call with the batch form:

```
{ "readings": [
  { "hobbs": 947.7, "reading_date": "2026-07-16", "external_ref": "<hobbs flight id>" },
  { "tach":  1180.4, "reading_date": "2026-07-12", "external_ref": "<tach flight id>" }
] }
```

Idempotent on `(aircraft, source="myflightbook", external_ref)` — reuse the flight
id as `external_ref` and repeat/multi-user pushes collapse to one row. `{id}` is
the MTL aircraft id from `GET /api/v1/aircraft`. MTL tracks a single hobbs + single
tach (the maintenance meters), so twin-engine second meters have no home today.

**Read-back — the reconciliation.** Tach is the maintenance meter but is logged
rarely; hobbs shows up on nearly every flight. MTL derives the aircraft's own
hobbs↔tach ratio and **projects an estimated current tach from the latest hobbs**,
so hobbs-only pushes still keep a usable current-tach. Both are exposed:

```
GET /api/v1/aircraft/{id}/hours  →  {
  current_hours,                              // = current_tach.value (back-compat)
  current_tach:  { value, estimated, rough, as_of },   // estimated=projected from hobbs
  current_hobbs: { value, estimated, rough, as_of },
  readings: [ … ]
}
```

`/airworthiness` carries the same `current_tach` / `current_hobbs`; its inspection/
AD urgency is judged on the (possibly estimated) tach.

**Was: MTL pulls.** Each MTL user registered their **own** MFB OAuth app under
Profile → MyFlightBook and MTL pulled recent flights (`src/lib/myflightbook.ts` +
`src/lib/mfbSync.ts`, manual button + daily cron). The push removes that
per-user-app friction; the pull can be retired once the push is adopted.

### MFB-side push sketch (suggested)

Two prerequisites on MFB's side: (1) add **`hours:write`** to the authorize scope
string (users re-consent once — the MTL consent screen shows "read and update");
(2) a small **`MTLWatermark`** table `(username, idaircraft, hobbs, tach,
latestFlightID, latestFlightDate)` for "only push what's new" — same shape as the
existing `externalmaintenance`/TachTime state.

```csharp
// Nightly: push new hobbs/tach high-water marks to MyTailLog for every user who
// authorized MTL with hours:write. Idempotent on MTL's side (upsert on
// external_ref), so re-runs and multi-user overlaps are safe.
public static async Task PushHoursToMyTailLog(string host)
{
    foreach (string username in UsersWithMyTailLogToken())          // pref MyTailLogClient.TokenPrefKey exists
    {
        Profile pf = MyFlightbook.Profile.GetUser(username);
        var client = new MyTailLogClient(pf.GetPreferenceForKey<AuthorizationState>(MyTailLogClient.TokenPrefKey), host);

        // The aircraft this user shares with MTL, once → cache the id↔tail map.
        // GET /api/v1/aircraft  → [{ id, tail_number }]
        IEnumerable<MTLAircraft> shared = await client.GetMyTailLogAircraft();

        UserAircraft ua = new UserAircraft(username);
        foreach (Aircraft ac in ua.GetAircraftForUser().Where(a => a.IsRealAircraft))
        {
            // Match MFB aircraft → MTL aircraft by normalized N-number (same as TachTime).
            MTLAircraft mtl = shared.FirstOrDefault(m =>
                Aircraft.NormalizeTail(m.TailNumber).CompareCurrentCultureIgnoreCase(ac.NormalizedTail) == 0);
            if (mtl == null) continue;                                 // not tracked in MTL

            // Current high-water marks for THIS user in THIS aircraft (existing helpers).
            decimal hobbs = AircraftUtility.HighWaterMarkHobbsForUserInAircraft(ac.AircraftID, username);
            decimal tach  = AircraftUtility.HighWaterMarkTachForUserInAircraft(ac.AircraftID, username);

            MTLWatermark seen = MTLWatermark.ForUserAircraft(username, ac.AircraftID);  // new MFB table
            bool newHobbs = hobbs > seen.Hobbs, newTach = tach > seen.Tach;
            if (!newHobbs && !newTach) continue;                       // nothing new since last run

            // POST /api/v1/aircraft/{id}/hours — send only meters that advanced;
            // reuse the ending flight's id as external_ref → idempotent.
            await client.PushHours(mtl.Id, new
            {
                hobbs        = newHobbs ? (decimal?)hobbs : null,
                tach         = newTach  ? (decimal?)tach  : null,
                reading_date = seen.LatestFlightDate.ToString("yyyy-MM-dd"),
                external_ref = seen.LatestFlightID.ToString(),
            });

            seen.Update(hobbs, tach); seen.Commit();                   // advance last-seen
        }
    }
}

// In MyTailLogClient — mirrors the other authenticated calls.
public async Task PushHours(string mtlAircraftId, object body)
{
    await RefreshAsNeeded(/* username */);                            // offline_access refresh + persist
    string json = JsonConvert.SerializeObject(body,
        new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore });
    var content = new StringContent(json, Encoding.UTF8, "application/json");
    await SharedHttpClient.GetResponseForAuthenticatedUri(
        new Uri($"{dataEndpointBase}aircraft/{mtlAircraftId}/hours"),
        AuthState.AccessToken, HttpMethod.Post, content,
        resp => {
            if (!resp.IsSuccessStatusCode)
                throw new InvalidOperationException($"MTL push {(int)resp.StatusCode}: {resp.Content.ReadAsStringAsync().Result}");
            return true;
        });
}
```

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
| `hours:write` | Append a hobbs/tach reading (`POST /api/v1/aircraft/{id}/hours`) — the MFB→MTL push |
| `oil:read` | Oil-analysis samples + wear-metal trend |
| `weightbalance:read` | Empty weight/arm/moment, max gross |

**Never shared:** transcribed log entries, scanned images, user PII beyond the
grant, or any aircraft not consented. The **only** write is appending hobbs/tach
readings via `hours:write` (POST above) — scoped to the granted aircraft, opt-in
per consent; nothing else is writable.

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
- **B6. Reciprocity (Direction A): RESOLVED → MFB push.** MFB pushes hobbs/tach
  via `hours:write` on the same MTL grant (sketch above); the per-user MFB-pull is
  being retired. Remaining: MFB adds `hours:write` to its authorize scope + builds
  the nightly push + watermark table.
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
