# Proposal: MyTailLog as a native external-maintenance provider in MyFlightBook

**To:** Eric Berman & the MyFlightBook team
**From:** Ian Amit (MyTailLog)
**Date:** 2026-07-13
**Status:** proposal for architecture review — no PR opened against MyFlightbookWeb yet, by request.

---

## Summary

MyTailLog (MTL) is an aircraft **logbook-digitization + maintenance/airworthiness tracker** — it transcribes scanned paper logbooks into structured records and forecasts AD/inspection compliance. That is the same category as **TachTime**, which MyFlightBook (MFB) already integrates as a first-party **external-maintenance provider**.

We propose implementing **MyTailLog as a second `ExternalMaintenanceSourceID` provider, mirroring the existing `TachTime` integration file-for-file.** MFB already ships the whole framework — `OAuthClientBase`, the `externalmaintenance` table, the map into the native `MaintenanceRecord` + `DeadlineCurrency`, high-water-tach seeding, and the Preferences → Maintenance connect UI. MTL's existing OAuth 2.1 API maps onto TachTime's provider contract almost 1:1, so the MFB-side change is roughly **2 new files + 4 small edits**.

This lands MTL data in MFB's **native** maintenance records and deadline math (driving currency, reminders, club views, and the aircraft's "current tach"), rather than as a bolt-on badge.

---

## Why the TachTime pattern (not a bespoke client)

MFB's partner model has two shapes; TachTime uses the second, and so should MTL:

| | MFB as **provider** (their OAuth server) | MFB as **client** (pulls from a partner) |
|---|---|---|
| Examples | mobile apps, Google-Sheets scripts | Leon, CloudAhoy, **TachTime** |
| Fit for MTL | ✗ (a read-only badge only) | ✅ **this** — deep native integration |

`TachTimeClient : OAuthClientBase` (`AppCode/oAuthServices/TachTimeClient.cs`), on a user-triggered refresh (`UpdateMaintenanceFromTachTime(username)`):

