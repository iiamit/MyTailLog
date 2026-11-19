# MyTailLog — current web app inventory (pre-redesign)

Source: the repository root at commit `f1d79dd` (main, clean). Read-only research; nothing in the repo was changed.

**How this was produced.** Four parallel readers each read one functional area's UI files in full (hangar/onboarding/status/hours; digitize/review/timeline; compliance/records; sharing/account/admin). I read the shells, `globals.css`, the root and aircraft layouts, the type file, and viewed all six product screenshots. Code metrics in §6 come from scripted counts over `apps/web/src/**/*.tsx`.

**What is and is not verified.**
- Everything here is from reading code and static screenshots. The app was not run.
- Items marked *(inferred)* are behaviour bugs deduced from code paths; confirm them in a running build before relying on them.
- The only product screenshots in the repo are the six in `apps/web/src/screenshots/`. `apps/web/public/` holds only brand marks, icons and `og.png`. `marketing/2026-11-social-launch/` holds social/reel artwork, which I did not review.
- `packages/shared` contains only a README; there is no shared UI code.

**Path shorthand.** `SRC` = `apps/web/src`. `A/` = `SRC/app/aircraft/[id]/`. Routes are written from the site root.

**Things the brief expected that do not exist in the web app.**
- No global search and no command palette. Search exists only inside the Timeline page (and per-logbook in the public record room).
- No in-place aircraft switcher. Switching means going back to the hangar.
- No in-app notification centre. Reminders are a daily email plus mobile push; the web shows only nav badges.
- No light theme on screen (print only).
- No passkeys, units/timezone settings, or session list. No in-app "delete account" on web (manual email request).
- No web "back up now" for cloud backups (native app only).
- No W&B loading calculator, station model or envelope chart; only empty-weight revision history.
- No data-plate or work-order photo scan. Both "scan" buttons in Equipment and Forecast are AI passes over already-extracted entries.
- No `/signup` route, although `/demo` links to it (see critique).
- No `loading.tsx` or `not-found.tsx` anywhere; one global `error.tsx`.

---

## 1. Route map

61 non-API route files, 44 API route files.

### 1.1 Public / marketing (no app chrome; most use `SRC/components/MarketingShell.tsx`, `max-w-3xl`)

| Path | Purpose | Main files |
|---|---|---|
| `/` | Landing page. h1 "Your annual is in three weeks. The logbooks are a cardboard box." Sections include "Free is a fact about the code, not a promise about next year", "Everything else it does", "What it doesn't do". CTAs "Create your account" / "Go to your hangar" → `/login`. Does not redirect signed-in users. | `SRC/app/page.tsx` (672 lines) |
| `/demo` | "Product tour": six numbered screenshot sections of N734DM; CTA "Create free account →" → `/signup` (no such route). | `SRC/app/demo/page.tsx` |
| `/faq` | "Questions before you sign up" (cost, data, privacy, export). | `SRC/app/faq/page.tsx` |
| `/compare` | "Six ways to keep aircraft maintenance records", incl. "Where we lose". | `SRC/app/compare/page.tsx` |
| `/switch/myfbo` | Migration page: "MyFBO is going away. Your maintenance history is inside it." | `SRC/app/switch/myfbo/page.tsx` |
| `/guides/[slug]` | Owner guides: `digitize-aircraft-logbooks`, `aircraft-maintenance-tracking`, `airworthiness-directive-tracking`. | `SRC/app/guides/[slug]/page.tsx` |
| `/ads` | Public AD catalog by make → model (SEO). | `SRC/app/ads/page.tsx`, `AdCatalogParts.tsx` |
| `/ads/[make]/[model]` | ADs naming one model, newest first, with FR/PDF links. | `SRC/app/ads/[make]/[model]/page.tsx` |
| `/privacy` | Privacy policy. | `SRC/app/privacy/page.tsx` |
| `/account-deletion` | How to request account deletion (manual email). | `SRC/app/account-deletion/page.tsx` |
| `/help` | "Help & documentation": about 30 sections mirroring every feature. Rendered in **AccountShell**, not MarketingShell. | `SRC/app/help/page.tsx` (1204 lines) |
| `/whats-new`, `/whats-new/rss.xml` | Changelog + RSS. Rendered in AccountShell. | `SRC/app/whats-new/page.tsx`, `SRC/lib/changelog.ts` |
| `/developers/docs` | Public OAuth API docs, rendered in AccountShell. | `SRC/app/developers/docs/page.tsx` |
| `/robots.txt`, `/sitemap.xml` | SEO. | `SRC/app/robots.ts`, `sitemap.ts` |

### 1.2 Auth

| Path | Purpose | Main files |
|---|---|---|
| `/login` | Sign in / create account: Google, Apple, magic link (default), password. `?next=`. | `SRC/app/login/page.tsx` |
| `/auth/callback` | Code exchange, then redirect to `next` (default `/dashboard`). | `SRC/app/auth/callback/route.ts` |
| `/oauth/consent/[uid]` (+ `/decide`) | Third-party app consent card. | `SRC/app/oauth/consent/[uid]/page.tsx`, `AircraftPicker.tsx`, `decide/route.ts` |
| `/.well-known/oauth-authorization-server`, `/api/oidc/*` | OAuth 2.1 / OIDC discovery and provider. | `SRC/app/.well-known/...`, `SRC/app/api/oidc/[...path]/route.ts` |

Protected prefixes (redirect to `/login?next=`): `/dashboard`, `/aircraft`, `/profile`, `/admin` (`SRC/lib/supabase/middleware.ts`, wired through `SRC/proxy.ts`).

### 1.3 Account level (global `AppHeader`; some inside `AccountShell`)

| Path | Purpose | Main files |
|---|---|---|
| `/dashboard` | "Your hangar": fleet tiles, aircraft cards, enroll, import backup. AppHeader only, no rail. | `SRC/app/dashboard/page.tsx`, `HeardAbout.tsx`, `ImportBackup.tsx`, `RemoveShared.tsx`, `actions.ts` |
| `/aircraft/enroll` | "Enroll an aircraft" form with FAA registry lookup. AccountShell. | `SRC/app/aircraft/enroll/page.tsx`, `EnrollForm.tsx`, `actions.ts` |
| `/profile` | "Your profile": details, notifications, sign-in methods, MyFlightBook, AI key + allowance, cloud backups, connected apps. AccountShell. | `SRC/app/profile/page.tsx`, `ProfileClient.tsx` (936 lines), `actions.ts` |
| `/profile/credentials` | "Signing credentials" (certificates used to sign authored entries). No shell rail. | `SRC/app/profile/credentials/page.tsx`, `CredentialManager.tsx` |
| `/developers` | "Developer API": register and manage OAuth apps. AccountShell. | `SRC/app/developers/page.tsx`, `DevelopersClient.tsx`, `actions.ts` |
| `/admin` | Admin stats, funnel, announcements, shared-AI provider, users table (`is_admin` only, else 404). | `SRC/app/admin/page.tsx`, `actions.ts` |

### 1.4 Per aircraft (`A/layout.tsx` wraps all in `SRC/components/shell/AircraftShell.tsx`; 404 without access)

| Path | Purpose | Main files |
|---|---|---|
| `/aircraft/[id]` | Overview hub: status gauge, next due, recent activity, coverage bars, Ask teaser. | `A/page.tsx` |
| `/aircraft/[id]/start` | Guided "Set up status in three steps". Not in nav. | `A/start/page.tsx`, `StartClient.tsx`, `actions.ts` |
| `/aircraft/[id]/details` | Edit aircraft details (owner). Not in nav. | `A/details/page.tsx`, `DetailsForm.tsx` |
| `/aircraft/[id]/status` | "Status": read-only urgency-grouped card grid of all items + recurring ADs. | `A/status/page.tsx` |
| `/aircraft/[id]/maintenance` | "Maintenance forecast": recurring items table, add/edit/done, update from logs, MFB sync. | `A/maintenance/page.tsx`, `MaintenanceClient.tsx` |
| `/aircraft/[id]/compliance` | "AD / SB compliance" register + inline AD editor. | `A/compliance/page.tsx`, `ComplianceClient.tsx` |
| `/aircraft/[id]/compliance/explore` | "Explore applicable ADs": FAA search, track candidates. Not in nav. | `A/compliance/explore/page.tsx`, `ExploreClient.tsx` |
| `/aircraft/[id]/squawks` | Report / resolve squawks. | `A/squawks/page.tsx`, `SquawksClient.tsx` |
| `/aircraft/[id]/capture` | Camera capture with quality check and offline queue. | `A/capture/page.tsx`, `CaptureClient.tsx` |
| `/aircraft/[id]/upload` | "Upload scans" (PDF/JPEG/PNG into the same queue). Not in nav. | `A/upload/page.tsx`, `UploadClient.tsx` |
| `/aircraft/[id]/pages` | "Logbooks & pages": scan list, extract, reorder, delete. | `A/pages/page.tsx`, `A/PagesPanel.tsx` (748 lines) |
| `/aircraft/[id]/pages/[pageId]/review` | Single-page review: scan beside entry forms. | `A/pages/[pageId]/review/page.tsx`, `ReviewClient.tsx` (837 lines), `EntryExtras.tsx`, `PageImageEditor.tsx`, `ReextractButton.tsx` |
| `/aircraft/[id]/review` | "Review all entries": flat queue grouped by page, bulk confirm. | `A/review/page.tsx`, `ReviewAllClient.tsx` |
| `/aircraft/[id]/entries/new` | Compose and electronically sign a new entry from a template (`?corrects=` for corrections). | `A/entries/new/page.tsx`, `EntryComposer.tsx` |
| `/aircraft/[id]/entries/[entryId]` | Signed entry view + sticker print controls. Not in nav. | `A/entries/[entryId]/page.tsx`, `StickerControls.tsx`, `SRC/components/EntrySticker.tsx` |
| `/aircraft/[id]/meters` | "Meters": ADS-B hours, current/starting readings, replaced meters, manual readings. | `A/meters/page.tsx`, `MetersClient.tsx` (710 lines) |
| `/aircraft/[id]/oil-analysis` | "Oil & engine trends": lab reports, top-offs, compression and oil-change history. | `A/oil-analysis/page.tsx`, `OilAnalysisClient.tsx`, `OilConsumptionClient.tsx`, `EngineTrends.tsx` |
| `/aircraft/[id]/timeline` | "Logbook timeline": merged entries by year + search + filters. | `A/timeline/page.tsx`, `TimelineClient.tsx` |
| `/aircraft/[id]/ask` | "Ask your logbook": single-question AI Q&A with citations. | `A/ask/page.tsx`, `AskClient.tsx` |
| `/aircraft/[id]/documents` | "Records Vault": categorised file store. | `A/documents/page.tsx`, `DocumentsClient.tsx` |
| `/aircraft/[id]/equipment` | "Installed equipment" inventory + AI suggestions from logs. | `A/equipment/page.tsx`, `EquipmentClient.tsx` |
| `/aircraft/[id]/weight-balance` | W&B revision history and current empty weight/CG. | `A/weight-balance/page.tsx`, `WeightBalanceClient.tsx` |
| `/aircraft/[id]/annual` | "Annual prep": read-only regrouping (due by annual, squawks, loose ends). | `A/annual/page.tsx` |
| `/aircraft/[id]/audit` | "Records gap audit": advisory findings list. | `A/audit/page.tsx`, `SRC/lib/audit.ts` |
| `/aircraft/[id]/summary` | Printable "Maintenance summary". Not in nav. | `A/summary/page.tsx`, `SRC/components/MaintenanceSummary.tsx` |
| `/aircraft/[id]/prebuy` | Printable "Pre-buy dossier". | `A/prebuy/page.tsx` |
| `/aircraft/[id]/export` | "Export & backup": PDF, CSV, .zip; hidden print-only full records report. | `A/export/page.tsx`, `PrintBar.tsx`, `SRC/components/BackupButton.tsx` |
| `/aircraft/[id]/import` | "Import a CSV" 3-step wizard. | `A/import/page.tsx`, `ImportCsvClient.tsx` |
| `/aircraft/[id]/duplicates` | "Duplicates & fixes": duplicate scans/entries, mis-keyed meter readings. | `A/duplicates/page.tsx`, `DuplicatesClient.tsx` |
| `/aircraft/[id]/share` | "Sharing, transfer & delete": record-room links, people, transfer, delete aircraft (owner). | `A/share/page.tsx`, `RoomsPanel.tsx`, `ShareClient.tsx` |

### 1.5 Public share and print

| Path | Purpose | Main files |
|---|---|---|
| `/r/[token]` | Public record room viewer (no account, `noindex`). Tabs via `?tab=`, search via `?q=`. | `SRC/app/r/[token]/page.tsx`, `SRC/lib/recordRoom.ts` |
| `/r/[token]/doc/[docId]`, `/r/[token]/page/[pageId]` | Raw document / scan served under the link's scope. | `route.ts` files beside it |
| `/print/entry/[entryId]?token=` | Token-gated sticker print page minted for the mobile app (10-minute link). | `SRC/app/print/entry/[entryId]/page.tsx`, `PrintNow.tsx` |

### 1.6 API routes that have UI consequences

- Capture and files: `POST /api/aircraft/[id]/capture`, `/blob`, `/documents`; `GET /api/page/[pageId]/image`, `/api/document/[id]`.
- AI: `POST /api/pages/[pageId]/extract`, `/api/aircraft/[id]/ask`, `/maintenance/scan`, `/equipment/scan`, `/oil-analysis/import`, `/import/csv` (`step=analyze|preview|import`).
- Export: `GET /api/aircraft/[id]/export?type=entries|ad|equipment|maintenance`.
- Integrations: `/api/myflightbook/{authorize,callback,sync}`, `/api/backup/[provider]/{authorize,callback}`, `/api/aircraft/[id]/backup/run` (native only), `/api/registry` (FAA lookup).
- Notifications: `/api/push`, `/api/push/test`, `/api/onboarding/unsubscribe` (standalone HTML page).
- Cron: `/api/cron/{daily,backup,adsb,ad-catalog,onboarding}`.
- Mobile sync: `/api/sync/{access,pull,push}`, `/api/aircraft/enroll`, `/api/aircraft/[id]/actions`, `/api/signed-entries/*`.
- Public OAuth API: `GET /api/v1/aircraft`, `GET /api/v1/aircraft/[id]/{airworthiness,equipment,hours,oil,weightbalance}`, `POST /api/v1/aircraft/[id]/hours`.
- Growth/admin: `/api/growth/{heard-about,summary}`, `/api/admin/storage-check`.

---

## 2. Navigation model

Three different chromes exist. A page gets exactly one.

| Chrome | Where | File |
|---|---|---|
| None | `/`, `/login`, `/auth/*`, `/r/*`, `/print/*`, `/oauth/consent/*`, and all MarketingShell pages when signed out | — |
| `AppHeader` (60px sticky bar) | Any signed-in page that is not `/`, `/login*`, `/auth*`, or `/aircraft/{id}/*` | `SRC/components/AppHeader.tsx` |
| `AppHeader` + `AccountShell` rail | `/aircraft/enroll`, `/profile`, `/developers`, `/developers/docs`, `/help`, `/whats-new` | `SRC/components/shell/AccountShell.tsx` |
| `AircraftShell` (own top bar + rail + sub-tabs) | Every `/aircraft/[id]/*` | `SRC/components/shell/AircraftShell.tsx` |

Note the hangar (`/dashboard`) has the AppHeader but **no** rail, while Enroll (one click away) has the AccountShell rail.

### 2.1 AppHeader (account-level top bar)

- Left: triangle logo mark (conic gradient `var(--accent)` → `#8ec8ff`) + "MyTailLog" (Space Grotesk 17px bold) → `/dashboard`; version chip `v{APP_VERSION}` → `/whats-new` (hidden below `sm`).
- Right: `Help`, `Profile`, `Sign out`, each icon + label (label hidden below `sm`), 13px.
- Container `max-w-6xl`, `bg-bg/85 backdrop-blur-md`, bottom hairline.

