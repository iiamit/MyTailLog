# MyTailLog — documentation digest (for the from-scratch redesign)

Compiled 2026-11-18 from documentation only (no application logic was reviewed).

**Sources read in full:** `README.md`, `PRODUCT.md`, `CHANGELOG.md`, `SECURITY.md`, and in `docs/`: `competitive-squawkfree.md`, `plan-competitive-backlog.md`, `authored-logbook-templates.md`, `mfb-integration.md`, `plan-mfb-single-integration.md`, `plan-cloud-backups.md`, `plan-csv-import.md`, `oauth-api-plan.md`, `onboarding-emails.md`, `social-login.md`, `mobile-and-sync.md`, `marketing-mobile-and-sign-in.md`, `app-store-launch.md`, `e2e-regression-plan.md`, `in-app-updates.md`; `marketing/2026-11-social-launch/README.md` + `reel/narration.txt` / `.srt`.

**Supplementary copy/data extracted (text only, to fill gaps the docs leave):** the in-app Help page copy (`apps/web/src/app/help/page.tsx` — the README calls it the documentation of "every feature and how the pieces affect each other"), visible copy on the landing page, `/demo`, the pre-buy dossier page and the authored-entry composer, and the demo seed `apps/web/scripts/seed-demo.sql`.

**Not read (exist, may matter to you):** `DESIGN.md` (root; design-system doc — "dark only on screen, light only for print"), `docs/design/*` (iOS redesign screens 11–24), `docs/ios-parity/CONTRACT.md` (mobile mutation catalogue), `docs/local-mac-handoff.md`, `docs/mfb-integration-pr-proposal.md`, `docs/mfb-test-backend.md`, the `/faq`, `/compare`, `/switch/myfbo`, `/privacy` pages.

**Latest version:** `2026.11` (calendar versioning, `APP_VERSION`, shown as a chip in the app header that links to `/whats-new`). Changelog started 2026-07. Releases: 2026.07 → 2026.08 → 2026.09 (App Store, Sep 22 2026) → 2026.10 (Android + social sign-in) → 2026.11 (record rooms, day-one status, new sidebar IA, public AD lists).

