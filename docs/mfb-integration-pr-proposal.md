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
| `airworthiness_directives[]`, `prop_overhaul`, other advisory | `DeadlineCurrency` (custom; Calendar or Hours) | `next_due_date` / `next_due_hours` |
| `current_hours` | `externalmaintenance.highWaterTach` | seeds MFB "current tach" |
| latest `readings[].hobbs` | `externalmaintenance.highWaterHobbs` | optional |

Merge with **"later of"** semantics (never regress a date/hours already newer in MFB), matching `TachTimeCompliance.ToMaintenanceRecord`.

---

## The proposed MFB-side PR

**Title:** `Add MyTailLog as an external maintenance provider (parallel to TachTime)`

**File tree**
```
MyFlightbook.AircraftSupport/
  ExternalMaintenanceRecord.cs         (edit: +enum value)
  MyTailLog.cs                         (new: record + compliance mapper)
MyFlightbook.Web/AppCode/oAuthServices/
  MyTailLogClient.cs                   (new: OAuth client + sync)
MyFlightbook.Web/Areas/mvc/Controllers/
  oAuthController.cs                   (edit: +4 actions)
MyFlightbook.Web/Areas/mvc/Views/Prefs/
  (maint pane)                         (edit: +Connect panel)
MyFlightbook.Web/  LocalConfig         (edit: +client id/secret keys)
Support/
  mytaillogsupport.sql                 (new: seed source + config)
```

> `OAuthClientBase`, `ExternalMaintenanceRecord`, and `MaintenanceRecord` member usages below are transcribed from a read of the current `master`; the two `// CONFIRM` spots are the members we'd verify against source during implementation. Everything else maps to members verified in the repo.

### 1. `ExternalMaintenanceRecord.cs` — register the source

```csharp
public enum ExternalMaintenanceSourceID { Unknown, TachTime, MyTailLog }
```

### 2. `MyFlightbook.AircraftSupport/MyTailLog.cs` — DTOs + mapper