### 2.2 AccountShell rail (236px, `lg+`)

| Group | Ident | Label | Route |
|---|---|---|---|
| Fleet | `HGR` | Hangar | `/dashboard` |
| Fleet | `NEW` | Enroll aircraft | `/aircraft/enroll` |
| Account | `PRO` | Profile | `/profile` |
| Account | `API` | Developer API | `/developers` |
| Account | `HLP` | Help & docs | `/help` |
| Account | `CHG` | What's new | `/whats-new` |

Below `lg`: a strip with "Hangar" link, the current page label, and a "More" dropdown listing the same groups.

### 2.3 AircraftShell — top bar (60px, sticky, hidden in print)

Left to right:
1. Logo mark + "MyTailLog" (word hidden below `sm`) → `/dashboard` (aria "MyTailLog hangar"); version chip → `/whats-new` (only `xl+`).
2. Tail number (mono 16px semibold); `DEMO` chip (9px) when demo; type string `{year make model}` (12.5px, only `xl+`).
3. Readouts (only `xl+`): `tach hrs` (13px mono value over 9px uppercase label), `hobbs`, and `airframe` when recorded.
4. Annunciator pill (only `2xl+`, i.e. ≥1536px): red dot + overdue count, amber + due soon, green + within limits, grey + needs information (only when > 0). Fallbacks: "Status unavailable", "Nothing tracked yet". Not a link.
5. Spacer, then `Help`, `Profile`, `Sign out` text links (`lg+`). Below `lg` these are replaced by a "More" dropdown.

### 2.4 AircraftShell — left rail (236px, `lg+`, hidden in print)

Top of rail: a card "CURRENT AIRCRAFT / {tail}" with "Hangar →" on the right; the whole card links to `/dashboard`. **This is the only way to switch aircraft.**

Groups and items, exactly as in `buildNav()` (`AircraftShell.tsx:24-138`):

| Group label | Ident | Label | Route | Shown to | Badge | Hub sub-tabs (label → route) |
|---|---|---|---|---|---|---|
| *(none)* | `OVW` | Overview | `/aircraft/{id}` | all | — | — |
| Status | `STS` | Status & forecast | `/status` | all | amber: overdue + due-soon count | Status → `/status` · Forecast → `/maintenance` · AD / SB → `/compliance` |
| Status | `SQK` | Squawks | `/squawks` | all | none | — |
| Log | `CAP` | Capture pages | `/capture` | editors | — | — |
| Log | `RVW` | Review | `/review` | editors | amber: pages with unconfirmed entries | — |
| Log | `ENT` | Add an entry | `/entries/new` | editors | — | — |
| Log | `MTR` | Hours & oil | `/meters` | all | — | Meters & resets → `/meters` · Oil & engine trends → `/oil-analysis` |
| Records | `TLN` | Timeline & Ask | `/timeline` | all | — | Timeline & search → `/timeline` · Ask your logbook → `/ask` |
| Records | `PGS` | Logbook pages | `/pages` | editors | — | — |
| Records | `DOC` | Records Vault | `/documents` | all | — | — |
| Records | `EQP` | Equipment & W&B | `/equipment` | all | accent: pending equipment proposals | Equipment → `/equipment` · Weight & balance → `/weight-balance` |
| Workflows | `ANL` | Annual prep | `/annual` | all | — | Annual prep → `/annual` · Records gaps → `/audit` |
| Workflows | `BUY` | Pre-buy dossier | `/prebuy` | all | — | — |
| Manage | `DAT` | Import, export & duplicates | `/export` | editors | — | Export & backup → `/export` · Import a CSV → `/import` · Fix duplicates → `/duplicates` |
| Manage | `EXP` | Export & backup | `/export` | viewers (replaces `DAT`) | — | — |
| Manage | `SHR` | Sharing & transfer | `/share` | owner | — | — |

Counts: an owner sees **15 rail items in 6 groups**, of which 6 are hubs carrying **14 sub-tabs**; a viewer sees 10 items. Counting tabs as destinations, the shell exposes 23 destinations.

Aircraft routes with **no nav entry**: `/start`, `/details`, `/upload`, `/summary`, `/compliance/explore`, `/entries/[entryId]`, `/pages/[pageId]/review`.

Active state: `panel2` background, `line2` border, ink text, ident turns accent, `aria-current="page"`. A hub stays lit on any of its `match` routes. `PGS` stays lit on `/pages/{id}/review`.

### 2.5 Hub sub-tab strip

Rendered by the shell above page content when the current route belongs to a hub: sticky at the top of the scroll pane, `bg-bg/85` blur, 44px-high buttons, 14px text. Active tab uses the same panel2 + line2 treatment. On phones it is a 2-column grid (so the 3-tab hubs wrap to two rows).

### 2.6 Mobile / narrow behaviour (below `lg` = 1024px)

- Rail is hidden. Idents are not shown anywhere on mobile.
- Top bar keeps the logo mark, tail and DEMO chip, plus a **"More"** dropdown (a `<details>` popover, max 22rem wide; closes on Escape, blur, or link click). It shows an amber review-count badge when pages await review.
- A second row of **shortcut buttons** (4-column grid for editors, 3 for viewers): `Overview`, `Status` (with badge), `Logbook` (= Timeline & Ask), `Capture`. Labels here differ from the rail labels.
- "More" contains: "Your hangar", then every remaining item under its group heading, then "Help & docs", "Profile", "What's new", "Sign out".
- Tach/hobbs readouts and the annunciator are not visible at all on phone or tablet widths.

### 2.7 Other navigation facts

- The content pane scrolls internally (`h-dvh` shell, `overflow-auto` pane) so the top bar and rail stay fixed; print unwinds this.
- Every aircraft page ends with the same footer note (from `A/layout.tsx`): "**Index, not the record.** The physical logbooks remain the system of record per 14 CFR 91.417. Every value is OCR-derived — confirm against the paper logbook before you rely on it."
- Page eyebrows do not match rail groups. Rail groups are Status / Log / Records / Workflows / Manage; page eyebrows are "Airworthiness", "Aircraft", "Add records", "Logbook", "Workflows", "Manage", "Aircraft overview".
- An `Announcement` banner (admin-published, dismissible) can appear under the header on any signed-in page.
- Toasts (`SRC/components/Toast.tsx`): bottom-centre, 4 seconds, green or red, no close button.

---

## 3. Screen-by-screen spec

Conventions used below:
- "Editors" = owner or a share with role `editor`. "Viewers" = role `viewer`. Demo aircraft is shared view-only.
- **Standard page header** (most aircraft pages): `eyebrow` (10px uppercase) + `h1` (Space Grotesk 27px semibold) + lede (13.5px dim, `max-w-xl`).
- **ConfirmButton** (`SRC/components/ConfirmButton.tsx`): inline two-step. First click arms; the control becomes a red `{confirmLabel}` + "Cancel". No modal.
- **LoadError** (`SRC/components/LoadError.tsx`): `role=alert` panel with a message and a "Try again" link.
- Urgency rules (`SRC/lib/compliance.ts`): overdue = due date < today or due hours ≤ current; due soon = within 90 days or 10 hours (VOR check: 5 days); otherwise current; "needs information" when there is no schedule or no meter reading.
- Due text: "{n}d overdue", "due today", "in {n}d (YYYY-MM-DD)", "{h} hrs left", "{h} hrs over", "at {h} hrs".
- Common write errors: "You don't have edit access to this aircraft.", "Someone else changed this just now. Reload and try again.", "Not signed in."

### 3.1 Hangar — `/dashboard` — "Your hangar" (or "Welcome to MyTailLog" with zero aircraft)

- Layout: `max-w-6xl px-5 py-8 sm:px-7`. AppHeader only.
- Header: eyebrow "Fleet"; h1 (30px); sub "Choose an aircraft to review its records, check upcoming maintenance or add logbook pages."
- **"How did you hear" card** (profile younger than 14 days and unanswered): h2 "How did you hear about MyTailLog?"; "Skip"; helper "One tap. It tells us where to spend our time. Nothing else is tracked."; pills Reddit · Facebook group · Pilots of America / forum · Type club · Search · App Store / Play · Friend or mechanic · MyFlightBook · Other. Error "Couldn't save that. Try again."
- **Fleet tiles** (≥1 aircraft; 2 columns, 4 from `sm`): "Aircraft", "Overdue fleet-wide" (red), "Due soon" (amber), "Pages to review" (amber). "—" when data is unavailable.
- **Disclaimer banner** (amber, `role=note`): "**This is an index, not the record.** The physical logbooks remain the system of record per 14 CFR 91.417. MyTailLog does not replace official maintenance records, is not an airworthiness determination, and is not a maintenance sign-off. Every value shown is derived from OCR/extraction — confirm it against the paper logbook before you rely on it."
- Eyebrow "Aircraft" (or "Get started"). Card grid 1 / 2 (`sm`) / 3 (`xl`).
- **Aircraft card**:
  - 58px status-coloured ring with a ✈ glyph; tail (mono 19px).
  - Chip: "DEMO · VIEW ONLY", or "SHARED · CONTRIBUTE" / "SHARED · VIEW".
  - Type line `{year} {make} {model}` or "Details not set".
  - Status strip, by precedence: "Status unavailable" · "{n} overdue" · "{n} due soon" · "{n} need information" · "Nothing tracked yet" · "No tracked items overdue". Right side: "{n} to review" or "Review count unavailable".
  - Line: "{tracked} tracked · {unknown} need information. Verify against the logbooks."
  - Stats: "Tach hrs", "Entries", "Records span" (`YYYY–YYYY`).
  - "Open aircraft →" → `/aircraft/{id}`.
  - Owner, non-demo: "Manage / delete aircraft" → `/aircraft/{id}/share#delete-aircraft`.
  - Shared or demo: "Remove from my dashboard" → inline "Remove {tail}?" "Yes" / "Cancel".
- **Enroll card** (dashed): "+" · "Enroll an aircraft" · "Add a tail number, then capture or upload its logbooks to start the index." → `/aircraft/enroll`.
- **Import card** (dashed button): "⇱" · "Import from backup" · "Restore an aircraft from a MyTailLog `.zip` archive — scans, extractions and status, intact." Hidden `.zip` file input. Progress inside the button: "Reading archive…", "Restoring scans… n/N", "Restoring records…". Errors: "Not a MyTailLog backup (no manifest).", "This isn't a MyTailLog backup file.", "This backup is from a newer version of MyTailLog.", "Import failed.", "Please sign in again." Always creates a new aircraft and opens it.
- Load errors: "Your aircraft could not be loaded." / "Some records could not be loaded. Fleet status is unavailable."
- Actions: `leaveSharedAircraft`, `POST /api/growth/heard-about`, client `importBackup`.

### 3.2 Enroll — `/aircraft/enroll` — "Enroll an aircraft"

- Layout: AccountShell; `max-w-2xl px-6 py-8`. Eyebrow "Fleet". Sub: "This creates the aircraft and its three logbooks (airframe, engine, prop). You can add pages and entries next."
- Single-column form:
  - Tail number* (placeholder "N12345").
  - Button "Look up FAA registry" ("Looking up…") → `GET /api/registry?tail=`; overwrites make, model, serial, year. Note on success: "Filled from FAA registry · {registrant} · engine: {make model}. Review and adjust as needed." Errors: "Enter a tail number first.", "No FAA registration found for that tail number.", "Lookup failed.", "Network error during lookup."
  - Make ("Cessna") | Model ("172N"); Year ("1978") | Serial number ("17271234").
  - Engine serial(s) ("L-12345-27A"; "Comma-separated for multi-engine."); Prop serial(s) ("EN-98765").
  - Home base ("KXYZ"; "Sensitive — stored private to your account.").
  - Hobbs at enrollment ("2450.3") | Tach at enrollment ("1890.5") | Airframe at enrollment ("3120.0"; "Gliders and motorgliders — leave blank if you don't track it.").
  - Submit "Enroll aircraft" ("Enrolling…").
- Validation: "Tail number is required.", "Year must be a whole number.", "hobbs must be a number." (also tach, airframe), "Couldn't enroll the aircraft.", "Aircraft saved, but logbooks failed: …".
- Side effects: creates 5 logbooks (airframe, engine, prop, avionics, other) and 4 Part 91 items (annual, transponder, pitot-static, ELT), then redirects to `/aircraft/{id}/start`.
- Footer: inline disclaimer "Index only — not the legal maintenance record (14 CFR 91.417). Confirm against the physical logbook before relying on any value."

### 3.3 Start — `/aircraft/[id]/start` — "Set up status in three steps"

- Gate: editors; others redirect to the hub. Layout `max-w-3xl`. Eyebrow "Get started · {tail}".
- Sub: "Your current hours and the date of your last annual are enough to start counting down what's due. You can scan the rest of your logbooks afterwards. **Skip for now**" (→ hub).
- Stepper: "1. Current hours", "2. Last annual", "3. Your status" (done = green top border + ✓; current = accent). The step is derived from data, not stored; there is no back navigation.
- **Step 1** "What do the meters read today?" — helper "Hour-based items count down from these. The tach is enough if you don't have a hobbs." Inputs Tach ("2214.7"), Hobbs ("3118.2"). "Save hours". Errors: "Enter the tach, the hobbs, or both.", "Readings must be zero or a positive number." Writes a manual reading dated today. Skipped automatically if meters were given at enrollment.
- **Step 2** "When was your last annual?" — helper "Photograph the page with your most recent annual sign-off. It's usually the last inspection entry in the airframe logbook. We'll read it and you confirm it."
  - Choose: primary "Photograph or upload the page" (JPEG/PNG/PDF); secondary "Type the date instead".
  - Working: "Preparing the photo…" → "Uploading…" → "Reading the page. This can take up to a minute…".
  - Pick: "Which entry is the annual? Check the date against the page." Radio list of extracted entries (date + 280-char text), first match for "annual" preselected; "Annual date" (date, max today); "Confirm annual"; "None of these". Note: "Confirming marks this entry reviewed. The page's other entries wait in Review."
  - Type: "Date of the last annual"; "Save"; "Back".
  - Errors: "Use a photo (JPEG or PNG) or a PDF.", "Couldn't read that file.", "The upload didn't go through. Check your connection and try again.", "Couldn't read the page.", "No entries were found on that page. Try a sharper photo, or type the date.", "Pick a valid date on or before today."
- **Step 3** headline: "{tail} has an overdue item." / "{tail}: {n} item(s) due soon." / "{tail} is current on what we know so far." Four rows — Annual inspection (91.409), Transponder test (91.413), Pitot-static / altimeter (91.411), ELT inspection (91.207) — each with a dot and due text, or " · last done?" + inline date + "Save". Box: "**Next: work backward through the airframe logbook.** Reminders go out by email before anything comes due; adjust them in Profile." Buttons "Scan more pages" → `/capture`; "Go to overview".
- Actions: `saveStartHours`, `pageEntries`, `confirmAnnual`, `setItemDate`, `POST …/capture`, `POST /api/pages/{id}/extract`.

### 3.4 Aircraft overview — `/aircraft/[id]` — h1 = tail number

