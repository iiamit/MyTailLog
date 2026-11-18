-- ===========================================================================
-- 0074 — Gaps as first-class records with an owner-set status (09 §2.6).
-- Owner statuses survive re-detection; `filled` is set only by the system.
-- ===========================================================================

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

create trigger logbook_gap_updated_at before update on logbook_gap
  for each row execute function set_updated_at();

alter table logbook_gap enable row level security;
create policy logbook_gap_read on logbook_gap for select
  using (has_aircraft_access(aircraft_id));
create policy logbook_gap_insert on logbook_gap for insert
  with check (can_edit_aircraft(aircraft_id));
create policy logbook_gap_update on logbook_gap for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy logbook_gap_delete on logbook_gap for delete
  using (can_edit_aircraft(aircraft_id));