```csharp
using MyFlightbook.Currency;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;

namespace MyFlightbook.MyTailLogSupport
{
    // ---- Wire model: mirrors MyTailLog GET /api/v1/aircraft/{id}/airworthiness ----
    public class MTLAirworthiness
    {
        [JsonProperty("aircraft_id")] public string AircraftId { get; set; }
        [JsonProperty("tail_number")] public string TailNumber { get; set; }
        [JsonProperty("current_hours")] public decimal? CurrentHours { get; set; } // = tach
        [JsonProperty("summary")] public MTLSummary Summary { get; set; }
        [JsonProperty("inspections")] public List<MTLItem> Inspections { get; set; } = new List<MTLItem>();
        [JsonProperty("airworthiness_directives")] public List<MTLItem> ADs { get; set; } = new List<MTLItem>();
    }
    public class MTLSummary
    {
        [JsonProperty("airworthy")] public bool Airworthy { get; set; }
        [JsonProperty("overdue")] public int Overdue { get; set; }
        [JsonProperty("due_soon")] public int DueSoon { get; set; }
    }
    public class MTLItem
    {
        [JsonProperty("kind")] public string Kind { get; set; }
        [JsonProperty("label")] public string Label { get; set; }
        [JsonProperty("reference")] public string Reference { get; set; } // ADs
        [JsonProperty("last_done_date")] public DateTime? LastDoneDate { get; set; }
        [JsonProperty("last_done_hours")] public decimal? LastDoneHours { get; set; }
        [JsonProperty("next_due_date")] public DateTime? NextDueDate { get; set; }
        [JsonProperty("next_due_hours")] public decimal? NextDueHours { get; set; }
        [JsonProperty("urgency")] public string Urgency { get; set; } // overdue|due_soon|upcoming|none
    }

    public class MyTailLogRecord : ExternalMaintenanceRecord
    {
        public MyTailLogRecord() : base() { Source = ExternalMaintenanceSourceID.MyTailLog; }

        public MyTailLogRecord(string username, int idAircraft, MTLAirworthiness aw) : this()
        {
            Username = username;
            AircraftID = idAircraft;
            JsonData = JsonConvert.SerializeObject(aw);
            HighWaterTach = aw.CurrentHours ?? 0M;         // MTL current tach → MFB current tach
            // HighWaterHobbs set by the client from /hours readings (optional)
            LastUpdated = DateTime.UtcNow;
        }

        // "Later of" merge into MFB's native record — never regress a newer value.
        public void ToMaintenanceRecord(MaintenanceRecord mr)
        {
            MTLAirworthiness aw = JsonConvert.DeserializeObject<MTLAirworthiness>(JsonData);
            foreach (MTLItem i in aw.Inspections)
            {
                switch (i.Kind)
                {
                    case "annual":        mr.LastAnnual      = Later(mr.LastAnnual, i.LastDoneDate); break;
                    case "transponder":   mr.LastTransponder = Later(mr.LastTransponder, i.LastDoneDate); break;
                    case "pitot_static":  mr.LastStatic      = Later(mr.LastStatic, i.LastDoneDate);
                                          mr.LastAltimeter   = Later(mr.LastAltimeter, i.LastDoneDate); break;
                    case "elt":           mr.LastELT         = Later(mr.LastELT, i.LastDoneDate); break;
                    case "vor":           mr.LastVOR         = Later(mr.LastVOR, i.LastDoneDate); break;
                    case "hundred_hour":  mr.Last100         = Math.Max(mr.Last100, i.LastDoneHours ?? 0M); break;
                    case "oil_change":    mr.LastOilChange   = Math.Max(mr.LastOilChange, i.LastDoneHours ?? 0M); break;
                    case "engine_tbo":    mr.LastNewEngine   = Math.Max(mr.LastNewEngine, i.LastDoneHours ?? 0M); break;
                }
            }
        }

        // ADs + advisory items with no native slot → custom deadlines, mirroring
        // TachTime's additional_items → IExternalCurrencyStatus path. // CONFIRM member names
        public IEnumerable<DeadlineCurrency> ToDeadlines()
        {
            MTLAirworthiness aw = JsonConvert.DeserializeObject<MTLAirworthiness>(JsonData);
            var outp = new List<DeadlineCurrency>();
            foreach (MTLItem ad in aw.ADs)
            {
                if (ad.NextDueHours.HasValue)
                    outp.Add(new DeadlineCurrency() {
                        Name = $"MyTailLog: {ad.Reference}", AircraftID = AircraftID,
                        AircraftHours = ad.NextDueHours.Value /* Mode → Hours */ });
                else if (ad.NextDueDate.HasValue)
                    outp.Add(new DeadlineCurrency() {
                        Name = $"MyTailLog: {ad.Reference}", AircraftID = AircraftID,
                        Expiration = ad.NextDueDate.Value /* Mode → Calendar */ });
            }
            return outp;
        }

        private static DateTime Later(DateTime a, DateTime? b) =>
            (b.HasValue && b.Value > a) ? b.Value : a;
    }
}
```

### 3. `AppCode/oAuthServices/MyTailLogClient.cs` — OAuth client + sync