**Contradictions in the docs you should know about before designing** (flagged again inline):
1. *eSignatures.* README, landing page and PRODUCT.md list eSignatures as explicitly out of scope ("keeps us in 'index of the physical record' territory, avoiding AC 120-78A"). But `docs/authored-logbook-templates.md` (migrations 0061/0062) and live UI copy describe **signed, locked, authored logbook entries** with an email-code "electronic-signature workflow" and printable stickers. The CHANGELOG never announces this feature. Treat it as shipped-but-unpositioned; ask the owner how it should be framed.
2. *Role names.* README says "viewer / contributor"; Help and CHANGELOG say "viewers (read-only) or editors (can contribute)". Same two roles; UI term is **viewer / editor** (plus **owner**).
3. *BYO key.* README/PRODUCT say "bring your own **Anthropic** key"; Help says "Anthropic **or OpenAI** API key" and that the operator selects the shared provider in Admin.
4. *Web camera capture.* README still says "automatic document edge-detection / deskew / crop"; CHANGELOG 2026.08 removed live auto-crop on web (now: phone's native camera + after-the-fact **Crop & clean up**; iOS uses Apple VisionKit scanner).
5. *Competitive table is an August snapshot.* Many "we don't have" rows in `competitive-squawkfree.md` have since shipped (projection, ADS-B, AD-by-model, attachments, /whats-new, native apps, record room).

---

## 1. CAPABILITY CATALOG (what exists today)

Web IA as of 2026.11: aircraft sidebar grouped **Status · Log · Records · Workflows · Manage** (mirrors the phone's tabs; related pages share a sidebar item as tabs; every page keeps its URL). Phone tabs: **Status · Log · Records · Squawks** (+ Ask, Account). Web aircraft routes that exist: `start`, `status`, `annual`, `ask`, `audit`, `capture`, `upload`, `import`, `pages`, `review`, `duplicates`, `timeline`, `entries` (`new`, `[entryId]`), `maintenance`, `compliance` (+`explore`), `equipment`, `weight-balance`, `meters`, `oil-analysis`, `squawks`, `documents`, `summary`, `prebuy`, `export`, `share`, `details`. Account-level: dashboard ("hangar"), `/profile`, `/developers`, `/developers/docs`, `/admin`. Public: `/`, `/demo` (product tour), `/help`, `/faq`, `/compare`, `/switch/myfbo`, `/whats-new` (+RSS), `/ads` and `/ads/<make>/<model>`, owner guides, `/privacy`, `/login`.

### 1.1 Onboarding & aircraft setup
- **Sign up / sign in** — Google, Apple, email magic link, or email + password on web (`/login` handles both sign-in and sign-up). Android: Google + email. iOS: Apple + email (Apple sign-in arrives with the updated App Store build). One account across web and apps.
- **Demo aircraft** — every new account gets fictional **N734DM** (1978 Cessna 172N) auto-shared read-only (user is a *viewer*, not owner). Any shared aircraft, demo included, has **Remove from my dashboard** (removes only your own access).
- **"How did you hear about MyTailLog?"** one-tap card for new accounts; first-party cookie records the tagged link/site of arrival; no third-party analytics.
- **Enroll an aircraft** — type a tail number; **FAA registry lookup** fills make, model, serial, registrant. A tail the registry doesn't know can still be added by hand. Works on web and phone. Creates **five logbooks** automatically: airframe, engine, prop, avionics, Other. Engine/prop serials can be added later via **Edit aircraft details**.
- **Standard Part 91 items seeded** on every new aircraft: annual, transponder, pitot-static, ELT — "so there's something to count down as soon as a date is known."
- **Three-step "status on day one" setup (web)** — (1) today's tach and hobbs, (2) a photo of the page with the last annual sign-off *or just its date*, (3) your status. **You confirm which entry is the annual before it moves anything.** Overview shows **Finish setup** until done. Product success metric: new owner reaches "status ready" (known annual date + current hours) in the first session.
- **Records coverage** (overview) — bars showing how far back each logbook goes and where it skips (replaced page-count tiles).
- **Starting readings** — the meters captured at enrollment; editable later; clearing a meter stops tracking it (tach-only aircraft leave hobbs blank).

### 1.2 Digitize: upload / scan / AI read / review
- **Upload scans** — PDF, JPEG, PNG. Multi-page PDFs split into one page each, in order. PDF rasterization, thumbnails and zip work happen in the browser (server never touches image bytes).
- **Capture (web/PWA)** — opens the phone's own camera app (native autofocus/HDR). No live auto-crop. Blurry/glare-heavy shots flagged before keeping. Pages queue on-device (service worker + IndexedDB) and upload when online. Mark a page **printed vs handwritten** (routes to cheaper vs stronger model; unknown → stronger).
- **Capture into <logbook>** — button on Aircraft → Pages per logbook; camera opens with that logbook preselected.
- **iOS/Android scan** — Apple VisionKit document scanner on iOS (edge detection, perspective correction, B&W look, crop correction before keeping, up to **24 pages per session**). The scan sheet already knows the aircraft, asks only which logbook, says where pages land ("Adds to the end — 24 pages so far"). Wording rule: pages are "saved on your phone" and "upload on the next sync" (never "queued/pending/routes to vision extraction").
- **Crop & clean up (web, post-capture)** — drag corners, rotate, optional **scan look** (mild B&W, preserves faint pencil). **Replaces the stored scan** (and says so; paper remains the legal record); prompts re-extract if the crop changed readability.
- **Extraction** — vision LLM reads a page into structured entries: date, hours (tach/hobbs/AFTT), work performed, parts, AD/SB refs, signature/cert. **Per-field confidence** shown as a percentage on each field; below-threshold fields highlighted. ~2 AI calls per page.
- **Stickers at odd angles** — page read in every orientation; each shop sticker is normally its own entry; unresolved rotated content triggers an automatic second look, then an **amber page-level warning** to compare against paper. **Add an entry the extractor missed** to key one in. Two-page spreads are flagged.
- **Review (single page)** — page image pinned beside editable entries; click image to magnify; **◎ spotlight** beside a field lights a ring on the exact ink the value was read from (stays lit while editing; needs extraction under current model). **Editing an entry marks it confirmed.** Re-extract a page from the review screen (replaces that page's entries). Raw transcription viewable.
- **Review all** — every extracted entry in one scrollable list, scan pinned beside each page's entries; inline edit/confirm; **Confirm N clean** bulk-accepts only entries with high overall score, no flagged field, and not a page-spanning fragment. **Open page ↗** to the single-page screen. Imported (scan-less) entries appear grouped as **"imported (no scan)"** in a full-width single column.
- **Merge page-spanning entry** — an entry running onto the next page merges into the previous one; equipment/AD/document links follow.
- **RULE — review gate:** *unreviewed OCR never moves a compliance signal.* `owner_confirmed` gates whether an entry drives reminders, forecasts, record-room contents. The maintenance forecast is gated to owner-confirmed entries.
- **Ripple from extraction** — extracting a running-maintenance page also (best-effort) proposes equipment installs/removals and advances maintenance last-done dates → can shift equipment list, forecast, Status.
- **Logbook pages view** — every scan grouped by logbook with **Needs review / Processing / ✓ reviewed** status (count comes from server); filter by logbook, "Needs review" filter; sort within a logbook by upload order, entry date, tach or **AFTT** (asc/desc, remembered); airframe pages labelled AFTT (tach shown as AFTT where none written). On phones date/tach fold under each row.
- **Reorder** — ↑/↓ nudges for one page; **Save this order** renumbers the whole logbook to the current sort (offered only with one logbook in view and every page extracted).
- **Multi-select delete** — tick pages or **Select all shown**; confirmation names pages *and* the entries that go with them; selection limited to visible pages.
- **Duplicates & fixes** (editor-only) — groups likely-duplicate scans and entries by date, tach/hobbs, work text; one per group marked **suggested keep**; each row has an Open link. Also flags **mis-keyed meter readings** (value below an earlier reading, e.g. 303 for 3,302; or a huge jump, e.g. 33,303) with a suggested correction → **Accept / edit / Keep mine** (won't re-flag); and a hobbs that's just the tach duplicated → **Clear**.
- **"Other" logbook auto-apply** — A&P documents are classified and *applied* rather than stored as entries: a **W&B sheet → new W&B revision**; an **AD compliance report → ground truth for AD state** (corroborates tracked ADs with a **"✓ A&P report"** badge, creates records for ADs you weren't tracking). The report never overwrites a compliance record whose logbook-derived date is newer.
- **CSV import** (`/aircraft/[id]/import`) — upload → AI proposes a **column** mapping from header + ~5 sample rows ("Tach Out" → Tach, "A&P" → Signature, "Invoice #" → don't import) → user confirms once → preview with count and per-row failures and reasons → import. Rows converted deterministically in code. **Dates never guessed** (first date with day > 12 settles the file; asks only if every row is ambiguous, showing both readings; inconsistent column = broken file). User must pick the target logbook. CSV only; comma/semicolon/tab; ≤ 5 MB / 5,000 rows; maintenance entries only; lands **unconfirmed**; finish line points to Fix duplicates. Editors only (viewer → 403).

### 1.3 Logbook browsing: timeline / search / Ask
- **Timeline & search** — all logbooks merged into one date-ordered timeline, filter by logbook type, full-text search by keyword, part, or AD number ("oil change", "magneto", "AD 2015-19-07"). Every entry links to its source page image. Attached Vault documents show on their entry. (Unattached Vault documents do **not** appear on the timeline.)
- **Ask your logbook** — plain-English Q&A ("When was the last annual?", "Hours since prop overhaul?"); answers drawn only from extracted entries, **cite the specific source entries** (click through). Composer shows the day's remaining answers (mobile). Needs a connection.
- **Mobile history** — entries get a written title + one-line summary (not shouted imported text); the same job from two sources collapses into one marked **"2 merged"**. Scans grouped by logbook with page numbers; swipe page viewer with thumbnail strip; pinch-zoom lightbox.

### 1.4 Compliance: inspections, ADs/SBs, recurring items, forecasting
- **Status** — color-coded card per recurring inspection, maintenance item and AD: **red = overdue, amber = due soon, green = current**; days *and* hours remaining both kept visible; ≈ projected date where supported; each card links to where it's managed. Read-only rollup. **2026.11: missing schedules or meter readings show as "needs information" rather than appearing current; failed loads show a retry instead of a reassuring empty state.** Status, overview, forecast and shared summaries all use the same recorded-limit rules.
- **Mobile Status ("can I fly today?")** — one countdown ring + one verdict sentence ("One item due soon", "Grounded — annual overdue"), then the single item needing action, then everything healthy collapsed into one row. Aircraft list flags the worst item. Computed on-device with the same compliance code as web.
- **Maintenance forecast** — recurring Part 91 items: annual (91.409), transponder (91.413), pitot-static (91.411), ELT (91.207), VOR (91.171), 100-hour, oil, engine TBO, prop overhaul, plus custom items. One-click seed of the standard set; mark done; add your own; edit interval. **Regulatory vs advisory** items distinguished (TBO/overhaul advisory).
  - **Calendar-month rule:** annual/transponder/pitot-static/ELT are due on the *last day of the month*. VOR (30 days) and advisory items count from the exact date.
  - **"Hours counted on" per item:** oil defaults to hobbs; everything else to tach; user-settable. No hobbs on record → falls back to tach. Missing meter is converted via the aircraft's own hobbs↔tach ratio and marked **"est."** — airframe is never estimated (except the "TT and tach never disagreed" fill, marked estimated).
  - 100-hour resets off the later of last 100-hour or last annual. **Update from logs** advances last-done.
- **Projected due dates (≈)** — hours-based items also show "≈ 14 Mar 2027" from the trailing 365 days of logged readings (tach preferred; hobbs fallback is labelled). Confidence: **High** (6+ readings/180+ d), **Medium** (4+/90 d), **Low** (2+/30 d), **None** (no date shown). Hover shows rate + readings used. Never overrides a calendar limit; never decides due-ness or reminder timing; intervals spanning a meter replacement excluded. Shown on Status, forecast, AD rows, reminder emails.
- **AD / SB compliance** — per-AD status (complied / previously complied / does-not-apply), method, date, hours, recurring interval → next-due, and the entry that proves it. Official FAA reference lookup (Federal Register, DRS fallback). ADs referenced in logs but not yet tracked are surfaced. Recurring ADs join forecast + Status.
- **AD Explore** (`/compliance/explore`) — searches by manufacturer (airframe make + every installed equipment make), by model, and by keyword at once; Federal Register + DRS (pre-1994 legacy ADs). Each result lists the models the AD names, yours highlighted and sorted first. **Track this AD** (one-time) or **Track with an interval** (hours and/or calendar months + next-due). Always framed "a starting point, not a determination."
- **Component-conditional ADs** — marking a component removed turns off the directive that only applied because of it, with the reason written down.
- **VOR check** — asks for place, bearing error and signature and writes a real 91.171(d) log entry as well as resetting the counter.
- **Annual prep** (Workflows, new 2026.11) — what comes due before the annual, open squawks for the shop, loose ends (pages awaiting review, records gaps), printable summary one click away.
- **Records gap audit** — advisory heuristics: missing annuals (breaks in the annual chain), long stretches with no entries, recurring ADs never complied/past due. Always "suspected" (a gap may be an unscanned page). Lives under Workflows → Annual prep.
- **Public AD lists** (`/ads/<make>/<model>`, no account) — FAA ADs whose titles/abstracts name a model, newest first, links to Federal Register; popular piston airframes + Lycoming/Continental engines + Hartzell/McCauley props; refreshed weekly; "not an applicability determination."

### 1.5 Aircraft data: equipment, W&B, hours/oil, squawks
- **Installed equipment** — list reconstructed from the logs; installs/removals detected in extraction arrive as **proposals to confirm or reject** (nothing trusted automatically). **Update from logs** rescans full history. Manual install/removal with dates. Fields: name, make, category, PN, SN, install/removal date, life limits, notes.
- **Weight & Balance** — revision history (empty weight, CG arm, moment, max gross, method weighed/computed, reference, reason); latest = current; useful load if max gross entered; enter any two of weight/arm/moment and the third fills in. **Stale banner** when equipment changed after the last revision. "An index of your W&B records, not a loading calculator."
- **Meters & resets** (Log → Hours & oil → Meters & resets) — current tach / hobbs / airframe, each with **as-of date and source** (logbook entry, MyFlightBook sync, entered by hand, ADS-B estimate, starting reading); estimated values labelled with what they were derived from. **Meter replacement**: record date, old final reading, new starting reading → stitched continuous total (multiple replacements allowed). Top bar shows the *face value* the instrument physically reads; countdowns use the stitched total. **Airframe** is a third independent meter (gliders/motorgliders), never derived.
- **Log a flight (mobile)** — steppers, shows delta ("+2.4 hours this flight"), one **Save to logbook** commits meters and oil; either meter may be omitted; warns when a value is lower than the last (meter swap or typo); oil takes any amount.
- **ADS-B passive hours** — opt-in per aircraft, off by default. Daily check (17:30 UTC, 3-day look-back) against OpenSky using only the public ICAO 24-bit address (from FAA registry/adsbdb, or manual; never computed from the N-number). Speaks only about flights after your latest reading: "3 flights totalling ≈4.2 h since your last reading" + suggested meter value + **Record a reading / Dismiss**. Never auto-written; saved as `adsb_estimate`; never compliance evidence; never feeds utilization rate; discarded once any real reading reaches or passes it.
- **Oil analysis** — **Import oil report** (lab PDF or photo; Blackstone, AVLab…); AI reads every sample (dates, hours on oil/engine, wear metals in ppm, oil properties, lab comments). Each metal charted over time against the lab's **universal average** (dashed line); above = amber, ≥2× = red ("a prompt to watch, not a verdict"). Re-import updates in place.
- **Oil consumption** — log top-offs ("added 1.5 qt") with tach/hobbs (prefilled); chart of **burn rate (hours per quart)** on one meter (tach preferred; chart states which); hobbs-only top-offs bridged via the aircraft's measured ratio and marked estimated; unmeasurable top-offs counted and explained.
- **Squawks** — anyone with access (including viewers/shared pilots) reports a discrepancy with severity; open until an editor/owner resolves. Editors/owner can resolve (naming the clearing entry), reopen, edit, delete. Resolved list retained. Mobile severity labels: **Low / Watch / Ground**. Mobile: swipe right to resolve; composer is a sheet.

### 1.6 Documents & hand-offs
- **Records Vault** — typed permanent records: airworthiness certificate, registration, radio station authorization, POH/AFM, W&B, STCs, 337s, 8130-3s, ICAs, manuals. PDF or photo ≤ 25 MB; category + reference number. Searchable by title, type label, reference number, file name. Viewers view/download; editors add/attach/detach/remove.
- **AROW / "Carry aboard" card (mobile)** — airworthiness, registration, POH/AFM, W&B pinned for a ramp check, each present or explicitly missing; PDFs open in-app page by page; documents pinned in the offline cache.
- **Entry ↔ document attachment** — in Review: **+ Link from Vault** or **+ Add file**; **unlink** detaches without deleting. Vault shows the linked record. One entry per document. Travels in the `.zip`.
- **Maintenance summary** (`/summary`, print → PDF) — one page: status at a glance, inspections + recurring ADs, open squawks, full AD/SB table, coming due (with ≈ projections), installed equipment, current W&B. Same engine as Status. Small MyTailLog footer. "The document you hand a buyer, an insurer, or an IA at annual."
- **Full records report** — summary plus every transcribed entry (print → PDF).
- **Share summary** — native share sheet (or clipboard) with a compact redacted text snapshot: status counts, due/overdue items, meters, W&B; deliberately omits scans, serial numbers, reporter names, squawk descriptions.
- **Pre-buy dossier** (`/prebuy`, print → PDF) — "A source-linked briefing for a prospective buyer or mechanic." Sections seen in copy: header (generated date · tach · hobbs · airframe), **Records coverage** (pages/reviewed/date range per logbook; pages needing extraction or review), **Items to investigate**, **Records gap audit**, **Squawk record**, **AD status and equipment**, **Engine history** (latest confirmed compressions, source entry links), **Scope and next checks**; **Share with a buyer** button → record room. Explicit caveat: "No issue was flagged by the available records. This does not establish completeness or airworthiness."
- **Record room links** (new 2026.11) — read-only, no-account link for a buyer, mechanic, IA or insurer. Owner picks contents: maintenance summary, whole logbooks (**confirmed entries only**), their page scans, individual Vault documents. Expiry **7 / 30 / 90 / 180 days**; revocable any time; shows open count; **transferring the aircraft revokes all**. Created from Sharing, the pre-buy dossier, or Records → More on the phone.
- **Authored (signed) logbook entries** [see contradiction 1] — composer at `/aircraft/[id]/entries/new`: pick logbook, date, hobbs/tach/airframe, a template, structured answers → generated wording the signer can edit ("Work performed — review and edit before signing", "Reset to template wording"), person who performed the work, **Sign with certificate** (credentials managed in Profile), attestation checkbox, then an **eight-digit email signing code** (10-minute expiry, bound to the exact entry values). Signed record stores final wording, structured answers, signer/certificate snapshot, timestamp, SHA-256 digest; **locked** — no edit/delete; a fix is a **correcting entry** linked to the original ("superseded by a signed correction"); superseded entries stay visible but are excluded from current-meter math.
  - **Templates (first release, four preventive-maintenance items, Part 43 App. A(c)):** oil **and filter** service, tire replacement, spark-plug service, battery service. Annual/100-hour (43.11) excluded; no oil-only pilot template. "Editable entry aids, not FAA-prescribed sentences."
  - **Stickers** — print the signed entry as a logbook sticker (width in inches; "Print at 100% scale on full-sheet adhesive paper and trim to fit. Check on plain paper first."), with a physical signature line and "Signature approves return to service only for the work described above." Sticker carries entry ID + digest prefix; **rescanning the page with the sticker links the scan to the existing signed entry** rather than creating a duplicate.

### 1.7 Collaboration: sharing / roles
- **Roles:** **Owner**, **Editor** (a.k.a. contributor — can contribute), **Viewer** (read-only, *can* report squawks). Invite by email; access begins when they sign in with that address; invitation email is sent and send failures are reported while access is preserved. Enforced by Postgres RLS, not UI.
- Editor-only: resolve/reopen/delete squawks, duplicates & fixes, CSV import, documents write, meter replacements, ADS-B opt-in/accept. Viewer edits say "You don't have edit access to this aircraft."
- **Ownership transfer** to another user (revokes record room links). **Delete aircraft** (type-to-confirm; removes all records and scans).
- **Record room recipients** have no account and no role — link-scoped, read-only.
- **OAuth apps** are a separate consent channel (see 1.8).

### 1.8 Integrations
- **MyFlightBook (hours)** — *Two paths exist today.* (a) **Partner two-way path**: authorize MyTailLog in MyFlightBook (Preferences → Maintenance), then **Update from MyTailLog** on MFB's My Aircraft page; MFB reads airworthiness and pushes hobbs/tach (nightly) under one grant with `hours:write`. "Authorization alone does not confirm that hours have arrived" — check Meters. (b) **Legacy pull**: Profile → MyFlightBook, user registers their *own* MFB OAuth app, saves client ID/secret, connects, **Sync from MyFlightBook** (manual + daily). Matches by normalized tail number. Readings shown "as of <date>" — "the last known reading, not a live gauge."
- **OAuth 2.1 API** — read-only third-party access with owner consent to: airworthiness (AD/inspection status, due, urgency), aircraft identity, equipment, hours, oil, W&B; one write scope (`hours:write`, append readings). **Log entries and scans are never shared.** Consent screen: plain-English scopes; choose **all my aircraft (default, includes future ones)** or **only the ones I pick**; new accounts can consent before owning an aircraft. **Profile → Connected apps**: list, revoke (immediate). Every read audit-logged; ~120 req/min per client.
- **Developer portal** (`/developers`) — register public (PKCE) or **Confidential (server-to-server)** apps; exact https redirect allowlist; secret shown once; **Rotate secret**; list/delete; docs at `/developers/docs`; RFC 8414 discovery.
- **Dropbox / Google Drive backups** — see 1.9.
- **CSV import** — see 1.2. **CSV export** — entries / AD-SB / equipment / maintenance.
- **FAA data** — registry lookup at enroll; Federal Register + DRS for ADs.
- **OpenSky (ADS-B)** — see 1.5.

### 1.9 Data ownership: export / import / backups
- **`.zip` backup** — all records as JSON + original scans and documents + `README.txt` documenting every file and column. **Re-import** recreates it as a *new* aircraft (never overwrites). Built in the browser.
- **Automatic cloud backups** — Profile: connect **Dropbox** (App folder scope) and/or **Google Drive** (`drive.file` scope); cadence **off / monthly / quarterly** per destination; one dated archive per aircraft (`MyTailLog/<TAIL>/<date>-<TAIL>.zip`). Add-only — nothing renamed/replaced/deleted. Profile shows last run, result, size per destination; email after two consecutive failures; **"too large to upload"** is a first-class status (ceiling ~400 MB) pointing to manual download. Mobile can request a backup run (online-only).
- **Open source / self-host** — MIT; the zip re-imports into a self-hosted instance. No billing code at all.

### 1.10 Notifications / reminders / emails
- **Reminder email** — daily job; one **digest per day**, grouped by aircraft, each item linking to Status; **once per due-cycle**; never an empty email; also fires when overdue. Profile → Notifications: master switch + lead times — **annual: days before (default 90)**; **oil change: hours before (default 10)**; **ADs/SBs and everything else: days and hours (defaults 30 d / 25 h, whichever first)**.
- **Push notifications (mobile)** — same daily check, grouped per aircraft ("N4321J — 2 items coming due"), same once-per-cycle rule. Turning off in-app removes the device.
- **Backup failure email**; **sharing invitation email**; **signing-code email**.
- **Onboarding email sequence** — nudges: 24 h after signup with no aircraft; 7 days after first aircraft with no pages/entries; 24 h after a page uploaded but not extracted; 24 h after extraction with entries awaiting review; one-time success note on first confirmed entry. Max three nudges, ≥ 3 days apart; existing users get one catch-up. Separate unsubscribe (does not touch maintenance reminders). Campaign ships disabled until the recipient audit.
- **In-app announcements** — admin publishes a title (≤ 120 chars), message (≤ 500), optional link; shown to signed-in users on web and mobile; dismissal stored per account across devices.
- **/whats-new** with stable anchors + RSS.

### 1.11 Account / AI allowance / BYO key
- **Profile:** name, **A&P/IA certificate number / signing credentials**, email change, password set/change/reset, **How you sign in** (Connect Google/Apple → "Connected"; connecting does not merge two accounts), Notifications, **AI & your API key**, MyFlightBook, cloud backup destinations, Connected apps.
- **Shared AI allowance** — per-user daily call cap + global daily-$ ceiling. Profile shows calls used vs cap for everyone; "a page takes about 2 calls to read, so the shared allowance is roughly **50 pages a day**"; calls free up individually 24 h after each one (rolling, not midnight). When the global budget is spent: "AI pauses until tomorrow"; everything else keeps working. Error string: "Daily AI limit reached".
- **BYO key** — stored encrypted, never shown again (last four characters displayed); status "using your key"; much higher limit; panel shows calls, input/output tokens, estimated cost. A rejected key fails clearly — never silently falls back to the shared key. Must be an API key (`sk-ant-…`), not a Claude.ai subscription.
- **Admin** (`/admin`): shared AI provider selection, announcements, activation funnel (derived from product records; no page-view tracking), storage health check.

### 1.12 Mobile / offline
- **Apps:** iPhone + iPad (App Store, iOS/iPadOS 15.6+), Android (Google Play). Capacitor wrapper with its own React screens; same design language as web. Free.
- **Offline model:** sync once → everything mirrored in on-device SQLite; scans/documents cached to filesystem (**Download all**; cache bounded at 500 MB, oldest page images purged first, documents never; **Clear cached scans**). Writes save locally first, send immediately when connected, else retry on reconnect. **Online-only:** AI extraction, AI scans, Ask, enrolling an aircraft, requesting a backup — these say so offline rather than queueing.
- **Waiting to upload** — lists queued writes and documents and keeps the server's reason on anything refused. **Conflict screen:** when the same row changed elsewhere, shows yours and theirs with differing lines marked → **Keep mine / Take theirs / Decide later**.
- **Everything editable on device:** review pages (drawer on phone, pane on iPad; **Check this** chips; ◎ spotlight; Confirm N clean; merge; key in missed entries), inspections (add/edit interval/mark done/seed Part 91 set), ADs (track, record compliance with date/hours/method/proving entry), equipment install/removal, squawks, documents (Files, iCloud, camera, drag-drop on iPad; ≤ 25 MB; attach to entry), meters, oil, add aircraft.
- **iPad (≥ 700pt):** 200pt sidebar (tail, type, current status, four tabs, Ask, Account) + two panes (verdict | item; page | entries; squawk | detail); Scans splits three ways (page rail | scan | entries). Below 700pt (Split View) falls back to the phone layout. **Keyboard:** ⌘1–4 tabs, ⌘K Ask, ⌘N new squawk, ⌘←/⌘→ turn pages, ⌘↩ confirm.
- **Account menu:** Appearance (**Light / Dark / Match my phone**, repaints live), notifications, Connect Google/Apple, **Rebuild from the server**, cache size + Clear cached scans, sign out (**clears the device copy**). Session in iOS Keychain (survives relaunch/airplane mode).
- **Header tail number switches aircraft in place.** Records tab = Documents · Scans · History behind a segmented control.
- All editable controls ≥ 16px font (iOS zoom threshold) — a hard rule after two shipped bugs.
- Web app is **dark only on screen**; print is light. Mobile has light + dark.

---

## 2. KEY USER FLOWS

### F1. First session → "status ready" (the acquisition metric)
1. Land on `/` → **Create free account** (Google / Apple / magic link / password). No card.
2. Dashboard shows demo aircraft N734DM (read-only) + "How did you hear about MyTailLog?" card.
3. Enroll: enter tail number → FAA registry fills make/model/serial/registrant (or enter by hand) → five logbooks + four Part 91 items created.
4. Setup step 1: enter today's tach and hobbs.
5. Setup step 2: photograph the page with the last annual sign-off (or type its date) → AI reads → **owner confirms which entry is the annual**.
6. Setup step 3: Status — countdowns live. Overview shows Records coverage and "Finish setup" until complete.

### F2. Digitize a logbook (desk, web) — e2e Tier B
1. Aircraft → Pages → pick logbook → **Upload scans** (PDF/JPEG/PNG; PDF rasterizes client-side into pages) or **Capture into <logbook>**.
2. Pages appear in the pages queue (Processing → Needs review).
3. **Extract** → entries appear in **Review** with per-field confidence.
4. Check each entry against the pinned scan (◎ spotlight; magnify); edit (marks confirmed) or **Confirm N clean**; add missed entries; merge page-spanning ones.
5. Confirmed entries update Status / forecast / equipment proposals / AD references.
6. Run **Duplicates & fixes** → delete non-kept copies; accept/keep meter-typo suggestions.
7. If volumes went in out of order: sort by Entry date → **Save this order**.

### F3. "Other" A&P document — Tier B
Upload/scan a W&B sheet or AD compliance report into **Other** → classified → new W&B revision *or* AD records corroborated ("✓ A&P report") / created.

### F4. CSV import — Tier C
Pick logbook → upload CSV → review proposed column mapping → (resolve date ambiguity if asked) → preview count + unreadable rows → import → entries appear in Review all as "imported (no scan)" → confirm → Fix duplicates. Refusals to design for: non-CSV, header-only file, over-cap file, mapping with no date column, viewer-level user.

### F5. Read-only exploration (demo) — Tier A
Landing and `/help` → login → dashboard shows demo → Aircraft overview → Status grid → Timeline & search (a query returns results) → Ask (answer + citations) → Maintenance forecast → AD/SB compliance → Installed equipment → W&B history → Records-gap audit.

### F6. At the aircraft (phone, often one-handed, often offline)
1. Open app → aircraft list flags worst item → Status verdict ring ("One item due soon").
2. **Log a flight**: steppers for tach/hobbs (+delta), oil added → **Save to logbook**.
3. Raise a squawk (sheet; Low / Watch / Ground). Later: swipe to resolve, name the clearing entry.
4. Mark a recurring item done; VOR check asks place / bearing error / signature and writes an entry.
5. Scan pages (VisionKit, up to 24) into a logbook → "saved on your phone… upload on the next sync".
6. Ramp check: Records → Documents → **Carry aboard** card (AROW present/missing) → open PDF in-app.
7. Back in coverage: writes upload; **Waiting to upload** shows leftovers, refusals, conflicts.

### F7. Annual with an IA
Workflows → **Annual prep**: items coming due before the annual, open squawks for the shop, loose ends (pages awaiting review, suspected gaps) → print **maintenance summary** → optionally create a **record room link** for the IA → after the annual, scan the sign-off page (and any AD compliance report into Other) → confirm → counters reset.

### F8. Pre-buy / sale
Open **Pre-buy dossier** → resolve "Review unconfirmed entries before using this report" → print/save PDF → **Share with a buyer** → choose contents (summary, logbooks, scans, Vault docs), expiry (7/30/90/180 d) → send link → monitor open count → revoke, or **transfer ownership** on sale (revokes all links).

### F9. Insurance renewal
Print/save the **maintenance summary** (or Share summary snapshot) → optionally a record room link for the insurer.

### F10. Sharing — Tier C
Sharing → invite by email as viewer or editor → share row created, invitation emailed → invitee signs in with that address and sees the aircraft. Invitee can **Remove from my dashboard**.

### F11. Export / restore — Tier C
Export page → CSVs / print reports / download `.zip` → (elsewhere or later) re-import `.zip` → new aircraft created with entries, ADs, scans, attachments.

### F12. Account & integrations — Tier C
- **BYOK:** Profile → AI & your API key → save key → status "using your key" → remove.
- **MyFlightBook (legacy):** save client credentials → connect → status reflects it → Sync.
- **Notifications:** toggle master switch, set lead times, save.
- **Cloud backup:** Profile → connect Dropbox/Drive (OAuth) → choose monthly/quarterly → see last run/result/size.
- **Connect Google/Apple:** sign in with original method → Profile → How you sign in → Connect → "Connected".
- **OAuth consent (third-party app):** app redirects → sign in → consent screen (scopes in plain English; all aircraft vs pick) → approve → manage under Connected apps.

### F13. Track a newly discovered AD
Compliance → Explore → results by make/model/keyword (your model highlighted) → **Track this AD** or **Track with an interval** → record compliance (date, hours, method, proving entry) → appears on Status/forecast.

### F14. ADS-B nudge
Opt in on Meters → next day banner "N flights totalling ≈X h since your last reading" + suggested value → **Record a reading** (editable) or **Dismiss**.

### F15. Author and sign an entry (owner-performed preventive maintenance)
Entries → New → choose template → fill details → edit generated wording → choose credential → attest → receive 8-digit email code → enter → entry locked → **print sticker** → stick in the paper book → physically sign → rescan the page later (links to the signed entry).

---

## 3. BACKLOG / PLANNED / NOT YET BUILT

**From the SquawkFree backlog (Aug 2026) — still open:**
- **T2-2 Pre-flight / inspection checklists that open squawks** — Tier 2, effort M. Template library (C172-style, sectioned), pass/fail with notes, permanent inspection history; failed item creates a pre-filled squawk that later closes against the resolving log entry.
- **T2-3 Person-level currency & expiry tracking** — Tier 2, effort M. Pilot certificate, medical class + expiry, flight review, IPC; reuses the reminder engine; individual only, no org dashboards.
- **T2-4 Squawk parity pass** — Tier 2, XS–S. Full discovery → resolution audit trail and link to the resolving entry (linking shipped on mobile in 2026.08; the audit-trail half is unconfirmed).
- **T3-2 Per-aircraft storage usage display** — Tier 3, S.
- **T3-3 Displacement pages + importers** — Tier 3. "/switch/myfbo" shipped; still open: a "Coming from a digitization service" page and a SquawkFree-export (JSON+CSV) importer.
- **T3-4 Content/SEO** — ongoing (three owner guides + public AD pages shipped; no blog).
- **Dropped deliberately:** ForeFlight Logbook CSV / MyFlightbook CSV export (would require fabricating flights the app doesn't hold).

**From the Runup analysis (Sep 2026), ordered by owner value:**
1. Record room — **shipped 2026.11** (base version). Optional later: contact collection, engagement analytics beyond open count. Principle: never gate verification behind handing over contact details.
2. **One timeline for entries and unattached Vault documents** — medium effort; dated standalone documents as distinct rows with type/source labels; undated kept separate. Not shipped.
3. **Written-vs-derived component time review** (engine/prop SMOH checks; twin-engine per-component identity and time bases) — large. Not shipped; current model is single hobbs + single tach with serial arrays only.
4. **Extraction completion notice** — small–medium; in-app when a batch finishes; opt-in email. Not shipped.
- Marketing follow-ups: evidence-led page on source-linked AD and hours review; show a real buyer/annual workflow.

**MyFlightBook single-connection plan (Nov 2026; rollout gate still open):**
- Replace the Profile credential form + manual pull button with **one MyFlightbook card** with five states: no grant · granted but no matched aircraft/readings · data received · stale/no recent delivery · revoked/insufficient scope. Show per-aircraft last successful hobbs and tach with dates and source, plus link to MFB setup/re-consent. "Never call a grant alone 'synced.'"
- Stop asking users to create their own MFB OAuth app; migrate legacy-pull users in batches with an action notice; sunset the legacy path after verification.
- **Hold/review gate for lower candidate readings** (dropped leading digit vs correction vs real replacement) — owner decides; only a confirmed meter reset starts a new era.
- Fix `/api/v1` airworthiness urgency for hobbs-based items and reset-stitched due values.
- Update Help/README/landing/mobile copy that promises a daily MTL pull.

**Cloud backups — deferred:** S3-compatible target (Backblaze/Wasabi/R2/MinIO; mainly self-hosters); two-phase resumable upload for very large archives (largest real archive is 70 MB vs 400 MB guard). Box dropped. **Non-goals:** restore *from* the provider, weekly/daily cadence, pruning the user's cloud, an extra encryption layer.

**CSV import — out of v1:** XLSX / Google Sheets links; import targets other than maintenance entries (hours readings, ADs, squawks, equipment); vendor-specific importers (never).

**OAuth/API — deferred:** edit-in-place for registered apps (currently delete + re-register); token-layer revocation of refresh tokens; shared rate-limit counter; `entries:read` deliberately excluded; second meters for twins have no home.

**Mobile — open:** Apple sign-in inside the public iOS app (pending build as of Oct 16); shared code package; **account deletion** was documented as having no server side (Apple guideline 5.1.1(v)) — status now unverified, check with owner.

**Authored entries — scope limits:** only four templates; annual/100-hour (43.11) excluded; no oil-only pilot template.

**Onboarding emails:** built; campaign starts disabled pending recipient audit.

**E2E coverage gaps (hints at less-exercised UI):** extract → review → confirm with stubs, find duplicates, equipment/maintenance scan, MFB credential UI, notification settings round-trip, meters/hobbs↔tach reconciliation UI, enroll (FAA lookup), oil-consumption panel, live-AI smoke tier.

**Permanent non-goals (all docs agree):** scheduling/booking, dispatch → invoicing, membership dues, payments/billing of any kind, weather briefing, 5-role org RBAC, 3D track replay / runway usage / fuel-burn analytics, human digitization service, parts procurement/inventory, work orders, multi-fleet MRO, flight schools/clubs/fleets, flight logging (tracks *hours*, not flights), W&B loading calculator.

---

## 4. COMPETITIVE GAPS

### SquawkFree (snapshot 2026-08-01; launched 2026-07-05)
Pricing: Premium $4.99/mo, Flight School $55/mo, Flight Intelligence add-on $3/aircraft/mo, digitization $299/aircraft one-time (human, ≤ 300 pages, 1–2 weeks). 60-day trial → read-only.

**They have, MyTailLog does not (today):**
- Pre-flight checklists with templates and permanent inspection history.
- Pilot currency + medical tracking.
- Manual flight logging; ADS-B *flight import* with route, touch-and-go counts, taxi/airborne splits, 3D replay (MyTailLog only does passive *hours* nudges).
- Per-tab granular sharing permissions (MyTailLog: viewer / editor).
- Export to ForeFlight Logbook CSV / MyFlightbook CSV; async emailed export job.
- Scheduling, dispatch, invoicing, dues, weather, org RBAC (deliberate non-goals).
- Analytics on fuel burn and maintenance costs; parts tracking and mechanic info per record.
- Storage quotas shown as a plan lever; public pricing; high-volume SEO blog.
- A "human reviewed every entry" certainty promise.

**MyTailLog has, SquawkFree does not:** automated AI extraction with per-field confidence (minutes vs weeks, $0 vs $299); review UI with scan beside entry and ◎ spotlight; duplicate detection; five logbook types; Ask with citations; equipment reconstructed from logs; W&B revisions auto-applied from a scanned sheet + stale flag; oil-analysis trending; oil burn rate; records-gap audit; A&P AD report as ground truth; hobbs↔tach reconciliation + meter resets; bidirectional MyFlightBook OAuth; OAuth 2.1 provider + developer portal; typed Records Vault; `.zip` re-import; ownership transfer; BYO AI key with usage visibility; reminder emails with configurable lead times; native offline apps; MIT/self-host; no billing. Since the snapshot: projection with confidence, AD discovery by model, attachments, /whats-new, ADS-B hours, record rooms.

**Design notes the analysis recommends borrowing:** monospace for data inline in prose (tail numbers, AD numbers, tach readings, airport IDs) with `tabular-nums`; a hero that is a scenario not a slogan ("Your annual is next month."); real product screenshots at full width; restraint in motion; honest "why/limits" copy. Their weak points: mascot at odds with a sober aesthetic, light-mode only, crowded nav.

### Runup (checked 2026-09-23) — the closer competitor
Self-serve AI extraction with review beside source; explicitly says paper is the legal record. Free tier (10 logbook + 5 records pages), Pro $16/aircraft/mo single, $24 twin, Sales Portal $49 one-time. No native app advertised.

**Runup advertises, MyTailLog lacks:**
- **Calculated engine and propeller times with discrepancy flags** (written vs calculated SMOH), and **separate twin-engine tracking**.
- **Chronological ledger mixing log entries and standalone documents.**
- **Buyer portal** with record visibility tiers, contact-gated deeper access, engagement analytics (MyTailLog's record room has selection, expiry, revoke, open count only).
- **Background OCR with in-app and email completion notices.**

**MyTailLog has, Runup doesn't advertise:** native offline apps, no subscription, oil trends, equipment reconstruction, W&B history, Ask, public API, self-hosting, zip re-import, scheduled Dropbox/Drive copies, AD discovery (Runup's AD tracking is Pro-only), public demo.

**Positioning consequence:** MyTailLog can no longer claim self-serve AI extraction or review-beside-source as unique. Lead with the **result** (a searchable record that helps at an annual, an airworthiness question, or a sale) and with four provable claims: cites the source page, free and open source, owner keeps the data, works in the hangar. Never claim superior OCR accuracy or "free and unlimited."

---

## 5. TERMINOLOGY & COPY VOICE

### Domain vocabulary used in the UI
- **Meters:** tach, hobbs, **AFTT** / airframe total time, "TT"; *face value* vs *stitched total*; meter replacement / reset; starting readings; "as of <date> · from MyFlightBook"; "est." / estimated; `adsb_estimate`; "+2.4 hours this flight".
- **Inspections:** annual (91.409), 100-hour, transponder cert (91.413), pitot-static / altimeter (91.411), ELT (91.207), VOR check (91.171(d)), oil & filter change, engine TBO, prop overhaul; SMOH / SPOH; "IAW"; "returned to service"; regulatory vs advisory; calendar months.
- **Directives:** AD, SB, AD/SB; complied / previously complied / does-not-apply; one-time vs recurring; method; next-due; "✓ A&P report"; Track this AD / Track with an interval; Federal Register, DRS.
- **People:** owner, co-owner, A&P, IA, mechanic, shop, CRS (repair station), buyer, insurer, pilot, viewer, editor.
- **Records:** logbook (airframe / engine / prop / avionics / Other), page, scan, entry, **Records Vault**, **record room**, AROW, "Carry aboard", POH/AFM, STC, Form 337, 8130-3, ICA, W&B revision (weighed / computed), empty weight, CG arm, moment, max gross, useful load, maintenance summary, full records report, pre-buy dossier, sticker, signed entry, correcting entry.
- **Review:** Needs review / Processing / ✓ reviewed; **Check this**; ◎ spotlight; **Confirm N clean**; Review all; Re-extract; Crop & clean up; scan look; "imported (no scan)"; suggested keep; Keep mine; "2 merged".
- **Status:** overdue (red) / due soon (amber) / current (green) / **needs information**; "Grounded — annual overdue"; "One item due soon"; ≈ projected date; confidence High / Medium / Low.
- **Squawk severity (mobile):** Low / Watch / Ground. Open / resolved.
- **Sync:** "saved on your phone", "upload on the next sync", Waiting to upload, Keep mine / Take theirs / Decide later, Download all, Rebuild from the server.
- **Sidebar groups:** Status, Log, Records, Workflows, Manage. Dashboard is the "hangar".
- **AI:** daily allowance, "using your key", "Daily AI limit reached".
- **Help-page device:** amber **"Ripple effects"** callouts explaining what an action changes elsewhere.

### Legal disclaimers and where they must appear
- **Canonical statement:** "MyTailLog is an index and decision-support layer, not the legal maintenance record. The physical logbooks remain the system of record (14 CFR 91.417). Confirm anything you rely on against them." Also: not an airworthiness determination, not a maintenance sign-off.
- **Placement rule (PRODUCT.md):** "Every surface that shows derived data must say so where it matters, and copy must never imply otherwise." Seen on: landing footer, Help (top "read this first" and bottom reminder), README, announcements/social copy, pre-buy dossier, maintenance summary.
- **Projections:** always "≈", always with confidence and the window; "a planning estimate, not a determination"; never next to/instead of a calendar limit.
- **AD search & public AD lists:** "a starting point, not a determination"; listings "come from matching FAA titles and abstracts, not from an applicability determination… your mechanic makes that call."
- **Gap audit:** always "suspected".
- **Oil analysis:** "a prompt to watch, not a verdict"; the lab's assessment is authoritative.
- **W&B:** "an index of your W&B records, not a loading calculator."
- **ADS-B:** honest limits stated in the UI itself, not buried in help.
- **MyFlightBook hours:** "the last known reading, not a live gauge."
- **Pre-buy dossier:** "This does not establish completeness or airworthiness."; "inspect the linked records and physical logbooks before relying on any finding."
- **Crop & clean up:** states it replaces the stored scan; paper is still the legal record.
- **Authored entries / stickers:** "editable entry aids, not FAA-prescribed sentences"; signer confirms eligibility; "Signature approves return to service only for the work described above."; sticker has a physical signature line.
- **Pricing honesty:** never say "free and unlimited"; always state the daily AI allowance and that BYO key incurs provider cost.
- **Evidence rules:** no accuracy percentage; no testimonials, quotes, press or case studies (none exist — do not fabricate); usage numbers only when owner-supplied.

### Voice
"Plain, aviation-literate, honest about limits." Second person, concrete, specific numbers, names the failure mode. Tone examples (verbatim):
- Hero: "Your annual is in three weeks. The logbooks are a cardboard box."
- "Free is a fact about the code, not a promise about next year."
- "Portability that survives us losing interest is a stronger promise than portability that depends on us staying nice."
- "No accuracy percentage, because nothing here measures one."
- "Dates are never guessed."
- "a foreign spreadsheet hasn't earned the right to drive a reminder or a forecast until you've looked at it."
- "Your existing Drive is invisible to us by construction, not by promise."
- "a backup that quietly stopped six months ago is worse than none."
- "Severity now reads Low / Watch / Ground — 'high' doesn't tell you whether the aircraft flies."
- "A tick-box that only moved a due-date would leave you non-compliant while telling you that you were fine."
- "Nothing you record disappears quietly."
- "The app was dark only, which is wrong on a ramp in daylight."
- Launch post: "keep the records available when the hangar has no signal (which is usually when you need them)." / "Your paper logbooks are still the legal record. This is the companion that helps you find what's in them."
- Social reel (friendlier, upbeat): "Turn paper logbooks into searchable history, one page at a time." / "Free and open source, with your records in your hands."
- Carousel lines: "Scan it. Find it. Use it." · "Your records. At the hangar." · "Free. Open source. Ready to fly."

Product principles (PRODUCT.md): (1) The paper is the truth: show the source page. (2) Status in the first session. (3) One owner, one aircraft, not a fleet. (4) Respect the owner's data and attention: no lock-in, no third-party tracking, no overstated claims. (5) Works where the aircraft is: offline, on a phone, one-handed.

Data typography convention noted in CHANGELOG: tail numbers, tach readings, AD numbers and dates are set in the "mono instrument face", inline in prose (web landing). Mobile retired monospace ("one warm dark palette and two brand faces").

---

## 6. PERSONAS & RITUALS

**Primary:** solo owner-pilot of a piston GA aircraft — one aircraft, decades of paper airframe/engine/prop/avionics logbooks, an A&P/IA they see at annual. Job to be done: know what's due (annual, transponder, pitot-static, ELT, recurring ADs, oil) and have records ready when a mechanic, IA, buyer or insurer asks. Often "nervous" about trusting a model — the confidence-scored review UI is the answer.

**Secondary (reached through the owner):**
- Co-owners / shared pilots — viewers or editors; viewers can still report squawks.
- **Record room recipients** — buyer, pre-buy mechanic, IA, insurer; no account; read-only, expiring link.
- A&P / IA / shop — receives the maintenance summary, open squawks, Annual prep output; their AD compliance report and W&B sheet come back as scans.
- Third-party developers / MyFlightBook — via OAuth.
- Migrators from shutting-down platforms (MyFBO) — CSV import, `/switch/myfbo`.
- Self-hosters (MIT).
- Glider/motorglider owners — airframe-time meter.

**Out of scope:** flight schools, clubs, fleets, MRO shops.

**Usage contexts:**
- **Desk (web, dark UI):** digitize and review backlog, duplicates, CSV import, AD explore, exports, sharing, profile/integrations.
- **At the aircraft / hangar / ramp (phone, often one-handed, often no signal, sometimes daylight):** check status ("can I fly today?"), log hours and oil, raise/resolve squawks, scan pages, show AROW at a ramp check, check a transcription "while the book is in your hands."
- **iPad:** two-pane review; in Split View beside ForeFlight.

**Rituals and their hand-off documents:**
| Ritual | What the owner does | Hand-off artifact |
|---|---|---|
| Annual inspection with an IA | Annual prep page; scan sign-off + AD report afterward | Printable **maintenance summary**; open squawks list; optional record room link |
| Pre-buy | Clear unconfirmed entries; review flagged items | **Pre-buy dossier** (PDF) + **record room link** ("Share with a buyer") |
| Insurance renewal | Pull current status and hours | **Maintenance summary** PDF or **Share summary** text snapshot; record room link |
| Selling the aircraft | Dossier, record room, then transfer | Dossier + record room; **ownership transfer** (revokes links); `.zip` for the new owner |
| Ramp check | Open Documents | **Carry aboard / AROW** card |
| After each flight | Log a flight | Meters + oil in one save |
| Oil change / owner maintenance | Author entry from template, sign | **Signed entry + printed sticker** |
| Oil lab report arrives | Import oil report | Wear-metal trend |
| Daily (system) | — | Digest email / push; MFB sync; ADS-B check |
| Monthly/quarterly (system) | — | `.zip` to Dropbox/Drive |

---

## 7. DEMO DATA — N734DM

Source: `apps/web/scripts/seed-demo.sql` plus mentions in docs. Entries are synthetic with no page scans in the seed (the README's review screenshot shows "a handwritten 1979 logbook page"); all `owner_confirmed`.

**Aircraft:** N734DM · 1978 Cessna 172N · S/N 17269841 · engine Lycoming O-320-H2AD S/N L-14238-27A · prop McCauley 1C160/DTM7557 S/N EM-77341 · home base KDEMO · enrollment hobbs 4212.4 / tach 4212.4 · note "Demo aircraft — fictional data for exploring MyTailLog." Logbooks: airframe, engine, prop, avionics, other.

**Log entries (date · tach · logbook · summary · signer / cert):**
| Date | Tach | Book | Entry | Signer |
|---|---|---|---|---|
| 1978-06-02 | 9.1 | Airframe | New aircraft. Airworthiness certificate issued. Pre-delivery inspection completed. | Cessna Aircraft Co. |
| 1998-04-18 | 2101.5 | Airframe | Annual IAW FAR 43 App. D; replaced left main tire; lubricated all controls. | R. Mitchell · A&P 2214467 IA |
| 2005-09-14 | 2803.0 | Engine | Lycoming O-320-H2AD overhauled by Signal Engines; zero time SMOH; new Slick magnetos, harness, plugs. | Signal Engines Inc. · CRS #SE9K204M |
| 2010-04-30 | 3204.8 | Prop | McCauley 1C160/DTM7557 overhauled by ProProp Services; zero time SPOH. | ProProp Services · CRS #PP7Q118N |
| 2011-08-22 | 3384.0 | Airframe | Annual; complied AD 2011-10-09 seat rail inspection, next due in 100 hrs; replaced ELT battery. | D. Alvarez · A&P 3105582 IA |
| 2019-03-12 | 3891.2 | Airframe | Removed King KX-155; installed Garmin GTN 650 per STC SA01714WI; W&B amended; Form 337 filed. | SkyTech Avionics · CRS #ST4R881K |
| 2019-03-12 | 3891.2 | Avionics | GTN 650 install: new tray, GA 35 antenna, wiring; interfaced to GI 106A CDI. | SkyTech Avionics |
| 2023-02-11 | 4038.9 | Avionics | ELT battery replaced (ACK E-04); new expiration Feb 2027. | M. Torres · A&P 3667012 |
| 2024-05-01 | 4102.7 | Airframe | Transponder IAW 91.413 / Part 43 App. F; altimeter/static IAW 91.411 / App. E. | AeroCheck Instruments · CRS #AC2Y441L |
| 2024-11-02 | 4131.5 | Engine | Oil change; filter CH48110-1; 7 qts Phillips XC 20W-50 + CamGuard; cut filter no metal; compressions 76/74/75/77 over 80. | M. Torres |
| 2025-06-08 | 4172.1 | Engine | Oil change; 7 qts Phillips XC 20W-50; sample sent to Blackstone, results normal. | M. Torres |
| 2025-07-20 | 4168.3 | Airframe | Annual; AD 2011-10-09 seat rails satisfactory; replaced vacuum pump filter; patched left wing fairing crack. | D. Alvarez · IA |
| 2025-07-20 | 4168.3 | Prop | Annual — propeller and spinner inspected; minor nicks dressed. | D. Alvarez |

Extraction confidence in seed: 0.95–0.99. **Seed quirk:** the 2025-06-08 oil change is at tach 4172.1 but the later 2025-07-20 annual is at 4168.3 (tach runs backwards) — fix this in mockups unless you want to demo the mis-keyed-reading flag.

**Maintenance items:**
| Item | Type | Interval | Last done | Next due |
|---|---|---|---|---|
| Annual inspection (91.409) | regulatory | 12 mo | 2025-07-20 @ 4168.3 | 2026-07-20 (calendar-month rule → 31 Jul 2026) |
| Transponder cert (91.413) | regulatory | 24 mo | 2024-05-01 | 2026-05-01 (→ 31 May 2026) |
| Pitot-static / altimeter (91.411) | regulatory | 24 mo | 2024-11-15 | 2026-11-15 (→ 30 Nov 2026) |
| ELT inspection (91.207) | regulatory | 12 mo | 2025-07-20 | 2026-07-20; note "Battery expires Feb 2027" |
| Oil & filter change | advisory | 50 h | 2025-06-08 @ 4172.1 | 4222.1; "50-hr interval, Phillips XC 20W-50" |
| Engine TBO (O-320-H2AD) | advisory | 2000 h | 2005-09-14 @ 2803.0 | 4803.0; "Advisory — on-condition per Savvy philosophy" |

The seed comment says the items are in "mixed states (overdue / due soon / current) for a colorful Status grid", but the dates are fixed, so real status drifts with the calendar. *My arithmetic, not from the docs:* at current tach 4212.4 the oil change has 9.7 h left, AD 2011-10-09 has 55.9 h left, TBO has 590.6 h left. For mockups, shift the dates relative to "today" to recreate the intended mix.

**AD compliance:**
- AD **2011-10-09** — Seat rail / seat rail lock inspection — recurring 100 h — complied 2025-07-20 @ 4168.3, method "Inspected IAW AD para (g); no wear beyond limits" — next due 4268.3.
- AD **76-07-12** — Fuel tank filler caps — one-time — complied 1998-04-18 @ 2101.5, "Vented caps installed".
- AD **2020-18-01** — Fuel pump diaphragm — not applicable, "Engine model not affected".

**Equipment:**
- Garmin GTN 650 GPS/NAV/COM · P/N 011-01057-00 · installed 2019-03-12 · STC SA01714WI.
- Rapco vacuum pump · P/N RA215CC · installed 2021-04-10.
- ACK ELT · E-04 · installed 2015-06-20 · battery exp Feb 2027.
- King KX-155 NAV/COM · P/N 069-1024-25 · installed 1978-06-02, **removed 2019-03-12** ("Removed for GTN 650").

**Weight & balance revisions:**
- 1998-04-18 — weighed — empty weight 1441.20 lb, arm 39.420 in, moment 56,812.10, max gross 2300 — "Annual 1998 / Periodic reweigh".
- 2019-03-12 — computed — 1447.80 lb, arm 39.610, moment 57,347.36, max gross 2300 — "Form 337, GTN 650 install / KX-155 removed, GTN 650 installed". (Useful load by subtraction: 852.2 lb — my arithmetic. The Rapco pump installed 2021-04-10 postdates this revision, which should trigger the W&B stale banner.)

**Demo screens that exist as screenshots** (`apps/web/src/screenshots/`): review, hub (overview), status, ask, timeline, wb. `/demo` tour captions: "Review every extracted field", "See what needs attention", "Ask a question. Check the source.", "One timeline across every book", "Keep weight and balance history", "Run the aircraft from one overview".

**Other sample values quoted in docs (useful for realistic mockups):**
- Example questions: "When was the last annual?", "Hours since prop overhaul?"; searches "oil change", "magneto", "AD 2015-19-07".
- Projection strings: "Due in 38.4 hours" / "due ≈ 14 Mar" / "≈ 14 Mar 2027".
- ADS-B: "ADS-B detected 3 flights totalling ≈4.2 h since your last tach reading (1,234.5 on 12 Jul)… Suggested tach: 1,234.5 → 1,238.7 · [Record a reading] [Dismiss]".
- Push: "N4321J — 2 items coming due". Verdicts: "One item due soon", "Grounded — annual overdue". Scan sheet: "Adds to the end — 24 pages so far". Flight log: "+2.4 hours this flight". Oil: "added 1.5 qt"; burn rate in hrs/qt.
- Meter typo examples: 303 for 3,302; 33,303; replacement example 3204.8 → 206.1.
- CSV mapping examples: "Tach Out" → Tach, "A&P" → Signature, "Invoice #" → don't import; ambiguous date "03/04/2026".
- Backup path: `MyTailLog/N734DM/2026-08-01-N734DM.zip`.
- API payload: `{ "hobbs": 947.7, "reading_date": "2026-07-14" }`, tach 1180.4.
- Sharing defaults: reminder lead times 90 days (annual), 10 hours (oil), 30 days / 25 hours (ADs & other); record room expiry 7/30/90/180 days; AI allowance ≈ 50 pages/day.
- Campaign figures (owner-supplied, Nov 2026): 2,800+ pages, 3,700+ entries, dozens of aircraft, 50+ active users in the last 30 days.
- Other tails in docs: N9363V appears in CHANGELOG bug reports and API examples and looks like a real aircraft — avoid it in mockups; N172SP (ICAO A12239) is used as an ADS-B lookup example.
