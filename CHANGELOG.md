# Changelog

Notable changes to MyTailLog, newest first. Versions are calendar-based
(`APP_VERSION`, shown in the app header). Started 2026-07; earlier history is in
the git log.

## 2026.08

### Fixed — an ADS-B estimate could outrank your own recorded hours
- **An accepted ADS-B estimate kept beating a later MyFlightBook sync of the same
  flights.** Reported on N9363V: the app showed 964.4 hobbs (the estimate) while
  MyFlightBook had 965.1 for those flights. Tach was right, which is what made it
  visible — that estimate carried no tach, so it never competed there.
- The principle was always "your own records win; ADS-B is only a fallback
  observer", but that was enforced only where suggestions are *raised*, never
  where current hours are *chosen*. The `estimated` flag existed and was set
  correctly; the meter-selection code simply never looked at it.
- The tie-break made it systematic rather than unlucky: on a shared date the
  reading closest to the previous value wins, and ADS-B airborne time under-reads
  by construction (it excludes taxi and runup) — so the estimate was reliably the
  closer one. A rule meant to reject outliers was quietly picking the guess over
  the measurement, every time.
- An estimate is now discarded as soon as any real reading reaches or passes it:
  meters are cumulative, so a measured value already contains whatever the
  estimate was guessing at. An estimate **above** every real reading still
  counts — that's the case it exists for.

### Added — The iOS app can now tell you if you're legal, and record what you did
- **Status, computed on the device.** Current tach/hobbs with provenance, then
  every maintenance item and recurring AD worst-first — offline, in the hangar,
  where there's no signal. The aircraft list flags the worst one so a problem is
  visible before you open anything. None of the airworthiness math is a second
  implementation: the app imports the *same* pure compliance code the web runs,
  because two copies is how a phone and a website start disagreeing about
  whether an annual is due.
- **Record it there and then** — meter readings (pre-filled, and it warns when
  the value is lower than the last one, which is either a meter swap or a typo),
  oil added, squawks, and marking a recurring item done. All queue on device and
  upload on the next sync.
- **The VOR check writes a real record.** 91.171(d) wants the place, the bearing
  error and a signature, so the app asks for them and writes a log entry as well
  as resetting the counter. A tick-box that only moved a due-date would leave you
  non-compliant while telling you that you were fine.
- **AROW documents offline** — airworthiness certificate, registration, POH/AFM
  and weight & balance pinned together for a ramp check, each either present or
  explicitly missing. **PDFs open in the app**, page by page: they used to say
  "open on the web app", which is the wrong answer on a taxiway, and a
  registration or airworthiness certificate is usually a PDF.
- **Nothing recorded disappears quietly.** A "Waiting to upload" list shows what
  hasn't reached the server and keeps the reason on anything refused. Retries are
  safe: every queued action carries an id that becomes the server row's key, so a
  re-send after a dropped connection writes nothing the second time.

### Fixed — ADS-B passive hours never actually ran
- **The sweep had not made a single successful call since it shipped.** Every
  daily run failed with a 10-second timeout, for every opted-in aircraft, and no
  flight was ever recorded. The cause was not our code: **OpenSky blackholes
  Google Cloud egress.** Measured from a Cloud Run job in us-east4 *and*
  us-central1, DNS resolves but the TCP handshake to their host never completes
  (`connect=0.000000s`, dropped rather than refused), while `api.github.com`
  answers in 27 ms from the same container. Raising the timeout could never have
  fixed a blackhole.
- **The sweep moved to a GitHub Actions job**, which reaches OpenSky in under a
  second. The runner holds **no database credentials**: it asks `/api/cron/adsb`
  which aircraft to look up and what windows to ask for, then posts the results
  back for the server to write. Opt-in is re-checked at write time, so switching
  ADS-B off mid-sweep still means no rows.
- **Overlapping observations no longer inflate the estimate.** OpenSky emits more
  than one record for a single flight when receiver coverage breaks up — the real
  data that surfaced this had a 23-minute segment sitting inside a 72-minute one.
  Summing them reported 3.4 h for 3.0 h of flying, on the very number we suggest
  adding to a tach. Overlapping spans are now merged and counted once.
- **/help now says when the check runs** (17:30 UTC, daily) and that it looks back
  three days, so a flight this afternoon is expected tomorrow rather than tonight.

