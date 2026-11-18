-- ===========================================================================
-- 0081 — Written-versus-calculated time checks the owner has answered
-- (09 §2.13, §3.10). A check reappears when either value changes (the stored
-- pair no longer matches).
-- ===========================================================================

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

create trigger time_check_dismissal_updated_at before update on time_check_dismissal
  for each row execute function set_updated_at();

alter table time_check_dismissal enable row level security;
create policy time_check_dismissal_read on time_check_dismissal for select
  using (has_aircraft_access(aircraft_id));
create policy time_check_dismissal_insert on time_check_dismissal for insert
  with check (can_edit_aircraft(aircraft_id));
create policy time_check_dismissal_update on time_check_dismissal for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy time_check_dismissal_delete on time_check_dismissal for delete
  using (can_edit_aircraft(aircraft_id));
