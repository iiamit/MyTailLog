-- ===========================================================================
-- Squawks — pilot-reported discrepancies, tracked open → resolved.
--
-- Anyone with access to the aircraft (including a read-only shared pilot) can
-- REPORT a squawk; only an editor/owner can RESOLVE or delete one. A squawk can
-- later record the maintenance entry that cleared it (resolved_log_entry_id).
-- ===========================================================================

create type squawk_severity as enum ('low', 'medium', 'high');
create type squawk_status as enum ('open', 'resolved');

create table if not exists squawk (
  id             uuid primary key default gen_random_uuid(),
  aircraft_id    uuid not null references aircraft(id) on delete cascade,
  description    text not null,
  severity       squawk_severity not null default 'low',
  status         squawk_status not null default 'open',
  reported_by    uuid not null references auth.users on delete set null,
  reporter_name  text,                        -- display name captured at report time
  reported_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references auth.users on delete set null,
  resolved_log_entry_id uuid references log_entry(id) on delete set null,
  resolution_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists squawk_aircraft_idx on squawk(aircraft_id, status, reported_at desc);

alter table squawk enable row level security;

-- Read: anyone with access. Report (insert): anyone with access, but only AS
-- themselves. Resolve/edit/delete: editors only.
create policy squawk_read on squawk for select
  using (has_aircraft_access(aircraft_id));
create policy squawk_report on squawk for insert
  with check (has_aircraft_access(aircraft_id) and reported_by = auth.uid());
create policy squawk_manage_update on squawk for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy squawk_manage_delete on squawk for delete
  using (can_edit_aircraft(aircraft_id));
