-- ===========================================================================
-- MyTailLog — Schema v1
-- Core entities: profile, aircraft, logbook, page, log_entry, document, component
--
-- Design principle: this app is an INDEX of the physical logbooks, which remain
-- the legal record per 14 CFR 91.417. Nothing here is an airworthiness record.
--
-- Data isolation: single-owner from day one. Every aircraft belongs to exactly
-- one owning user; all child records inherit access through the aircraft. Access
-- is enforced by Postgres row-level security, not just application code. The
-- has_aircraft_access() helper is the single choke point so the future
-- aircraft_share model (read/contribute grants, ownership transfer) can be added
-- without rewriting every policy.
-- ===========================================================================

-- Extensions -----------------------------------------------------------------
create extension if not exists "pgcrypto";       -- gen_random_uuid()

-- Enums ----------------------------------------------------------------------
create type logbook_type   as enum ('airframe', 'engine', 'prop');
create type review_status  as enum ('unreviewed', 'confirmed', 'disputed');
create type document_type  as enum ('form_337', 'form_8130_3', 'stc', 'ica', 'weight_balance', 'other');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- profile — one row per auth user (Supabase manages auth.users)
-- ===========================================================================
create table profile (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  -- A&P/IA cert number, optional — surfaced when this user signs off as mechanic.
  cert_number text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profile_updated_at before update on profile
  for each row execute function set_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profile (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ===========================================================================
-- aircraft — the top-level owned entity
-- Records here (tail #, serials, owner name, base) are SENSITIVE personal data.
-- ===========================================================================
create table aircraft (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete restrict,
  tail_number        text not null,
  make               text,
  model              text,
  serial_number      text,
  year               int,
  -- Multi-engine aircraft carry more than one engine/prop serial; stored as
  -- arrays so a single aircraft row covers the common single/twin cases.
  engine_serials     text[] not null default '{}',
  prop_serials       text[] not null default '{}',
  home_base          text,          -- sensitive: airport identifier / location
  enrollment_date    date not null default current_date,
  enrollment_hobbs   numeric(10,1), -- hobbs at time of enrollment
  enrollment_tach    numeric(10,1), -- tach at time of enrollment
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index aircraft_owner_idx on aircraft(owner_id);
create trigger aircraft_updated_at before update on aircraft
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helper — single choke point for RLS. v1: ownership only.
-- Extend here (union against aircraft_share) when sharing lands; policies
-- referencing this function don't need to change.
-- ---------------------------------------------------------------------------
create or replace function has_aircraft_access(target_aircraft uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from aircraft a
    where a.id = target_aircraft
      and a.owner_id = auth.uid()
  );
$$;

-- ===========================================================================
-- logbook — one of {airframe, engine, prop} per aircraft. component_ref
-- distinguishes multiple engine/prop logbooks on multi-engine aircraft
-- (e.g. 'engine 1', 'engine 2', matching engine_serials position).
-- ===========================================================================
create table logbook (
  id            uuid primary key default gen_random_uuid(),
  aircraft_id   uuid not null references aircraft(id) on delete cascade,
  type          logbook_type not null,
  component_ref text,          -- null for single-engine airframe/engine/prop
  title         text,          -- optional human label, e.g. "Engine (L)"
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index logbook_aircraft_idx on logbook(aircraft_id);
create trigger logbook_updated_at before update on logbook
  for each row execute function set_updated_at();

-- ===========================================================================
-- page — a raw scanned/captured logbook page. Original image lives in Supabase
-- storage (storage_path); OCR text + confidence + review status live here.
-- ===========================================================================
create table page (
  id                     uuid primary key default gen_random_uuid(),
  logbook_id             uuid not null references logbook(id) on delete cascade,
  aircraft_id            uuid not null references aircraft(id) on delete cascade,
  storage_path           text not null,          -- object storage key of original image
  page_sequence          int,                    -- order within a capture session
  captured_at            timestamptz,            -- when the photo was taken
  ocr_text               text,                   -- raw classic-OCR output
  extraction_confidence  numeric(4,3),           -- 0.000–1.000 overall page confidence
  review_status          review_status not null default 'unreviewed',
  is_handwritten         boolean,                -- capture-app flag → routes to vision-LLM
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index page_logbook_idx  on page(logbook_id);
create index page_aircraft_idx on page(aircraft_id);
create trigger page_updated_at before update on page
  for each row execute function set_updated_at();

-- ===========================================================================
-- log_entry — structured record extracted from a page. field_confidence holds
-- per-field 0–1 scores so the review UI can flag exactly which fields fell below
-- threshold. extraction_schema_version + extraction_model track provenance so we
-- can re-run or migrate extractions as the prompt/schema evolves.
-- ===========================================================================
create table log_entry (
  id                        uuid primary key default gen_random_uuid(),
  page_id                   uuid references page(id) on delete set null,
  logbook_id                uuid not null references logbook(id) on delete cascade,
  aircraft_id               uuid not null references aircraft(id) on delete cascade,
  entry_date                date,
  hobbs                     numeric(10,1),
  tach                      numeric(10,1),
  description               text,               -- narrative of work / event
  work_performed            text,
  parts                     text,               -- free-text; structured lifecycle lives in component
  signature_name            text,
  mechanic_cert_number      text,
  ad_refs                   text[] not null default '{}',  -- referenced AD numbers
  sb_refs                   text[] not null default '{}',  -- referenced SB numbers
  confidence                numeric(4,3),       -- overall entry confidence
  field_confidence          jsonb,              -- {"entry_date":0.98,"hobbs":0.42,...}
  extraction_schema_version int not null default 1,
  extraction_model          text,               -- e.g. 'tesseract-5' or 'claude-*'
  owner_confirmed           boolean not null default false,  -- gate before driving reminders
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index log_entry_logbook_idx  on log_entry(logbook_id);
create index log_entry_aircraft_idx on log_entry(aircraft_id);
create index log_entry_page_idx     on log_entry(page_id);
create index log_entry_date_idx     on log_entry(aircraft_id, entry_date);
-- Full-text search over the narrative fields (Phase 1 search feature).
create index log_entry_fts_idx on log_entry
  using gin (to_tsvector('english',
    coalesce(description,'') || ' ' || coalesce(work_performed,'') || ' ' || coalesce(parts,'')));

create trigger log_entry_updated_at before update on log_entry
  for each row execute function set_updated_at();

-- ===========================================================================
-- document — first-class records distinct from log entries: FAA Form 337,
-- 8130-3 tags, STCs, ICAs, W&B sheets. Referenced by AD compliance and W&B
-- (later phases) but not themselves logbook page entries.
-- ===========================================================================
create table document (
  id            uuid primary key default gen_random_uuid(),
  aircraft_id   uuid not null references aircraft(id) on delete cascade,
  type          document_type not null,
  title         text,
  storage_path  text,           -- scanned document in object storage
  document_date date,
  reference     text,           -- form number / STC number / tag number
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index document_aircraft_idx on document(aircraft_id);
create trigger document_updated_at before update on document
  for each row execute function set_updated_at();

-- ===========================================================================
-- component — individual part lifecycle, distinct from log_entry.parts free
-- text. Makes "what's installed now and its remaining life" queryable.
-- ===========================================================================
create table component (
  id                 uuid primary key default gen_random_uuid(),
  aircraft_id        uuid not null references aircraft(id) on delete cascade,
  name               text not null,        -- e.g. "Vacuum pump", "Magneto (L)"
  part_number        text,
  serial_number      text,
  install_entry_id   uuid references log_entry(id) on delete set null,
  install_date       date,
  removal_entry_id   uuid references log_entry(id) on delete set null,
  removal_date       date,
  -- Life limit if any; unit distinguishes hours vs calendar. Null = on-condition.
  life_limit_value   numeric(10,1),
  life_limit_unit    text check (life_limit_unit in ('hours', 'months', 'cycles')),
  is_installed       boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index component_aircraft_idx on component(aircraft_id);
create trigger component_updated_at before update on component
  for each row execute function set_updated_at();

-- ===========================================================================
-- Row-level security
-- ===========================================================================
alter table profile   enable row level security;
alter table aircraft  enable row level security;
alter table logbook   enable row level security;
alter table page      enable row level security;
alter table log_entry enable row level security;
alter table document  enable row level security;
alter table component enable row level security;

-- profile: a user sees and edits only their own profile row.
create policy profile_self_select on profile for select using (id = auth.uid());
create policy profile_self_update on profile for update using (id = auth.uid());

-- aircraft: owner-scoped. (Sharing will extend has_aircraft_access, and a
-- separate select policy can be added for shared read access later.)
create policy aircraft_owner_select on aircraft for select using (owner_id = auth.uid());
create policy aircraft_owner_insert on aircraft for insert with check (owner_id = auth.uid());
create policy aircraft_owner_update on aircraft for update using (owner_id = auth.uid());
create policy aircraft_owner_delete on aircraft for delete using (owner_id = auth.uid());

-- Child tables: access flows through has_aircraft_access(aircraft_id).
-- One macro-shaped block per table keeps the policy identical everywhere.
create policy logbook_access   on logbook   for all using (has_aircraft_access(aircraft_id)) with check (has_aircraft_access(aircraft_id));
create policy page_access      on page      for all using (has_aircraft_access(aircraft_id)) with check (has_aircraft_access(aircraft_id));
create policy log_entry_access on log_entry for all using (has_aircraft_access(aircraft_id)) with check (has_aircraft_access(aircraft_id));
create policy document_access  on document  for all using (has_aircraft_access(aircraft_id)) with check (has_aircraft_access(aircraft_id));
create policy component_access on component for all using (has_aircraft_access(aircraft_id)) with check (has_aircraft_access(aircraft_id));
