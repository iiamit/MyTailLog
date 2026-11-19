-- ===========================================================================
-- 0083 — The server-computed status snapshot that the web, phones and widgets
-- all read (09 §2.15, StatusSnapshot shape in §4.3). Recomputed by the server
-- after writes that touch status inputs, by the daily job (midnight in the
-- owner's profile.time_zone, UTC when null), and on demand.
-- Writes: service role only (no insert/update/delete policy).
-- ===========================================================================

create table aircraft_status_snapshot (
  aircraft_id uuid primary key references aircraft(id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,   -- change_log needs an id column
  computed_at timestamptz not null,
  inputs_seq bigint not null,          -- max change_log.seq for this aircraft that the snapshot reflects
  algo_version int not null,           -- bump when any 09 §3 rule changes
  snapshot jsonb not null,             -- StatusSnapshot, 09 §4.3
  updated_at timestamptz not null default now()
);

create trigger aircraft_status_snapshot_updated_at before update on aircraft_status_snapshot
  for each row execute function set_updated_at();

alter table aircraft_status_snapshot enable row level security;
create policy snapshot_read on aircraft_status_snapshot for select using (has_aircraft_access(aircraft_id));
