-- ===========================================================================
-- Meters — three owner-reported fixes to the two-meter model:
--
--  1. Per-item meter override. Which meter an item counts down on was a global
--     function of `kind` in code (oil → hobbs, everything else → tach). Plenty of
--     owners run oil on TACH, and some aircraft have no hobbs meter at all. NULL
--     keeps the existing policy default, so nothing changes for anyone who
--     doesn't set it.
--
--  2. Meter resets. Hobbs and tach both get REPLACED over an aircraft's life and
--     restart at (usually) zero — documented in the logbook as such. Without
--     modelling it, importing pre-replacement logs breaks the countdowns: the
--     last-done baseline lands on the old scale while "current" is on the new
--     one. One row per replacement; the app stitches history into a continuous
--     total-time scale from it. Applies to any meter, not just tach.
--
--  3. Airframe time as a first-class third meter. Sailplanes have no engine —
--     no tach, usually no hobbs — and motorgliders accrue far more AIRFRAME time
--     than engine time, so airframe can't be aliased onto either. Recorded only,
--     never derived: there is no fixed ratio between airframe and engine time.
-- ===========================================================================

-- --- 1. per-item meter override ------------------------------------------
alter table maintenance_item
  add column if not exists meter text
  check (meter is null or meter in ('hobbs', 'tach', 'airframe'));

comment on column maintenance_item.meter is
  'Meter this item''s hour countdown runs on. NULL = app default (oil → hobbs, else tach).';

-- --- 2. meter resets ------------------------------------------------------
create table if not exists meter_reset (
  id           uuid primary key default gen_random_uuid(),
  aircraft_id  uuid not null references aircraft(id) on delete cascade,
  meter        text not null check (meter in ('hobbs', 'tach', 'airframe')),
  reset_date   date not null,                        -- first date on the NEW meter
  prior_value  numeric(10,1),                        -- last reading on the OLD meter
  new_value    numeric(10,1) not null default 0,     -- what the new meter started at
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists meter_reset_aircraft_idx on meter_reset(aircraft_id, meter, reset_date);

create trigger meter_reset_updated_at before update on meter_reset
  for each row execute function set_updated_at();

alter table meter_reset enable row level security;

-- Read: anyone with access. Write: editors/owners only (matches 0015).
create policy meter_reset_read on meter_reset for select
  using (has_aircraft_access(aircraft_id));
create policy meter_reset_insert on meter_reset for insert
  with check (can_edit_aircraft(aircraft_id));
create policy meter_reset_update on meter_reset for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy meter_reset_delete on meter_reset for delete
  using (can_edit_aircraft(aircraft_id));

-- Offline clients need resets or their hour math diverges from the server's.
create trigger log_change_meter_reset after insert or update or delete on meter_reset
  for each row execute function log_change();

-- --- 3. airframe meter ----------------------------------------------------
alter table log_entry     add column if not exists airframe numeric(10,1);
alter table hours_reading add column if not exists airframe numeric(10,1);
alter table aircraft      add column if not exists enrollment_airframe numeric(10,1);

comment on column log_entry.airframe is
  'Airframe hours. The only meter a glider has; on a motorglider it runs ahead of engine time.';