```csharp
using MyFlightbook.MyTailLogSupport;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;

namespace MyFlightbook.OAuth.MyTailLog
{
    public class MyTailLogClient : OAuthClientBase   // same base TachTimeClient uses
    {
        private const string szPrefToken   = "MyTailLogToken";
        private const string szCodeVerifier = "myTailLogCodeVerifier";

        // OAuth 2.1 endpoints (verified to exist on the MTL side).
        private const string authEndpoint  = "https://mytaillog.com/api/oidc/auth";
        private const string tokenEndpoint = "https://mytaillog.com/api/oidc/token";
        private const string apiBase       = "https://mytaillog.com/api/v1/";
        private static readonly string[] scopes =
            { "openid", "offline_access", "airworthiness:read", "hours:read", "aircraft:read" };

        public MyTailLogClient(bool sandbox = false) : base(
            new OAuthClientConfig() {
                AuthEndpoint = authEndpoint, TokenEndpoint = tokenEndpoint,
                ClientID = LocalConfig.SettingForKey(sandbox ? "MyTailLogClientIDSandbox" : "MyTailLogClientID"),
                ClientSecret = LocalConfig.SettingForKey(sandbox ? "MyTailLogClientSecretSandbox" : "MyTailLogClientSecret"),
                Scopes = scopes, UsePKCE = true, CodeVerifierPrefKey = szCodeVerifier,
                TokenPrefKey = szPrefToken
            }) { }  // CONFIRM: exact OAuthClientBase ctor / config shape

        // Preferences → Maintenance "Sync now". Returns a per-tail summary string.
        public async Task<string> UpdateMaintenanceFromMyTailLog(string username)
        {
            string tok = await ValidTokenForUser(username);      // base: refresh via offline_access
            var http = AuthedClient(tok);

            var acList = JsonConvert.DeserializeObject<MTLAircraftList>(
                await http.GetStringAsync(apiBase + "aircraft"));

            var summary = new List<string>();
            foreach (var mtl in acList.Aircraft)
            {
                Aircraft ac = MatchByTail(username, mtl.TailNumber);   // NormalizeTail, membership check
                if (ac == null) { summary.Add($"{mtl.TailNumber}: not in your MFB aircraft"); continue; }

                var aw = JsonConvert.DeserializeObject<MTLAirworthiness>(
                    await http.GetStringAsync($"{apiBase}aircraft/{mtl.Id}/airworthiness"));

                var rec = new MyTailLogRecord(username, ac.AircraftID, aw);
                rec.HighWaterHobbs = await LatestHobbs(http, mtl.Id);  // GET .../hours readings
                MyTailLogRecord.FDeleteForUser(username, ac.AircraftID, ExternalMaintenanceSourceID.MyTailLog);
                rec.FCommit();                                          // full-replace, like TachTime

                rec.ToMaintenanceRecord(ac.Maintenance);
                ac.UpdateMaintenanceForUser(ac.Maintenance, username);
                ac.Commit(username);
                foreach (var d in rec.ToDeadlines()) d.FCommit();

                summary.Add($"{mtl.TailNumber}: {aw.Summary.Overdue} overdue, {aw.Summary.DueSoon} due soon");
            }
            return string.Join("\n", summary);
        }

        public void Revoke(string username)   // mirror TachTimeClient.Revoke
        {
            MyTailLogRecord.FDeleteForUser(username, ExternalMaintenanceSourceID.MyTailLog);
            ClearTokenForUser(username, szPrefToken);
        }
    }

    public class MTLAircraftList { [JsonProperty("aircraft")] public List<MTLAircraft> Aircraft { get; set; } }
    public class MTLAircraft {
        [JsonProperty("id")] public string Id { get; set; }
        [JsonProperty("tail_number")] public string TailNumber { get; set; } }
}
```

### 4. `oAuthController.cs` — connect / callback / refresh / revoke

Four actions mirroring `TachTimeRefresh` / `TachTimeRevoke` + the authorize pair:

```csharp
[Authorize] public ActionResult MyTailLogAuthorize()            // → redirect to authEndpoint (PKCE)
[Authorize] public async Task<ActionResult> MyTailLogAuthCallback(string code, string state)  // exchange, cache token
[Authorize][HttpPost] public async Task<ActionResult> MyTailLogRefresh()  // UpdateMaintenanceFromMyTailLog(User.Identity.Name)
[Authorize][HttpPost] public ActionResult MyTailLogRevoke()     // new MyTailLogClient().Revoke(User.Identity.Name)
```

### 5. Prefs → Maintenance pane (view snippet)

```html
<div class="extMaintProvider">
  <img src="~/images/mytaillog.svg" alt="MyTailLog" height="24" />  @* from MTL /brand *@
  @if (Model.MyTailLogConnected) {
    <button formaction="@Url.Action("MyTailLogRefresh","oAuth")">Sync now</button>
    <button formaction="@Url.Action("MyTailLogRevoke","oAuth")">Disconnect</button>
    <span class="note">Last sync: @Model.MyTailLogLastSync</span>
  } else {
    <a class="btn" href="@Url.Action("MyTailLogAuthorize","oAuth")">Connect MyTailLog</a>
  }
</div>
```

### 6. `LocalConfig` + `Support/mytaillogsupport.sql`

```
MyTailLogClientID / MyTailLogClientSecret   (+ …Sandbox)
```
```sql
-- externalmaintenance already keys on sourceID; enum value 2 = MyTailLog.
-- Seed config placeholders (client id/secret filled per deployment):
REPLACE INTO localconfig (ckey, cvalue) VALUES
  ('MyTailLogClientID',''), ('MyTailLogClientSecret','');
```

---

## MyTailLog-side work

1. **Register MFB as a confidential client** at `mytaillog.com/developers`: redirect URI
   `https://myflightbook.com/logbook/mvc/oAuth/MyTailLogAuthCallback`, scopes
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
2. Confirm `OAuthClientBase`'s config/ctor + token-refresh entry points so the client subclass matches house style (the `// CONFIRM` in §3).
3. Confirm the ADs / advisory-item → `DeadlineCurrency` (`IExternalCurrencyStatus`) path (the `// CONFIRM` in §2).
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
