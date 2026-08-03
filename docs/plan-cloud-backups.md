# Plan — automatic backups to the user's own cloud storage

Scheduled, unattended `.zip` backups pushed to a storage account **the user
owns** (Dropbox, Google Drive, Box, …), at most once a month.

Reading of "frequency up to once a month": **monthly is the ceiling**, so the
cadence options are `off` / `monthly` / `quarterly`. That bound is load-bearing —
it's what makes a full archive per run affordable. Nothing below assumes we can
go more often, and a couple of decisions would change if we ever wanted weekly.

---

## 1. What already exists, and the one thing that blocks reuse

We already produce exactly the artifact this feature needs to ship: the
`.zip` backup (`BACKUP_FORMAT_VERSION 1` — `manifest.json`, `data.json`,
`scans/`, `docs/`, `README.txt`), and critically it **re-imports**
(`lib/backup/import.ts`, guarded by `e2e/backup-roundtrip.spec.ts`). A backup
nobody can restore is theatre; ours is proven by a test that actually restores.

**The blocker:** `lib/backup/export.ts` runs **entirely in the browser**. Its own
header says so, and it:

- pulls every blob over HTTP through `/api/document/{id}` and `/api/page/{id}/image`,
- assembles **the whole archive in memory** via `fflate.zip(...)` and returns a `Blob`,
- carries a `ponytail:` note conceding that memory ceiling.

An unattended backup runs with no browser present, so this has to be reachable
server-side. That's the bulk of the work — not the OAuth.

Reusable as-is: `lib/storage.ts` `getBlob()` (backend-agnostic server-side read),
the whole `lib/backup/format.ts` contract, `lib/crypto.ts` (AES-256-GCM), the
`private`-schema + `SECURITY DEFINER` token pattern from migration 0047, the
MyFlightBook OAuth-client shape in `lib/myflightbook.ts`, and the
Cloud Scheduler → `Bearer CRON_SECRET` cron gate.

---

## 2. Binding constraints (verified, not assumed)

| Fact | Where checked | Consequence |
| --- | --- | --- |
| **`memoryMiB: 1024`** | `apphosting.yaml` `runConfig` | A 1 GB instance cannot hold a large archive. **Streaming is mandatory**, not an optimisation. |
| **`maxInstances: 2`** | same | Backups share the fleet with live traffic. Must run off-peak and be time-boxed. |
| **Cron `maxDuration = 300`** | `api/cron/daily/route.ts:20` | One request ≈ 5 minutes. `runConfig` exposes no `timeoutSeconds` key, so **assume 300 s is the hard ceiling** until proven otherwise. |
| Daily cron is **already time-pressured** | comment at `route.ts:48` — the ADS-B sweep runs last and stops at the budget | Backups need their **own** route and Scheduler job, not a fourth pass on the daily one. |
| **`fflate` already exposes `Zip` / `ZipPassThrough` / `AsyncZipDeflate`** | verified in `node_modules` | Streaming ZIP with **no new dependency**. |
| Page JPEGs ~1–3 MB; documents capped at 25 MB | `capture/route.ts:15`, `documents/route.ts:15` | A 300-page aircraft ≈ **600 MB**. That's the case that breaks a naive design. |
| Scans are stored at `level: 0` | `backup/export.ts:88` | Zipping is I/O-bound, not CPU-bound — already-compressed JPEGs aren't recompressed. Low CPU contention. |

---

## 3. Providers

Researched 2026-08-02. The differences that matter are **token lifetime** and
**how much bureaucracy stands between us and a working app** — not the upload API,
which is much the same everywhere (start session → append chunks → finish).

| | Dropbox | Google Drive | Box |
| --- | --- | --- | --- |
| **Refresh token** | **Never expires** (`token_access_type=offline`) | Indefinite **once published to Production** | **60 days, single-use, rotates on every refresh** |
| **Scope we'd need** | `files.content.write`, **App folder** access type | **`drive.file`** — per-file, only files we create | App Folder (limited access) |
| **Review burden** | None | **`drive.file` is non-sensitive → no security assessment.** But the app must be *published*, not *Testing* | None |
| **Killer caveat** | — | **In "Testing" status refresh tokens die after 7 days** — fatal for a monthly job | A single failure to persist the rotated token **permanently kills the connection** |
| **Chunked upload** | `upload_session/*`, 150 MB per call | resumable, 256 KB-multiple chunks | `upload_sessions` above 50 MB |
| **Verdict** | **Ship first** | **Second** — biggest audience, one operational prerequisite | **Last, or skip** |

**Confirmed 2026-08-02: Dropbox → Google Drive. Box is dropped.** Cadence
confirmed as `off / monthly / quarterly`.

- **Dropbox first** because it is the only one with no expiry story and no console
  gauntlet. It proves the whole pipeline end to end at the lowest risk.