1. PKCE-OAuth pull from TachTime (`/oauth/authorize`, `/oauth/token`; token cached in the user's MFB prefs).
2. `GET /v1/aircraft` → match to MFB aircraft **by normalized N-number**.
3. Per aircraft: pull compliance + current tach.
4. Land it two ways — (a) full-replace an `externalmaintenance` row (`TachTimeRecord.FDeleteForUser` → `FCommit`) whose `highWaterTach`/`highWaterHobbs` feed MFB's deadline aggregates; (b) `ToMaintenanceRecord(ac.Maintenance)` → `ac.UpdateMaintenanceForUser(mr, user)` → `ac.Commit(user)` to move the native last-annual / 100-hr / etc.

MyTailLog's v1 API lines up directly:

| TachTime (shipped in MFB) | MyTailLog (exists today) |
|---|---|
| `auth.tachtime.app/oauth/authorize` · `/token` | `mytaillog.com/api/oidc/auth` · `/api/oidc/token` (PKCE / S256, OAuth 2.1) |
| `GET /v1/aircraft` (cursor) | `GET /api/v1/aircraft` → `{ id, tail_number }` |
| `GET /v1/aircraft/{id}` (tach, last entry) | `GET /api/v1/aircraft/{id}/hours` → `current_hours` (**= tach**), `readings[]` |
| `GET /v1/aircraft/{id}/compliance` | `GET /api/v1/aircraft/{id}/airworthiness` → ADs + inspections + `urgency` + `summary` |
| scopes `tachtime:*:read` | scopes `airworthiness:read hours:read aircraft:read` (+ `offline_access`) |
| `ExternalMaintenanceSourceID.TachTime` | **new** `ExternalMaintenanceSourceID.MyTailLog` |

Status/urgency and due-type enums line up too: TachTime `status {current, due_soon, overdue, unknown}` ← MTL `urgency {none, upcoming, due_soon, overdue}`; TachTime `due_type {calendar, time_in_service}` ← MTL `next_due_date` vs `next_due_hours`.

---

## Data flow

```
   MyTailLog (OAuth 2.1 AS + RS)                    MyFlightBook (OAuth client)
   ─────────────────────────────                    ────────────────────────────
   /api/oidc/auth  ───consent (per aircraft)───►  MyTailLogClient (PKCE)
   /api/oidc/token ◄──code + verifier──────────   token cached in user prefs
   GET /api/v1/aircraft ───────────────────────►  match by N-number
   GET /api/v1/aircraft/{id}/airworthiness ─────►  MyTailLogRecord (externalmaintenance)
   GET /api/v1/aircraft/{id}/hours ─────────────►      ├─ highWaterTach/Hobbs → deadline math
                                                       └─ ToMaintenanceRecord → ac.Maintenance
                                                          (LastAnnual, Last100, LastELT, …)
                                                          + DeadlineCurrency for ADs
```

Refresh is user-triggered from **Preferences → Maintenance**, exactly like TachTime (an optional daily background sweep can be added later).

---

## Field mapping (`/airworthiness` → MFB)

| MTL inspection `kind` | MFB `MaintenanceRecord` field | basis |
|---|---|---|
| `annual` | `LastAnnual` | `last_done_date` |
| `transponder` | `LastTransponder` | date |
| `pitot_static` | `LastStatic` **and** `LastAltimeter` | date (MTL folds 91.411 altimeter + static) |
| `elt` | `LastELT` | date |
| `vor` | `LastVOR` | date |
| `hundred_hour` | `Last100` | `last_done_hours` |
| `oil_change` | `LastOilChange` | `last_done_hours` |
| `engine_tbo` | `LastNewEngine` | `last_done_hours` (best-effort) |
| `airworthiness_directives[]`, `prop_overhaul`, other advisory | `IExternalCurrencyStatus` via `MyTailLogRecord.GetExternalCurrencies()` — live display + sync summary; **not** written as native `DeadlineCurrency` (same as TachTime `additional_items`) | `next_due_date` / `next_due_hours` |
| `current_hours` | `externalmaintenance.highWaterTach` | seeds MFB "current tach" |
| latest `readings[].hobbs` | `externalmaintenance.highWaterHobbs` | optional |

Merge with **"later of"** semantics (never regress a date/hours already newer in MFB), matching `TachTimeCompliance.ToMaintenanceRecord`.

---

## The proposed MFB-side PR

**Title:** `Add MyTailLog as an external maintenance provider (parallel to TachTime)`

**File tree**
```
MyFlightbook.AircraftSupport/
  ExternalMaintenanceRecord.cs   (edit: +enum member +registry factory entry)
  MyTailLog.cs                   (new: DTOs + MyTailLogRecord + ToMaintenanceRecord)
                                 (namespace MyFlightbook.AircraftSupport.Maintenance.MyTailLog)
MyFlightbook.Web/AppCode/oAuthServices/
  MyTailLogClient.cs             (new: OAuth client + sync; namespace MyFlightbook.OAuth.MyTailLog)
MyFlightbook.Web/Areas/mvc/Controllers/
  oAuthController.cs             (edit: +3 actions in the External Maintenance region)
MyFlightbook.Web/Areas/mvc/Views/Prefs/
  _prefExternalMaint.cshtml      (edit: +MyTailLog block)
MyFlightbook.Web/  LocalConfig   (edit: +MyTailLogClientID/Secret [+ …Sandbox])
Support/
  mytaillogsupport.sql           (new: seed localconfig keys)
```

> **Fidelity note.** The C# below was reconciled against the actual TachTime
> implementation on `master` (`OAuthClientBase.cs`, `TachTimeClient.cs`,
> `ExternalMaintenanceRecord.cs`, `TachTime.cs`, `oAuthController.cs`,
> `_prefExternalMaint.cshtml`) and follows the same idioms: LocalConfig-key ctor,
> two-ctor `(host)`/`(state, host)` pattern, PKCE via `PKCEPair` +
> `AuthorizationUri`/`PendingCodeVerifier`, tokens in user prefs, HTTP via
> `SharedHttpClient.GetResponseForAuthenticatedUri`, `IExternalCurrencyStatus`
> for ADs, and the `ExternalMaintenanceRegistry` factory. A few member names we
> could not read byte-for-byte are marked `// verify vs TachTime` — they should
> match the reference client verbatim.

### 1. `ExternalMaintenanceRecord.cs` — register the source (enum + factory)

```csharp
// namespace MyFlightbook.AircraftSupport.Maintenance
public enum ExternalMaintenanceSourceID
{
    Unknown = 0,
    TachTime = 1,
    MyTailLog = 2,   // + new
}

// In ExternalMaintenanceRegistry._map, add one factory entry alongside TachTime:
{ ExternalMaintenanceSourceID.MyTailLog, (user, aircraftID, json, hwTach, hwHobbs, ts) =>
    new MyTailLog.MyTailLogRecord(user, aircraftID, json)
        { HighWaterTach = hwTach, HighWaterHobbs = hwHobbs, LastUpdated = ts } },
```

### 2. `MyFlightbook.AircraftSupport/MyTailLog.cs` — DTOs + record + mapper

```csharp
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using System;
using System.Collections.Generic;
using System.Linq;

namespace MyFlightbook.AircraftSupport.Maintenance.MyTailLog
{
    // ---- Wire model: MyTailLog GET /api/v1/aircraft/{id}/airworthiness ----
    public class MTLAirworthiness
    {
        [JsonProperty("aircraft_id")] public string AircraftId { get; set; }
        [JsonProperty("tail_number")] public string TailNumber { get; set; }
        [JsonProperty("current_hours")] public decimal CurrentHours { get; set; } // = tach
        [JsonProperty("summary")] public MTLSummary Summary { get; set; }
        [JsonProperty("inspections")] public List<MTLInspection> Inspections { get; set; } = new List<MTLInspection>();
        [JsonProperty("airworthiness_directives")] public List<MTLDirective> ADs { get; set; } = new List<MTLDirective>();

        // Monotonic merge into MFB's native record — advances a deadline, never
        // regresses it. Same shape/contract as TachTimeCompliance.ToMaintenanceRecord.
        public MaintenanceRecord ToMaintenanceRecord(MaintenanceRecord mr = null)
        {
            MaintenanceRecord r = new MaintenanceRecord(mr);
            foreach (MTLInspection i in Inspections)
            {
                switch (i.Kind)
                {
                    case "annual":       r.LastAnnual       = DateIfLater(i.LastDoneDate, r.LastAnnual); break;
                    case "transponder":  r.LastTransponder  = DateIfLater(i.LastDoneDate, r.LastTransponder); break;
                    case "pitot_static": r.LastStatic       = DateIfLater(i.LastDoneDate, r.LastStatic);
                                         r.LastAltimeter    = DateIfLater(i.LastDoneDate, r.LastAltimeter); break;
                    case "elt":          r.LastELT          = DateIfLater(i.LastDoneDate, r.LastELT); break;
                    case "vor":          r.LastVOR          = DateIfLater(i.LastDoneDate, r.LastVOR); break;
                    case "hundred_hour": if (i.LastDoneHours > r.Last100)      r.Last100      = i.LastDoneHours; break;
                    case "oil_change":   if (i.LastDoneHours > r.LastOilChange) r.LastOilChange = i.LastDoneHours; break;
                    case "engine_tbo":   if (i.LastDoneHours > r.LastNewEngine) r.LastNewEngine = i.LastDoneHours; break;
                }
            }
            return r;
        }

        private static DateTime DateIfLater(DateTime? proposed, DateTime def) =>
            (proposed.HasValue && proposed.Value.ToUniversalTime().Date > def) ? proposed.Value.ToUniversalTime().Date : def;
    }

    public class MTLSummary
    {
        [JsonProperty("airworthy")] public bool Airworthy { get; set; }
        [JsonProperty("overdue")] public int Overdue { get; set; }
        [JsonProperty("due_soon")] public int DueSoon { get; set; }
    }

    public class MTLInspection
    {
        // annual|transponder|pitot_static|elt|vor|hundred_hour|oil_change|engine_tbo|prop_overhaul
        [JsonProperty("kind")] public string Kind { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("last_done_date")] public DateTime? LastDoneDate { get; set; }
        [JsonProperty("last_done_hours")] public decimal LastDoneHours { get; set; }
        [JsonProperty("next_due_date")] public DateTime? NextDueDate { get; set; }
        [JsonProperty("next_due_hours")] public decimal NextDueHours { get; set; }
        [JsonProperty("urgency")] public string Urgency { get; set; } // overdue|due_soon|upcoming|none
    }

    // ADs (and any advisory item) implement IExternalCurrencyStatus, exactly like
    // TachTimeAdditionalInspection — surfaced via GetExternalCurrencies(), NOT
    // written as native DeadlineCurrency rows.
    [Serializable]
    public class MTLDirective : IExternalCurrencyStatus
    {
        [JsonProperty("reference")] public string Reference { get; set; }
        [JsonProperty("title")] public string Title { get; set; }
        [JsonProperty("last_done_date")] public DateTime? DateDone { get; set; }
        [JsonProperty("last_done_hours")] public decimal HoursDone { get; set; }
        [JsonProperty("next_due_date")] public DateTime? DateDue { get; set; }
        [JsonProperty("next_due_hours")] public decimal HoursDue { get; set; }
        [JsonProperty("urgency")] public string Urgency { get; set; }
        public bool UsesHours => !DateDue.HasValue && HoursDue > 0;
        public string Name => string.IsNullOrEmpty(Title) ? Reference : $"{Reference} — {Title}";
    }

    public class MyTailLogRecord : ExternalMaintenanceRecord
    {
        public MyTailLogRecord() : base() { DataSource = ExternalMaintenanceSourceID.MyTailLog; }
        public override string SourceName => "MyTailLog";
        private MTLAirworthiness Data { get; set; }
        public override object DataAsType => Data;

        public MyTailLogRecord(string username, int aircraftID, string json) : this()
        {
            Username = username; AircraftID = aircraftID; JSONData = json;
            Data = JsonConvert.DeserializeObject<MTLAirworthiness>(json);
        }

        public MyTailLogRecord(string username, int aircraftID, MTLAirworthiness data) : this()
        {
            Username = username; AircraftID = aircraftID; Data = data;
            JSONData = JsonConvert.SerializeObject(data, new JsonSerializerSettings {
                DefaultValueHandling = DefaultValueHandling.Ignore, Formatting = Formatting.Indented });
            HighWaterTach = data.CurrentHours;   // MTL current tach → MFB current tach
            HighWaterHobbs = 0;                  // (optional: set from /hours readings)
        }

        public override IEnumerable<IExternalCurrencyStatus> GetExternalCurrencies() =>
            Data?.ADs ?? Enumerable.Empty<IExternalCurrencyStatus>();
    }
}
```

### 3. `AppCode/oAuthServices/MyTailLogClient.cs` — OAuth client + sync

```csharp
using MyFlightbook.AircraftSupport;
using MyFlightbook.AircraftSupport.Maintenance;
using MyFlightbook.AircraftSupport.Maintenance.MyTailLog;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web;

namespace MyFlightbook.OAuth.MyTailLog
{
    public class MyTailLogClient : OAuthClientBase
    {
        private const string clientConfigKey        = "MyTailLogClientID";
        private const string clientConfigKeySandbox = "MyTailLogClientIDSandbox";
        private const string clientSecretConfigKey        = "MyTailLogClientSecret";
        private const string clientSecretConfigKeySandbox = "MyTailLogClientSecretSandbox";
        private const string authEndpoint  = "https://mytaillog.com/api/oidc/auth";
        private const string tokenEndpoint = "https://mytaillog.com/api/oidc/token";
        private const string dataEndpointBase = "https://mytaillog.com/api/v1/";
        private static readonly string[] scopes = new string[] {
            "openid", "offline_access", "airworthiness:read", "hours:read", "aircraft:read" };
        public const string TokenPrefKey = "MyTailLogToken";
        private const string szCachedCodeVerifier = "myTailLogCodeVerifier";

        private static bool UseSandbox(string host) => !Branding.CurrentBrand.MatchesHost(host);

        // Same LocalConfig-key ctor + two-ctor pattern as TachTimeClient.
        public MyTailLogClient(string host) : base(
            UseSandbox(host) ? clientConfigKeySandbox : clientConfigKey,
            UseSandbox(host) ? clientSecretConfigKeySandbox : clientSecretConfigKey,
            authEndpoint, tokenEndpoint, scopes) { }

        public MyTailLogClient(IAuthorizationState state, string host) : this(host) { AuthState = state; }

        // PKCE authorize URL — identical construction to TachTimeClient.AuthorizationUri
        // (stash the PKCEPair on the profile; S256 challenge). // verify vs TachTime
        public Uri AuthorizationUri(string szRedir, string state, IUserProfile pf)
        {
            PKCEPair pkce = new PKCEPair();
            pf.AssociatedData[szCachedCodeVerifier] = pkce;
            var q = HttpUtility.ParseQueryString(string.Empty);
            q["response_type"] = "code";
            q["client_id"] = AppKey;
            q["redirect_uri"] = szRedir;
            q["scope"] = string.Join(" ", scopes);
            q["code_challenge"] = pkce.Challenge;            // verify member name vs PKCEPair
            q["code_challenge_method"] = "S256";
            if (!string.IsNullOrEmpty(state)) q["state"] = state;
            return new UriBuilder(oAuth2AuthorizeEndpoint) { Query = q.ToString() }.Uri;
        }

        public static PKCEPair PendingCodeVerifier(IUserProfile pf) =>
            (PKCEPair)pf.AssociatedData[szCachedCodeVerifier];

        // Preferences → Maintenance "Sync now". Per-tail summary, like TachTime.
        public async Task<IDictionary<string, IEnumerable<string>>> UpdateMaintenanceFromMyTailLog(string username)
        {
            Dictionary<string, IEnumerable<string>> dResult = new Dictionary<string, IEnumerable<string>>();
            try
            {
                await RefreshAsNeeded(username);   // refresh via offline_access, persist to TokenPrefKey

                MTLAircraftList acList = await GetJson<MTLAircraftList>(new Uri(dataEndpointBase + "aircraft"));

                UserAircraft ua = new UserAircraft(username);
                List<string> unknown = new List<string>();

                MyTailLogRecord.FDeleteForUser(username, ExternalMaintenanceSourceID.MyTailLog);  // wipe old, then re-add

                foreach (MTLAircraftRef mtl in acList.Aircraft)
                {
                    Aircraft ac = ua.FindMatching(a => !a.HideFromSelection &&
                        a.NormalizedTail.CompareCurrentCultureIgnoreCase(Aircraft.NormalizeTail(mtl.TailNumber)) == 0)
                        .FirstOrDefault();
                    if (ac == null) { unknown.Add(mtl.TailNumber); continue; }

                    MTLAirworthiness aw = await GetJson<MTLAirworthiness>(
                        new Uri($"{dataEndpointBase}aircraft/{mtl.Id}/airworthiness"));

                    new MyTailLogRecord(username, ac.AircraftID, aw).FCommit();   // raw JSON + high-water tach

                    MaintenanceRecord mr = aw.ToMaintenanceRecord(ac.Maintenance);
                    ac.UpdateMaintenanceForUser(mr, ac.Maintenance, username);
                    ac.Commit(username);

                    List<string> summary = new List<string>();
                    summary.AddRange(ac.GetMaintenanceChanges());                 // human diff (as TachTime)
                    summary.AddRange((aw.ADs ?? new List<MTLDirective>()).Select(ad => ad.Name));
                    dResult[ac.TailNumber] = summary;
                }
                if (unknown.Any())
                    dResult[Resources.Aircraft.TachTimeUnknownAircraft] = unknown;  // or a MyTailLog-specific string
            }
            catch (Exception e) when (!(e is OutOfMemoryException))
            {
                dResult[Resources.Aircraft.TachTimeError] = new[] { e.Message };
            }
            return dResult;
        }

        public static void Revoke(string username) =>
            ExternalMaintenanceRecord.FDeleteForUser(username, ExternalMaintenanceSourceID.MyTailLog);

        // ---- helpers mirroring the TachTime call chain ----
        private async Task<T> GetJson<T>(Uri uri) =>
            await SharedHttpClient.GetResponseForAuthenticatedUri(uri, AuthState.AccessToken, HttpMethod.Get, response =>
            {
                string s = response.Content.ReadAsStringAsync().Result;
                if (!response.IsSuccessStatusCode)
                    throw new InvalidOperationException($"Error fetching {uri}: {response.StatusCode}, message: {s}");
                return JsonConvert.DeserializeObject<T>(s);
            });

        private async Task RefreshAsNeeded(string username)   // verify vs TachTime.RefreshAsNeeded
        {
            if (CheckAccessToken()) return;
            IAuthorizationState st = await RefreshAccessToken(AuthState.RefreshToken, null, oAuth2TokenEndpoint);
            Profile pf = MyFlightbook.Profile.GetUser(username);
            if (st == null) { pf.SetPreferenceForKey(TokenPrefKey, null, true); throw new UnauthorizedAccessException(); }
            AuthState = st;
            pf.SetPreferenceForKey(TokenPrefKey, st);
        }
    }

    public class MTLAircraftList { [JsonProperty("aircraft")] public List<MTLAircraftRef> Aircraft { get; set; } = new List<MTLAircraftRef>(); }
    public class MTLAircraftRef {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("tail_number")] public string TailNumber { get; set; } }
}
```

### 4. `oAuthController.cs` — Redir / Revoke / Refresh (the TachTime trio)

Add to the `#region External Maintenance apps`. All `[Authorize]`, no `[HttpPost]`,
returning to `~/mvc/Prefs?pane=maint` (the authorize URL is built in the view, §5):

```csharp
[Authorize]
public async Task<ActionResult> MyTailLogRedir(string code)
{
    Profile pf = MyFlightbook.Profile.GetUser(User.Identity.Name);
    PKCEPair pkce = MyTailLogClient.PendingCodeVerifier(pf);
    IAuthorizationState authState = await new MyTailLogClient(Request.Url.Host)
        .ConvertToken(Url.Action("MyTailLogRedir", "oAuth", new { area = "mvc" }, Request.Url.Scheme), code, pkce.CodeVerifier);
    pf.SetPreferenceForKey(MyTailLogClient.TokenPrefKey, authState);
    return Redirect("~/mvc/Prefs?pane=maint");
}

[Authorize]
public ActionResult MyTailLogRevoke()
{
    Profile pf = MyFlightbook.Profile.GetUser(User.Identity.Name);
    if (!pf.PreferenceExists(MyTailLogClient.TokenPrefKey))
        throw new InvalidOperationException("Can't revoke a non-existent authtoken!");
    MyTailLogClient.Revoke(User.Identity.Name);                        // deletes cached maint rows
    pf.SetPreferenceForKey(MyTailLogClient.TokenPrefKey, null, true);  // clears token pref
    return Redirect("~/mvc/Prefs?pane=maint");
}

[Authorize]
public async Task<ActionResult> MyTailLogRefresh()
{
    return await SafeOp(async () =>
    {
        Profile pf = MyFlightbook.Profile.GetUser(User.Identity.Name);
        if (!pf.PreferenceExists(MyTailLogClient.TokenPrefKey))
            throw new UnauthorizedAccessException();
        ViewBag.summaryLog = await new MyTailLogClient(
            pf.GetPreferenceForKey<AuthorizationState>(MyTailLogClient.TokenPrefKey), Request.Url.Host)
            .UpdateMaintenanceFromMyTailLog(User.Identity.Name);
        return PartialView("_actionSummary");
    });
}
```

### 5. `_prefExternalMaint.cshtml` — add a MyTailLog row

Mirrors the existing TachTime `<tr>` (connect/disconnect via `PreferenceExists`;
authorize URL built inline). Display strings should go through
`Branding.ReBrand(Resources.Preferences.*)` with new resource entries.

```cshtml
@using MyFlightbook.OAuth.MyTailLog
...
<tr class="imgMiddle">
    <td class="imgMiddle"><img style="height:48px;" src='@("~/images/mytaillog.svg".ToAbsolute())' alt="MyTailLog" /></td>
    <td>
        @if (m_pf.PreferenceExists(MyTailLogClient.TokenPrefKey))
        {
            <p>Connected to MyTailLog.</p>
            <a href="@Url.Action("MyTailLogRevoke", "oAuth")">Disconnect MyTailLog</a>
        }
        else
        {
            Uri authLink = new MyTailLogClient(Request.Url.Host)
                .AuthorizationUri(Url.Action("MyTailLogRedir", "oAuth", new { area = "mvc" }, Request.Url.Scheme), string.Empty, m_pf);
            <a href="@(authLink)">Authorize MyTailLog</a>
        }
    </td>
</tr>
```
("Sync now" follows the same path TachTime uses to invoke `…Refresh` → `_actionSummary`.)

### 6. `LocalConfig` + `Support/mytaillogsupport.sql`

Add the four keys (values filled per deployment / brand), mirroring
`tachtimesupport.sql`:

```sql
REPLACE INTO localconfig (ckey, cvalue) VALUES
  ('MyTailLogClientID',''),        ('MyTailLogClientSecret',''),
  ('MyTailLogClientIDSandbox',''), ('MyTailLogClientSecretSandbox','');
```
The shared `externalmaintenance` table already stores any source via its `sourceID`
column — no new table or migration.

---

## MyTailLog-side work

1. **Register MFB as a confidential client** at `mytaillog.com/developers`: redirect URI
   `https://myflightbook.com/logbook/mvc/oAuth/MyTailLogRedir`, scopes
   `airworthiness:read hours:read aircraft:read offline_access` → we hand MFB `client_id` /
   `client_secret`. *(Configuration only — no code.)*
2. **Sandbox client** for MFB's integration testing, pointed at a staging MTL, if MFB wants one.

### Queued MTL-side API enhancement (ready to ship after architecture sync)

Not built yet — **pending final architecture agreement with MFB**, then we deploy it on the MTL
side so it's live before MFB wires up the mapper:

- Add `current_tach`, `current_hobbs`, and the `estimated` / `rough` flags to the
  `/api/v1/aircraft/{id}/airworthiness` and `/hours` responses. These are already computed
  server-side by MTL's hobbs↔tach reconciliation (`getCurrentTach`); exposing them lets MFB
  show e.g. *"tach 1,180 (est. from hobbs — actual may differ slightly)"* rather than an
  unqualified number, and seed both `highWaterTach` and `highWaterHobbs` cleanly.
- Optional: a per-aircraft `updated_at` / `ETag` on `/airworthiness` so a daily MFB sweep can
  skip unchanged aircraft.

Scope is ~10 lines per route; it is additive and backward-compatible (new fields only), so it
can ship independently once the response contract is confirmed with MFB.

---

## Direction A reciprocity (the existing MFB → MTL pull)

Today MTL already pulls each user's flight **hobbs/tach** from MFB (`readaircraft readflight`,
tach via custom property 96) to advance maintenance hours. It works, but currently asks **each
user to register their own MFB OAuth app**. MFB's own partner model would let MTL register **one**
confidential client and have users simply consent — same as every other MFB partner. If MFB is
open to issuing MTL an app-level client, we'd switch to that and drop the per-user-app step
(separate, smaller change on the MTL side).

