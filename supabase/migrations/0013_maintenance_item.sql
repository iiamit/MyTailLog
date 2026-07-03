-- ===========================================================================
-- MyTailLog — Recurring maintenance items (Phase 2, step 8: forecasting)
--
-- Standard Part 91 recurring inspections (annual 91.409, transponder 91.413,
-- pitot-static/altimeter 91.411, ELT 91.207, VOR 91.171, 100-hour) plus advisory
-- items (engine TBO, prop overhaul, oil change). Each tracks its interval and
-- last-done point; next-due is computed (stored) so the forecasting dashboard
-- can sort a unified due list by urgency alongside recurring ADs.
--
-- `regulatory` distinguishes mandatory Part 91 items from advisory ones (TBO /
-- overhaul are NOT regulatory for Part 91 — the UI must not conflate them), per
-- the plan's caution about advisory vs. legal requirements.
-- ===========================================================================

create table maintenance_item (
  id               uuid primary key default gen_random_uuid(),
  aircraft_id      uuid not null references aircraft(id) on delete cascade,
  kind             text not null,   -- annual | transponder | pitot_static | elt | vor | hundred_hour | oil_change | engine_tbo | prop_overhaul | other
  label            text not null,
  regulatory       boolean not null default true,
  interval_months  int,
  interval_hours   numeric(10,1),
  last_done_date   date,
  last_done_hours  numeric(10,1),
  next_due_date    date,
  next_due_hours   numeric(10,1),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index maintenance_item_aircraft_idx on maintenance_item(aircraft_id);
create index maintenance_item_due_idx on maintenance_item(aircraft_id, next_due_date);

create trigger maintenance_item_updated_at before update on maintenance_item
  for each row execute function set_updated_at();

alter table maintenance_item enable row level security;
create policy maintenance_item_access on maintenance_item for all
  using (has_aircraft_access(aircraft_id))
  with check (has_aircraft_access(aircraft_id));
