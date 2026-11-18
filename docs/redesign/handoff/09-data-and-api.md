# 09 · Data model and API

This file is the data truth for the direction D redesign (precedence 2 after 00-product-principles.md). Section 1 summarises the data model as it exists in `supabase/migrations` 0001 to 0068. Section 2 specifies every addition the redesign needs as additive, ordered migrations 0069 to 0084: new columns, enums, tables, indexes, row-level security (RLS), views and functions. Section 3 defines the derived computations the server owns (due status, projections, the line ahead, suggested visits, situations, map grouping, gap evidence, time checks, trust) and the small subset native clients must mirror offline, verified by shared fixtures. Section 4 lists the API endpoints the web and the native iOS and Android apps call, with request and response shapes. Section 5 is the offline sync contract (cursor, tombstones, outbox, conflicts by version, blobs). Section 6 covers storage, jobs and retention. Open questions are at the end. Capability rules (what the owner sees) live in 08-capabilities.md; end-to-end sequences live in 07-flows.md.

## Contents
1. [Current data model (summary)](#1-current-data-model-summary)
2. [Schema additions (migrations 0069 to 0084)](#2-schema-additions)
3. [Derived computations the server owns](#3-derived-computations-the-server-owns)
4. [API endpoints](#4-api-endpoints)
5. [Offline sync contract](#5-offline-sync-contract)
6. [Storage, jobs and retention](#6-storage-jobs-and-retention)
7. [Migration safety checklist](#7-migration-safety-checklist)
8. [Open questions](#8-open-questions)

---

## 1. Current data model (summary)

Postgres on Supabase. Every aircraft-scoped table carries `aircraft_id` and is guarded by two SQL functions (0015): `has_aircraft_access(aircraft_id)` (owner, or a share row for the caller's email, any role) for SELECT, and `can_edit_aircraft(aircraft_id)` (owner, or share role `editor`) for INSERT, UPDATE and DELETE. Exceptions are noted per table. Every synced table has `updated_at` with a `set_updated_at()` BEFORE UPDATE trigger (audited in 0058) and a `log_change()` AFTER trigger that appends to `change_log`.

### 1.1 Enums today
| Enum | Values |
|---|---|
| `logbook_type` | airframe, engine, prop, avionics (0004), other (0017) |
| `review_status` (page) | unreviewed, confirmed, disputed |
| `extraction_status` (page) | pending, processing, extracted, failed |
| `document_type` | form_337, form_8130_3, stc, ica, weight_balance, other, airworthiness_cert, registration, radio_license, poh_afm, maintenance_manual |
| `ad_kind` | ad, sb (0007) |
| `ad_status` | open, complied, previously_complied, not_applicable, superseded |
| `squawk_severity` | low, medium, high (UI labels Low, Watch, Ground) |
| `squawk_status` | open, resolved |

### 1.2 Tables today (key columns only)
| Table | Purpose and key columns | RLS |
|---|---|---|
| `profile` | `id` (= auth user), `full_name`, `cert_number`, `email`, `preferences jsonb` (reminder settings under `preferences.alerts`), `is_admin`, onboarding and signup-source fields | self |
| `aircraft` | `owner_id`, `tail_number`, `make`, `model`, `serial_number`, `year`, `engine_serials[]`, `prop_serials[]`, `home_base`, `enrollment_date`, `enrollment_hobbs/tach/airframe`, `is_demo`, `icao24`, `adsb_enabled`, `notes` | access / owner |
| `aircraft_share` | `aircraft_id`, `invited_email`, `role` (`viewer`/`editor`), `invited_by` | owner manages; grantee reads own |
| `logbook` | `aircraft_id`, `type logbook_type`, `component_ref`, `title` | access / edit |
| `page` | `logbook_id`, `storage_path`, `thumbnail_path`, `page_sequence`, `captured_at`, `is_handwritten`, `ocr_text`, `extraction_status`, `extraction_error`, `extraction_confidence`, `extracted_at`, `review_status`, `detected_page_count`, `unread_rotated_content` | access / edit |
| `log_entry` | `page_id` (nullable: imported or owner-noted entries), `logbook_id`, `entry_date`, `tach`, `hobbs`, `airframe`, `description`, `work_performed`, `parts`, `signature_name`, `mechanic_cert_number`, `ad_refs[]`, `sb_refs[]`, `confidence`, `field_confidence jsonb`, `field_boxes jsonb`, `extraction_model`, `extraction_schema_version`, `owner_confirmed`, `entry_index`, `continues_next`, `is_continuation`, `hours_reviewed_at`, `reference_links jsonb`, authored-entry fields (`authored_by`, `authored_signed_at`, `authored_cert_kind`, `authored_cert_rating`, `authored_template_id/version`, `authored_answers`, `authored_payload`, `authored_digest`, `supersedes_entry_id`, `authored_superseded_by`) | access / edit; signed rows locked by `protect_signed_log_entry` |
| `document` | Records Vault: `type document_type`, `title`, `storage_path`, `document_date`, `reference`, `notes`, `log_entry_id` (attachment), `file_name`, `mime_type`, `size_bytes` | access / edit |
| `scanned_document` | "Other" logbook pages classified and applied: `page_id`, `doc_type`, `extracted jsonb`, `applied`, `confidence` | access / edit |
| `component` | installed equipment: `name`, `make`, `category`, `part_number`, `serial_number`, install and removal date and entry, `life_limit_value/unit`, `is_installed` | access / edit |
| `equipment_proposal` | install/removal proposals from extraction awaiting confirm or reject | access / edit |
| `maintenance_item` | tracked items: `kind`, `label`, `regulatory`, `interval_months`, `interval_hours`, `last_done_date`, `last_done_hours`, `next_due_date`, `next_due_hours`, `meter` (tach/hobbs/airframe override), `notes` | access / edit |
| `ad_compliance` | `kind`, `reference`, `title`, `applicability`, `recurring`, `interval_hours`, `interval_months`, `status`, `method`, `complied_date`, `complied_hours`, `next_due_date`, `next_due_hours`, `reference_entry_id`, `ad_reference_id`, `component_id`, `reason`, `status_changed_on`, `verified_report_page_id`, `verified_at` | access / edit |
| `ad_reference`, `ad_catalog` | global FAA AD reference data (Federal Register, DRS) | readable by any signed-in user |
| `hours_reading` | `reading_date`, `tach`, `hobbs`, `airframe`, `source` (`manual`, `myflightbook`, `adsb_estimate`, `starting`, `entry`, …), `external_ref`, `synced_by`, `hours_reviewed_at` | access / edit |
| `meter_reset` | meter replacement: `meter`, `reset_date`, `prior_value`, `new_value` | access / edit |
| `adsb_flight` | OpenSky flights after the latest reading: `first_seen`, `last_seen`, airports, `airborne_minutes`, `dismissed_at` | access / edit |
| `oil_addition` | top-offs: `added_date`, `quarts`, `tach`, `hobbs` | access / edit |
| `oil_analysis_sample` | lab samples: elements ppm, properties, universal averages | access / edit |
| `weight_balance` | revisions: empty weight, arm, moment, max gross, method, `source_page_id` | access / edit |
| `squawk` | `description`, `severity`, `status`, `reported_by`, `reporter_name`, `reported_at`, `resolved_at`, `resolved_by`, `resolved_log_entry_id`, `resolution_notes` | read and report: any access (as self); update/delete: edit |
| `record_room` | `label`, `token_hash`, `token_enc`, `include_summary`, `logbook_ids[]`, `include_scans`, `document_ids[]`, `expires_at` (≤ 181 days), `revoked_at`; revoked on transfer by trigger | owner only |
| `record_room_view` | `room_id`, `path`, `ip_hash`, `user_agent`, `created_at` (service role writes) | owner reads |
| `reminder_log` | `user_id`, `aircraft_id`, `item_key`, `due_signature`, `sent_at` (once per due cycle) | self |
| `signing_credential`, `entry_signing_challenge`, `signed_entry_scan` | authored-entry signing and sticker rescan links | self / access |
| `change_log` | `seq` (identity, the sync cursor), `table_name`, `row_id`, `op` (I/U/D), `aircraft_id` (null for global rows), `owner_id`, `changed_at` | access-scoped read |
| `device_token` | push tokens per user and platform | self |
| `ai_usage`, `private.user_ai_key`, `app_setting` | AI calls (rolling 24 h cap, default 100 calls shared key, 1000 own key; about 2 calls per page), BYO key cipher, shared provider | self / private |
| `mfb_connection`, `private.backup_destination`, `backup_schedule`, `backup_run` | MyFlightBook link, Dropbox and Drive backups | self / private |
| `oauth_*`, `oidc_payloads` | OAuth 2.1 provider | private |
| `announcement`, `announcement_dismissal`, `growth_event`, `onboarding_email_*` | product messaging | admin / self |

### 1.3 What the redesign needs that is missing
- A link between a tracked item and every entry that completed it (item histories drawn as stops).
- Shops, planned and suggested visits, and their dismissal.
- Gaps as first-class records with an owner-set status.
- Document expiry and renewal on the due list.
- Squawk photos and an account-free mechanic link.
- Scan batches, a server-side reading queue, duplicate detection at upload, and completion notifications.
- Tach photo reading results on `hours_reading`.
- Trust level as a column, and a way for a scanned page to replace an owner's note.
- Reminder kinds (lead, lapse, weekly, visit, visit at risk), snooze, an in-app inbox.
- Record room audience, cover, contents and opens (sessions).
- Written-versus-calculated time checks and their dismissals.
- A server-computed status snapshot that phones, widgets and the web all read.

---

## 2. Schema additions

Rules for every migration below: additive only (new tables, nullable columns or columns with defaults, `ALTER TYPE … ADD VALUE`, new views and functions); no column drops, renames or type changes; every new aircraft-scoped table gets `updated_at` + `set_updated_at()` trigger, the four standard policies (select `has_aircraft_access`, insert/update/delete `can_edit_aircraft`) unless stated, an `(aircraft_id, …)` index, and a `log_change()` trigger when it is synced (section 5.2). `ALTER TYPE … ADD VALUE` statements go in their own migration file without other statements in the same transaction.

### 2.1 0069_entry_trust_and_notes.sql
```sql
create type trust_level as enum ('ai_read', 'confirmed', 'signed');

alter table log_entry
  add column trust trust_level generated always as (
    case
      when authored_signed_at is not null then 'signed'::trust_level
      when owner_confirmed and nullif(btrim(signature_name), '') is not null
           and nullif(btrim(mechanic_cert_number), '') is not null then 'signed'::trust_level
      when owner_confirmed then 'confirmed'::trust_level
      else 'ai_read'::trust_level
    end) stored,
  add column replaced_by_entry_id uuid references log_entry(id) on delete set null,
  add column stated_times jsonb,          -- [{component:'engine'|'prop', basis:'SMOH'|'SPOH'|'TSO'|'TT', value:number}]
  add column entry_kind text;             -- normalised kind from extraction: 'annual','oil_change','transponder',... (nullable)

create index log_entry_aircraft_date_idx on log_entry (aircraft_id, entry_date);
create index log_entry_replaced_idx on log_entry (replaced_by_entry_id) where replaced_by_entry_id is not null;
```
- `trust` is the single source for TrustMark: `ai_read` = "read by AI", `confirmed` = "confirmed by you", `signed` = "signed by <signature_name>" (paper signature with a certificate number the owner confirmed) or "signed by you in MyTailLog" (authored entry). The generated column rewrites `log_entry` once; run in a low-traffic window (row count is in the low tens of thousands).
- `replaced_by_entry_id`: set on an owner note (an entry with `page_id is null` created by Mark done or Log a VOR check) when the owner accepts a scanned entry as its source (see 08-capabilities.md C-REVIEW-05). Replaced notes are excluded from status, meter math and the map, and remain visible in the entry's history.
- `stated_times` and `entry_kind` are written by extraction schema version N+1; older rows stay null and are back-filled lazily on re-extract only.

### 2.2 0070_item_completion.sql
```sql
create table item_completion (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  maintenance_item_id uuid references maintenance_item(id) on delete cascade,
  ad_compliance_id uuid references ad_compliance(id) on delete cascade,
  log_entry_id uuid references log_entry(id) on delete set null,
  done_date date not null,
  done_hours numeric(10,1),
  meter text check (meter in ('tach','hobbs','airframe')),
  source text not null check (source in ('mark_done','extraction','owner_link','import','vor_check','visit')),
  visit_id uuid,                              -- fk added in 0073
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((maintenance_item_id is null) <> (ad_compliance_id is null))
);
create index item_completion_item_idx on item_completion (maintenance_item_id, done_date desc);
create index item_completion_ad_idx on item_completion (ad_compliance_id, done_date desc);
create index item_completion_aircraft_idx on item_completion (aircraft_id);
create unique index item_completion_entry_uniq on item_completion (log_entry_id, maintenance_item_id, ad_compliance_id) nulls not distinct;
```
- One row per completion of a tracked item or AD. The latest row by `done_date` (ties: highest `done_hours`) whose entry is not replaced and whose trust is `confirmed` or `signed` (or which has no entry and was created by the owner) defines `last_done_*` on the parent. The parent columns `last_done_date/hours` and `complied_date/hours` stay, maintained by the write functions (`maintenance.markDone`, `compliance.recordCompliance`), so old clients keep working.
- Back-fill (in the same migration): one row per `maintenance_item` with a `last_done_date` (`source='import'`, entry null) and one per `ad_compliance` with a `complied_date` (`log_entry_id = reference_entry_id`).
- Extraction (schema version N+1) proposes completions from `entry_kind`; a proposal becomes a row only when the entry is confirmed.

### 2.3 0071_maintenance_item_d.sql
```sql
alter table maintenance_item
  add column line logbook_type,                      -- the book whose line its ring sits on
  add column shop_kind text check (shop_kind in ('mechanic','avionics_shop','prop_shop','engine_shop','self')),
  add column provider_id uuid,                       -- fk added in 0072
  add column ifr_only boolean not null default false,
  add column expires_on date,                        -- expiry-type items (ELT battery): due on this date, no interval
  add column visit_window_days int check (visit_window_days between 0 and 180),
  add column visit_window_hours numeric(6,1) check (visit_window_hours between 0 and 200),
  add column remind_lead_days int,                   -- per-item override of the category lead
  add column remind_lead_hours numeric(6,1);
```
Back-fill defaults by `kind`:

| kind | line | shop_kind | ifr_only |
|---|---|---|---|
| annual | airframe | mechanic | false |
| hundred_hour | airframe | mechanic | false |
| transponder | avionics | avionics_shop | false |
| pitot_static | avionics | avionics_shop | true |
| elt | avionics | mechanic | false |
| elt_battery (new kind) | avionics | mechanic | false |
| vor | avionics | self | true |
| oil_change | engine | mechanic | false |
| engine_tbo | engine | engine_shop | false |
| prop_overhaul | prop | prop_shop | false |
| custom (any other) | airframe | mechanic | false |

`STANDARD_ITEMS` in `apps/web/src/lib/maintenance.ts` gains `elt_battery` (label "ELT battery", regulatory true, no interval, `expires_on` required) and the `line`, `shop_kind`, `ifr_only` defaults above. Oil change keeps 50 hours and may carry `interval_months` (B's mockup shows "every 50 hours or 4 months"); the seed sets `interval_months = 4` only for new aircraft.

### 2.4 0072_service_provider.sql
```sql
create table service_provider (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),        -- 'AeroCheck Instruments', 'M. Torres'
  kind text not null check (kind in ('mechanic','avionics_shop','prop_shop','engine_shop')),
  cert_number text,                                                  -- 'A&P 3667012', 'CRS AC2Y441L'
  airport text,                                                      -- ICAO/FAA ident, 'KBED'
  email text,
  phone text,
  is_default boolean not null default false,                          -- default for its kind on this aircraft
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_provider_aircraft_idx on service_provider (aircraft_id);
create unique index service_provider_default_uniq on service_provider (aircraft_id, kind) where is_default;
alter table maintenance_item add constraint maintenance_item_provider_fk
  foreign key (provider_id) references service_provider(id) on delete set null;
alter table ad_compliance add column provider_id uuid references service_provider(id) on delete set null;
```
- Providers are created by the owner (W-MAINT-06, M-STATUS-04 "Who does it") or proposed from confirmed entries: a distinct `(signature_name, mechanic_cert_number)` seen on ≥ 2 confirmed entries becomes a proposal shown in tracked-items setup, never auto-created.
- `email` is used only to prefill the owner's own email client (mailto or share sheet). MyTailLog never sends email to a provider.

### 2.5 0073_visits.sql
```sql
create type visit_status as enum ('planned','in_shop','awaiting_records','done','cancelled');

create table planned_visit (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  status visit_status not null default 'planned',
  week_of date not null,                 -- Monday of the planned week
  visit_date date,                       -- exact day if the owner set one
  provider_id uuid references service_provider(id) on delete set null,
  airport text,
  notes text check (length(notes) <= 2000),
  from_suggestion_key text,              -- suggestion key it was booked from (3.5.6), null if made by hand
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visit_date is null or (visit_date >= week_of and visit_date < week_of + 7)),
  check (extract(isodow from week_of) = 1)
);
create index planned_visit_aircraft_idx on planned_visit (aircraft_id, week_of);

create table planned_visit_item (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  visit_id uuid not null references planned_visit(id) on delete cascade,
  item_key text not null check (item_key ~ '^(mx|ad|squawk):[0-9a-f-]{36}$'),
  done_completion_id uuid references item_completion(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, item_key)
);
create index planned_visit_item_aircraft_idx on planned_visit_item (aircraft_id);
create unique index planned_visit_item_open_uniq on planned_visit_item (aircraft_id, item_key)
  where done_completion_id is null;      -- an open item is in at most one visit (enforced in writes for status planned/in_shop)

create table visit_suggestion_dismissal (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  suggestion_key text not null,
  dismissed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aircraft_id, suggestion_key)
);

alter table item_completion add constraint item_completion_visit_fk
  foreign key (visit_id) references planned_visit(id) on delete set null;
```
- `item_key` prefixes: `mx:` maintenance_item id, `ad:` ad_compliance id, `squawk:` squawk id (an open squawk can ride along to a visit).
- The partial unique index covers open items across all visits; the write function rejects adding an item already in another visit with the error "This item is already in the visit for the week of <date>." When a visit becomes `cancelled` or `done`, the write function deletes its `planned_visit_item` rows that have no `done_completion_id` (those items were not done at this visit and return to suggestions); rows with a completion stay as the visit's record.
- Status transitions (enforced in `lib/writes/visits.ts`): planned → in_shop | cancelled; in_shop → awaiting_records | done; planned → awaiting_records automatically by the daily job the day after `coalesce(visit_date, week_of + 4)`; awaiting_records → done when every item has `done_completion_id` or the owner taps "Close this visit"; any non-done → cancelled. `done` and `cancelled` are terminal.
- Suggested visits are not stored; they are computed (3.5). Only dismissals and bookings persist.

### 2.6 0074_logbook_gap.sql
```sql
create type gap_status as enum ('open','no_pages_exist','asked_previous_owner','filled','dismissed');

create table logbook_gap (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  logbook_id uuid not null references logbook(id) on delete cascade,
  from_date date not null,             -- last confirmed entry before the gap (exclusive bound)
  to_date date not null,               -- first confirmed entry after the gap (exclusive bound)
  status gap_status not null default 'open',
  source text not null default 'coverage_rule' check (source in ('coverage_rule','annual_chain','owner')),
  note text check (length(note) <= 1000),
  status_set_by uuid references auth.users(id) on delete set null,
  status_set_at timestamptz,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (to_date > from_date)
);
create index logbook_gap_aircraft_idx on logbook_gap (aircraft_id, logbook_id, from_date);
```
- Detection and reconciliation rules are in 3.8. The owner-set statuses (`no_pages_exist`, `asked_previous_owner`, `dismissed`) survive re-detection: when a re-run finds a gap overlapping an existing row by ≥ 50 % of the shorter span, it updates `from_date`/`to_date` on that row and keeps its status and note.
- `filled` is set only by the system when confirmed entries close the gap.

### 2.7 0075_document_expiry.sql (two files: enum value, then columns)
```sql
-- 0075a
alter type document_type add value if not exists 'insurance';
-- 0075b
alter table document
  add column expires_on date,
  add column renews_every_months int check (renews_every_months between 1 and 120),
  add column track_expiry boolean not null default false,
  add column remind_lead_days int check (remind_lead_days between 0 and 365);
create index document_expiry_idx on document (aircraft_id, expires_on) where track_expiry;
```
- A document with `track_expiry = true` is a due item (`item_key = 'doc:<id>'`, 3.2). With `track_expiry` and no `expires_on` it shows as "no record" ("No date on file").
- Defaults when the owner turns tracking on: registration `renews_every_months = 84`; insurance 12; radio_license 120; others null. The expiry date is always typed or read from the document by the owner, never computed from `document_date` without the owner seeing it.

### 2.8 0076_squawk_photos_and_mechanic_links.sql
```sql
create table squawk_photo (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  squawk_id uuid not null references squawk(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  width int, height int,
  taken_at timestamptz,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index squawk_photo_squawk_idx on squawk_photo (squawk_id, created_at);
alter table squawk_photo enable row level security;
create policy squawk_photo_read on squawk_photo for select using (has_aircraft_access(aircraft_id));
-- Anyone with access may add a photo to a squawk they reported; editors may add to any.
create policy squawk_photo_add on squawk_photo for insert with check (
  has_aircraft_access(aircraft_id) and created_by = auth.uid() and (
    can_edit_aircraft(aircraft_id) or exists (select 1 from squawk s where s.id = squawk_id and s.reported_by = auth.uid())));
create policy squawk_photo_delete on squawk_photo for delete using (
  can_edit_aircraft(aircraft_id) or created_by = auth.uid());

create table mechanic_link (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  kind text not null check (kind in ('squawk','visit')),
  squawk_ids uuid[] not null default '{}',
  visit_id uuid references planned_visit(id) on delete cascade,
  recipient_label text not null check (length(recipient_label) between 1 and 80),   -- 'M. Torres'
  provider_id uuid references service_provider(id) on delete set null,
  token_hash text not null unique,
  token_enc text not null,
  include_photos boolean not null default true,
  include_reporter boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '91 days'),
  check ((kind = 'squawk' and cardinality(squawk_ids) between 1 and 20) or (kind = 'visit' and visit_id is not null))
);
create index mechanic_link_aircraft_idx on mechanic_link (aircraft_id);
create table mechanic_link_view (
  id bigserial primary key,
  link_id uuid not null references mechanic_link(id) on delete cascade,
  ip_hash text, user_agent text,
  created_at timestamptz not null default now()
);
create index mechanic_link_view_idx on mechanic_link_view (link_id, created_at desc);
alter table mechanic_link enable row level security;
alter table mechanic_link_view enable row level security;
create policy mlink_manage on mechanic_link for all
  using (can_edit_aircraft(aircraft_id))
  with check (can_edit_aircraft(aircraft_id) and created_by = auth.uid());
create policy mlink_view_read on mechanic_link_view for select using (
  exists (select 1 from mechanic_link l where l.id = link_id and can_edit_aircraft(l.aircraft_id)));
revoke all on mechanic_link, mechanic_link_view from anon;
grant all on mechanic_link, mechanic_link_view to service_role;
```
- Token: 128 bits random, base62, shown as `https://mytaillog.com/m/<token>`; `token_hash = sha256(token)`; `token_enc` AES-GCM via `lib/crypto.ts` (same as record_room) so the owner can copy it again. Default expiry 30 days; allowed 7, 30, 90.
- The `revoke_rooms_on_transfer` trigger is extended (same migration) to also set `revoked_at = now()` on every open `mechanic_link` of the aircraft when `owner_id` changes.
- Storage: photos live in the private `logbook-pages` bucket under `<aircraft_id>/squawks/<squawk_id>/<photo_id>.jpg` so the existing `storage_object_aircraft()` policy covers them.

### 2.9 0077_scan_batch_and_reading_queue.sql (two files)
```sql
-- 0077a
alter type extraction_status add value if not exists 'queued';
alter type extraction_status add value if not exists 'waiting_allowance';
-- 0077b
create table scan_batch (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  logbook_id uuid not null references logbook(id) on delete cascade,
  source text not null check (source in ('phone_camera','web_upload','web_camera','pdf','csv')),
  expected_pages int not null check (expected_pages between 1 and 2000),
  is_handwritten boolean not null default true,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,             -- every page terminal (extracted or failed)
  notified_at timestamptz,
  updated_at timestamptz not null default now()
);
create index scan_batch_aircraft_idx on scan_batch (aircraft_id, created_at desc);
alter table page
  add column batch_id uuid references scan_batch(id) on delete set null,
  add column image_phash text,                    -- 16 hex chars, 64-bit dHash of the normalised image
  add column duplicate_of_page_id uuid references page(id) on delete set null,
  add column needs_look boolean,                  -- computed at extraction (3.9.2); null until extracted
  add column landing_date date;                   -- earliest confirmed-or-read entry date on the page, for the map
create index page_batch_idx on page (batch_id);
create index page_phash_idx on page (aircraft_id, image_phash) where image_phash is not null;
create index page_queue_idx on page (extraction_status, created_at) where extraction_status in ('queued','waiting_allowance');
```
- `queued`: uploaded, waiting for a reader worker. `processing`: being read. `waiting_allowance`: the uploader's rolling-24-hour AI allowance is spent; the worker retries when the earliest call in the window ages out. `pending` stays for legacy clients that call extract themselves.
- `needs_look = true` when any entry on the page has a field with `field_confidence < 0.75` (`CONFIDENCE_THRESHOLD` in `lib/extraction/schema.ts`), fails a plausibility check (3.9.2), is a page-spanning fragment, or the page has `unread_rotated_content`.

### 2.10 0078_hours_reading_photo.sql
```sql
alter table hours_reading
  add column photo_path text,                -- <aircraft_id>/meters/<reading_id>.jpg, nullable
  add column ocr_value numeric(10,1),        -- what the phone read
  add column ocr_confidence numeric(4,3),
  add column ocr_candidates jsonb,           -- [{value:number, confidence:number, bbox:[x,y,w,h]}]
  add column owner_edited boolean not null default false;   -- the saved value differs from ocr_value
```
- New `source` value `tach_photo` (text column, no enum change). A `tach_photo` reading is a measured reading (it counts for utilization, unlike `adsb_estimate`).
- Photos are kept only when the owner's setting "Keep meter photos" is on (default on); otherwise `photo_path` is null and the image is discarded after reading.

### 2.11 0079_reminders_v2.sql
```sql
alter table reminder_log
  add column kind text not null default 'lead' check (kind in ('lead','lapse','weekly','visit','visit_risk','document','reading_done','gap')),
  add column channel text not null default 'email' check (channel in ('email','push','in_app')),
  add column visit_id uuid references planned_visit(id) on delete set null;
create index reminder_log_lookup_idx on reminder_log (user_id, aircraft_id, item_key, kind, due_signature);

create table reminder_snooze (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  item_key text not null,
  due_signature text not null,               -- snooze ends automatically when the cycle changes
  until_at timestamptz,                      -- null = stop for this cycle
  created_at timestamptz not null default now(),
  unique (user_id, aircraft_id, item_key, due_signature)
);
alter table reminder_snooze enable row level security;
create policy snooze_self on reminder_snooze for all using (user_id = auth.uid()) with check (user_id = auth.uid() and has_aircraft_access(aircraft_id));

create table notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aircraft_id uuid references aircraft(id) on delete cascade,
  kind text not null,                        -- same set as reminder_log.kind plus 'share_invite','backup_failed','conflict'
  title text not null check (length(title) <= 140),
  body text not null check (length(body) <= 600),
  deep_link text not null,                   -- 'mytaillog://aircraft/<id>/status/item/mx:<uuid>' (see 4.9)
  actions jsonb not null default '[]',       -- [{id:'plan_visit', label:'Plan the visit'}, …]
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz
);
create index notification_user_idx on notification (user_id, created_at desc);
alter table notification enable row level security;
create policy notification_self_read on notification for select using (user_id = auth.uid());
create policy notification_self_update on notification for update using (user_id = auth.uid()) with check (user_id = auth.uid());
```
Reminder preferences stay in `profile.preferences.alerts` (existing shape, merged over defaults by `resolveAlerts`). New keys, all optional:
```jsonc
{
  "alerts": {
    "annual":   { "enabled": true, "lead_days": 90 },
    "oil":      { "enabled": true, "lead_hours": 10 },
    "ad":       { "enabled": true, "lead_days": 30, "lead_hours": 25 },
    "default":  { "enabled": true, "lead_days": 30, "lead_hours": 25 },
    "document": { "enabled": true, "lead_days": 60 },                 // new
    "channels": { "email": true, "push": true },                      // new
    "weekly_while_lapsed": true,                                       // new, max 8 weekly sends per cycle
    "reading_done": { "push": true, "email": false },                  // new
    "visit": { "enabled": true, "lead_days": 7 },                      // new
    "quiet_hours": { "start": "21:00", "end": "07:00", "tz": "America/New_York" }   // new, push only
  },
  "keep_meter_photos": true                                            // new
}
```

### 2.12 0080_record_room_v2.sql
```sql
alter table record_room
  add column audience text not null default 'other' check (audience in ('ia','buyer','insurer','other')),
  add column cover text not null default 'map' check (cover in ('map','summary')),
  add column map_window text not null default 'whole_life' check (map_window in ('whole_life','line_ahead','last_5_years')),
  add column include_dossier boolean not null default false,
  add column include_squawks boolean not null default false,
  add column include_reporters boolean not null default false,
  add column include_gaps_note boolean not null default true;
alter table record_room_view
  add column session_key text,          -- sha256(ip_hash || user_agent || floor(epoch/1800)) computed by the server
  add column section text;              -- 'map','summary','dossier','logbook:<id>','document:<id>','page:<id>'
create index record_room_view_session_idx on record_room_view (room_id, session_key);

create view record_room_opens as
  select room_id, session_key, min(created_at) as opened_at, max(created_at) as last_at,
         array_agg(distinct section) filter (where section is not null) as sections
  from record_room_view group by room_id, session_key;
alter view record_room_opens set (security_invoker = true);
```
- "Opens" = distinct `session_key` (one browser within 30 minutes). Rows written before 0080 have `session_key` null and count one open per row (matches today's count).
- `expires_at` constraint (≤ 181 days) stays. The IA preset sets `expires_at = least(annual due date + 14 days, created_at + 180 days)`.
- Contents rules are unchanged: confirmed and signed entries only, scans only if `include_scans`, documents by id.

### 2.13 0081_time_check.sql
```sql
create table time_check_dismissal (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  component text not null check (component in ('engine','prop')),
  log_entry_id uuid not null references log_entry(id) on delete cascade,
  written_value numeric(10,1) not null,
  calculated_value numeric(10,1) not null,
  action text not null check (action in ('agree','added_to_annual_prep')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aircraft_id, component, log_entry_id)
);
```
A check reappears when the written or calculated value changes (the stored pair no longer matches).

### 2.14 0082_aircraft_d.sql
```sql
alter table aircraft
  add column expected_hours_per_week numeric(4,1) check (expected_hours_per_week between 0 and 60),
  add column situation_override text check (situation_override in ('preparing_sale','in_shop')),
  add column status_ready_at timestamptz;     -- first time owner_status_ready() became true (success metric)
```
- `expected_hours_per_week`: the owner's answer to "About how many hours a week do you fly?" (setup, optional). Used only as the third projection fallback (3.3).
- `situation_override`: set by the owner from the home ("I'm selling N734DM", "It's in the shop"); cleared by the owner or automatically when the reason ends (3.6).

### 2.15 0083_status_snapshot.sql
```sql
create table aircraft_status_snapshot (
  aircraft_id uuid primary key references aircraft(id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,   -- change_log needs an id column
  computed_at timestamptz not null,
  inputs_seq bigint not null,          -- max change_log.seq for this aircraft that the snapshot reflects
  algo_version int not null,           -- bump when any 3.x rule changes
  snapshot jsonb not null,             -- StatusSnapshot, 4.3
  updated_at timestamptz not null default now()
);
alter table aircraft_status_snapshot enable row level security;
create policy snapshot_read on aircraft_status_snapshot for select using (has_aircraft_access(aircraft_id));
-- writes: service role only (no insert/update policy for authenticated)
```
- Recomputed by the server after any committed write that touches the aircraft's status inputs (debounced 5 seconds per aircraft), by the daily job (dates move at midnight in the aircraft's home time zone, default UTC when `home_base` has none), and on demand by `GET /api/aircraft/{id}/status?fresh=1`.
- Synced to phones like any other row; it is what the phone, the widget and the web all show when no local unsynced change applies.

### 2.16 0084_sync_registration.sql
- Adds `log_change()` triggers to: `item_completion`, `service_provider`, `planned_visit`, `planned_visit_item`, `visit_suggestion_dismissal`, `logbook_gap`, `squawk_photo`, `scan_batch`, `time_check_dismissal`, `aircraft_status_snapshot` (row id = its `id` column).
- Back-fills one `I` row per existing row of those tables (0045 pattern) so devices with an old cursor receive them.
- Adds the same tables to `SYNCED_TABLES` in `apps/web/src/lib/sync/changes.ts`.
- Not synced (online only, fetched by endpoint): `record_room*`, `mechanic_link*`, `notification`, `reminder_snooze`, `reminder_log`.
- Creates `sync_retention` (single-row table: `min_seq_retained bigint`) for 5.4.

---

## 3. Derived computations the server owns

All rules here are implemented once in TypeScript in a new workspace package `packages/core` (pure functions, no I/O), used by the Next.js server, the web client, the daily jobs and the reminder composer. Native apps do not reimplement the whole engine. They read the server's `aircraft_status_snapshot` and recompute only the "local adjustment" subset (3.12) for changes made on the device and not yet synced, verified by the shared fixtures in `packages/core/fixtures/*.json` that Swift and Kotlin unit tests must pass byte for byte.

### 3.1 Inputs and the unconfirmed gate
- Entries count toward anything derived only when `trust in ('confirmed','signed')` and `replaced_by_entry_id is null`. `ai_read` entries are shown with their TrustMark but never move due status, projections, the line ahead, visits, reminders, record rooms, dossiers, summaries or exports of status.
- Owner-entered facts (meter readings other than `adsb_estimate`, Mark done without a page, setup answers, document expiries) count as `confirmed`.
- `adsb_estimate` readings never count for status or utilization.
- Meter values used for countdowns are stitched totals across `meter_reset` rows (existing `hobbsTach.ts`). The displayed tach is the face value.

### 3.2 Due items and status
A due item is one of: a `maintenance_item` (`mx:<id>`), an `ad_compliance` with `recurring = true` or `status = 'open'` (`ad:<id>`), or a `document` with `track_expiry` (`doc:<id>`).

**Calendar limit (date):**
| Item | Rule |
|---|---|
| annual, transponder, pitot_static, elt (`CALENDAR_MONTH_KINDS`) | `last_day_of_month(last_done_date + interval_months)` |
| vor | `last_done_date + 30 days` (exact days) |
| elt_battery and other expiry items | `expires_on` |
| other items with `interval_months` | `last_done_date + interval_months` (same day of month, clamped to month end) |
| AD | `next_due_date` from `computeNextDue` (complied date + interval_months) |
| document | `expires_on` |

**Hours limit:** `next_due_hours` on the item's meter (`meter` override, else `oil_change` → hobbs, else tach; hobbs missing → tach). `hundred_hour` resets off the later of its last done and the last annual (existing `effectiveNextDue`).

**Status (per item, evaluated "today" in the aircraft's time zone):**
| Status | Condition |
|---|---|
| `overdue` | calendar due date < today, or hours remaining ≤ 0 |
| `due_soon` | not overdue, and (days left ≤ 90, or ≤ 5 for `vor`, or ≤ the document's lead, default 60, for `doc:`) or hours remaining ≤ 10 |
| `current` | has at least one limit and neither of the above |
| `no_record` | no last-done date and no expiry date, or an hours limit with no current meter reading, or a tracked document without `expires_on` |

`advisory` is a separate boolean (`regulatory = false`); it never changes the status computation but StatusMark shows the advisory variant and the verdict never leads with an advisory item unless it is overdue.

**Days left** = `due_date − today` in whole days (negative when overdue; the copy says "lapsed 7 days ago").

### 3.3 Hours projected to dates
Projection converts hours remaining into "about <date>". It never decides status and never replaces a calendar limit.

**Rate selection (first rule that qualifies wins):**
1. **Trailing 90 days, tach.** `utilizationFor(readings, resets, 'tach', today)` with the window shortened to 90 days. Qualifies when ≥ 3 contributing reading dates spanning ≥ 21 days and `hoursPerDay > 0`.
2. **Trailing 90 days, hobbs.** Same, on hobbs. Labelled "from hobbs".
3. **Trailing 365 days** (today's algorithm, tach then hobbs). Qualifies at confidence ≥ `low` (≥ 2 readings over ≥ 30 days). Used when the aircraft has flown little lately; copy notes "from the past year".
4. **Owner's estimate.** `aircraft.expected_hours_per_week / 7`. Copy notes "from your estimate".
5. **None.** No date is shown; the hours limit says "<n> h left, no recent flying to date it".

`basis` is recorded as `trailing_90 | trailing_90_hobbs | trailing_365 | owner_estimate | none`. Confidence is reported with today's ladder (`high` ≥ 6 readings over ≥ 180 days; `medium` ≥ 4 over ≥ 90; `low` ≥ 2 over ≥ 30) applied to the readings of the rule used; rules 1 and 2 report at most `medium`; rule 4 reports `low`.

**Projected date** = `today + ceil(hours_remaining / hours_per_day)` days. Hours already reached: no projection (the item is overdue).

**Display granularity** (copy in 12-copy-and-voice.md): ≤ 120 days away "about Dec 12"; 121 to 540 days "about Apr 2027"; > 540 days "about 2030".

**"First":** for an item with both limits, `first = 'calendar'` when `calendar_due ≤ projected_date`, else `'hours'`. When the projection basis is `none`, `first` is `'hours'` if hours remaining ≤ 10 (due soon by hours), otherwise `'calendar'`, and the hours line says it cannot be dated. `first_date` = the date of the limit named first (calendar date or projected date). Items with one limit have `first` = that limit.

**Meter on a date** (Plan ahead, visits): `meter_at(d) = current_stitched + hours_per_week/7 × (d − today)`, where `hours_per_week` is the selected rate unless the owner typed another in the date scrubber.

### 3.4 Line ahead
The line ahead is the list of due items placed on their book's line between `from = today` and `to = today + horizon`.

| Surface | Horizon |
|---|---|
| Status home (web, tablet, phone) | 12 months |
| Status in the annual-month situation | 60 days |
| Widget | 60 days |
| Plan ahead | 24 months (first 6 at double scale, drawn per 10-line-map.md) |
| Annual prep | today to the annual's due date + 14 days |

Each due item with a `first_date` inside the horizon yields one ring: `{item_key, line, date: first_date, kind: 'calendar'|'projected', status}`. Overdue items sit at `today` with `ring bad`. Items with no date (projection none, or `no_record`) are not drawn; they are listed under the line ("Not on the line: <label>, needs a date"). Line assignment: `maintenance_item.line`; ADs: the logbook of their `reference_entry_id`, else airframe (engine ADs whose reference contains the engine make go on engine; prop likewise); documents are not drawn on a book line (they sit in the "documents" row of the due list only). Planned visits within the horizon are drawn as `cap plan` labelled "Planned"; suggested visits as `cap plan` labelled "Suggested" (drawing in 10-line-map.md).

### 3.5 Suggested visits
**Purpose:** propose one shop trip that clears several items before they lapse.

**Candidates:** due items with `status in ('overdue','due_soon','current')`, a `first_date` within the horizon (Status: 12 months; Plan ahead: 24 months), not `advisory` overhauls (`engine_tbo`, `prop_overhaul` are never bundled), not documents, not already in a `planned` or `in_shop` visit, plus open squawks with severity `medium` or `high` (they ride along; they never anchor).

**Groups by place:** each candidate resolves a provider: `maintenance_item.provider_id` → the default provider for its `shop_kind` → none. Its place = `provider.airport` → `aircraft.home_base` → `'home'`. Items with `shop_kind = 'self'` (VOR check) have no place and may join any group. Two items can share a visit only when their places are equal. Different shop kinds at the same place may share a visit (the visit lists each item's provider).

**Algorithm (deterministic):**
1. Sort candidates (excluding self items and squawks) by `first_date` ascending, then `item_key`.
2. Take the earliest ungrouped candidate A. Open a group at A's place with `anchor = A.first_date` (for an overdue item, `anchor = today`).
3. Add every ungrouped candidate B at the same place where `B.first_date ≤ anchor + W_days`, or B has an hours limit and `B.hours_remaining − hours_flown(today → visit_week_end) ≤ W_hours`. Defaults `W_days = 60`, `W_hours = 25`; per-item `visit_window_days/hours` override.
4. **Visit week:** the latest Monday M such that `M + 4 days < min(first_date of non-overdue items in the group)` and `M ≥ next Monday after today`. If the group has an overdue item that needs a shop (not self), `M = next Monday on or after today + 2 days`.
5. Add self items (VOR) whose status is overdue or whose due date is ≤ M + 34 days (a VOR check done at the visit lasts 30 days past it). Add open `medium`/`high` squawks to the first group of the aircraft.
6. Repeat from step 2 until no candidates remain.
7. Keep groups with ≥ 2 items (counting self items and squawks). Single-item groups are dropped (the ring alone says it).
8. Drop groups whose `suggestion_key` is in `visit_suggestion_dismissal`.
9. **Early cost** for each item done before its due: calendar items "<n> days early" (`first_date − (M+2)`), hours items "about <n> h early" (`hours_remaining − hours_flown(today → M+2)`, rounded to whole hours). Shown on the visit.
10. Limit: Status shows the first 2 groups within 12 months; Plan ahead shows up to 6 within 24 months.

**`suggestion_key`** = `sha1(place + '|' + sorted(item_keys).join(',') + '|' + M)`, hex, first 16 characters. Dismissing a suggestion stores its key; a different item set or week yields a new key and the suggestion can return.

**Copy model** (exact strings in 12-copy-and-voice.md): "Visit 1, week of Dec 7", "clears 3 items before they lapse", per item the provider and last-done page.

**Worked example (N734DM, Nov 18, 2026, 3 h a week):** oil (projected Dec 12, place KBED, M. Torres), transponder and pitot-static (Dec 31, KBED, AeroCheck), VOR (overdue, self) → anchor Dec 12, transponder within 60 days → group; M = Dec 7 (Dec 11 < Dec 12); VOR added. "Week of Dec 7, 4 items". Then ELT battery (Feb 28) + seat-rail AD (projected about Mar 23, 23 days after) → M = Feb 22; AD "about 10 h early". (The mockups show Feb 15 and Feb 8 for this second visit; the rule above wins.)

### 3.6 Situation of the aircraft (home)
Evaluated in this order; the first match is the situation.

| Situation | Condition | Line ahead horizon |
|---|---|---|
| `setup` | `owner_status_ready()` false: no annual last-done date or no current tach/hobbs | none (W-SETUP-02 map with dashed past) |
| `in_shop` | `situation_override = 'in_shop'` or a visit with status `in_shop` | 60 days |
| `preparing_sale` | `situation_override = 'preparing_sale'`, or a live (unexpired, unrevoked) record room with `audience = 'buyer'` | 12 months |
| `annual_month` | the annual is not overdue and its due date is ≤ 60 days away | 60 days |
| `attention` | any item `overdue` or `due_soon` | 12 months |
| `all_clear` | none of the above | 12 months |

`in_shop` from a visit clears when the visit leaves `in_shop`. `preparing_sale` from a record room clears when no buyer room is live; the override clears only by the owner. Overdue and due-soon items are always listed in every situation; the situation changes the verdict, the order of sections and the horizon, never hides an item.

### 3.7 Map model (stops, interchanges, eras)
The map is a presentation of synced data, so phones build it locally from their mirror with the same rules (fixtures `map-*.json`).

- **Stop:** one per (logbook, entry_date) among entries that are not replaced and not continuation fragments. `trust` of the stop = the lowest trust among its entries (`ai_read` < `confirmed` < `signed`); `ai_read` stops are drawn with a dotted stroke (`stop unconf`, 10 §6). Entries with no date are not drawn; they are counted under the map ("3 entries without a date").
- **Interchange:** a set of stops on ≥ 2 different logbooks with the same `entry_date` where at least one pair shares a non-empty normalised `mechanic_cert_number`, or the tach values agree within 0.5 h. An interchange's trust is the lowest of its stops.
- **Era (since overhaul):** for the engine line, from the confirmed completion of `engine_tbo` (or an entry with `entry_kind = 'engine_overhaul'`) to today; label "<hours> h since overhaul". Prop likewise. Only the latest era is shaded by default; earlier eras are drawn when the book is filtered.
- **Gap:** `logbook_gap` rows with status `open`, `asked_previous_owner` (dashed); `no_pages_exist` (drawn per 10-line-map.md as a thin solid "no pages exist" stretch); `dismissed` and `filled` are not drawn.
- **Squawk markers** on the spine: open squawks at `reported_at` (filled diamond), resolved squawks at `resolved_at` (hollow), on the airframe line unless the clearing entry is in another book.
- **Landing pages:** pages with `extraction_status in ('queued','processing','waiting_allowance')` are not drawn; pages read but unconfirmed contribute `ai_read` stops; a page whose entries have no date is placed at `page.landing_date` if set.

### 3.8 Gaps: detection and evidence
**Detection** (server, after any confirm or delete that changes a logbook's confirmed entry dates, and nightly):
1. For each logbook of type airframe, engine, prop, avionics: sort confirmed entry dates. Any consecutive pair more than 24 months apart (`COVERAGE_GAP_MONTHS`) is a coverage gap from the earlier date to the later date.
2. Annual chain (airframe only): any two consecutive confirmed annual completions more than 13 calendar months apart, where no gap already covers that span, yields a gap with `source = 'annual_chain'` spanning the two annuals. These are flagged "suspected".
3. Before the first confirmed entry of a book, if the aircraft `year` is earlier than that entry's year by ≥ 2, a gap from `make_date(year,1,1)` to the first entry (labelled "no pages yet before <year>").
4. Reconcile with existing rows (2.6). A gap whose span now contains confirmed entries splitting it into pieces shorter than 24 months is set `filled`.

**Evidence ("what the other books show")** for a gap on book X between dates a and b, computed on read: for every other book Y, count confirmed entries in (a, b), the min and max tach among them, page range (min and max `page_sequence`, with logbook volume labels), and the count of annual completions; plus unconfirmed pages of book X whose entries fall in (a, b) ("6 pages read, not yet confirmed"). The verdict line is "The aircraft flew and was inspected. The <book> pages for those years are what is missing." when another book has ≥ 1 annual in the span, else "The other books show <n> entries in those years." Hours flown in the span = max tach − min tach across all books' confirmed entries, rounded to the nearest 10 ("about 840 hours").

### 3.9 Reading pipeline rules
#### 3.9.1 Queue
- An upload creates `page` rows with `extraction_status = 'queued'` and `batch_id`. A server worker (cron every minute plus a database webhook on insert) claims queued pages oldest first, at most 4 concurrently per user, reserves AI calls with `reserve_ai_call_v2`; on "Daily AI limit reached" sets `waiting_allowance` and records `retry_after = earliest call in the window + 24 h`.
- On success: `extracted`, entries written as `ai_read`, `needs_look` computed, `landing_date` set. On failure after 2 attempts: `failed` with `extraction_error` (owner copy in 12-copy-and-voice.md).
- When every page of a batch is `extracted` or `failed`, set `scan_batch.completed_at`, then create one `notification` (kind `reading_done`) and push "6 pages are read. 2 need a look." per the owner's `reading_done` channels. One notification per batch, never per page.

#### 3.9.2 Doubtful fields (plausibility)
A field is doubtful (`needs_look`) when any of:
- `field_confidence[field] < 0.75`;
- `tach` or `hobbs` lower than the previous dated entry on the same page or in the same logbook by more than 0.1 h, with no `meter_reset` between them;
- `tach` more than 300 h above the previous entry in the same logbook when the dates are < 12 months apart;
- `entry_date` outside the range [previous entry date on the page − 31 days, next entry date on the page + 31 days], or in the future, or before the aircraft's year;
- the extractor returned alternatives for the field (`field_confidence` carries `{value, alt:[…]}` in schema N+1).
The review desk orders fields by doubt: plausibility failures first, then ascending confidence.

#### 3.9.3 Duplicate page at upload
- The client computes `image_phash` (64-bit dHash on the deskewed page scaled to 9×8 greyscale) before upload and sends it with the page.
- The server compares against pages of the same aircraft: Hamming distance ≤ 6 → `duplicate_of_page_id` set and the upload response carries `{duplicateOf: {pageId, logbook, pageLabel, scannedAt}}`. The page is still stored and read only after the owner chooses "Keep both"; "Skip this one" deletes it. Pages with a duplicate candidate stay `queued` but are not claimed until the owner chooses (they do not use allowance).
- Post-extraction duplicate detection (`lib/duplicates.ts`) is unchanged and feeds W-MAINT-05.

### 3.10 Written versus calculated time
For component C in {engine, prop}:
1. **Anchor:** the latest confirmed completion of `engine_tbo` (engine) or `prop_overhaul` (prop), giving `anchor_tach`. No anchor → no check ("Add the overhaul to compare times").
2. **Written values:** confirmed entries after the anchor with a `stated_times` element for C with basis `SMOH`/`TSO` (engine) or `SPOH`/`TSO` (prop).
3. **Calculated** = stitched tach at that entry − `anchor_tach`.
4. **Result:** `|written − calculated| ≤ 1.0` → `agree`; else `apart` with `difference`. Digit-swap hint when the written and calculated values, as strings with one decimal, differ only by swapping two adjacent digits ("The written figure looks like two digits swapped").
5. Shown for the latest written value per component; the list shows up to 3 earlier ones on request. Dismissals per 2.13.
Copy rule: the app never corrects the book: "Mention it to your IA; only a new entry can correct the book."

### 3.11 Reminder composition
Daily job at 13:00 UTC (existing cron), per user, per aircraft, per due item, using `resolveAlerts`:
- **lead:** when the item first enters its category lead window (days or hours, whichever first). Once per due cycle (`due_signature`).
- **lapse:** on the day the item becomes overdue. Once per cycle.
- **weekly:** every 7 days after lapse while still overdue, if `weekly_while_lapsed`; at most 8 per cycle.
- **visit:** `visit.lead_days` before a planned visit's week; lists its items.
- **visit_risk:** when an item in a planned visit gets a `first_date` earlier than the visit's Monday (for example after a flight is logged). Once per (visit, item, new first_date week).
- **document:** lead and lapse for `doc:` items with the `document` lead.
- Items in a `planned` visit whose week is before their `first_date` do not get their own lead reminder; the visit reminder covers them.
- Snoozes (`reminder_snooze`) suppress sends for that item and cycle until `until_at` (or for the cycle).
- One push and one email digest per user per day (existing grouping by aircraft); quiet hours delay pushes to the end of the window.
- **Whole-answer content:** every reminder states the item, the limit that comes first with its date or hours and projection, the other limit, the provider and page of the last completion, and the suggested or planned visit that covers it if any. Example (push): title "N734DM: three items fit one visit, week of Dec 7"; body "Oil change in 9.7 h (about Dec 12), transponder and pitot-static by Dec 31. AeroCheck Instruments did the last two on Dec 3, 2024, Airframe p. 58."; actions "Plan the visit", "Remind me Friday".

### 3.12 What native clients compute locally (offline adjustments)
Phones show the synced `aircraft_status_snapshot` and, for changes waiting in their outbox, recompute only:
1. Current meter values from the snapshot's meters plus local readings (stitched with local resets).
2. Hours remaining for each item = `next_due_hours − current`, and the projected date with the snapshot's `rate.hours_per_day`.
3. After a local Mark done: the item's next due by 3.2 (calendar month rule, VOR 30 days, interval hours from the done hours).
4. Status by the thresholds in 3.2.
5. Plan ahead lapses for a scrubbed date (3.3 meter-on-a-date).
6. Visit at risk: a planned or suggested visit whose Monday is after a locally recomputed `first_date`.
7. Map stops and interchanges (3.7) from local rows.
Anything else (suggested visit grouping, situations, gaps, time checks, first read, verdict sentence) is taken from the last snapshot. Values changed locally carry the "On this phone" marker until the next pull replaces the snapshot. Fixture files: `due-calendar.json`, `due-hours.json`, `status-thresholds.json`, `projection.json`, `plan-date.json`, `visit-risk.json`, `map-grouping.json`.

---

## 4. API endpoints

All endpoints are under `https://<host>/api`. Authentication: `Authorization: Bearer <supabase access token>` (native) or the Supabase session cookie (web); both resolve through `createSyncClient`, so RLS applies. JSON in and out, `snake_case` keys in rows (as stored), `camelCase` in envelopes (as today). Errors: `{ "error": "<owner-readable message>", "code": "<machine code>" }` with HTTP 400 (validation), 401 (no session), 403 (role), 404, 409 (conflict), 410 (resync required), 413 (too large), 429 (rate or allowance), 503 (AI provider unavailable). Codes used by clients: `needs_connection` (client-side only), `ai_allowance_exhausted`, `viewer_read_only`, `conflict`, `resync_required`, `duplicate_page`, `not_owner`.

### 4.1 Kept as is (with the noted changes)
| Endpoint | Change |
|---|---|
| `GET /api/sync/pull?cursor&limit` | adds new tables; may return 410 `resync_required` (5.4) |
| `POST /api/sync/push` | new mutation types (5.3) |
| `GET /api/sync/access` | adds `aiAllowance: {used, cap, pagesLeftApprox, nextFreeAt, ownKey}` if not already present, and `roles: [{aircraftId, role}]` |
| `POST /api/aircraft/{id}/capture` | accepts `batchId`, `phash`, `pageSequence`, `isHandwritten`; returns `{pageId, duplicateOf?}`; no longer triggers extraction itself |
| `POST /api/pages/{pageId}/extract` | kept for re-read ("Crop and re-read"); enqueues instead of reading synchronously; returns `{status:'queued'}` |
| `POST /api/aircraft/{id}/ask` | unchanged (online, streaming, buffered for native) |
| `POST /api/aircraft/enroll`, `GET /api/registry` | unchanged (online) |
| `POST /api/aircraft/{id}/documents` | accepts `expiresOn`, `trackExpiry`, `renewsEveryMonths` |
| `POST /api/aircraft/{id}/blob` | accepts `kind: 'squawk_photo'|'meter_photo'` with `squawkId` or `readingId` |
| `POST /api/aircraft/{id}/backup/run` | unchanged ("Backup scheduled") |
| `POST /api/push` | registers device token; adds `widgetRefresh: boolean` to opt the device into silent widget refresh pushes |
| `POST /api/signed-entries/challenge`, `GET /api/signed-entries/{entryId}/print-link` | unchanged |
| `POST /api/aircraft/{id}/import/csv`, `GET /api/aircraft/{id}/export` | unchanged |

### 4.2 Status snapshot
`GET /api/aircraft/{id}/status[?fresh=1]` → `200 StatusSnapshot` (the same JSON stored in `aircraft_status_snapshot.snapshot`).

### 4.3 StatusSnapshot shape
```ts
type StatusSnapshot = {
  aircraftId: string;
  computedAt: string;            // ISO
  inputsSeq: number;
  algoVersion: number;
  today: string;                 // YYYY-MM-DD in the aircraft's time zone
  situation: 'setup'|'in_shop'|'preparing_sale'|'annual_month'|'attention'|'all_clear';
  verdict: { text: string; emphasis: [number, number][] };   // char ranges set bold; composed per 12-copy-and-voice.md
  meters: Record<'tach'|'hobbs'|'airframe', { face: number|null; stitched: number|null; asOf: string|null;
           source: 'manual'|'tach_photo'|'myflightbook'|'entry'|'starting'|'adsb_estimate'|null; readingId: string|null } >;
  rate: { hoursPerDay: number; hoursPerWeek: number; basis: 'trailing_90'|'trailing_90_hobbs'|'trailing_365'|'owner_estimate'|'none';
          meter: 'tach'|'hobbs'; sampleCount: number; windowStart: string|null; windowEnd: string|null;
          confidence: 'high'|'medium'|'low'|'none' };
  items: DueItem[];
  visits: { suggested: VisitView[]; planned: VisitView[] };
  lineAhead: { from: string; to: string; rings: Ring[]; undated: string[] /* item keys */ };
  counts: { overdue: number; dueSoon: number; noRecord: number; pagesToReview: number; pagesBeingRead: number; openSquawks: number };
  adsb?: { flights: number; hours: number; suggestedTach: number|null; since: string };
};
type DueItem = {
  key: string;                   // 'mx:<uuid>' | 'ad:<uuid>' | 'doc:<uuid>'
  source: 'maintenance'|'ad'|'document';
  kind: string;                  // 'annual','oil_change','transponder','ad', 'registration', …
  label: string;                 // 'Transponder', 'AD 2011-10-09 seat rails'
  rule: string;                  // '91.413 · every 24 months', 'every 50 h'
  line: 'airframe'|'engine'|'prop'|'avionics'|null;
  regulatory: boolean; advisory: boolean; ifrOnly: boolean;
  status: 'overdue'|'due_soon'|'current'|'no_record';
  calendar: { dueDate: string; daysLeft: number; calendarMonthRule: boolean } | null;
  hours: { meter: 'tach'|'hobbs'|'airframe'; dueAt: number; remaining: number;
           projectedDate: string|null; projectionBasis: string; estimatedMeter: boolean } | null;
  first: 'calendar'|'hours'|null;
  firstDate: string|null;
  lastDone: { date: string|null; hours: number|null; entryId: string|null; pageId: string|null;
              pageLabel: string|null /* 'Airframe p. 58' */; trust: 'ai_read'|'confirmed'|'signed'|null;
              signer: string|null } | null;
  providerId: string|null;
  visitId: string|null;          // planned visit holding it
  reminder: { nextAt: string|null; kind: string|null; snoozedUntil: string|null };
};
type Ring = { itemKey: string; line: string; date: string; dateKind: 'calendar'|'projected'; status: DueItem['status'] };
type VisitView = {
  id: string|null;               // null for suggested
  suggestionKey: string|null;
  status: 'suggested'|'planned'|'in_shop'|'awaiting_records'|'done'|'cancelled';
  weekOf: string; visitDate: string|null; place: string;
  providerIds: string[];
  items: { key: string; earlyBy: { days?: number; hours?: number } | null; status: DueItem['status'] }[];
  clearsBeforeLapse: number;     // items that would lapse without the visit
  atRisk: { itemKey: string; firstDate: string }[];   // items now due before weekOf
};
```

### 4.4 Plan ahead
`POST /api/aircraft/{id}/plan` with `{ "date": "2027-03-01", "hoursPerWeek": 3 }` (hoursPerWeek optional, defaults to `rate.hoursPerWeek`) →
```json
{ "date": "2027-03-01", "hoursPerWeek": 3, "hoursUntil": 44.1,
  "metersOnDate": { "tach": 4256.5, "hobbs": null },
  "lapsed":   [{ "key": "mx:…", "when": "already", "dueDate": "2026-11-11", "coveredByVisit": "sugg:3fa1…" }],
  "lapses":   [{ "key": "mx:…", "when": "by_date", "dueDate": "2026-12-31", "coveredByVisit": "sugg:3fa1…" }],
  "stillInDate": [{ "key": "ad:…", "spare": { "hours": 11.9 } }, { "key": "mx:…", "spare": { "days": 152 } }],
  "cannotCheck": [{ "key": "doc:…", "reason": "no_date" }] }
```
Web and phones compute this locally for scrubbing (3.12 item 5); the endpoint exists for server-side rendering and parity tests.

### 4.5 Visits
| Endpoint | Body / response |
|---|---|
| `GET /api/aircraft/{id}/visits?horizonMonths=24` | `{ suggested: VisitView[], planned: VisitView[] }` |
| Booking, editing, cancelling, completing | via sync push mutations (5.3) so they work offline |
| `POST /api/aircraft/{id}/visits/{visitId}/send` | online; `{ recipientLabel, providerId?, expiresInDays: 7|30|90 }` → `{ url, expiresAt, mailto }` creates a `mechanic_link` (kind visit); `mailto` is a prefilled `mailto:` URI (subject "N734DM visit, week of Dec 7", body lists items and the link). The client opens it or the share sheet. |

### 4.6 Map
`GET /api/aircraft/{id}/map?from=1978-01-01&to=2028-12-31&logbooks=engine,prop&include=gaps,eras,squawks,rings,visits` →
```ts
{ range: { from: string; to: string; scaleBreak: string|null };   // scale break: today − 12 months (spine)
  lines: { logbook: string; logbookId: string; volumes: { id: string; label: string; from: string; to: string }[] }[];
  stops: { id: string; logbook: string; date: string; entryIds: string[]; trust: string; pageIds: string[]; label: string|null }[];
  interchanges: { id: string; date: string; stopIds: string[]; trust: string; label: string|null }[];
  gaps: { id: string; logbook: string; from: string; to: string; status: string; unconfirmedPages: number }[];
  eras: { logbook: string; from: string; to: string|null; label: string; anchorEntryId: string }[];
  squawks: { id: string; date: string; open: boolean; line: string }[];
  rings: Ring[]; visits: VisitView[]; undatedEntries: number }
```
Stop ids are stable: `sha1(logbookId + '|' + date)` first 16 hex. Interchange ids: `sha1(sorted stop ids)`.

### 4.7 Gaps, first read, time checks
| Endpoint | Response |
|---|---|
| `GET /api/aircraft/{id}/gaps/{gapId}/evidence` | `{ gap, otherBooks: [{logbook, entries, annuals, tachFrom, tachTo, pageRange: "Engine p. 6 to 11"}], hoursFlownApprox, unconfirmedPagesInGap, verdict, neighbourPages: { before: PageRef|null, after: PageRef|null } }` |
| `GET /api/aircraft/{id}/first-read?logbookId=` | `{ logbookId, ready: boolean, pages: number, from, to, findings: Finding[], nextBook: {logbook, reason} | null, aiPartial: boolean }`, `Finding = { kind: 'gap'|'recurring_repair'|'big_change'|'annual_chain'|'untracked_ad', text: string, citations: PageRef[] }` |
| `GET /api/aircraft/{id}/time-checks` | `[{ component, entryId, pageRef, written, calculated, result: 'agree'|'apart', difference, digitSwap: boolean, dismissed: boolean }]` |
| `POST /api/aircraft/{id}/time-checks/dismiss` | via push mutation `timeCheck.dismiss` (5.3) |

`PageRef = { pageId, logbook, volume, pageNumber, label: 'Airframe p. 58', entryId?: string }`.

### 4.8 Reading queue and allowance
`GET /api/aircraft/{id}/reading-queue` →
```json
{ "batches": [{ "id": "…", "logbook": "airframe", "createdAt": "…", "expected": 6, "uploaded": 6, "queued": 0,
   "reading": 0, "waitingAllowance": 0, "read": 6, "failed": 0, "needsLook": 2, "completedAt": "…" }],
  "allowance": { "usedCalls": 62, "capCalls": 100, "pagesUsedApprox": 31, "pagesCapApprox": 50,
                 "nextFreeAt": "2026-11-19T09:14:00Z", "ownKey": false, "globalPaused": false } }
```
`POST /api/aircraft/{id}/batches` `{ logbookId, source, expectedPages, isHandwritten }` → `{ batchId }` (online; offline phones create the batch row through push `batch.create`, 5.3, and upload pages from the blob queue).
`POST /api/pages/{pageId}/duplicate-decision` `{ decision: 'keep_both'|'skip' }` → `{ ok: true }`.

### 4.9 Notifications and preferences
| Endpoint | Shape |
|---|---|
| `GET /api/me/notifications?after=<iso>` | `{ items: Notification[] }` newest first, 50 max |
| `POST /api/me/notifications/{id}` | `{ read?: true, dismissed?: true }` |
| `POST /api/me/notifications/{id}/action` | `{ actionId: 'plan_visit'|'remind_friday'|'review'|'later' }` → `{ deepLink?: string }`; `remind_friday` creates a `reminder_snooze` until the coming Friday 09:00 local |
| `GET /api/me/preferences`, `PATCH /api/me/preferences` | `profile.preferences` (2.11 shape); PATCH merges keys |
| `POST /api/me/reminders/test` | sends a test push and email; `{ devices: number, email: boolean }` |

Deep links (also used as universal links `https://mytaillog.com/app/...`): `mytaillog://aircraft/{id}/status`, `/status/item/{itemKey}`, `/status/plan?date=`, `/status/visit/{visitId|suggestionKey}`, `/books/map?at=`, `/books/review?batch=`, `/books/entry/{entryId}`, `/maint/squawk/{id}`, `/share`.

### 4.10 Widget snapshot
`GET /api/aircraft/{id}/widget` →
```json
{ "aircraftId": "…", "tail": "N734DM", "computedAt": "…", "today": "2026-11-18",
  "verdictShort": "VOR check lapsed. Oil in 9.7 h.",
  "window": { "from": "2026-11-18", "to": "2027-01-17" },
  "rings": [{ "line": "engine", "date": "2026-12-12", "status": "due_soon", "label": "Oil", "dateKind": "projected" }],
  "visit": { "weekOf": "2026-12-07", "label": "Dec 7 visit: oil, transponder and static", "status": "suggested" },
  "alarm": { "label": "VOR check lapsed Nov 11, IFR only" } | null,
  "deepLink": "mytaillog://aircraft/…/status" }
```
Widgets render from the app's shared container (App Group on iOS, Glance state on Android) written after every sync and local recompute; this endpoint is called by the widget extension only when the app has not refreshed the container for 4 hours. Size ≤ 2 KB. Cache-Control `private, max-age=900`.

### 4.11 Record rooms
| Endpoint | Shape |
|---|---|
| `GET /api/aircraft/{id}/record-rooms` | `[{ id, label, audience, cover, mapWindow, includes: {...}, url, expiresAt, revokedAt, opens: number, lastOpenedAt }]` (owner only) |
| `POST /api/aircraft/{id}/record-rooms` | `{ label, audience, mapWindow, includeSummary, includeDossier, logbookIds, includeScans, documentIds, includeSquawks, includeReporters, expiresInDays: 7|30|90|180 | expiresAt }` → `{ id, url, qrPayload: url, expiresAt }`; 403 `not_owner` for editors |
| `PATCH /api/aircraft/{id}/record-rooms/{roomId}` | `{ extendDays?: 30, revoke?: true, label? }` |
| `GET /api/aircraft/{id}/record-rooms/{roomId}/opens` | `[{ openedAt, lastAt, sections: ['dossier','logbook:engine'] }]` |
| Public `GET /r/{token}` and sub-paths | existing; now writes `session_key` and `section` |

### 4.12 Mechanic links
| Endpoint | Shape |
|---|---|
| `POST /api/aircraft/{id}/mechanic-links` | `{ kind: 'squawk', squawkIds: [..], recipientLabel, providerId?, expiresInDays: 7|30|90, includePhotos: true, includeReporter: false }` → `{ id, url, expiresAt, mailto }`; 403 `viewer_read_only` for viewers |
| `GET /api/aircraft/{id}/mechanic-links` | list with `opens` |
| `PATCH /api/aircraft/{id}/mechanic-links/{linkId}` | `{ revoke: true }` |
| Public `GET /m/{token}` | page (no account): tail, make and model, each squawk (description, severity label, reported date, photos, related confirmed entries with page crops if the owner included them), or for a visit: week, place, items with due limits and last-done page crops. Read-only; writes `mechanic_link_view`. Expired or revoked: 410 page "This link has ended. Ask the owner for a new one." |

### 4.13 Aircraft lifecycle
| Endpoint | Shape |
|---|---|
| `POST /api/aircraft/{id}/transfer` | `{ newOwnerEmail, keepAccessAs: 'viewer'|'none' }` → `{ ok, revokedRooms: n, revokedLinks: n }`; wraps `transfer_aircraft()`; when `keepAccessAs = 'viewer'` inserts an `aircraft_share` for the old owner. Online only. |
| `DELETE /api/aircraft/{id}` | body `{ confirmTail: "N734DM" }`; 400 when it does not match `tail_number` case-insensitively; deletes storage objects under `<aircraft_id>/` then the row (cascade). Online only, owner only. |
| `POST /api/aircraft/{id}/situation` | via push `aircraft.setSituation` (5.3) |

### 4.14 Rate limits
Per user: 120 requests per minute across these endpoints; `plan` 30 per minute; `widget` 12 per hour per device; record-room and mechanic-link creation 20 per day per aircraft. 429 carries `retryAfter` seconds.

---

## 5. Offline sync contract

### 5.1 Model
- **Read path:** `GET /api/sync/pull?cursor=<seq>&limit=<n≤1000>` returns `{ changes: [{table, op:'upsert'|'delete', id, seq, row?}], nextCursor, hasMore }`, collapsed to the latest state per row since the cursor. The client applies changes in order inside one SQLite transaction per page of results, stores `nextCursor`, loops while `hasMore`. Re-pulling is idempotent.
- **Tombstones:** `change_log` `D` rows persist. An `upsert` for a row the caller can no longer see is returned as `delete` (access revoked or row deleted between queries).
- **Access changes:** `GET /api/sync/access` lists accessible aircraft and roles; the client drops local rows of any aircraft no longer listed and shows "You no longer have access to N4321J." once.
- **Write path:** the outbox (`action_queue` on device) drains to `POST /api/sync/push` in batches of ≤ 100 mutations, in creation order per aircraft.

### 5.2 Synced tables
Existing `SYNCED_TABLES` plus: `item_completion`, `service_provider`, `planned_visit`, `planned_visit_item`, `visit_suggestion_dismissal`, `logbook_gap`, `squawk_photo` (metadata; images via blob cache), `scan_batch`, `time_check_dismissal`, `aircraft_status_snapshot`. Local SQLite schema mirrors each table's columns; unknown columns in a pulled row are stored in a `extra_json` column so older app builds tolerate new columns.

### 5.3 Outbox operations
Envelope unchanged (`{id, type, aircraftId, payload, base?}`; `id` is the idempotency key and the new row id for inserts). New types:

| Type | Payload | Role | Online only |
|---|---|---|---|
| `reading.create` (extended) | `{id, date, tach?, hobbs?, airframe?, source?: 'manual'|'tach_photo', ocrValue?, ocrConfidence?, ocrCandidates?, ownerEdited?, photoBlobId?}` | editor | no |
| `visit.create` | `{id, weekOf, visitDate?, providerId?, airport?, notes?, fromSuggestionKey?, itemKeys: string[]}` | editor | no |
| `visit.update` (base) | `{visitId, weekOf?, visitDate?, providerId?, notes?, addItemKeys?, removeItemKeys?}` | editor | no |
| `visit.setStatus` (base) | `{visitId, status: 'in_shop'|'awaiting_records'|'done'|'cancelled'}` | editor | no |
| `visitSuggestion.dismiss` | `{id, suggestionKey}` | editor | no |
| `provider.upsert` (base when id present) | `{id?, fields: {name, kind, certNumber?, airport?, email?, phone?, isDefault?}}` | editor | no |
| `provider.delete` (base) | `{providerId}` | editor | no |
| `gap.setStatus` (base) | `{gapId, status: 'open'|'no_pages_exist'|'asked_previous_owner'|'dismissed', note?}` | editor | no |
| `gap.create` | `{id, logbookId, fromDate, toDate, note?}` (owner-declared) | editor | no |
| `squawk.create` (extended) | adds `photoBlobIds?: string[]` | any role (as self) | no |
| `squawkPhoto.create` | `{id, squawkId, blobId, takenAt?}` | reporter or editor | no |
| `squawkPhoto.delete` (base) | `{photoId}` | creator or editor | no |
| `document.setExpiry` (base) | `{documentId, trackExpiry, expiresOn?, renewsEveryMonths?, remindLeadDays?}` | editor | no |
| `itemCompletion.link` (base of item) | `{id, itemKey, entryId, doneDate, doneHours?}` | editor | no |
| `itemCompletion.delete` (base) | `{completionId}` | editor | no |
| `entry.replaceNote` (base of note) | `{noteEntryId, pageEntryId}` | editor | no |
| `timeCheck.dismiss` | `{id, component, entryId, written, calculated, action: 'agree'|'added_to_annual_prep'}` | editor | no |
| `aircraft.setSituation` (base) | `{situation: 'preparing_sale'|'in_shop'|null}` | owner | no |
| `aircraft.setExpectedHours` (base) | `{hoursPerWeek: number|null}` | editor | no |
| `batch.create` | `{id, logbookId, source, expectedPages, isHandwritten}` | editor | no |
| `page.duplicateDecision` | `{pageId, decision: 'keep_both'|'skip'}` | editor | no |
| `reminder.snooze` | `{id, itemKey, dueSignature, until?: ISO}` | any role | no (stored per user) |
| `mx.upsert` (extended) | item fields add `line, shopKind, providerId, ifrOnly, expiresOn, visitWindowDays, visitWindowHours, remindLeadDays, remindLeadHours` | editor | no |

Still refused by `validateMutation` with "Needs a connection" (the client never queues them; it calls the route when online): `page.extract`, `ask`, `aircraft.enroll`, `backup.run`, record room create/extend/revoke, mechanic link create/revoke, share invite and removal, transfer, delete aircraft, CSV import, first read generation.

Viewer role: the client hides edit controls; if a viewer's mutation reaches the server it returns `error` with code `viewer_read_only` and message "You don't have edit access to this aircraft." The only viewer writes are `squawk.create`, `squawkPhoto.create` on own squawks, and `reminder.snooze`.

### 5.4 Cursors and retention
- `nextCursor` is the max `seq` returned. Clients store one cursor per account.
- A nightly job may prune `change_log` rows older than 400 days, recording the highest pruned seq in `sync_retention.min_seq_retained`. When a client pulls with `cursor < min_seq_retained`, the server answers `410 {code:'resync_required'}`; the client keeps its outbox, discards its mirror, pulls from cursor 0 ("Rebuild from the server" without losing unsent changes), then drains the outbox. Pruning ships disabled (`app_setting` `change_log_prune_enabled = false`).

### 5.5 Conflicts by version
- The version of a row is its `updated_at` (microsecond `timestamptz`, bumped by trigger on every update). Every update and delete mutation carries `base` = the `updated_at` the device last saw. The server compares `row.updated_at > base` → `conflict` with the current row; nothing is written. This is the existing rule (docs/ios-parity/CONTRACT.md §2) and applies to every new table.
- Inserts are conflict-free (keyed by client id; retries are no-ops).
- Composite edits carry the base of the row they change (`visit.update` the visit; `itemCompletion.link` the parent item; `entry.replaceNote` the note).
- **Client handling:** a conflicted action stays in the outbox with `status = 'conflict'` and `server_row`. M-SYS-01 shows yours and theirs field by field with differing lines marked; actions "Keep mine" (re-queue with `base = server_row.updated_at`), "Take theirs" (drop the action, apply the server row), "Decide later" (leave it; the aircraft header shows "1 change needs a decision"). The web shows the same on the affected screen as an AlarmSlip with the two values (web conflicts arise only from stale forms: server actions also pass `base`).
- **Keep both changes (native, 05 §6.6):** when yours and theirs changed different fields, the client may offer "Keep both changes", which re-submits only the owner's changed fields with `base` = the server row's `updated_at`. This is an explicit owner choice, not an automatic merge.
- **Never silent:** the client never auto-resolves; a conflicted action blocks later actions on the same row (they wait), not actions on other rows.
- Counter-type writes do not conflict: `reading.create`, `oil.create`, `squawk.create`, `squawkPhoto.create` are inserts.

### 5.6 Blobs (pages, photos, documents)
- Images and files go through the blob queue, separate from the outbox: `capture_queue` (pages) and a new `blob_queue` (`id, aircraft_id, kind: 'page'|'squawk_photo'|'meter_photo'|'document', path_local, bytes, sha256, created_at, attempts, status, error`).
- Upload: `POST /api/aircraft/{id}/capture` (pages) or `/blob` (photos) with `id`, `sha256`; the server dedupes by `(aircraft_id, sha256)`.
- Ordering: a mutation that references a blob (`squawkPhoto.create {blobId}`) waits in the outbox until the blob is uploaded; the blob queue drains first.
- Size: page ≤ 12 MB after client JPEG encode (quality 0.8, long edge ≤ 3000 px); photos ≤ 6 MB; documents ≤ 25 MB. Over size → `413` and the item shows "Too large to upload. Retake at a lower size or upload from a computer."
- Retry: exponential back-off 30 s, 2 min, 10 min, 1 h, then every 6 h; failures after 5 attempts are listed in M-SYS-01 with the server's reason and "Try again" / "Remove from this phone".

### 5.7 Sync state shown to the owner
The phone header shows one of: "Synced 9:42", "Offline · 3 changes on this phone", "Uploading 2 of 6", "1 change needs a decision". Tapping it opens M-SYS-01. Copy is owned by 12-copy-and-voice.md.

---

## 6. Storage, jobs and retention

| Object | Path in bucket `logbook-pages` | Retention |
|---|---|---|
| Page image and thumbnail | `<aircraft_id>/<logbook_id>/<page_id>.jpg`, `…_thumb.jpg` (existing) | until page deleted |
| Squawk photo | `<aircraft_id>/squawks/<squawk_id>/<photo_id>.jpg` + `_thumb` | until photo or squawk deleted |
| Meter photo | `<aircraft_id>/meters/<reading_id>.jpg` | until reading deleted; not kept when `keep_meter_photos = false` |
| Vault document | existing path | until document deleted |

| Job | Schedule | Work |
|---|---|---|
| Reader worker | every minute + insert webhook | claims `queued` and eligible `waiting_allowance` pages (3.9.1) |
| Snapshot recompute | on write (debounced 5 s) and 00:05 aircraft-local | writes `aircraft_status_snapshot` |
| Daily reminders | 13:00 UTC (existing `cron/daily`) | 3.11, plus visits moving to `awaiting_records` |
| Gap detection | after confirm batches and 03:00 UTC | 3.8 |
| ADS-B | 17:30 UTC (existing) | unchanged |
| Backups | existing | unchanged |
| change_log prune | 04:00 UTC, disabled by default | 5.4 |
| View log trim | weekly | delete `record_room_view` and `mechanic_link_view` rows older than 2 years |

Exports: the `.zip` (`README.txt` documents every file) adds `item_completions.json`, `service_providers.json`, `planned_visits.json`, `logbook_gaps.json`, `squawk_photos/`, `meter_photos/`, and the new columns on existing files. Re-import recreates them (ids remapped). CSV exports gain a "Due list" file built from the snapshot (confirmed data only).

---

## 7. Migration safety checklist
- [ ] Every migration 0069 to 0084 runs on a copy of production in under 60 seconds; the generated `log_entry.trust` column (0069) is the only table rewrite.
- [ ] Enum additions (0075a, 0077a) are in files with no other statements.
- [ ] No existing column is dropped, renamed or retyped; old app builds (Capacitor and the first native builds) keep pulling and pushing without errors, ignoring new tables and columns.
- [ ] Every new aircraft-scoped table has RLS enabled before grants, the access/edit policies, an `aircraft_id` index, `updated_at` trigger, and (if synced) a `log_change` trigger and a back-fill.
- [ ] `revoke_rooms_on_transfer` also revokes mechanic links; a test transfers an aircraft with one live room and one live link and sees both revoked.
- [ ] `item_completion` back-fill produces exactly one row per item with a last-done date and per AD with a complied date.
- [ ] `packages/core` fixtures pass in TypeScript, Swift and Kotlin CI jobs.
- [ ] The snapshot for the demo aircraft N734DM on 2026-11-18 equals the fixture `snapshot-N734DM-2026-11-18.json` (verdict, 11 items, 2 suggested visits).
- [ ] Viewer tokens cannot read `mechanic_link`, `record_room`, or another user's `notification` rows (RLS tests).

## 8. Open questions
1. Version token: this spec keeps `updated_at` as the row version (existing contract). A monotonic `row_version bigint` would avoid any timestamp precision issue; adopting it would need a dual-accept period for `base`. Lead to decide; default is `updated_at`.
2. Native clients mirror only the 3.12 subset. If the owner wants suggested visits recomputed offline (for example after an offline flight moves an item), the grouping algorithm would have to be ported to Swift and Kotlin with fixtures; today the phone shows the last snapshot's visits plus the local at-risk check.
3. Projection fallback order (90 days, then 365 days, then owner estimate) and the 21-day minimum span for the 90-day window are decisions made here; the brief asked for "trailing 90-day average with fallbacks". Confirm with the lead.
4. Second suggested visit week: the rule yields "week of Feb 22" for the mock data; mockups show Feb 15 (web) and Feb 8 (phone).
5. `extraction_status` gains `queued` and `waiting_allowance`. Clients that switch on the enum must treat unknown values as "being read".
6. Mechanic links and record rooms are online-only to create; an owner at the hangar with no signal cannot send a squawk link until they reconnect. Queueing the creation would need a client-generated token, which this spec avoids.
7. Aircraft time zone: there is no `aircraft.time_zone` column; "today" uses the owner's device zone on the client and UTC on the server, which can disagree for a few hours at midnight. Adding `time_zone` (derived from `home_base`) is suggested for a later migration.
8. Whether `signed` trust should require the owner to confirm the signature field specifically, or any confirmed entry with a signer and certificate number (this spec) is enough.
9. Added after review (raised by 04-web-screens.md): `ask_history` (recent questions per user and aircraft, 90 days) for W-ASK-01's recent list; `wb_envelope` (CG envelope points per aircraft) so W-AIRCRAFT-04 can draw the envelope chart (optional until then); one endpoint returning the non-Status tab counts and flags for the rail (`GET /api/aircraft/{id}/rail`, shapes in 03-information-architecture.md §13); whether the "in the shop?" and "did the visit happen?" prompts can be dismissed, and for how long.
10. Account deletion: the server route required for App Store submission does not exist today (05-mobile-architecture.md); 13-build-plan.md puts it in phase 0. Passkeys need WebAuthn registration and assertion routes (05 §8).