- Layout `max-w-6xl`; header then two rows of two panels (`xl:grid-cols-2`). Eyebrow "Aircraft overview".
- Header: tail (mono 34px); `{year make model} · S/N {serial}` or "Details not set".
- Header actions: "Finish setup · {done} of 2 details →" (amber; editors with incomplete setup) → `/start`; "Edit aircraft details" (owner) → `/details`; chip "Shared · contribute" / "Shared · view only"; "Capture pages" (primary, editors) → `/capture`; "Export & backup" → `/export`.
- **Panel "Tracked maintenance status"**: readout "tach ≈ {x} · hobbs {x}"; 132px ring gauge (red/amber/green/grey) with centre number and caption "need attention" / "need information" / "tracked alerts" / "not assessed"; legend rows overdue · due soon · within recorded limits · need information; "Review tracked status →" → `/status`; paragraph "{n} tracked items. Only recorded items are assessed. Tach reading as of {date}. Hobbs reading as of {date}. Verify against the physical logbooks." (or "Nothing tracked yet. Add maintenance items to begin."); **"MOST URGENT" banner** with label, due text and arrow → `/status`.
- **Panel "Next due · Part 91 forecast"**: "View forecast →" → `/maintenance`; up to 4 maintenance items (ADs excluded) with dot, label, due text, right-hand countdown ("212d", "3d over", "12.5h", "check reading", "hours unknown"); each row → `/maintenance#item-{id}`. Empty: "No recurring items yet. Set up status →".
- **Panel "Recent activity"**: "timeline & search →"; 3 latest entries (date, logbook chip, "tach {n}", 2-line text). Rows are not links. Empty: "No entries yet — capture and review a page to get started."
- **Panel "Records coverage · {firstYear} → today"**: right "{n} pages need review" (amber) or "{n} pages"; one coverage bar per logbook with "{count} · {YYYY}–{YYYY}"; note "{Logbook} gap {YYYY}–{YYYY}. Missing pages, or just a quiet stretch?"; CTAs "Review {n} pending pages →" (amber fill) + "All pages", or "Browse logbooks & pages →". Empty: "No pages captured yet."
- **Panel "Ask your logbook"**: link "Ask about your records →"; "Try "When was the engine last overhauled?" Answers cite the source entries for you to check."
- Error variants for each panel ("…could not be loaded.").

### 3.5 Aircraft details — `/aircraft/[id]/details` — "Edit {tail} details"

- Owner only. `max-w-2xl`. Back link "← Aircraft overview". Sub: "Add or correct the details you skipped during enrollment. Check serial numbers against the aircraft and component records."
- Fields: Make, Model, Year, Airframe serial number, Engine serial number(s), Propeller serial number(s), Home base. Submit "Save aircraft details". Success "Aircraft details saved."
- Tail number is not editable. No FAA lookup here. Meters are edited on Meters.

### 3.6 Status — `/aircraft/[id]/status` — "Status" (hub tab 1 of Status / Forecast / AD / SB)

- Read-only. `max-w-6xl`. Eyebrow "Airworthiness". Sub: "Every recurring inspection, item, and AD at a glance — grouped worst-first and color-coded by urgency. Derived from your logs; verify against the physical logbooks."
- Header readout: "tach ≈ {n} (est.|rough est.) · hobbs {n} (est.) · airframe {n}" or "hours unknown", with tooltips explaining each estimate.
- Count chips: "{n} overdue", "{n} due soon", "{n} current", "{n} need information".
- Sections in order "Overdue", "Due soon", "Needs information", "Current"; card grid `auto-fit minmax(210px,1fr)`.
- **Card** (whole card links to `/compliance#item-{id}` for ADs, `/maintenance#item-{id}` otherwise): dot + label; chips "AD", "✓ A&P" (corroborated by a scanned A&P AD report), "advisory"; line "OVERDUE · {n} days overdue" / "due soon · …" / "current · {n} hrs left" / "needs information"; optional projection "at recent use, hours run out ≈ 14 Mar 2027 ({confidence} confidence)" with an explanatory tooltip; mono line "due {date} · at {hrs} {meter} · last {date}" or "no schedule set"; thin progress bar of interval elapsed.
- Empty: "No status items yet. Add the standard Part 91 items on the maintenance forecast and record AD compliance to populate this."
- Error: "Tracked status could not be loaded. No assessment is available."

### 3.7 Maintenance forecast — `/aircraft/[id]/maintenance` — "Maintenance forecast"

- `max-w-6xl`. Eyebrow "Airworthiness". Lede: "Standard Part 91 recurring items and recurring ADs, sorted by urgency. Advisory items (TBO, overhaul) are informational, not regulatory. Due dates are only as accurate as the last-done data you enter — verify against the physical logbooks." Optional second paragraph explaining "≈ a calendar date" projections ("planning estimate, not a determination").
- Toolbar left: "Current tach ≈ {n} (est.) · hobbs {n} (est.)" with tooltips ("Tach drives regulatory items (100-hr, annual)", "Hobbs drives usage items (oil change)"); "hobbs {n} · tach {n} as of {date} · from MyFlightBook".
- Toolbar right: "Sync hours" (MyFlightBook); "Update from logs" (AI; only with a key configured); "Add standard Part 91 items" (only when there are zero items); primary "Add item".
- Helper: "Last-done dates update automatically as pages are extracted; use "Update from logs" to rescan the full history. Verify against the physical logs."
- **Item form** (inline panel above the table; eyebrow "New item" / "Edit item"): Type (Custom + standard list; choosing one prefills); Label*; Interval (months); Interval (hours); "Hours counted on" (Default / Tach / Hobbs / Airframe, with helper about oil defaulting to hobbs); Last done date; Last done hours; checkbox "Regulatory (mandatory under Part 91) — uncheck for advisory items like TBO"; Notes. "Save" / "Cancel".
- Standard types and defaults: Annual inspection (91.409) 12 mo; Transponder test (91.413) 24 mo; Pitot-static / altimeter (91.411) 24 mo; ELT inspection (91.207) 12 mo (these four count calendar months); VOR check (91.171) 30 days; 100-hour inspection (91.409) 100 hrs; Oil change 50 hrs (advisory, hobbs); Engine TBO 2000 hrs (advisory); Propeller overhaul 72 mo (advisory).
- **Table** (fixed 6 columns): Item | Interval | Last | Next due | Remaining | Actions. Item cell: glowing dot, label, chips "advisory" / "AD". Remaining is coloured by urgency, with "est." and a projection line. Notes under the row.
  - Maintenance rows: "Done", "Edit", "Delete" (ConfirmButton). AD rows: "Compliance →".
  - **"Done" inline form**: "Date done" (today), "Hours ({meter}, optional)" (prefilled), "Meter" select, "Save" / "Cancel".
- Empty: "No maintenance items yet. Seed the standard Part 91 items or add your own."
- Toasts: "Item added.", "Item updated.", "Added standard Part 91 items.", "Marked "{label}" done.", "Deleted "{label}".", "Updated {n} item(s) from {m} entries.", "Scanned {m} entries — no recurring-maintenance completions detected.", "Scan failed.", MFB sync messages.
- Actions: `upsertMaintenanceItem`, `deleteMaintenanceItem`, `markMaintenanceDone`, `seedStandardItems`, `POST …/maintenance/scan`, `POST /api/myflightbook/sync`.
- Viewers see all buttons; the server rejects.

### 3.8 AD / SB compliance — `/aircraft/[id]/compliance` — "AD / SB compliance"