### Changed — A landing page that says what the thing does
- **The front page listed six features; the app has closer to thirty**, and the
  ones people actually pick it for — that it is free with no billing code in it
  at all, that it is MIT-licensed and self-hostable, that extraction is
  automated and self-serve rather than a transcription service you mail your
  books to, that it answers questions instead of just storing files, and that it
  backs itself up to a Dropbox or Google Drive *you* own — were absent
  altogether. They are on the page now.
- **It opens with a scenario rather than a slogan**, and sets data the way the
  app does: tail numbers, tach readings, AD numbers and dates in the mono
  instrument face, inline in the prose.
- **All six product screenshots are used**, each at full width under the
  paragraph it illustrates, instead of four rotating in a carousel that showed
  one at a time. They are captures of dense UI, so a half-column reduced most of
  them to a dark smudge; at full width every one is readable. The carousel
  component is gone.
- **Starting is a primary action again.** Account creation is the main call to
  action for signed-out visitors (`/login` handles sign-in *and* sign-up);
  signed-in visitors get a route straight to their hangar in the same places.
- **The other public pages are properly reachable** — FAQ, How it compares,
  Coming from MyFBO, Help, the API docs and What's new are in a top bar and a
  footer, rather than one line of small print. The same two additions were made
  to the shared marketing footer.
- **It says what the product does not do**, in its own section: no accuracy
  percentage (nothing measures one — you get per-field confidence and the scan
  beside the entry), no scheduling/dispatch/invoicing/billing, iOS is a
  TestFlight beta with no Android app, and CSV import is CSV only. The
  index-not-the-legal-record notice (14 CFR 91.417) stays.

### Added — Import a CSV
- **Bring maintenance history in from a spreadsheet or another platform**, without
  printing it to PDF first. Pick the logbook, upload the CSV, and the entries are
  created directly.
- **The columns are mapped, not the rows.** There is no importer per vendor and
  there won't be: one AI pass reads your header plus a few sample rows and
  proposes what each column means — "Tach Out" → Tach, "A&P" → Signature,
  "Invoice #" → don't import. You confirm that **once**, and every row is then
  converted in plain code. The same file always imports the same way, and a
  wrong import is explainable by pointing at the mapping rather than at a model.
- **Dates are never guessed.** `03/04/2026` is 3 April or 4 March depending on
  who exported it, and getting it wrong would shift a maintenance date by up to
  eleven months — which then drives annual-due, 100-hour and AD compliance. The
  whole date column is scanned and the first date with a day past the 12th
  settles the reading for the entire file; you're asked only when *every* row
  genuinely reads both ways, and then you're shown what the first few dates
  become each way. A column that's internally inconsistent is reported as a
  broken file rather than quietly coerced.
- **You see the count before anything is written**, along with every row that
  can't be read and why. An unreadable date or an implausible tach fails that one
  row instead of being imported as a zero, and never takes the rest of the file
  with it.
- **Imported entries land unconfirmed** and show up in Review all grouped as
  "imported (no scan)" — a foreign spreadsheet hasn't earned the right to drive a
  reminder or a forecast until you've looked at it. Importing into an aircraft
  that already has entries is the usual way to create duplicates, so the finish
  line points at Fix duplicates.
- Reads what spreadsheets actually emit: comma, semicolon and tab separated
  files, a UTF-8 BOM, CRLF, and quoted fields containing commas or line breaks.
  CSV only (save an XLSX as CSV in one step), up to 5 MB / 5,000 rows.

### Added — Cloud backups to Google Drive
- **Google Drive joins Dropbox as a backup destination**, and you can connect
  **both at once** — each has its own cadence, schedule and history, so a
  problem with one doesn't take the other down with it. That's the difference
  between a backup and a second copy.
- **We ask for the narrowest Drive permission that exists**: access to *files
  this app creates*, and nothing else. Your existing Drive is invisible to us by
  construction, not by promise. Backups land in a `MyTailLog` folder, nested per
  aircraft, and we only ever *add* — nothing is renamed, replaced or deleted.
- Uploads are **resumable**: a dropped connection part-way through a large
  archive picks up from exactly where the server actually got to, rather than
  starting again or — worse — quietly writing a truncated file.

