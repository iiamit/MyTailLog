-- ===========================================================================
-- Oil top-off log → consumption trends.
--
-- Between oil changes, owners "top off" a quart or two. Logging each top-off
-- with the hobbs/tach at the time lets us show a burn-rate trend (hours per
-- quart) — a leading indicator of engine health. This is separate from
-- oil_analysis_sample (lab wear-metal reports): this is the owner's own quick
-- "added 1.5 qt" note.
-- ===========================================================================

create table if not exists oil_addition (
  id           uuid primary key default gen_random_uuid(),
  aircraft_id  uuid not null references aircraft(id) on delete cascade,
  component_id uuid references component(id) on delete set null, -- the engine, if tracked (null = the aircraft's engine)
  added_date   date not null,
  quarts       numeric(5,2) not null check (quarts > 0),
  hobbs        numeric(10,1),
  tach         numeric(10,1),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists oil_addition_aircraft_idx on oil_addition(aircraft_id, added_date);

alter table oil_addition enable row level security;
create policy oil_addition_read on oil_addition for select
  using (has_aircraft_access(aircraft_id));
create policy oil_addition_write on oil_addition for all
  using (can_edit_aircraft(aircraft_id))
  with check (can_edit_aircraft(aircraft_id));
