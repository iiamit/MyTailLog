-- ===========================================================================
-- MyTailLog — Pending equipment proposals (Phase 2)
--
-- Equipment is derived from the logs, but never auto-written — the owner
-- confirms. When a page is extracted (or the owner runs a full log scan), the
-- LLM proposes installed/removed components; those land here as PENDING
-- suggestions until confirmed (which creates/updates a component) or dismissed.
-- This lets new-page extraction keep the equipment list current without
-- silently changing it.
-- ===========================================================================

create table equipment_proposal (
  id             uuid primary key default gen_random_uuid(),
  aircraft_id    uuid not null references aircraft(id) on delete cascade,
  page_id        uuid references page(id) on delete set null, -- source page, if from one extraction
  name           text not null,
  make           text,
  category       text,
  part_number    text,
  serial_number  text,
  install_date   date,
  removal_date   date,
  is_installed   boolean not null default true,
  action         text,   -- 'installed' | 'removed' | 'present'
  confidence     numeric(4,3),
  source         text,   -- short supporting quote from the logs
  created_at     timestamptz not null default now()
);

create index equipment_proposal_aircraft_idx on equipment_proposal(aircraft_id);

alter table equipment_proposal enable row level security;
create policy equipment_proposal_access on equipment_proposal for all
  using (has_aircraft_access(aircraft_id))
  with check (has_aircraft_access(aircraft_id));