### Added — Automatic cloud backups (Dropbox)
- **Your records back themselves up to storage you own.** Connect Dropbox from
  Profile and the same re-importable `.zip` you can download by hand — records
  plus every original scan — is pushed to your account **monthly or quarterly**,
  one dated file per aircraft at `MyTailLog/<TAIL>/<date>-<TAIL>.zip`.
- **App-folder access only.** We ask for permission to write files in our own
  folder and nothing else, so the rest of your Dropbox stays invisible to us —
  and we only ever *add* files. Nothing in your account is renamed, replaced, or
  deleted; retention is your call.
- **You can tell whether it's working.** Profile shows the last run, its result,
  and its size, and you get an email if two runs in a row fail — a backup that
  quietly stopped six months ago is worse than none.
- Very large aircraft are reported as **too large to upload** rather than failing
  mysteriously, with a pointer to the manual download.

### Added — AD discovery by model
- **Find ADs by your actual variant, not just your make.** The AD explorer now
  searches by **model** and by free-text **keyword** alongside the existing
  manufacturer-wide search (both run — the make is the broad net, the model is
  the sharp one).
- **Every result lists the models the AD names**, parsed from its title and
  summary, with the ones covering your model highlighted; those results sort
  first. You can see whether your variant is actually named instead of guessing
  from the manufacturer.
- **Pre-1994 legacy ADs now surface.** Model and keyword searches also query the
  FAA's Dynamic Regulatory System, whose archive reaches back past the Federal
  Register's 1994 start. If either source is unreachable the other still returns.
- **"Track this AD" in one click**, or with a **recurrence**: one-time vs
  recurring, an interval in hours and/or calendar months, and a next-due — which
  feeds the maintenance forecast and the Status grid like any other tracked AD.
- Search results remain a **starting point, not a determination**: the parsed
  model list can be incomplete, and applicability often turns on serial numbers.
  A scanned A&P AD compliance report is still the ground truth.

### Added — Maintenance due dates you can plan around
- **"Due in 38.4 hours" now also reads "due ≈ 14 Mar."** Hours-based items —
  100-hour, hour-interval ADs, oil, component TBO — are projected onto a calendar
  date from how much you actually fly, using your own logged tach readings.
- Every projection carries a **confidence** (from how many readings back it and
  how far apart they are) and shows the window it was computed over. Below the
  threshold you see hours only, exactly as before — one reading never becomes a
  forecast.
- **Intervals spanning a meter replacement are excluded**, so a tach swapped in
  at airframe total can't inflate the rate. Projections are planning estimates,
  never a substitute for the record: a calendar limit like the annual is always
  the date it says.

### Added — Maintenance summary (print / PDF)
- A one-page **maintenance summary** per aircraft — status at a glance,
  inspections and recurring ADs, open squawks, full AD/SB compliance, installed
  equipment, and current weight & balance. The document you hand a buyer, an
  insurer, or an IA at annual. Figures come from the same engine as the Status
  page, so the summary can't disagree with the app.
- Every `.zip` backup now carries a **`README.txt` manifest** describing each
  file and column, so the archive still explains itself years later.

### Added — What's new
- This changelog is now published at **[/whats-new](https://mytaillog.com/whats-new)**,
  and the version chip in the header links to it.

### Added — Questions, comparisons, and getting your records out
- New public pages: **/faq** (what it costs, what happens to your data, who can
  see it, what happens if the project stops), **/compare** (how six different
  ways of keeping records actually stack up, including where MyTailLog loses),
  and **/switch/myfbo** for owners whose platform is shutting down.

### Added — Attach documents to log entries
- Link a **Records Vault** document to a specific log entry — a 337, an 8130-3,
  an invoice — from either review flow, and see the linked entry from the Vault
  side. Attachments show on the timeline and travel with the `.zip` backup.

### Fixed
- **Restoring a backup that contained an attached document failed outright.**
  The importer remapped every other entry reference but not the document's, so
  the restore hit a foreign-key violation and rolled back the whole archive —
  not just the attachment.
- **Removing an attachment deleted the file.** The only control on an attached
  document deleted it from the Vault instead of unlinking it. It now unlinks and
  the document stays.
- **Printing came out nearly blank.** The design tokens are dark-only and
  browsers drop backgrounds, so printed pages rendered pale ink on white; the
  app shell also clipped print output to a single screenful.

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