- **Google Drive second** because it's where most owners actually are, and the
  blocker is operational rather than technical: with only `drive.file` we avoid
  the restricted-scope security assessment entirely, but the OAuth app **must be
  moved to Production publishing status**, or every connection silently dies after
  seven days. That's a prerequisite to schedule, not code to write.
- **Box last.** Its single-use rotating refresh token means a crash between
  "refresh succeeded" and "new token persisted" **permanently breaks the
  connection** and the user must reconnect by hand. That's a real reliability tax
  on a job that runs unattended once a month, for the audience least likely to be
  GA aircraft owners.

### Worth considering instead of Box: an S3-compatible target

One adapter (endpoint + key + secret + bucket) covers **Backblaze B2, Wasabi,
Cloudflare R2, MinIO, and any self-hoster's own bucket**, with *no OAuth at all* —
no app registration, no review, no token rotation, no refresh expiry. For an
MIT-licensed, self-hostable project this is philosophically the best fit and
probably the cheapest adapter of the four to build and to keep working.

It's not what was asked for, so it's a suggestion rather than part of the plan —
but I'd take it over Box.

---

### App-status rules differ per provider — do not generalise from one to the other

This is the detail most likely to cause a silent outage, because the two
providers use the same word for very different things.

**Dropbox — Development status is fine, indefinitely, for a small user base.**
A development-status app behaves *identically* to a production one, and
**token lifetime is unaffected by app status**. The only limits are on how many
accounts may link it. So there is nothing to do here until we grow.

One nuance worth knowing before we get there: linking the **50th user starts a
two-week clock** to apply for and receive production approval. Miss it and the
app's ability to link *additional* users freezes — already-linked users keep
working. So the trigger isn't "apply whenever after 50", it's "apply within two
weeks of 50". (A development app tops out at 500 linked users regardless.)

**Google Drive — Testing status is NOT the equivalent, and would break us.**
An app in Testing publishing status issues **refresh tokens that expire after 7
days**. For a job that runs monthly that is fatal, and it fails *silently*: every
connection dies between runs and the next sweep just reports a failure. Publishing
to **Production** is therefore a functional prerequisite for Phase 2, not a growth
cap to defer. The saving grace is that `drive.file` is non-sensitive, so
publishing needs no security assessment.

**Summary:** Dropbox status limits *how many* users; Google status limits *how
long tokens live*. Only the second one can break a working feature.

## 4. Architecture

```
Cloud Scheduler  ──POST──▶  /api/cron/backup   (Bearer CRON_SECRET)
                                  │
                            due runs, oldest first, within a time budget
                                  │
             ┌────────────────────┴─────────────────────┐
             ▼                                          ▼
   collectBackupData()                          getBlob() per scan/doc
   (shared with the browser export)             (lib/storage.ts, server-side)
             └────────────────┬─────────────────────────┘
                              ▼
                   fflate streaming Zip  ── constant memory ──▶
                              ▼
                   provider adapter: chunked upload session
                              ▼
                   backup_run row: ok / failed + bytes + path
```

**Never buffer the archive.** Blob → ZIP → provider chunk, all streaming. Memory
stays in the low MB regardless of archive size, which is the only way this fits a
1 GB instance.

### The shared seam

Split `exportBackup` so both callers share the part that must not drift:

- **`collectBackupData(supabase, aircraftId)`** → `{ data, manifest }`. Pure row
  collection. **Used by both** the browser export and the server backup, so the
  archive format can never diverge between "the ZIP I downloaded" and "the ZIP in
  my Dropbox". Note the existing order-sensitivity warning at `export.ts:31-34` —
  that bug (PR #98) is exactly why this belongs in one function.
- **Browser path** keeps fetching blobs over the RLS-scoped routes and building in
  memory. It works, it costs us no server time, leave it alone.
- **Server path** reads blobs via `getBlob()` directly (no HTTP hop, no CDN
  egress) and streams into `fflate.Zip`.

### The 300-second problem, handled honestly

A ~600 MB archive will not reliably finish in one 300 s request.

**v1: single-pass streaming with an explicit size guard.** Before starting, sum
the aircraft's blob bytes. Above a configured ceiling (start at **400 MB**), don't
attempt it — mark the run `skipped_too_large` and **tell the user**, with a
pointer to the manual download. A defined, reported failure beats a mystery
timeout at 3 a.m.

Log the measured byte total on every run from day one, so we learn the real size
distribution before building anything more elaborate.

**v2, only if the data says it's needed: two-phase resumable.** Build the archive
into our own GCS bucket (same-region, egress-free, resumable), then upload from
GCS to the provider in chunks across successive cron ticks, persisting
`(session_id, offset)` on `backup_run`. Seekable source ⇒ genuinely resumable.
Then delete the temp object. This is the correct design for large libraries and
also the more expensive one — don't build it on a guess.

### Provider adapter interface

```ts
type BackupProvider = {
  id: "dropbox" | "gdrive" | "box";
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<Tokens>;
  refresh(refreshToken: string): Promise<Tokens>;          // Box: returns a NEW refresh token
  upload(accessToken: string, path: string, body: ReadableStream, size?: number): Promise<{ path: string }>;
};
```

Three implementations behind one interface, mirroring what `myflightbook.ts`
already does for a single provider.

---

## 5. Data model (migration `0049_cloud_backups.sql`)

Tokens follow the **0047 pattern exactly**: ciphertext lives in the `private`
schema, unreachable over the REST API, and is touched only through
`SECURITY DEFINER` functions granted to `service_role`. A column-level `revoke`
does **not** hold in Supabase — migration 0039's comment documents why 0038 was
cosmetic — so relocation is the only thing that actually works.

- **`private.backup_destination`** — `id`, `user_id`, `provider`, `account_label`
  (e.g. the Dropbox email, for the UI), `folder_path`, `access_token_cipher`,
  `refresh_token_cipher`, `expires_at`, `created_at`, `revoked_at`.
- **`public.backup_schedule`** — `id`, `user_id`, `destination_id`, `aircraft_id`
  (null ⇒ all aircraft), `frequency` (`off|monthly|quarterly`), `day_of_month`,
  `next_run_at`, `last_run_at`. RLS via `has_aircraft_access` / owner.
- **`public.backup_run`** — `id`, `schedule_id`, `aircraft_id`, `started_at`,
  `finished_at`, `status` (`running|ok|failed|skipped_too_large`), `bytes`,
  `remote_path`, `error`. RLS-readable by the owner so the UI can show history.
  **Errors must be redacted of anything token-shaped before they're stored** — this
  table is browser-readable by design.

Status for the UI comes from an RPC (`my_backup_destinations()`) returning
`{ provider, account_label, connected, last_run_at, last_status }` — **never the
ciphertext**, exactly as `my_mfb_status()` does today. That's the specific bug
class that made 0047 necessary: the Profile page was selecting the ciphertext
column into the browser.

Add all three tables to the `log_change()` trigger list if they should reach the
iOS client — and remember the 0045 lesson: **new synced tables need adding to both
the trigger list and any re-backfill.**

---

## 6. Scheduling

A dedicated **`/api/cron/backup`** route plus its own Cloud Scheduler job, run
**daily in the small hours**. It is not a fourth pass on the daily cron — that one
is already at its time budget and would starve.

Each tick: select runs where `next_run_at <= now()`, oldest first; process until
the time budget is spent; leave the rest for tomorrow. Monthly cadence means a
one-day slip is invisible.

**Spread the load.** Derive `day_of_month` from a hash of `user_id` (1–28, so it
exists in February). Without this every backup lands on the 1st and two instances
try to move the entire user base's archives at once.

Per-run: claim with a lease (`status='running'`, `started_at`) so a retry can't
double-upload; best-effort per destination with its own `try/catch`, matching how
`runSync`/`runReminders` already isolate failures.

---

## 7. Security

This feature's whole job is **shipping a complete copy of a user's records to a
third party**. It deserves more care than a normal integration, and the
secure-by-default checklist applies in full.

- **Tokens** — `private` schema + `SECURITY DEFINER` + AES-256-GCM, per 0047. Never
  in `database.types.ts`'s `Tables`, never in a client component, never logged.
- **Minimum scope, app-scoped folders.** Dropbox **App folder** and Google
  **`drive.file`** both mean we can only ever see files *we* created. We should not
  be able to read the user's existing Drive, and choosing scopes that make that
  impossible is better than promising not to.
- **Off by default, explicit per-destination consent**, revocable from Profile,
  and revocation must delete the stored tokens rather than just flag a row.
- **CSRF on the callback** — validate `state`, and pin the redirect URI to
  `publicOrigin` rather than a request header. Both patterns already exist in the
  MyFlightBook callback; reuse rather than re-derive.
- **Box's rotating token** — if we build it: persist the new pair in its own
  committed write *before* any upload work, and treat a persist failure as fatal
  to that run. Losing the rotated token permanently breaks the connection.
- **RLS regression test** — add `backup_run` / `backup_schedule` to
  `e2e/rls-isolation.spec.ts`. RLS scopes **rows, not columns**.
- **Redact before storing errors.** A provider 401 body can contain a token.

---

## 8. When it fails

A backup that quietly stopped working six months ago is worse than no backup,
because the user believed they had one.

- Retry once on the next nightly tick; after **two consecutive failures**, email
  the user via the existing Resend path used by reminders.
- Surface **last run, status, and size** in Profile — the honest answer to "is
  this actually working?"
- `skipped_too_large` is a first-class outcome with its own message, not an error.
- **Never delete anything in the user's account.** Write new dated files
  (`MyTailLog/N734DM/2026-08-01-N734DM.zip`) and let them manage retention.
  Automatic pruning of someone else's cloud storage is not a risk worth taking for
  the disk space it saves.

---

## 9. Cost

Per aircraft per month: one full archive. At ~150 MB typical / 600 MB worst case,
100 active aircraft ≈ **15–60 GB/month egress** ≈ **$2–7/month** at GCS rates,
plus a few minutes of Cloud Run time. Not free, not alarming.

If it ever does bite, the lever is **incremental backups** — scans are immutable
and content-addressed, so only `data.json` plus genuinely new blobs need to move.
That's a real design change (restore becomes a merge across archives), which is
why v1 is full archives: self-contained, and restorable by the importer we
already have and already test.

---

## 10. Phasing

| Phase | Scope | Notes |
| --- | --- | --- |
| **0 — DONE** | Extract `collectBackupData()`; add the streaming server-side archive builder + unit tests | No user-visible change. Measured: a **600 MB archive builds with ~95 MB of RSS growth** under a 512 MB heap cap, so memory is bounded rather than proportional — the claim the whole design rests on. |
| **1 — DONE** | Migration 0049; **Dropbox** adapter; connect/revoke UI; `/api/cron/backup`; status + failure email | Shipped in #134. Verified against real Dropbox: 3 archives, 0 failures, 34.6 s. |
| **2 — DONE** | **Google Drive** adapter; migration 0050 made schedules per-destination | Shipped in #136. Verified against real Drive: 3 archives, 0 failures, 31 s, nested under `MyTailLog/`. Both providers run side by side without interfering. |
| **3 — DEFERRED** | **S3-compatible** target (Box was already dropped) | Not needed short or mid term — see below. |
| **4 — DEFERRED** | Two-phase resumable upload | Not needed short or mid term — the telemetry says so; see below. |

### Deferred, and why

Both were always conditional, and the conditions haven't been met. Neither is
cancelled — this records what would have to change for them to be worth building.

**Phase 3 — an S3-compatible target.** Dropbox and Google Drive cover where GA
owners actually keep files, and a user can connect **both** for genuine
redundancy across two companies. An S3 adapter would mainly serve self-hosters
and people who prefer Backblaze/Wasabi/R2. Revisit if self-hosted deployments ask
for it, since they're the constituency with no reason to hold a consumer cloud
account.

**Phase 4 — two-phase resumable upload.** This was explicitly gated on
*"only if phase-1 telemetry shows real archives near the ceiling."* The telemetry
now exists and says no: the **largest real archive is 70 MB against a 400 MB size
guard**, uploading in ~22 s against a 300 s request budget. Roughly 5× headroom
on size and 13× on time. Revisit if `backup_run.bytes` starts showing archives
past ~250 MB, or if `skipped_too_large` rows appear.

Between them these were the two most expensive items on the plan, and both were
deferred on evidence rather than on a guess — which is what the size guard and
the byte logging were added to make possible.

Testing throughout: stub the provider behind an env flag exactly as
`E2E_STUB_AI` and `E2E_STUB_ADSB` do (set only in `playwright.config.ts`'s
`webServer.env`, never in prod), so CI never touches a real cloud account. The
ADS-B work is the cautionary tale here — **a stub that accepts more than
production does is a blindfold**: it let a window that the live API always
rejected pass CI. Whatever the provider refuses (chunk alignment, session
expiry, path rules), the stub must refuse too.

---

## 11. Needs a decision or an account

1. **Provider order** — confirm Dropbox-first, and whether Box is wanted at all
   given §3.
2. **Google Cloud Console** — the OAuth app must be published to **Production**
   with the `drive.file` scope before phase 2 ships. No security assessment
   needed at that scope, but it is not instant.
3. **Dropbox and Box app registrations** — client ID/secret per provider, into
   Secret Manager. Note the naming lesson from `#131`: `apphosting.yaml`'s
   `secret:` key must match the Secret Manager ID **exactly**.
4. **Cadence options** — confirm `off / monthly / quarterly` is the right set.
5. **Size ceiling** — 400 MB is a starting guess; the phase-1 telemetry should set
   the real number.

## 12. Deliberate non-goals

- **Restore *from* the provider.** The archive is already re-importable through the
  existing UI; adding a "restore from Dropbox" path duplicates a working flow to
  save one download.
- **Weekly or daily cadence.** Out of scope by the stated requirement, and monthly
  is what makes full archives affordable.
- **Pruning or otherwise deleting files in the user's cloud account.**
- **Our own encryption layer over the archive.** The data is going to a provider
  the user chose and controls; a passphrase we can't recover would turn a lost
  password into a lost backup. Worth revisiting only if someone asks for it.