---

## Open questions for MFB

1. Open to a second `ExternalMaintenanceSourceID` provider (MyTailLog) on the TachTime pattern? (Additive; no change to TachTime.)
2. Confirm the few `// verify vs TachTime` members in §3 — the `PKCEPair.Challenge`/`CodeVerifier` accessor names and the exact `RefreshAsNeeded` refresh-and-persist shape — so the client subclass is byte-compatible with the reference.
3. Confirm ADs/advisory items should surface as `IExternalCurrencyStatus` (as drafted, matching TachTime `additional_items`), or whether you'd prefer them promoted to native `DeadlineCurrency` rows.
4. Provisioning: MFB registers as an MTL confidential client (recommended), and — for Direction A — would MFB issue MTL an app-level MFB client?
5. Sandbox: point MFB's integration tests at a staging MTL, or is a throwaway prod client sufficient?

---

## Testing / rollout

- **Unit:** `MyTailLogRecord.ToMaintenanceRecord` mapping (each kind → field; "later of" merge; hours vs date) — pure, no network, matches the existing `MyFlightbook.*.Tests` style.
- **Integration:** MFB's OAuth "playpen" testbed against a throwaway MTL confidential client; assert one aircraft's deadlines + high-water tach land.
- **Rollout:** ships dark until `MyTailLogClientID` is configured (the connect panel hides when the key is empty), so it is a no-op for any deployment that doesn't set it — the same gating TachTime uses.

---

## Reference

- MyFlightBook source reviewed: `AppCode/oAuthServices/TachTimeClient.cs`, `OAuthClientBase.cs`,
  `OAuthWebService.cs`, `Areas/mvc/Controllers/oAuthController.cs`,
  `MyFlightbook.AircraftSupport/{Aircraft,Maintenance,ExternalMaintenanceRecord,TachTime}.cs`,
  `AppCode/Aircraft/AircraftUtility.cs`, `AppCode/Flights/Currency/Deadline.cs`,
  `Support/tachtimesupport.sql`.
- MyTailLog API: `docs/mfb-integration.md` (bidirectional overview), `docs/oauth-api-plan.md`
  (OAuth 2.1 AS/RS), `mytaillog.com/developers/docs`.
- Brand assets for a "Connect MyTailLog" button: `mytaillog.com/brand/` (see `public/brand/README.md`).
