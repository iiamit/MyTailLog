# MyTailLog ↔ MyFlightBook — bidirectional integration

**Status:** MyTailLog endpoints and MyFlightBook's two-way client are implemented;
production execution of MyFlightBook's scheduled push has not been verified here.
**Owner (MyTailLog):** Ian Amit. **Scope:** two-way data sync between
a shared owner/operator's MyFlightBook (MFB) logbook and their MyTailLog (MTL)
maintenance records.

MTL is an aircraft **logbook digitization + maintenance/airworthiness tracker**;
MFB is a **pilot logbook**. They describe the same aircraft from two angles
(flying vs. maintenance), joined by **tail number**. MyFlightBook reads maintenance
data from MyTailLog and writes flight-hour readings back with the owner's consent.

---

## The two directions

| Direction | Data | Who is the OAuth client | Status |
|---|---|---|---|
| **A. MFB → MTL** | **hobbs / tach** high-watermark push | **MFB** (client of MTL, `hours:write`) | Implemented in both codebases; scheduled production execution and individual deliveries must be checked. Optional per-user pull remains available |
| **B. MTL → MFB** | **Airworthiness** (AD/inspection status, due dates, current tach) | **MFB** (client of MTL) | Implemented (MFB pulls via `Update from MyTailLog`) |

"Bidirectional" = A + B. Both use the **same MTL grant** (MFB is the OAuth client
of MTL in both directions), provided that grant includes `hours:write`. In
MyFlightBook, authorizing MyTailLog stores the token; the user must then run
**Update from MyTailLog** on My Aircraft to create the external-maintenance
record used by the hours-push job. A grant alone is not proof that hours arrived.

---

## Direction A — hours (MFB → MTL)

**Implemented in MFB code** (2026-07). MFB requests **`hours:write`** alongside
read scopes and can POST hobbs/tach to MTL with the same grant. Its local scheduled
endpoint finds aircraft whose latest ending hobbs/tach beat
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

**Optional legacy path: MTL pulls.** Each MTL user registers their **own** MFB OAuth app under
Profile → MyFlightBook and MTL pulls recent flights (`src/lib/myflightbook.ts` +
`src/lib/mfbSync.ts`, manual button + daily cron). This is independent of the
MyFlightBook-side grant and is not required for the intended two-way path.

### Original MFB-side push sketch (historical proposal)

MyFlightBook implemented `hours:write` and uses its existing `externalmaintenance`
high-water marks. The sketch below is not its deployed implementation. Current
source: [MyTailLogClient.cs](https://github.com/ericberman/MyFlightbookWeb/blob/master/MyFlightbook.Web/AppCode/oAuthServices/MyTailLogClient.cs),
[ExternalMaintenanceRecord.cs](https://github.com/ericberman/MyFlightbookWeb/blob/master/MyFlightbook.AircraftSupport/ExternalMaintenanceRecord.cs).

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

### Scopes (per aircraft or account-wide consent)
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
aircraft (by tail) plus the owner's MTL consent. The MyFlightBook-side connection
uses one MTL grant for both directions when it includes `hours:write`. The
optional MTL-side pull uses a separate MFB OAuth grant.

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

## Coordination and verification checklist

- Confirm the MFB grant includes `hours:write`; older grants may need re-consent.
- Run Update from MyTailLog on MFB's My Aircraft page to create its
  `externalmaintenance` row; the push query only scans aircraft with such a row.
- Confirm MFB's local `PushHighWaterMaintenance` task runs in production and
  check MTL's `oauth_access_log` for successful or denied `hours:write` calls.
- Fix the published MFB client: the Hobbs reading currently takes its date and
  flight ID from `Tach1` instead of `Hobbs1`; the MFB query also assumes a tach
  high-water row exists when it converts nullable tach fields.
- Jointly test a user with Hobbs-only flights, separate latest Hobbs/tach flights,
  replaced tach, and an aircraft shared by multiple MFB users.

---

## Brand assets

For a "Connect MyTailLog" button, a connected-apps listing, or a partner page,
logos live at `https://mytaillog.com/brand/` (SVG + transparent PNG; mark-only and
full lockup, light- and dark-background variants). Use the **light-background**
lockup on MyFlightBook's site. See `public/brand/README.md` for colors, type, and
clearspace.

## MTL-side status

MTL's OAuth and `/api/v1` endpoints are shipped and CI-tested. The MFB client
implements both directions; the production scheduler and end-to-end delivery
still need verification. Reference: `docs/oauth-api-plan.md`.