- `max-w-6xl`. Eyebrow "Airworthiness". Lede: "Airworthiness Directives and Service Bulletins found in your logs, with compliance method and next due. This is your private tracking record, not an airworthiness determination — the physical logbooks and the FAA remain authoritative." Right link "Explore applicable ADs →".
- Toolbar: "Current hours ≈ {tach}" / "Current hours unknown"; primary "Add AD / SB".
- One red error line under the toolbar is the only error surface on the page.
- **"Referenced in your logs — not tracked yet"** (dashed section): pill buttons "+ AD 2011-10-09" / "+ SB …"; one click creates an open record.
- **AD editor** (inline panel above the list; opened by "Add AD / SB" or a row's "Edit"; scrolls into view and takes focus). Title "Track an AD or service bulletin" / "Edit AD {number}". Two-column grid:
  - Type: "AD (mandatory)" / "SB (advisory)".
  - Number* (placeholder "2015-19-07"); Title.
  - Status: "Open", "Complied (CW)", "Previously complied (PCW)", "Does not apply (DNA)", "Superseded".
  - Recurring (checkbox) → reveals "Interval (hours)" and "Interval (months)".
  - Complied date; Complied hours; Method of compliance.
  - Related equipment (select of components; helper "Removing this equipment will mark the AD not applicable.").
  - Applicability / notes (textarea).
  - Only for DNA / Superseded: "N/A since" / "Superseded on" date; "Reason" (placeholder "e.g. vacuum pump removed").
  - "Save" / "Cancel" (no dirty check; opening another row replaces the form).
  - Validation: "AD/SB number is required.", "Pick AD or SB.", "Pick a status.", "Intervals and hours must be zero or a positive number."
  - Next due is never typed here; the server derives it only when recurring and Complied.
- **Record cards** (sorted overdue → open → due soon → upcoming → rest; 3px left border by state):
  - Row 1: chip "AD"/"SB"; number (mono); method; title; right "last {date} · {hours}h", "next {dueText}" or "no due date", projection.
  - Row 2 badges: status pill; urgency pill; "✓ A&P report"; "recurring {n} hrs / {n} mo".
  - Row 3: "Superseded|Not applicable since {date} — {reason}"; notes.
  - Row 4 official reference: "FAA · Federal Register · {title}" or "FAA DRS · {title}"; "effective {date}"; links "Federal Register ↗", "Official PDF ↗", "FAA DRS document ↗".
  - Row 5 actions: "Edit"; "Look up FAA record"; "Delete" (native `window.confirm("Delete tracking for {ref}?")`).
- Empty: "No AD/SB records yet. Add one, or track a number referenced in your logs."
- Lookup miss: "Couldn't find AD in the Federal Register or FAA DRS. Double-check the number, or it may be a very old AD indexed differently." No success toasts.
- Actions: `upsertAdRecord`, `deleteAdRecord`, `trackRef`, `saveAdReference`, `enrichViaDRS`.

### 3.9 Explore applicable ADs — `/aircraft/[id]/compliance/explore`

- `max-w-3xl py-10`; plain h1 (`text-2xl font-bold`), no eyebrow. Not in nav; no link back to compliance.
- Lede explains manufacturer vs model search and ends "This is a starting point, not a determination: applicability is your and your A&P's call — confirm against the AD itself (serial numbers, installed equipment), then track what applies."
- Search panel: "Manufacturers to search: {makes}" (from aircraft make + equipment makes); "Model" (prefilled); "Keywords (optional, comma-separated)" (placeholder "fuel selector, Hartzell, seat rail…"); button "Find candidate ADs" ("Searching FAA sources…").
- Summary: "{n} candidate AD(s) (excluding ones you already track) — {m} name a model matching {model}. A candidate is a lead to check, not a determination that it applies."
- **Result card**: chip "AD"; number; search-term pill; "DRS legacy · {status}"; "names your model" (accent); "effective {date}"; title; 3-line abstract; "Models named:" chips.
- Card actions: "Track this AD" → "Tracking ✓"; "Track with an interval…" (inline expander: radios One-time / Recurring, Interval (hours), Interval (months), Next due (date), Next due (hours), "Track with these"); "Federal Register ↗" / "DRS ↗"; "PDF ↗".
- Errors: "Nothing to search — set the aircraft make or model, add equipment with a manufacturer, or type a keyword.", "Couldn't reach the Federal Register or DRS just now — try again.", "A recurring AD needs an interval — hours, months, or both."

### 3.10 Squawks — `/aircraft/[id]/squawks` — "Squawks"

- `max-w-3xl`. Eyebrow "Aircraft". Sub: "Track discrepancies noticed in flight — a rough mag, a sticky switch, a small leak. Anyone with access can report one; it stays open until a mechanic clears it."
- **"Report a squawk"** (all roles): textarea (placeholder "e.g. #2 radio intermittent on transmit"); severity Low (default) / Medium / High; "Report squawk". Toast "Squawk reported." Error "Describe the issue."
- **"Open ({n})"**: severity chip + description + "Reported {date} by {name}"; editors get "Resolve" (one click, no note). Empty: "No open squawks. 🎉"
- **"Resolved ({n})"**: struck-through description, "Resolved {date} — {notes}"; editors get "Reopen" and "Delete" (ConfirmButton).
- Actions: `addSquawk`, `resolveSquawk`, `reopenSquawk`, `deleteSquawk`.

### 3.11 Meters — `/aircraft/[id]/meters` — "Meters" (hub tab 1 of Hours & oil)

- `max-w-3xl`, five stacked sections. Eyebrow "Aircraft". Sub: "What each instrument reads, what the app counts maintenance on, and any meter that has been replaced. Record airframe time here too — a sailplane has no tach or hobbs to read it from." Viewers read-only.
- **§1 "ADS-B passive hours"**
  - Off: long explainer (OpenSky Network asked once a day with only the public ICAO 24-bit address; nothing about the user leaves the app; no track stored) + four-bullet limits list ("Airborne wall-clock is neither tach nor hobbs…", coverage gaps, not every aircraft broadcasts, "Nothing is ever written for you, and an accepted estimate never counts as compliance evidence — confirm the real meter.").
  - Controls: "Mode S address (optional)" (placeholder "looked up automatically") + "Turn on ADS-B checks".
  - On: "Watching {HEX} via OpenSky, once a day." + "Turn off". No suggestion: "Nothing unaccounted for — your recorded readings cover every flight seen."
  - Suggestion (amber box): "ADS-B detected **{n} flight(s) totalling ≈{h} h** since your last recorded reading… Hour-based items may be **≈{h} h closer** than shown." "Suggested {meter}: {from} → {to}". Buttons "Record a reading" (inline number + "Save"/"Cancel") and "Dismiss".
  - Toasts: "Watching {HEX}.", "ADS-B checks off.", "Reading recorded."
- **§2 "Current readings"**: three cards Hobbs, Tach, Airframe — value; "{total} total, incl. the meter it replaced"; "estimated — no {meter} reading on record"; "as of {date} · from {a logbook entry | MyFlightBook | entered by hand | an ADS-B estimate | the starting reading}". Note: "Airframe time is never estimated from the other two…".
- **§3 "Starting readings"** + "Edit": three cards + note "What each meter read when you added this aircraft on {date}. Every hours countdown starts from here, so a wrong figure shifts all of them. **Clear a meter to stop tracking it**…". Edit form: three numbers (placeholder "not tracked"), "Save"/"Cancel". Toast "Starting readings updated."
- **§4 "Replaced meters"** + "Record a replacement": explainer; form Meter (Hobbs/Tach/Airframe), "First date on the new meter", "Old meter's final reading" (blank = inferred), "New meter started at" (0), Notes. List row "{Meter} replaced {date}", "{prior} → {new}" or "inferred → {new}", "Remove" (ConfirmButton). Empty: "No meter replacements recorded."
- **§5 "Readings entered by hand"** + "Add a reading": form Date (today), Hobbs, Tach, Airframe; list of the 50 most recent manual readings with "Remove". Empty: "Nothing entered by hand. Readings also arrive from scanned logbook pages and MyFlightBook syncs."
- Actions: `updateEnrollmentMeters`, `addMeterReset`, `deleteMeterReset`, `addMeterReading`, `deleteMeterReading`, `setAdsbEnabled`, `dismissAdsbFlights`, `acceptAdsbEstimate`.

### 3.12 Oil & engine trends — `/aircraft/[id]/oil-analysis` (hub tab 2 of Hours & oil)

- `max-w-5xl`. Eyebrow "Aircraft". Sub: "Import your lab reports (Blackstone, AVLab, …) to track wear-metal trends over time. Values are read from the report by AI — confirm anything important against the original, and treat the lab's own written assessment as authoritative."
- **A. Lab reports**
  - "Import oil report" ("Reading report…"); accepts PDF/JPEG/PNG/WebP. Helper "Blackstone / AVLab PDF, or a photo of the report. Every sample in the report is imported." Success "Imported {n} sample(s) from {lab}" (+ tail-mismatch warning).
  - Panels: "Latest sample — {date}" (Hours on oil, Engine hours, Oil added, Oil type, "Lab assessment: …"); "Wear-metal trend" (mini charts for iron, chromium, aluminum, copper, nickel, silicon, lead; dashed universal average; amber above average, red at ≥2×); "Elements — latest sample (ppm)"; "Oil properties — latest sample" (viscosity, flashpoint, fuel %, antifreeze %, water %, insolubles %, TBN, TAN); "All samples ({n})".
  - Empty: "No oil analysis yet. Import a lab report to start tracking wear-metal trends."
  - Samples cannot be edited or deleted.
- **B. "Oil consumption"**: "Log each top-off with the tach/hobbs to track the burn rate over time." Readout "{x.x} hrs/qt" + "avg burn rate · on {meter}". Notes about estimated or excluded top-offs. Toggle "+ Top off oil" → form Date, Quarts added ("1.5"), Tach, Hobbs, Notes; "Log top-off". List "{date} · {q} qt tach {x} · hobbs {y} — {notes}" + "Delete" (ConfirmButton). Empty: "No top-offs logged yet. Log one after your next quart to start the trend."
- **C. "Historical engine trends"**: explainer ("…this is a record view, not a diagnosis."); "Cylinder compression" line chart per cylinder + table Date | Readings (psi) | Review ("Source entry" / "Confirm source"); "Oil-change intervals" table From | To | Interval; footnotes about recognised entries.
- Actions: `addOilTopOff`, `deleteOilTopOff`, `POST …/oil-analysis/import`.

### 3.13 Shared facts for the digitize pipeline

- Logbook types and labels (`SRC/lib/logbooks.ts`): airframe "Airframe", engine "Engine", prop "Propeller", avionics "Avionics", other "Other". A custom `logbook.title` overrides. "Other" holds non-log documents (W&B sheets, AD compliance reports) that are classified and applied, not turned into entries.
- Status enums are shown as raw lowercase text in pills: extraction `pending | processing | extracted | failed`; review `unreviewed | confirmed | disputed`.
- Fields that carry AI confidence and a source box: entry_date, hobbs, tach, description, work_performed, parts, signature_name, mechanic_cert_number, ad_refs, sb_refs. Airframe time is owner-entered only.
- Confidence threshold 0.75. Below it a field gets an amber chip and amber border. A "clean" entry has overall ≥ 0.75, no field below 0.75, and is not a continuation.
- A page "needs review" when it is extracted and has at least one unconfirmed entry (not when `page.review_status` says so).
- **AI allowance** (`SRC/lib/extraction/aiContext.ts`): rolling 24 hours. Shared key 100 calls per user; own key 1000; global shared ceiling $20/day. A page usually costs 2 calls (3 with rotated stickers). Error strings shown verbatim: "Daily AI limit reached (100 calls). Add your own API key in Settings to raise it.", "Daily AI limit reached (1000 calls). Try again tomorrow.", "The app's shared AI budget for today is used up. Add your own API key in Settings to keep using AI.", "Shared AI is disabled. Add your own API key in Settings."
- **AI reading progress**: there is no polling and no streaming. Each page is one blocking `POST /api/pages/{id}/extract` (up to 300 s). The row flips to "processing" optimistically. Bulk extraction is a sequential loop in the browser tab.
- `ZoomableImage`: click opens a full-screen lightbox (`bg-black/90`); click toggles fit ↔ actual size; scroll to pan; Esc, backdrop or "✕ Close" closes.

### 3.14 Capture — `/aircraft/[id]/capture` — "Capture pages"

- `max-w-6xl`. Eyebrow "Add records". Sub: "Photograph logbook pages one at a time. Each shot is checked for blur, glare, and resolution, then queued on-device and uploaded when you have signal — so you can digitize a whole logbook in a hangar offline." `?logbook=` preselects.
- **Left column** (sticky, 360px at `lg`): eyebrow "{Logbook} · {tail}"; "Page #{next}"; black 3:4 preview ("Take a photo of the page" / "Processing…" / last shot); status row "{n} page(s) waiting to upload" or "Queue empty" + "Online" (green) / "Offline — queued on-device" (amber); buttons "Take a photo" / "Retake" and "Sync".
- **Right column**: "Logbook" select; helper "Next page #{n} · {m} already captured"; for the Other logbook: "Scan A&P Weight & Balance sheets and AD compliance reports here — they're auto-classified and applied to your W&B and AD tracking."; checkbox (default on) "Handwritten page (routes to vision extraction)"; "Upload now"; three info panels "Your phone's own camera", "Batch a whole logbook", "Works with no signal".
- **Modal "Review page"** (the only true modal overlay in the app): image; "{w}×{h} · sharpness {n} · glare {x}%"; amber issues "Resolution too low…", "Image looks blurry. Hold steady and let the camera focus.", "Glare detected. Tilt the page or move away from the light."; buttons "Add to queue" (green) or "Keep anyway" (amber), and "Retake". Thresholds: short edge ≥ 1000px, sharpness ≥ 80, glare ≤ 4.5%.
- Status text: "Uploaded {n} page(s). {m} still queued.", "Couldn't read that photo. Try again, or use Upload scans."
- Footer: "Captured pages are stored on this device until uploaded, then reviewed and extracted later. MyTailLog is an index of your logbooks, not the legal maintenance record."
- Mechanism: IndexedDB queue, drained by the page and by a service worker.

### 3.15 Upload scans — `/aircraft/[id]/upload` — "Upload scans"

- `max-w-3xl py-10`; plain h1 (`text-3xl font-bold`), no eyebrow. Reached only from the Logbook pages header.
- Intro: "Already have your logbooks scanned? Upload PDFs or images. Multi-page PDFs are split into individual pages, queued on-device, and uploaded — the same pipeline as camera capture, so pages are reviewed and extracted together later."
- Form: "Logbook" select + helper "Next page #{n} · {existing} already captured"; checkbox "Handwritten pages (routes to vision extraction)" (default on).
- Status row: "Online" / "Offline — pages queued on-device"; "{n} page(s) waiting to upload" / "Queue empty"; "Upload now".
- Dropzone-styled label (click only, no drag-and-drop): "Choose PDF, JPEG, or PNG files" / "Processing…"; "Multi-page PDFs are split into one page each, in order."; progress "{file} — page {i}/{total}".
- Results: "Added {N} page(s) from {M} file(s)"; per file "{n} page(s) · {w} low quality" or an error ("Unsupported type (need PDF, JPEG, or PNG).", "Couldn't read this file.").
- Behaviour: PDFs rasterised in the browser (pdf.js), long edge 2400px; quality report is informational; no AI call here.
- No onward link after upload.

### 3.16 Logbook pages — `/aircraft/[id]/pages` — "Logbooks & pages"

- `max-w-6xl`. Eyebrow "Add records". Sub: "Every captured scan, grouped by logbook. Click a logbook to filter; click a page to open its review, or a thumbnail to magnify it." Header buttons (editors): "Upload scans" (secondary), "Capture pages" (primary).
- **Logbook tiles** (4 columns; toggle a filter): label, component ref, "{n} page(s)". With one selected: "📷 Capture into {label}" + "Opens the camera with this logbook already selected." and "show all".
- **Pages header**: "Pages · {logbook}"; summary "{n} need review" (amber) or "all extracted pages reviewed" (green) + " · {n} reviewed". Buttons: "Review all ({n})" → `/review`; "Thumbnails ({n})" (one-time backfill); "Extract {n} pending" / "Extracting…". When extraction is not available: the text "Set ANTHROPIC_API_KEY to enable extraction".
- **Filter/sort bar**: pills "All", "Needs review", "Processing" (with counts); "Reorder" / "Done reordering" (↑ ↓ per row; one logbook + upload order only); "Sort" (Upload order, Entry date, Tach, AFTT); "Save this order"; "↑ Asc" / "↓ Desc". Sort is remembered in localStorage.
- **Selection bar** (editors): "Select all" / "Select all shown"; "{n} selected · {m} entries"; "Clear"; "Delete {n}" → "Delete {n} pages + {m} entries". Hint "Tick pages to delete several at once."
- **Page row** (amber left border when it needs review): checkbox; 48px thumbnail (lightbox); "#{seq}"; logbook label; "{n} entries" / "not extracted"; "· two-page spread — split during review"; red extraction error; date + meter; review badge "disputed" / "needs review" / "✓ reviewed"; extraction pill (raw status); actions "Review", "Extract" / "Re-extract", "Delete" (ConfirmButton → "Delete + {n} entries").
- Empty: "No pages yet. Capture or upload logbook pages to extract entries." / "Nothing to review here." / "Nothing processing." / "No pages in {logbook}."
- Toasts: "Page deleted.", "Deleted {n} pages.", "Saved the order of {n} pages.", "Generated {n} thumbnail(s)."
- Actions: `deletePage`, `deletePages`, `reorderPages`, `POST /api/pages/{id}/extract`, `POST …/blob`.

### 3.17 Single-page review — `/aircraft/[id]/pages/[pageId]/review` — "Review {Logbook} · page #{n}"

- `max-w-6xl py-10`; plain h1 (`text-2xl font-bold`), no eyebrow.
- Header right: "Re-extract page" (native confirm "Re-extract this page? Existing entries for it are replaced."); "← Previous" / "{pos} of {total}" / "Next →" (same logbook, by page sequence).
- Sub: "Confirm or correct what the extractor read. Nothing here is a legal record — it's an index of your physical logbooks."
- Green banners: "Classified as {Weight & Balance document | AD compliance report | Unrecognized document} · {date} — {summary}." + link "View weight & balance" / "View AD compliance"; "Printed MyTailLog sticker matched to an existing signed entry. No duplicate entry was added."
- **Layout: two equal columns at `lg`** (`grid lg:grid-cols-2`), stacked below.
- **Left — the scan** (sticky at `top-[72px]`, no max height):
  - "✂ Crop & clean up" (editors).
  - Full-width image; click opens the lightbox.
  - **Spotlight**: when a field's ◎ is toggled, a 2px accent ring is drawn on that field's source box and the rest of the scan is dimmed.
  - Caption: "Tap a field's ◎ to spotlight where it was read. Click the image to magnify."
  - Amber notes: "Detected as a two-page spread — entries from both pages are listed; check that none were missed." / "There is sideways or rotated content on this page (often a sticker affixed at 90°) that couldn't be read in full. Compare against the paper — if an entry is missing, add it with **Add an entry the extractor missed** below."
  - Toggle "Show extracted text" / "Hide extracted text" (raw OCR in a `<pre>`).
  - **Crop editor** (replaces the image): "Crop & clean up"; "Drag the corners to cut out the background."; four corner handles; "↻ Rotate"; "Scan look" (grayscale + contrast); "Reset"; "Cancel"; "Save changes". Warning: "This **replaces the stored scan** — the paper page remains your legal record, and you can always re-capture it. Entries already extracted came from the old image, so if the crop changed what's readable, re-extract this page afterwards."
- **Right — entries**: "{n} entries · {m} confirmed" + page status pill. Stacked EntryCards, then a dashed button "+ Add an entry the extractor missed", then footer buttons "Mark page reviewed" (primary; returns to the pages list), "Flag as disputed", "Done".
  - Empty: "This page hasn't been extracted yet. Extract it from the aircraft page, or add entries manually below."
- **EntryCard** (shared with Review all):
  - Header: "New entry" / "Confirmed" / "Extracted"; right "{n}% overall" / "manual" / "reviewed".
  - Continuation banner: "This looks like the continuation of an entry that started on the previous page." + "Merge into that entry".
  - Fields: "Entry category" (logbook select; helper "The scanned page stays in its original book."); "Date"; "Hobbs"; "Tach"; "Airframe"; "Description"; "Work performed"; "Parts"; "Signature"; "Cert #"; "AD refs (comma-sep)"; "SB refs (comma-sep)".
  - Per field: label + ◎ locate button (18px) + confidence chip "{n}%" (green ≥ 75, amber < 75). Flagged empty fields show placeholder "needs your input".
  - Buttons: "Save & confirm" (primary; saving confirms); "Confirm as-is" / "Unconfirm"; "Merge ↑ prev page"; "Delete" (red, immediate, no confirm).
  - **Extras sub-panel**: "Attachments" (list of Vault documents with "unlink"; "None."; "+ Add file"; "+ Link from Vault" → select) and "Reference links" (list with "remove"; inputs "Label" and "https://…"; "Add").
- Keyboard shortcuts: none (only Esc in the lightbox). No "next page needing review".
- Actions: `saveEntry`, `addEntry`, `deleteEntry`, `setEntryConfirmed`, `setPageReview`, `mergeContinuation`, `setEntryLinks`, `setDocumentEntry`, extract, blob, documents.

### 3.18 Review all — `/aircraft/[id]/review` — "Review all entries · {tail}"

- Editors only. `max-w-6xl py-10`. Eyebrow "Add records". Sub: "Every extracted entry in one scroll — edit inline, confirm as you go, or confirm all the clean ones at once. Low-confidence fields are flagged; use **Open page ↗** to check against the original scan. This is an index of your logbooks, not a legal record."
- Toolbar: pills "Needs review {n}" (default) / "All entries {n}"; "Confirm {n} clean" (tooltip: "Confirm every high-confidence entry the AI flagged nothing on. Anything with a low field is left for you.").
- Groups by logbook then page: header "{Logbook} · page #{n}" or "{Logbook} · imported (no scan)"; "{n} entries here"; "Open page ↗". Body: scan on the left (sticky, height capped to the viewport, same spotlight), EntryCards on the right. Scan-less groups are full width.
- Not available here: add a missed entry, mark page reviewed/disputed, crop, re-extract.
- Empty: "Nothing left to review — every entry is confirmed." / "No entries yet."
- Toasts: "Confirmed {n} clean entries · {m} still need your review.", "Nothing clean to confirm — the rest need your eyes.", "Merged into the previous page."

### 3.19 New entry — `/aircraft/[id]/entries/new` — "New logbook entry" (or "Correct a signed entry")

- Editors only (404 otherwise). `max-w-3xl`. Back link "← Logbook timeline". Sub: "{tail} · Your draft stays on this device until you sign online. Sign only work you are authorized to approve."
- **Step 1 form**:
  - "Logbook"; "Template": "Oil and filter service", "Tire replacement", "Spark-plug service", "Battery service", "General maintenance".
  - Source note with the regulation reference (e.g. "14 CFR Part 43 Appendix A(c)(23)…") + "Applicability depends on the aircraft, work, and signer. Annual and 100-hour inspections require a separate record and are not supported here."
  - "Completed" (date), "Tach", "Hobbs", "Airframe time".
  - Template fields, e.g. oil: "Oil brand and type", "Oil quantity and unit", "Filter brand, model and part number", "Removed filter inspection findings", "Maintenance instructions / revision", "Checks actually performed". Other templates have equivalent sets.
  - "Work performed — review and edit before signing" (auto-generated, editable) + "Reset to template wording".
  - "Person who performed the work".
  - Signing box: "Sign with certificate" select; link "Manage credentials"; copy "Signer: {name}. Your signature approves return to service only for the work described. The signed record cannot be edited or deleted; corrections create another signed entry."; attestation checkbox "I performed or approved only the work described, am authorized to sign it, and intend this electronic signature to approve return to service for that work."
  - Button "Email a signing code".
- **Step 2 "Confirm your signature"**: "An eight-digit code was sent to your account email. It expires in 10 minutes. Review this exact entry before entering it:"; the work text and meters; "Signing code"; "Sign this entry"; "Edit entry".
- Many specific validation errors (missing fields, no credential, wrong credential for template, rate limit of 5 codes per 15 minutes, wrong/expired code).
- Draft autosaves to localStorage. Success → `/entries/{newId}`.

### 3.20 Signed entry + sticker — `/aircraft/[id]/entries/[entryId]` — "Signed logbook entry"

- Any reader. `max-w-3xl`. "← Logbook timeline". Copy: "This entry is locked. To fix an error, create a correcting entry that points back to it."; optional "This entry has been superseded by a signed correction."; "Physical logbook scan: view page 1…" or "No physical page scan linked yet."; button "Create correction".
- **Sticker controls**: "Sticker width (inches)" (2–7, default 4); "Paper" (US Letter / A4); "Print or save PDF"; "Print at 100% scale on full-sheet adhesive paper and trim to fit. Check on plain paper first."
- **Sticker** (black on white): "{tail} · {logbook}" + date; Tach / Hobbs / Airframe; work text; "Work performed by: {name}"; "Electronically signed by {name} · {cert kind} ({rating}) #{cert no}"; "Signature approves return to service only for the work described above."; UTC timestamp; "MTL ENTRY ID: {uuid}"; "MTL DIGEST: {16 chars}"; "Physical signature: ______".
- `/print/entry/[entryId]?token=` is the same sticker for the mobile app with a 10-minute token; paper fixed to Letter.

### 3.21 Timeline — `/aircraft/[id]/timeline` — "Logbook timeline" (hub tab 1 of Timeline & Ask)

- `max-w-6xl`; list + 296px sticky sidebar. Eyebrow "Logbook". Sub: "Every extracted entry across airframe, engine, prop, and avionics — merged by date and searchable." Header button "New logbook entry" (primary; shown to all roles).
- **List**: collapsible year sections (▶ caret, year, count, rule); most recent year open; all open while searching; "Undated" group. `?entry=` expands and scrolls to one entry.
- **Entry row**: 48px thumbnail (lightbox) or grey square; date + "tach {n}"; 2px logbook-colour rail; logbook pill; status "● confirmed" / "{n}% · unconfirmed" / "electronically signed" / "superseded by correction"; "Hobbs {n}"; formatted description (+ work performed); link "View signed entry and print sticker"; chips "AD {ref}" / "SB {ref}"; "Attached:" document chips; parts chips; right link "source" → page review.
- **Sidebar panel 1**: search input "Search all entries…" (300 ms debounce, full-text RPC); status "Searching…" / "{n} results for "q"" / "{n} entries across all logbooks"; "Filter by logbook" toggle pills.
- **Sidebar panel 2** "At a glance": "Total entries", "Span", "Logbooks".
- Empty: "No entries match "q"." / "No logbooks selected — enable a filter." / "No entries yet. Extract some pages to build the timeline."
- Not present: date range, AD or status filters, sort control; signature and cert # are not shown.

### 3.22 Ask — `/aircraft/[id]/ask` — "Ask your logbook" (hub tab 2)

- `max-w-6xl`; main + 300px sticky sidebar. Eyebrow "Logbook". Sub: "Ask a plain-English question about {tail}'s history. Answers are drawn only from your extracted entries and cite the entries they came from — verify against the physical logbooks."
- Form: input (placeholder "e.g. When was the last annual?") + "Ask" button. Suggestion chips (auto-submit): "When was the last annual inspection?", "When was the engine last overhauled?", "What ADs have been complied with?", "When was the transponder last certified?", "What avionics have been installed?"
- Loading: "Reading for "{question}"…". Answer card: question in accent 11px, answer 14.5px plain text. "Cited entries": cards with date, logbook, 220-char snippet; link to page review when a scan exists.
- Disclaimer: "AI answers can be wrong — confirm against the physical logbook before relying on any date, hour, or compliance claim."
- Sidebar "Why it's trustworthy": "Answers only from **your** extracted entries — never the open internet." / "Every claim links back to the **source entry** you can open." / "Still an index — the paper logbook stays the record."
- One question, one buffered answer; no history, no follow-ups. Any reader can spend an AI call.
- Errors: "AI Q&A needs a provider key configured on the server or in Profile.", "Question is too long (max 2000 characters).", allowance messages, "Network error."

### 3.23 Import a CSV — `/aircraft/[id]/import` — "Import a CSV · {tail}"

- Editors only. `max-w-3xl py-10`. Eyebrow "Add records". Sub: "Coming from another platform, or from your own spreadsheet? Upload the CSV and we'll work out what each *column* means — you confirm that once, and every row is then converted in plain code, the same way every time. Imported entries land **unconfirmed**, so nothing drives a reminder or a forecast until you've reviewed it."
- **Step 1**: "Which logbook do these entries belong to?"; file input; "Read the columns"; "CSV only (up to 5 MB / 5,000 rows). Any spreadsheet saves as CSV in one step."
- **Step 2 "Check what each column means"**: "{rows} rows · {cols} columns · {separator}-separated…". Table Column | First value | Import as (Date, Description, Work performed, Parts, Hobbs, Tach, Airframe time, Signature / mechanic, Certificate #, AD references, SB references, Don't import), with an amber "{n}%" chip for low-confidence mappings.
  - Ambiguous dates box: "Which way round are these dates?" with samples and buttons "Month/day/year (US)" / "Day/month/year". When resolved automatically: "Dates read as … — settled by a day past the 12th somewhere in the file, not guessed."
  - "Check what will be created".
- **Step 3**: "{n} entries will be created"; expandable "{n} rows can't be read and will be skipped"; duplicate warning; "Import {n} entries".
- **Done**: "Imported {n} entries"; "They're in the review queue, **unconfirmed**…"; buttons "Review the imported entries", "Fix duplicates", "Import another file".
- Specific server errors for size, row count, unmapped date/description, inconsistent dates.

### 3.24 Duplicates & fixes — `/aircraft/[id]/duplicates`

- Editors only. `max-w-5xl`. Eyebrow "Add records". Sub explains heuristic matching and that "one copy in each duplicate group is suggested to keep."
- **"Possible mis-keyed readings · {n}"**: row = date, source pill ("MyFlightBook" / "log entry"), "{field} {value}" + reason (" · below an earlier reading", " · unusually large jump", " · same value as tach (duplicated into hobbs)"), "Open", then "fix to" number + "Accept", or "Clear {field}", and "Keep mine".
- **"Duplicate scans · {n}"**: cluster line "{n} pages look like the same scan in {logbook}."; rows with thumbnail, "page #{n}", "{n} entries", "Open", "suggested keep", "Delete" (ConfirmButton → "Delete page + {n} entries").
- **"Duplicate entries · {n}"**: "{n} entries look like the same logged event."; rows with thumbnail, date, meter, "confirmed", text, "Open", "suggested keep", "Delete".
- Empty: "Nothing to review. (Duplicate matching and mis-keyed-reading checks are heuristic — they can't catch everything; give pages a quick scan too.)"

### 3.25 Records gap audit — `/aircraft/[id]/audit` (hub tab 2 of Annual prep)

- Read-only, server-rendered. `max-w-6xl`. Eyebrow "Airworthiness". Sub: "Suspected gaps in the digitized records — missing annuals, timeline gaps, and AD-compliance gaps — measured against the 91.417(b) retention baseline. These are advisory heuristics over the extracted entries, not an airworthiness determination; verify against the physical logbooks. A flagged gap may simply mean the relevant pages aren't digitized yet."
- Summary: "{w} warning(s) · {n} finding(s) across {m} entries". Finding card: title, category, pill "gap" / "note", detail.
- Findings: "No annual inspections detected"; "Possible missing annual(s): {years}"; "~{n}-year gap in records ({a} → {b})"; "{AD|SB} {ref}: recurring, no compliance recorded"; "{ref}: past next-due with no newer compliance".
- No links from a finding to anything; no dismiss.

### 3.26 Records Vault — `/aircraft/[id]/documents` — "Records Vault"

- `max-w-4xl`. Eyebrow "Aircraft". Lede: "The aircraft's permanent records in one place — airworthiness certificate, registration, POH/AFM, weight & balance, STCs, 337s, and more. These sit alongside your logbook scans, so the paperwork you'd otherwise dig a binder for is a click away."
- **"Add a document"** (editors): toggle "+ Upload" / "Cancel". Form: Category; File* (PDF or image); Title (defaults to file name); Reference # (placeholder "STC / form / tag number"); Document date; Notes; "Upload"; hint "PDF or image, up to 25 MB."
- Categories, in order: Airworthiness certificate, Registration, Radio station authorization, POH / AFM, Weight & balance, STCs, Form 337, Form 8130-3, ICA, Maintenance manuals, Other.
- **List**: one section per non-empty category. Row: title link (opens in new tab); "{reference} · {date} · {size} — {notes}"; optional "Linked record: {date} — {summary}" + "unlink"; "Download"; "Delete" (ConfirmButton).
- Empty: "No documents yet." (+ "Upload the aircraft's certificates, STCs, and manuals to keep them here.")
- Toasts: "Document added.", "Document removed.", "Detached from the entry — still in the Vault.", "Upload failed."
- Metadata cannot be edited after upload. Linking a document to an entry happens only from the page-review screen.

### 3.27 Installed equipment — `/aircraft/[id]/equipment` (hub tab 1 of Equipment & W&B)

- `max-w-6xl`. Eyebrow "Aircraft". Lede: "Track what's currently installed and what's been removed. This drives AD applicability — removing a component marks its Airworthiness Directives no longer applicable (with the removal date), and installed equipment surfaces the ADs that apply to it."
- Toolbar: "{n} installed · {m} removed"; "Scan logs for equipment" (AI); primary "Add manually". Helper: "The equipment list is built primarily from your logbooks. Scan the logs to propose what was installed and removed over time, then confirm."
- **Suggestions section** (accent border): "{n} equipment suggestion(s) from your logs"; "all" / "none"; per proposal a checkbox (pre-checked), name, make, category pill, "installed"/"removed" pill, confidence %, "P/N … · S/N … · installed {date} · removed {date}", quoted source text. Buttons "Import {n} selected", "Dismiss selected".
- **Form** ("New equipment" / "Edit equipment"): Name* ("Vacuum pump"); Manufacturer ("Garmin, Dukes…"); Category (airframe, engine, prop, avionics, other); Part number; Serial number; Install date; Life limit + Unit (hours, months, cycles); Notes. "Save"/"Cancel".
- **Lists**: "Installed" table Component | Make / model | Installed | Actions; "Removed" list (dimmed). Row: category dot, name, "{n} AD(s)" pill, make, date; actions "Edit", "Mark removed" / "Reinstall", "Delete"; sub-line with P/N, S/N, removed date, life limit, notes.
- Native dialogs: "Mark removed" uses `window.prompt` for a typed date (and warns how many linked ADs will be marked not applicable); "Delete" uses `window.confirm`.
- Status copy (inline, not toasts): "Found {n} new suggestion(s) from {m} entries.", "Imported {a} new, updated {u} from the logs.", "Removed. {n} AD(s) marked not applicable."
- Empty: "No equipment tracked yet. Add installed components to drive AD applicability."

### 3.28 Weight & balance — `/aircraft/[id]/weight-balance` (hub tab 2)

- `max-w-6xl`; main + 300px sidebar. Eyebrow "Aircraft". Lede: "A history of your W&B revisions and the current empty weight and CG. This is an index, not a loading calculator or the legal W&B record — confirm against the aircraft's official weight & balance data."
- **Card "Current weight & balance"**: "as of {date} · {method}"; four readouts (21px mono): "Empty weight" lb, "CG arm" in, "Moment" lb-in, "Useful load" lb. Empty: "No W&B revision recorded yet."
- **"Revision history"**: cards with date, green "current" pill on the newest, method pill, "EW {n} lb · CG {n} in · moment {n} lb-in", reason, "ref: {reference}", notes; "Edit", "Delete" (ConfirmButton). Empty: "No revisions yet. Add your aircraft's current W&B, then a new revision each time equipment changes."
- **Sidebar**: amber card "May be out of date" — "{n} equipment change(s) recorded after the last W&B revision ({date}):" + up to 8 lines "{date} — installed|removed {name}" + guidance + "View in equipment →". Below it the primary "+ Add revision".
- **Revision form**: Revision date*; Method (Weighed / Computed); Empty weight (lb); Max gross weight (lb); CG arm (in); Moment (lb-in); Reason for change ("e.g. Installed GTN 650, removed KX-155"); Reference (Form 337 / doc); Notes. Helper "Enter any two of weight / arm / moment — the third is filled in (moment = weight × arm)."
- Toasts: "Revision added.", "Revision updated.", "Revision deleted."

### 3.29 Annual prep — `/aircraft/[id]/annual` — "Annual prep · due {date}"

- Read-only. `max-w-5xl`. Eyebrow "Workflows". Lede: "What to settle before you hand the aircraft and the books to your IA: items coming due, open squawks for the shop, and loose ends in the digitized records." Primary button "Print summary for your IA" → `/summary`.
- Notice when the annual date is unknown: "The date of the last annual isn't known yet, so this page looks 90 days ahead." + "Set the annual date →" (editors) → `/start`.
- Three panels (`md:grid-cols-3`):
  - "Due by the annual · {n}": rows with dot, label, due text; link to `/compliance` or `/maintenance`. Empty: "Nothing else falls due before the annual."
  - "Open squawks for the shop · {n}": severity dot, description, reported date. Empty: "No open squawks."
  - "Before you hand over the books": checklist — "{n} pages awaiting review" / "All extracted pages reviewed"; "{n} pages not read yet"; up to 5 audit findings; "All {n} records findings →".
- Nothing can be resolved in place.

### 3.30 Maintenance summary — `/aircraft/[id]/summary` (print-first; no nav item)

- `max-w-4xl`. Screen-only header: eyebrow "Manage"; lede "The one-page picture of the aircraft — status, open squawks, ADs, what's coming due, installed equipment and current weight & balance. Print it for a buyer, an insurer, or your IA at annual. For the full entry-by-entry record, use the records export on the Export & backup page." Buttons "Share summary" (Web Share API or clipboard; plain text) and "Print / Save as PDF".
- **Article** (12px base), reused by the public record room:
  1. "{tail} — maintenance summary"; "{year make model} · S/N … · engine S/N … · prop S/N …"; "Generated {date} · tach {n} est. · hobbs {n} est. · airframe {n}".
  2. "Status at a glance": tiles Overdue, Due soon, Within recorded limits, Needs information, Open squawks.
  3. "Inspections, items & recurring ADs ({n})": Item (+ "req'd") | Last done | Next due | Remaining | Status.
  4. "Open squawks ({n})": Reported | Severity | Discrepancy | By.
  5. "AD / SB compliance ({n})": Ref (+ "rec") | Title | Status | Complied | Next due.
  6. "Installed equipment ({n})": Component | Make | Part no. | Serial no. | Installed.
  7. "Current weight & balance": Revision date, Method, Empty weight, Empty CG (arm), Empty moment, Max gross, Useful load, Reference, Reason.
  8. Legal footer: "Generated by MyTailLog from an index of {tail}'s physical logbooks. This is **not** the legal maintenance record and **not** an airworthiness determination — the paper logbooks remain the system of record under 14 CFR 91.417. Every value here is OCR-derived; verify against the original logbooks before relying on it." + "Kept with MyTailLog, a free logbook tracker for aircraft owners · mytaillog.com".
- Print: chrome and screen header hidden; tokens re-pointed to a light ramp; tables avoid page breaks. Browser print only, no PDF library.

### 3.31 Pre-buy dossier — `/aircraft/[id]/prebuy`

- `max-w-4xl`, printable. Eyebrow "Workflows". Lede: "A source-linked briefing for a prospective buyer or mechanic. Print or save as PDF, then inspect the linked records and physical logbooks before relying on any finding." Buttons "Share with a buyer" (owner; → `/share?room=Buyer#record-room`) and "Print / Save as PDF".
- Article sections: header block (tail, type, serials, generated date, meters); "Records coverage" (counts, per-logbook page/review counts and date span, pages needing extraction or review with links); "Items to investigate" (audit findings, non-current status items, open squawks, each with a source link); "AD status and equipment"; "Engine history" (latest compression, oil-change intervals); "Scope and next checks" (limits statement).
- Empty investigate state: "No issue was flagged by the available records. This does not establish completeness or airworthiness."

### 3.32 Export & backup — `/aircraft/[id]/export`

- `max-w-6xl`. Eyebrow "Manage". Lede: "Your data is yours. Print a status report, pull a spreadsheet, or take a complete re-importable archive — no lock-in."
- Three cards:
  - "PDF reports": "Maintenance summary →" and "Full records report (every entry)" (opens the print dialog on a hidden print-only report).
  - "CSV export": links "Entries", "AD/SB", "Equipment", "Maintenance".
  - "Full backup (.zip)": "Scans, extractions and metadata in one re-importable archive, with a README.txt documenting every file and column. Recommended monthly." Button "Download backup (.zip)" with progress "Reading records…", "Packing scans… n/m", "Compressing…".
- Panel "You can leave whenever you like" with three bullets: "Export and re-import.", "Open formats, no reader required.", "MIT licensed and self-hostable."
- Print-only report: "{tail} — records export"; AD / SB compliance; Equipment; Maintenance forecast; Logbook entries (every entry).

### 3.33 Sharing, transfer & delete — `/aircraft/[id]/share` (owner only)

- `max-w-6xl`. Eyebrow "Manage". Lede: "Send a read-only link to {TAIL}'s records, invite people to view or contribute, hand the aircraft to a new owner, or delete it." Layout: full-width record-room panel, then a 2-column grid (People | Transfer + Delete).
- **Panel "Record room links"** (owner-side management)
  - Intro: "A read-only link for a buyer, mechanic, IA or insurer. They don't need an account and see only what you pick. Every link expires, you can revoke it at any time, and each view is counted."
  - Existing link row: label; "revoked" | "expires YYYY-MM-DD" | "expired YYYY-MM-DD" · "N view(s)" · "last YYYY-MM-DD". Active: "Copy", "Preview" (new tab), "Revoke" (red, no confirm). Inactive: "Delete".
  - Create form: "Who is it for?" (placeholder "Buyer · J. Smith"); "Include" checkboxes — "Maintenance summary · status, ADs, equipment, W&B" (on), one per logbook "{title} · {n} confirmed" (on), "Page scans from selected logbooks (may include unconfirmed content)" (off), one per Vault document (on); amber warning about unconfirmed entries; "Expires in" 7 / 30 / 90 / 180 days (default 30); "Create link". Success: "Link created. Copy it".
  - Links cannot be edited or extended. The app does not send the link.
- **Panel "People with access"**: "Viewers see everything read-only; editors can review and add revisions." Owner row ("You", email, "Owner"); share rows (initials, email, "View only" | "Can contribute", "Remove" — no confirm). Empty: "Not shared with anyone yet." Form "Invite by email": email + role select + "+ Invite". Helper: "We email them an invitation. They get access as soon as they sign in with this email — no account needed first." Notices for sent / not-sent email. Role changes require re-inviting.
- **Panel "Transfer at sale"**: "Hands {TAIL} and all its records to another MyTailLog user in one step. They must already have an account. This can't be undone by you afterward." Email + "Transfer ownership" (native confirm).
- **Panel "Delete aircraft"** (red-tinted): "Permanently removes {TAIL} and everything under it… Export a backup first." "Type DELETE to confirm:" + "Delete…".
- Roles: owner; editor ("Can contribute"); viewer ("View only"). Owner-only: sharing, transfer, delete, record rooms, running a backup, OAuth consent.

### 3.34 Public record room — `/r/[token]` (recipient side, no account)

- `max-w-4xl`, no app chrome, `noindex`.
- Header: eyebrow "Records shared by the owner · expires YYYY-MM-DD"; h1 = tail; "{year make model} · S/N {serial}"; disclaimer "The physical logbooks are the legal record (14 CFR 91.417). This page is an index the owner built from them and shows only entries the owner has confirmed. Check the originals before you rely on it."
- Tabs (links): "Summary" (if included), one per included logbook, "Documents · {n}".
- Summary tab: the same article as §3.30.
- Logbook tab: search form ("Search entries" + "Search"); rows with date, "description · work performed", "tach N", and "scan ↗" only if scans were included. Confirmed, non-superseded entries only; newest 500 ("Showing the newest 500. Search to find older entries.").
- Documents tab: title, date, "Open ↗".
- Inactive (revoked, expired, unknown — all identical): "This link is no longer active" / "Ask the owner for a new one."
- Footer: "These records are kept with **MyTailLog**, a free logbook tracker for aircraft owners. Track your own aircraft →".
- Each load and document open is counted as a view (hashed IP). The owner's preview is not counted.

### 3.35 Profile — `/profile` — "Your profile"

AccountShell; `max-w-2xl`; one column of bordered cards; no tabs or anchors. Header: eyebrow "Account"; the user's email; admins also get "Admin dashboard →".

1. **"Details"**: "Full name" (placeholder "Jane Aviator"); "Save". Then a loose link "Manage logbook signing credentials →".
2. **"Notifications"** (one form):
   - Intro: "A daily check emails you before maintenance, inspections, and ADs come due. Set how far in advance per category…"
   - Checkbox "Email me reminders before items come due" (master; **off by default**).
   - Checkbox "Email me setup tips as I add my aircraft and logbooks" (on by default).
   - "The phone app": "Reminders also arrive on the MyTailLog app. Send a test to check this account's devices can receive them." Button "Send a test" with explicit result messages.
   - Per-category lead times (disabled while the master is off): Annual inspection — 90 days; Oil change — 10 hours; Airworthiness Directives (AD/SB) — 30 days, 25 hours; Everything else — 30 days, 25 hours.
   - "Save notifications".
3. **"How you sign in"**: "Magic links to **{email}** always work. Set a password to also sign in with one."; Google and Apple rows ("Connected" or "Connect"); "Set / change password"; "Change email" ("Send confirmation").
4. **"MyFlightBook"**: intro (register your own OAuth app at MyFlightBook, paste client ID and secret); "Status: Connected as {username}" | "Not connected"; fields "Client ID", "Client secret", "MyFlightBook username"; "Save credentials"; "Connect MyFlightBook" / "Reconnect"; "Sync from MyFlightBook"; "Disconnect". A conditional info box explains the alternative push route via Connected apps.
5. **"AI & your API key"**: intro ("Extraction and Q&A run on the app's shared AI provider with a daily cap. Add your own Anthropic or OpenAI API key…"); "Status: Using your {provider} key (…last4)" | "On the shared key"; **allowance bar** "Used in the last 24 hours — {n} / {cap} calls" (accent, amber above 80%, red at cap) with the explanation "A logbook page usually takes 2 calls to read — 3 if it has rotated stickers — so this allowance is roughly {cap/2} pages a day. Calls free up individually 24 hours after you make them, not all at once at midnight."; own-key stats "Cost so far", "AI calls", "Input tokens", "Output tokens"; form "Provider" (Anthropic | OpenAI), "API key", "Save key", "Remove key".
6. **"Automatic cloud backups"**: intro (monthly or quarterly .zip to `MyTailLog/<TAIL>/<date>-<TAIL>.zip`; "we only ever *add*"); one sub-card each for Dropbox and Google Drive: status, "Frequency" (Off | Monthly | Quarterly), "Save", "Disconnect {Name}", stats "Next run", "Last run", "Result", "Size", and "Connect {Name}" / "Reconnect {Name}".
7. **"Connected apps"** (only when grants exist): app name; aircraft scope; raw scope ids; "Revoke".
8. Bare "Sign out" button.

`/profile/credentials` — "Signing credentials": "← Profile"; intro "Enter the certificate you will use when signing maintenance entries. These details are self-declared; MyTailLog does not verify FAA privileges."; list rows "{Kind} · {number} · {rating}" + "Remove"; "Add a credential": "Certificate kind" (Private pilot | Commercial pilot | Airline transport pilot | Mechanic (A&P)), "Certificate number", "Ratings"; "Save credential".

### 3.36 Developer API — `/developers`, consent — `/oauth/consent/[uid]`

- `/developers`: eyebrow "Account"; lede "Register an app to read aircraft data (with each owner's consent) over OAuth 2.1."; "API docs →".
  - "Register an app": "Name"; "Redirect URIs" (textarea); "Scopes" checkboxes — `airworthiness:read`, `aircraft:read`, `equipment:read`, `hours:read`, `hours:write`, `oil:read`, `weightbalance:read`, `offline_access`; "Confidential (server-to-server)"; "Register app". Result boxes "Your client_id:" and "Client secret — copy it now, it won't be shown again."
  - "Your apps": name, "confidential" | "public", client_id, scopes, redirect URIs; "Edit scopes", "Rotate secret", "Delete" (none confirm). Empty: "No apps yet."
- Consent card (`max-w-md`, no chrome): eyebrow "Authorize access"; "{App} wants to read [and update] your aircraft data"; "Signed in as {email}. Read-only — no changes are ever made."; "It will be able to" + scope bullets with an amber "writes" pill; "Which aircraft": "All my aircraft" (default) | "Only the aircraft I choose"; "Allow access" | "Deny". Expired: "Request expired".

### 3.37 Admin — `/admin`

`max-w-5xl`. Stat tiles (Users, New (7d), New (30d), Active, Aircraft, Logbooks, Pages, Entries); "Activation funnel" (Signed up, Aircraft, Uploaded, Reviewed, Status ready, Summary); "Sign-ups by source" table; "In-app updates" (publish a title, message and optional link to all users; list of the last 10 with "End"); "Shared AI" provider select (Anthropic | OpenAI | Disabled); users table (User, Aircraft, Logbooks, Pages, Entries, Joined, Last entry).

### 3.38 Login — `/login`

`max-w-md`, centred, no chrome. h1 "Sign in to MyTailLog" / "Create your account". Buttons "Continue with Google", "Continue with Apple". Note about connecting social sign-in later in Profile. "Or continue with email". Segmented toggle "Magic link" (default) | "Password". Fields "Email", "Password". Submit "Send magic link" | "Sign in" | "Create account". Links "New here? Create an account", "Forgot password?". Success notices replace the form ("Check {email} for your sign-in link.").

### 3.39 Reminders and notifications (no dedicated screen)

- Daily cron: emails users with the master switch on about items inside their lead window or overdue, once per item per due cycle. Subject "MyTailLog: N maintenance item(s) due — {tails}". The same reminder is pushed to registered phones only when the email was sent.
- Setup-tip emails per onboarding milestone, with a standalone unsubscribe page.
- In-app, the only signals are the amber nav badges (status, review), the accent equipment badge, the hangar tiles, and admin announcements.

---

## 4. Workflows as currently implemented

### 4.1 First session → "status ready" (known annual date + current hours)

1. `/login` → magic link, Google, Apple or password → `/auth/callback` → `/dashboard`.
2. Hangar shows the demo aircraft card (N734DM, "DEMO · VIEW ONLY") and, at the end of the grid, the dashed "Enroll an aircraft" card. The "How did you hear" card sits on top.
3. Click "Enroll an aircraft" → `/aircraft/enroll`. Type the tail; optionally "Look up FAA registry"; up to 10 optional fields → "Enroll aircraft".
4. Redirect to `/aircraft/{id}/start`. Step 1: tach and/or hobbs → "Save hours" (skipped if given at enrollment).
5. Step 2: either "Photograph or upload the page" → wait up to a minute → pick the entry → "Confirm annual"; or "Type the date instead" → date → "Save".
6. Step 3: status headline; optional inline dates for transponder, pitot-static, ELT → "Go to overview" or "Scan more pages".

Minimum: about 6 clicks, 3 typed values, 3 screens. Friction:
- The demo aircraft hides the zero-aircraft "Welcome" state, so a new user's first screen leads with a fictional aircraft and puts the real first action last in the grid.
- Enroll asks for meters, then Start asks again (two different stored concepts: "starting readings" vs a manual reading).
- Enroll says "three logbooks" but five are created; the hub chip says "of 2 details" while Start says "three steps".
- No back step in Start; a mistyped tach must be fixed on Meters.
- Reminders are off by default and Start only mentions them in passing.

### 4.2 Digitize a logbook (upload → AI read → review → confirm)

1. Rail "Capture pages" (camera, one page at a time with a quality-check modal), or rail "Logbook pages" → "Upload scans" (PDF/images; a multi-page PDF is split in the browser).
2. Pages queue on the device and upload in the background. Neither screen links onward.
3. Go to "Logbook pages" manually. New rows read "not extracted" with pill `pending`.
4. Click "Extract {n} pending" (or per-row "Extract"). Rows go `processing` → `extracted` or `failed`. The tab must stay open; there is no progress count and no cancel.
5. Review either per page ("Review" on a row → scan left, entries right) or in bulk (rail "Review" → all entries in one scroll).
6. Per entry: edit, then "Save & confirm", or "Confirm as-is". Optional: "Merge ↑ prev page", "+ Add an entry the extractor missed", "Delete". In bulk review, "Confirm {n} clean" confirms every high-confidence entry.
7. "Mark page reviewed" returns to the pages list; "Next →" moves to the next page.

Page lifecycle: extraction `pending → processing → extracted | failed`; review `unreviewed → confirmed | disputed`. Friction:
- Four screens (Capture/Upload, Pages, Review page, Review all) and at least two manual navigations with no hand-off.
- Extraction is a separate manual step after upload, bound to an open tab.
- Remaining AI allowance is not shown anywhere in this flow; it is only on Profile.
- Two review surfaces with different capabilities (crop, re-extract, add-missed and mark-page exist only per page; bulk confirm exists only in Review all).
- "Mark page reviewed" does not clear the "needs review" badge, which keys off unconfirmed entries *(inferred)*.

### 4.3 Log hours and oil

- Hours: rail "Hours & oil" → Meters → scroll to the fifth section "Readings entered by hand" → "Add a reading" → date + hobbs/tach/airframe → "Save". (4 clicks plus a long scroll.)
- Other hours sources: MyFlightBook sync ("Sync hours" on Forecast, or daily), ADS-B suggestion ("Record a reading"), extracted logbook entries, the OAuth `hours:write` API.
- Oil top-off: rail "Hours & oil" → tab "Oil & engine trends" → scroll past the lab-report panels → "+ Top off oil" → date, quarts, tach, hobbs, notes → "Log top-off".
- Oil change done: Status hub → tab "Forecast" → row "Oil change" → "Done" → date/hours → "Save".
- Friction: the most frequent task has no entry point on the hangar, the overview or the top bar. Hours, top-offs and "oil change done" live on three different pages.

### 4.4 Add and resolve a squawk

- Add: rail "Squawks" → description + severity → "Report squawk" (any role).
- Resolve: "Resolve" (one click; no note, date or linked entry is asked although the data model supports all three).
- Afterwards: "Reopen", or "Delete" (resolved items only). No edit.
- The overview shows no squawk count and the rail item has no badge.

### 4.5 Handle an AD

1. Discover, three ways: chips "Referenced in your logs — not tracked yet" on AD / SB; "Explore applicable ADs →" (FAA search by make/model/keyword); or the public `/ads` catalog (no in-app track action).
2. Track: one click on a chip or "Track this AD" (status Open), or "Track with an interval…", or "Add AD / SB" and fill the editor.
3. Record compliance: back on AD / SB (no link from Explore) → find the card → "Edit" → set Status "Complied (CW)", date, hours, method → "Save".
4. Recurring: tick "Recurring" + intervals; next due appears once status is Complied. Each recurrence overwrites the previous compliance (no history).
5. Equipment link: choosing "Related equipment" means a later "Mark removed" on Equipment flips the AD to "Does not apply".

Friction: no dedicated "record compliance" action; no link to the logbook entry that did the work; a next-due typed in Explore is wiped on the first edit *(inferred)*; one-time ADs with a deadline cannot carry a due date.

### 4.6 Prepare for the annual

1. Rail "Annual prep" → read three panels.
2. Each row jumps to the top of another page (Forecast, AD / SB, Squawks, Review, Pages, Records gaps). Fix there, navigate back manually.
3. "Print summary for your IA" → `/summary` → "Print / Save as PDF".

Friction: Annual prep is a read-only dashboard; nothing can be settled in place and the row links ignore the existing `#item-{id}` anchors.

### 4.7 Pre-buy dossier and record room link

- Dossier: rail "Pre-buy dossier" → "Print / Save as PDF".
- Record room: dossier → "Share with a buyer" (or rail "Sharing & transfer") → label, tick what to include, expiry → "Create link" → "Copy it" → paste into your own email.
- Monitor views on the row; "Revoke" is immediate.
- Friction: the link form sits on a page that also holds transfer and delete-aircraft; a link's contents are not shown on its row and cannot be edited; the app never sends the link.

### 4.8 Share with a co-owner or mechanic

1. Rail "Sharing & transfer" → scroll past record-room links → "People with access".
2. Email + "View only" / "Can contribute" → "+ Invite". Access is granted immediately; no acceptance step.
3. The invitee signs in with that email and sees the aircraft in their hangar with a "SHARED · …" chip.
4. Change role by re-inviting; "Remove" is immediate with no confirm.

### 4.9 Export, backup, restore

- Manual: rail "Import, export & duplicates" → "Download backup (.zip)" (built in the browser), or CSV links, or "Full records report (every entry)" (straight to the print dialog, no preview).
- Automatic: Profile → "Automatic cloud backups" → "Connect Dropbox" / "Connect Google Drive" → frequency. No "run now" on the web; the run day is fixed per user.
- Restore: Hangar → "Import from backup" card → choose the .zip → a new aircraft is created and opened.
- Friction: export is per aircraft, automatic backup is per account in Profile, restore is on the hangar — three places for one job.

### 4.10 Cross-cutting friction patterns

- **Duplicated entry points**: three links to Status on the overview; Capture reachable from rail, overview header, pages header and pages tiles; Summary reachable only from Annual prep and Export.
- **Inconsistent confirmation**: inline ConfirmButton (11 uses), native `window.confirm`/`prompt` (7 call sites), typed "DELETE", or nothing at all (entry delete in review, remove person, revoke link, re-extract from the list).
- **Inconsistent feedback**: toasts on 12 screens, inline status paragraphs elsewhere, one page-level error line far from the action on AD / SB and Explore.
- **Inconsistent role gating**: some pages hide edit controls from viewers (W&B, Vault, Meters); others show them and fail on submit (Forecast, AD / SB, Equipment, page review).
- **Edit forms open above the list** without scrolling or focus on Forecast, Equipment and W&B.
- **Read-only dashboards that deep-link away**: Status, Annual prep, Records gaps.

---

## 5. Data model the UI exposes

From `SRC/lib/database.types.ts` (hand-maintained mirror of 69 migrations in `supabase/migrations/`).

| Entity (table) | Key fields | Notes |
|---|---|---|
| Aircraft (`aircraft`) | tail_number, make, model, year, serial_number, engine_serials[], prop_serials[], home_base, enrollment_date, enrollment_hobbs/tach/airframe, is_demo, icao24, adsb_enabled, owner_id | One owner. Tail not editable in the UI. |
| Logbook (`logbook`) | type (airframe, engine, prop, avionics, other), component_ref, title | Five created at enrollment. |
| Page (`page`) | logbook_id, storage_path, thumbnail_path, page_sequence, captured_at, ocr_text, extraction_status, extraction_error, extraction_confidence, review_status, is_handwritten, detected_page_count, unread_rotated_content | One scan image. |
| Entry (`log_entry`) | page_id (nullable), logbook_id, entry_date, hobbs, tach, airframe, description, work_performed, parts, signature_name, mechanic_cert_number, ad_refs[], sb_refs[], confidence, field_confidence, field_boxes, owner_confirmed, is_continuation, continues_next, reference_links, plus authored_* (signed-entry fields: template, answers, digest, signed_at, cert kind/rating), supersedes_entry_id, authored_superseded_by | Extracted, CSV-imported (no page) or authored and signed. |
| Maintenance item / inspection (`maintenance_item`) | kind, label, regulatory, interval_months, interval_hours, meter, last_done_date, last_done_hours, next_due_date, next_due_hours, notes | Kinds: annual, transponder, pitot-static, ELT, VOR, 100-hour, oil change, engine TBO, prop overhaul, custom. |
| AD / SB (`ad_compliance`) | kind (ad, sb), reference, title, status (open, complied, previously_complied, not_applicable, superseded), recurring, interval_hours, interval_months, method, complied_date, complied_hours, next_due_date, next_due_hours, applicability, notes, reason, status_changed_on, component_id, reference_entry_id (no UI), ad_reference_id, verified_report_page_id | Linked official record in `ad_reference`; public catalog in `ad_catalog`. |
| Equipment (`component`) | name, make, category, part_number, serial_number, install_date, removal_date, is_installed, life_limit_value, life_limit_unit, install_entry_id, removal_entry_id, notes | Proposals from AI in `equipment_proposal`. |
| W&B revision (`weight_balance`) | revision_date, method (weighed, computed), empty_weight, empty_weight_arm, empty_weight_moment, max_gross_weight, reference, reason, notes, source_page_id | No stations or envelope. |
| Hours reading (`hours_reading`) | reading_date, hobbs, tach, airframe, source (manual, MyFlightBook, ADS-B estimate…), external_ref | Meter swaps in `meter_reset` (meter, reset_date, prior_value, new_value, notes). ADS-B flights in `adsb_flight`. |
| Oil (`oil_addition`, `oil_analysis_sample`) | top-off: added_date, quarts, hobbs, tach, notes · sample: sample_date, lab, lab_number, oil_type, oil_hours, engine_hours, elements_ppm, oil_properties, universal_averages, lab_comments | |
| Squawk (`squawk`) | description, severity (low, medium, high), status (open, resolved), reporter_name, reported_at, resolved_at, resolved_by, resolved_log_entry_id, resolution_notes | Resolution fields exist but the UI never collects them. |
| Document (`document`) | type (11 categories), title, storage_path, document_date, reference, notes, log_entry_id, file_name, mime_type, size_bytes | Scanned non-log pages in `scanned_document` (weight_balance, ad_report, other). |
| Share / member (`aircraft_share`) | invited_email, role (viewer, editor), invited_by | Keyed by email; no pending state. |
| Record room link (`record_room`, `record_room_view`) | label, include_summary, logbook_ids[], include_scans, document_ids[], expires_at, revoked_at · view: path, ip_hash, user_agent | Token stored hashed. |
| Reminder (`reminder_log`, `profile.preferences`) | preferences: notify_due, alerts{annual, oil, ad, default}{enabled, lead_days, lead_hours} · log: item_key, due_signature, sent_at | No per-item reminders; lead times per category only. |
| Profile (`profile`) | full_name, email, is_admin, preferences, onboarding_opt_out, signup_source, heard_about | Signing certificates in `signing_credential`. |
| Integrations | `mfb_connection`, `backup_schedule` / `backup_run`, `app_setting` (encrypted AI key), `ai_usage`, `device_token`, `oauth_client`, `oauth_*_grant`, `oauth_access_log` | |
| Admin / growth | `announcement`, `announcement_dismissal`, `growth_event`, admin views | |

---

## 6. Current visual design as implemented

### 6.1 Tokens (`SRC/app/globals.css`)

Tailwind v4 with an `@theme` block mapping CSS variables to utilities. There is no `tailwind.config`; `:root` is `color-scheme: dark`.

| Token | Value | Tailwind name |
|---|---|---|
| `--bg` | `#0a0d13` | `bg-bg` |
| `--panel` | `#111823` | `bg-panel` |
| `--panel2` | `#161f2b` | `bg-panel2` |
| `--raise` | `#1c2836` | `bg-raise` |
| `--line` / `--line2` | `#232f3e` / `#33475a` | `border-line`, `border-line2` |
| `--ink` / `--dim` / `--faint` | `#e9eef5` / `#94a3b6` / `#8795a8` | `text-ink`, `text-dim`, `text-faint` |
| `--accent` / `--accent-soft` | `#5aa9ff` / `#16324e` | `accent`, `accent-soft` |
| `--grn` / `--amb` / `--red` | `#43d38a` / `#f4b13c` / `#ff6156` | `annun-green`, `annun-amber`, `annun-red` |
| `--grn-bg` / `--amb-bg` / `--red-bg` | 12% washes of the above | used via inline `style` |
| `--book-airframe/engine/prop/avionics/other` | `#5aa9ff` / `#f4b13c` / `#43d38a` / `#b98cff` / `#94a3b6` | `book-*` |
| `--color-due-overdue/soon/upcoming` | `#dc2626` / `#d97706` / `#16a34a` | defined, **zero uses** (dead legacy tokens) |

- Body: `--bg` with a fixed backdrop of a 44px grid (1.4% white lines) and one accent radial glow at top right; letter-spacing 0.1px.
- Focus: 2px accent outline, 3px offset. Custom scrollbar thumb `#2a3746`.
- Motion: `animate-up` (0.3s fade and 8px rise on every page's content), `animate-pin` (pulsing accent ring), `sweep`; all neutralised under `prefers-reduced-motion`.
- Print: the same variables are re-pointed to a light ramp (white surfaces, black ink, accent `#14508f`, green `#1c7a49`, amber `#8a5a06`, red `#b3241a`).

### 6.2 Fonts (`SRC/app/layout.tsx`, vendored in `SRC/app/fonts/`)

- Space Grotesk (display, variable 300–700), Instrument Sans (UI, 400–700), JetBrains Mono (readouts, 100–800), loaded with `next/font/local`, `display: swap`.
- `<html class="dark …">`; viewport theme colour `#0a0d13`. The PWA manifest uses a different colour (`#0f172a`).

### 6.3 Component primitives

Only five CSS utilities exist; everything else is repeated Tailwind class strings. There is no shared Button, Input, Card, Chip, Tabs, Table or Modal component.

| Primitive | Definition | Reality |
|---|---|---|
| `panel` | `rounded-xl border border-line bg-panel` | 97 uses in 42 files; many pages hand-roll `rounded-lg border …` instead (Meters, Squawks, Profile). |
| `panel-raised` | gradient `panel2 → panel` | Overview status panel, Ask answer card, W&B current card. |
| `readout` | mono + tabular figures | 128 uses in 34 files. |
| `eyebrow` | 10px uppercase, 0.16em tracking, faint | 102 uses; also hand-rolled at 9px and 9.5px. |
| `ident` | 10px mono, 0.08em tracking | Rail only. |
| Primary button | `bg-accent` + dark text; radius varies (`rounded-md`, `rounded-[9px]`, `rounded-lg`) | 65 `bg-accent` uses in 40 files. |
| Secondary button | hairline border, dim text | Per-file class strings. |
| Input | `rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm` | Some forms use `bg-panel` and `rounded`. |
| Chip / pill | `rounded-full` + border | 71 `rounded-full` uses; sizes 10–13px. |
| Status row | 8px dot + label + right-aligned mono due text | Overview "Next due", Annual prep. |
| Status card | dot, label, state line, mono due line, 1px progress bar, 3px left border | Status page. |
| Coverage bar | one bar per logbook in its colour on a shared year axis, with gaps | Overview only. |
| Gauge | 132px conic ring with centre count | Overview only. |
| ConfirmButton | inline two-step destructive confirm | 11 uses in 8 files. |
| Toast | bottom-centre, 4s | 12 screens. |
| ZoomableImage | lightbox | Pages, review, timeline, duplicates. |
| NavigationMenu | `<details>` popover with the app's only `shadow-lg` besides Toast and Announcement | Mobile "More". |
| Icons | 20 inline SVGs in `SRC/components/icons.tsx` | Mixed with emoji and Unicode glyphs (✈ ⇱ 📷 🖨 ▤ 🗄 ✂ ↻ ◎ 🎉) in 15 files. |

There is no `<dialog>`, `role="dialog"` or `aria-modal` anywhere. The capture "Review page" overlay and the image lightbox are plain fixed divs.

### 6.4 Measured consistency against DESIGN.md

Scripted counts over all non-test `.tsx` in `apps/web/src`:

- **Type sizes.** 24 distinct arbitrary pixel sizes: 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 17, 18, 19, 20, 21, 22, 27, 30, 32, 34, 44. Most used: 13px (89), 11px (64), 13.5px (45), 12.5px (39), 11.5px (29), 12px (29), 27px (28), 10px (23), 10.5px (17). On top of that, Tailwind's `text-sm` (14px) appears 388 times and `text-xs` (12px) 314 times. So two parallel scales are in use.
- **Sizes below 12px** account for roughly 140 of the arbitrary-size uses (9–11.5px), which is where labels, metadata, chips, due lines and the legal footer sit.
- **Page titles.** Eight different h1 treatments: `font-display text-[27px]` (28 pages), `text-2xl font-bold` with no display font (7: admin, explore, export, import, page review, review all, login), `font-display text-2xl` (4), `text-3xl font-bold` (upload), `font-display text-[30px]` (hangar), mono `text-[34px]` (overview), `text-[22px]` (record room), `text-[32px]` (marketing).
- **Radii.** `rounded-md` 240, `rounded-lg` 75, `rounded-full` 71, `rounded-sm` 27, `rounded-xl` 25, plus arbitrary 3, 7, 9, 10 and 14px. DESIGN.md specifies 9px for buttons; most buttons are `rounded-md` (6px).
- **Widths.** `max-w-6xl` 25, `2xl` 20, `3xl` 19, `xl` 17, `5xl` 5, `4xl` 4. Vertical padding alternates `py-8` and `py-10`.
- **Hard-coded colours** outside tokens: 12 chart hexes in `A/oil-analysis/EngineTrends.tsx`; `#8ec8ff` in both shells' logo; `#747775`, `#1f1f1f`, `bg-white`, `bg-black` on login (brand buttons); `text-red-500` in `EntryComposer.tsx` and `CredentialManager.tsx`; `text-white` in `CredentialManager.tsx`; several `rgba(...)` overlays in review, crop and capture.
- **Shadows.** DESIGN.md says no shadows. Found: `shadow-lg`-style classes in Toast, Announcement and NavigationMenu, and inline glow `boxShadow` on status dots in six files (overview, status, forecast, hangar, both reviewers).
- **Token drift.** DESIGN.md lists `faint` as `#5d6b7d`; the CSS ships `#8795a8` (lighter, presumably raised for contrast). DESIGN.md was not updated.
- **One Accent Rule.** Regularly broken: the overview shows an accent-filled "Capture pages" and an amber-filled "Review 2 pending pages" plus accent links; Profile has six accent-filled Save buttons on one page; the timeline's only filled button is "New logbook entry" although the page's job is finding things.
- **Annunciator Rule.** Amber doubles as the engine-logbook colour and green as the propeller colour, so on the timeline and coverage bars status colours are used as categories. The capture modal uses green and amber as button fills.
- **Touch targets.** `min-h-11` (44px) is applied only in the shells, login, landing and the overview header (23 uses in 7 files). In-page buttons are typically 28–34px tall.

### 6.5 The screenshots (all 1600px wide, demo aircraft N734DM, dark)

Common frame in all six: 60px top bar (logo, version chip `v2026.11`, tail, DEMO chip, type, three small readouts, annunciator pill "4 · 0 · 4", then Help / Profile / Sign out at far right) and the 236px rail with 15 items. Content is a centred column about 1100px wide, leaving wide empty margins either side. Every page ends with the same grey "Index, not the record." bar.

- **`hub.png` (overview).** Mono tail "N734DM" at 34px with the type beside it; three buttons top right, the middle one ("Capture pages") filled blue. A 2×2 panel grid follows. Top left: a red/green ring with a red "4" and "NEED ATTENTION", a four-row legend, a "Review tracked status →" outline button, a grey paragraph, and a red-bordered "MOST URGENT — Transponder cert (91.413) — 200d overdue" banner. Top right: four status rows, all red, with mono "200d over" at the right. Bottom left: three recent entries with coloured logbook chips. Bottom right: four thin coverage bars with tick marks, then a full-width amber-filled "Review 2 pending pages →" button, then a small "Ask your logbook" panel. **The eye lands first on the amber button** (largest saturated fill), then the red ring, then the blue button. The actual headline — four items overdue — competes with three other saturated elements. The bottom-left panel is half empty. Density is moderate, but most text is 11–13px.
- **`status.png`.** Sub-tab strip (Status / Forecast / AD / SB) under the top bar. Title "Status", two-line lede, a mono hours line floated right. Four count chips, then "OVERDUE" (four red-edged cards) and "CURRENT" (four green-edged cards) in a 4-column grid. Each card: dot + bold label, a coloured state line, an 11px mono "due … · last …" line, a thin bar. Clear and scannable; the grouping worst-first works. Weak points: the mono due line is very small and low contrast; "advisory" and "AD" chips are tiny; one label is truncated ("Engine TBO (O-320-…"); the cards have no visible action; half the viewport below is empty.
- **`review.png` (single-page review).** Title "Review Airframe · page #2" in a plain bold face (no eyebrow, different from other pages). Left half: a tall scan of a handwritten 1974 logbook page with a small "✂ Crop & clean up" button above and an 11px caption below. Right half: one "Confirmed" card with "60% overall", then eleven labelled inputs, most with a tiny ◎ button and a 10px amber or green percentage chip; amber borders on low-confidence fields. Button row: blue "Save & confirm", then "Unconfirm", "Merge ↑ prev page", red "Delete" at equal weight. Below: Attachments / Reference links sub-panel, a dashed "+ Add an entry the extractor missed", then a second blue button "Mark page reviewed" with "Flag as disputed" and "Done". **The eye lands on the scan**, which is right. But the form reads as a dense wall: confidence chips are too small to scan, two blue primaries compete, and the destructive Delete sits inline with routine actions. The scan is taller than the viewport and has no zoom, pan or rotate controls in view.
- **`ask.png`.** Sub-tabs (Timeline & search / Ask your logbook). Title, lede, a wide input with a blue "Ask" button, five suggestion chips, a raised answer card (question in small blue, answer at about 14.5px), a "CITED ENTRIES" card with a blue left edge, and an 11px disclaimer. Right: a "WHY IT'S TRUSTWORTHY" panel with three bullets. This is the calmest and most legible screen; hierarchy is clear. The citation card is not visibly a link.
- **`timeline.png`.** Title, lede, and a blue "New logbook entry" button at top right (the only filled element). Left: year groups; 2025 is open with three entries, each with an empty grey thumbnail square, mono date and tach, a coloured vertical rail, a logbook chip, "● confirmed", and formatted text (numbered lists render well). Below: twelve collapsed year rows from 2024 to 1969, each a caret, a year and a tiny count. Right: search box, logbook filter pills, "AT A GLANCE" stats. The collapsed years waste a full screen of height for 13 numbers; search is small and off to the side although finding things is the page's purpose; entry text at 14px is the most readable body text in the app.
- **`wb.png`.** Sub-tabs (Equipment / Weight & balance). A raised "Current weight & balance" card with four 21px mono readouts; "REVISION HISTORY" with two cards (date, "current"/"computed" pills, an 11px mono line, reason, ref, Edit / red Delete buttons). Right: an amber-bordered "May be out of date" card and, beneath it, a full-width blue "+ Add revision". The stale-data warning is well placed and specific. The primary action sits in the sidebar under the warning rather than with the list it adds to.

Overall impression: a coherent dark instrument-panel look with real craft in the status language and readouts. It is visually quiet but small: labels at 9–11px in grey on near-black, and a lot of meaning carried by 8px coloured dots and 10px chips.

---

## 7. Critique

### 7.1 Problems (ranked roughly by impact on the owner-pilot)

1. **Type is too small for the audience.** 24 arbitrary sizes, with about 140 uses at 9–11.5px; working text is 11–13.5px by design (`DESIGN.md` "keep working type between 10px and 13.5px"). The demographic skews 50+. Due dates, confidence percentages and the legal note are the smallest text on screen. `SRC/app/globals.css:92-101`, `SRC/components/shell/AircraftShell.tsx:143-144`.
2. **Dark only.** `color-scheme: dark` with no screen light theme (`globals.css:110-146`). Poor in a bright hangar or on a ramp, and tiring for long review sessions against a cream paper scan.
3. **Navigation is heavy: 15 rail items, 6 groups, 14 hub sub-tabs, three different shells.** Labels are compound ("Import, export & duplicates", "Status & forecast", "Timeline & Ask"). Seven aircraft screens have no nav entry at all (`/upload`, `/summary`, `/start`, `/details`, `/compliance/explore`, …). `AircraftShell.tsx:24-138`.
4. **The 3-letter idents add noise without function.** They are not shortcuts, are 10px mono, and are dropped entirely on mobile. `AircraftShell.tsx:361`.
5. **Status vanishes below 1536px and on mobile.** The annunciator is `2xl` only and readouts are `xl` only; on a phone the top bar shows just the tail. `AircraftShell.tsx:259-270`.
6. **No aircraft switcher, no global search, no command palette.** Switching aircraft is a trip to the hangar; search exists only in the timeline sidebar.
7. **The most frequent task is the most buried.** Logging hours is the fifth section of Meters under a long ADS-B explainer; oil top-off is mid-page on another tab; there are no quick actions on the hangar, overview or top bar. `A/meters/MetersClient.tsx:607-625`, `A/oil-analysis/OilConsumptionClient.tsx:111-118`.
8. **The overview does not lead with the answer.** Three saturated elements (amber review button, red ring, blue capture button) compete; the forecast panel excludes ADs while the gauge includes them; three links go to the same Status page; recent-activity rows are not links; squawks are absent. `A/page.tsx:101,237-271,330-351`.
9. **Status is read-only.** Status, Annual prep and Records gaps are dashboards that deep-link away; nothing can be marked done in place. `A/status/page.tsx:98-99`, `A/annual/page.tsx:111`, `A/audit/page.tsx:105-134`.
10. **Digitizing is four screens with no hand-offs.** Upload and Capture are dead ends; extraction is a separate manual step bound to an open tab with no progress, cancel or allowance display. `A/upload/UploadClient.tsx:257-286`, `A/PagesPanel.tsx:217-227`.
11. **Two review surfaces with split capabilities**, no keyboard shortcuts, no "next page needing review", and "Mark page reviewed" ejects to the list. Bulk confirm cannot be used on CSV imports because their confidence is null *(inferred)*. `A/pages/[pageId]/review/ReviewClient.tsx`, `A/review/ReviewAllClient.tsx`, `SRC/lib/extraction/schema.ts:43`.
12. **The review form is a wall of fields.** Confidence is a 10px chip per field, the locate control is an 18px circle, two accent primaries compete, and Delete is immediate with no confirmation. The scan has no zoom/pan/rotate without a lightbox that hides the form. `ReviewClient.tsx:312-322,497-503,631-673`.
13. **Possible state bugs in review** *(inferred)*: "Mark page reviewed" does not clear "needs review" (`SRC/lib/writes/pages.ts:50-53` vs `SRC/lib/pageStatus.ts:21`); "Unconfirm" leaves the card showing "Confirmed" (`ReviewClient.tsx:324-330`).
14. **AD handling has no "record compliance" action and keeps no history.** Compliance is an edit of the same record; recurring ADs overwrite the previous compliance; a next-due typed in Explore is wiped on the next save *(inferred)*; one-time ADs with a deadline cannot carry a due date. `A/compliance/ComplianceClient.tsx`, `SRC/lib/writes/compliance.ts:179`.
15. **Onboarding contradictions.** Enroll says "three logbooks" (five are made); the hub says "of 2 details", Start says "three steps"; meters are asked twice; Start has no back step; the demo aircraft suppresses the welcome state and pushes "Enroll" to the end of the grid. `SRC/app/aircraft/enroll/page.tsx:13`, `A/page.tsx:162`, `A/start/page.tsx:65`, `SRC/app/dashboard/page.tsx:107`.
16. **Reminders are off by default and invisible in the product.** Nothing in onboarding turns them on; push follows the email switch; each item is reminded once per cycle with no overdue follow-up. Saving with the master switch off appears to wipe per-category settings *(inferred)*. `SRC/app/profile/page.tsx:170`, `SRC/app/profile/ProfileClient.tsx:436-438`, `SRC/app/api/cron/daily/route.ts:185`.
17. **Profile is one 936-line scroll** of eight unrelated cards with six Save buttons and no anchors; AI allowance (needed during digitizing) and cloud backup (an export concern) both live here. `SRC/app/profile/ProfileClient.tsx:363-934`.
18. **Dangerous actions are filed under "Sharing".** Delete aircraft and transfer ownership sit on the share page under two unrelated panels, reached from the hangar via "Manage / delete aircraft". `A/share/ShareClient.tsx:219`, `SRC/app/dashboard/page.tsx:247-252`.
19. **Four confirmation patterns and three feedback patterns.** Inline ConfirmButton, native `confirm`/`prompt` (7 call sites, including a typed removal date in `A/equipment/EquipmentClient.tsx:173-179`), typed "DELETE", or none; toasts vs inline text vs a distant page-level error line (`ComplianceClient.tsx:287`).
20. **Role gating is inconsistent.** Viewers see Add/Edit/Delete on Forecast, AD / SB, Equipment and page review and fail on submit; "New logbook entry" on the timeline 404s for viewers. `A/timeline/page.tsx:118`, `A/entries/new/page.tsx:22-23`.
21. **Developer language leaks into the UI.** "Set ANTHROPIC_API_KEY to enable extraction" (`A/PagesPanel.tsx:431`), "(routes to vision extraction)" (`A/capture/CaptureClient.tsx:304`), `adsb_estimate` (`MetersClient.tsx:244`), raw enums as pills (`pending`, `unreviewed`), "hobbs must be a number." Errors say "Settings" for a page called "Profile".
22. **Status vocabulary drifts.** "current" / "within recorded limits" / "upcoming" for the same state; "OVERDUE" upper-case beside "due soon" lower-case; "Does not apply" / "N/A since" / "Not applicable since"; four wordings for the editor role. `A/page.tsx:228`, `A/status/page.tsx:318-349`, `SRC/components/MaintenanceSummary.tsx:183`, `A/export/page.tsx:243`.
23. **Status colours are reused as category colours.** Engine = amber, propeller = green on the timeline, coverage bars and equipment dots, against the Annunciator Rule. `globals.css:136-140`.
24. **No component layer.** Buttons, inputs, cards, chips and tables are repeated class strings, which is why there are eight h1 styles, four button radii and two type scales. See §6.4.
25. **Tables and forms do not adapt.** Fixed 6-column forecast grid and `grid-cols-2` edit forms with no mobile fallback; W&B's "+ Add revision" drops below the whole history on phones. `A/maintenance/MaintenanceClient.tsx:95`, `ComplianceClient.tsx:312`, `A/weight-balance/WeightBalanceClient.tsx:303-350`.
26. **Wasted space and weak emphasis on wide screens.** A ~1100px column on a 1600px canvas; the timeline spends a screen on thirteen collapsed year rows; search is a small sidebar field. `A/timeline/TimelineClient.tsx`.
27. **Record room is thin on both sides.** The owner cannot see what a link exposes or edit it; "Maintenance summary" silently includes squawks with reporter names and serial numbers; the recipient gets raw image tabs, a 500-entry cap and no indication of who the link was for. `A/share/RoomsPanel.tsx:86-121`, `SRC/app/r/[token]/page.tsx:58-60,124-155`.
28. **Printables disagree.** The full records report uses different status logic and labels from the summary, omits W&B and squawks, and cannot be previewed on screen. `A/export/page.tsx:60-73,145,243`.
29. **Squawks under-use their own data model.** Resolve captures no note, date or linked entry; no edit; no badge or overview presence. `A/squawks/SquawksClient.tsx:130,156`.
30. **Broken or dead ends.** `/demo` CTA points to `/signup`, which has no route or redirect (`SRC/app/demo/page.tsx`); `?error=auth` is never shown on login (`SRC/app/auth/callback/route.ts:29`); no `loading.tsx` anywhere, so slow server pages show nothing; iPhone HEIC photos pass the Vault file picker and fail on the server (`A/documents/DocumentsClient.tsx:124`).
31. **Emoji and Unicode glyphs stand in for icons** in 15 files alongside a 20-icon SVG set, and render differently per platform.
32. **Touch targets are small.** 44px minimums exist only in the shells; in-page buttons, the ◎ locate control (18px) and text actions ("Edit", "Delete", "unlink") are well under that.

### 7.2 Strengths worth preserving

1. **Field-level provenance in review.** Scan beside the form, per-field confidence, and the ◎ spotlight that rings the exact source box. This is the product's trust mechanism. `ReviewClient.tsx:127-141,182-225,660-673`.
2. **Honest uncertainty language, everywhere.** "≈", "est.", "rough est.", "needs information" instead of a false green, "as of {date} · from {source}", confidence-labelled projections with an auditable tooltip, "a lead to check, not a determination".
3. **One status model with real regulatory nuance** (`SRC/lib/status.ts`, `compliance.ts`): calendar-month due dates, 30-day VOR, 100-hour reset off the annual, per-item meter, meter replacements. It feeds the hangar, overview, status, forecast, summary, annual prep and dossier.
4. **The four-state annunciator vocabulary** (overdue / due soon / current / needs information), always dot plus text, worst-first grouping, both calendar and hours limits shown.
5. **Consistent, concise legal boundary copy** (14 CFR 91.417, "index, not the record") in banner, inline, footer and print forms. Keep the wording.
6. **Review-before-compliance rule made visible.** Unconfirmed entries never drive status; CSV imports land unconfirmed; "Confirm {n} clean" leaves anything doubtful and says how many remain.
7. **Offline-first capture** with an on-device queue, specific retake advice, auto-advancing page number and an online/offline indicator.
8. **Data-derived, resumable onboarding** with the owner explicitly confirming the annual entry, plus FAA registry prefill.
9. **Record-room model**: per-link scope, mandatory expiry, instant revoke, view counts, confirmed-only entries, uniform inactive state. Invite-by-email with no acceptance step.
10. **Cross-record links**: equipment ↔ ADs (removal retires linked ADs), equipment changes → "May be out of date" W&B warning, Vault documents ↔ entries, untracked AD references surfaced from the logs, "✓ A&P report" corroboration.
11. **Export story and copy**: round-trip .zip, CSV, open formats, "You can leave whenever you like"; print via token re-pointing rather than a PDF pipeline.
12. **AI allowance transparency**: a usage bar for everyone, calls explained in pages, rolling 24-hour window stated plainly.
13. **Small good patterns to standardise**: inline two-step ConfirmButton that names consequences ("Delete 3 pages + 12 entries"), `#item-{id}` deep links with a `:target` outline, specific empty and error states with a next action, graceful partial-failure states.
14. **Signed-entry flow**: draft autosave, exact-text review before code entry, immutable entries with a correction chain, and a printable sticker carrying an ID and digest that later scans recognise.
15. **Visual assets worth carrying forward**: mono tabular readouts for every comparable number, per-logbook colour coding, the coverage bar, and the "MOST URGENT" call-out.

