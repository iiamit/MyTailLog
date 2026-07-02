-- ===========================================================================
-- MyTailLog — AD/SB compliance tracking (Phase 2, step 7)
--
-- Per-aircraft airworthiness compliance records for Airworthiness Directives
-- and (optional, advisory) Service Bulletins. This is PRIVATE per-aircraft data
-- (the method used, dates/hours complied, next due) — distinct from a future
-- shared FAA AD master reference. Ingesting the FAA AD catalog is deliberately
-- deferred; for now records are entered by the owner or seeded from AD/SB
-- numbers already extracted into log entries (log_entry.ad_refs/sb_refs). A
-- later FAA-ingestion step can add a shared master table and point these at it.
--
-- Status uses the CW/PCW/DNA vocabulary the competitive review recommended:
--   complied = CW (complied with), previously_complied = PCW,
--   not_applicable = DNA (does not apply), plus open (applicable, not yet
--   complied) and superseded.
-- ===========================================================================

create type ad_kind   as enum ('ad', 'sb');
create type ad_status as enum ('open', 'complied', 'previously_complied', 'not_applicable', 'superseded');

create table ad_compliance (
  id                 uuid primary key default gen_random_uuid(),
  aircraft_id        uuid not null references aircraft(id) on delete cascade,
  kind               ad_kind not null default 'ad',
  reference          text not null,          -- AD/SB number, e.g. '2015-19-07'
  title              text,
  applicability      text,                   -- free-text applicability note
  recurring          boolean not null default false,
  interval_hours     numeric(10,1),          -- recurring interval in hours
  interval_months    int,                    -- recurring interval in calendar months
  status             ad_status not null default 'open',
  method             text,                   -- compliance method used
  complied_date      date,
  complied_hours     numeric(10,1),          -- aircraft hours at compliance
  -- Next-due is derived from interval + last compliance and stored so the
  -- forecasting dashboard (step 8) can sort by it directly.
  next_due_date      date,
  next_due_hours     numeric(10,1),
  -- Optional link to the log entry that documents compliance.
  reference_entry_id uuid references log_entry(id) on delete set null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index ad_compliance_aircraft_idx on ad_compliance(aircraft_id);
create index ad_compliance_due_idx on ad_compliance(aircraft_id, next_due_date);

create trigger ad_compliance_updated_at before update on ad_compliance
  for each row execute function set_updated_at();

alter table ad_compliance enable row level security;
create policy ad_compliance_access on ad_compliance for all
  using (has_aircraft_access(aircraft_id))
  with check (has_aircraft_access(aircraft_id));
