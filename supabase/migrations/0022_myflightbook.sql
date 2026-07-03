-- ===========================================================================
-- MyTailLog — MyFlightBook integration.
--
-- Two tables:
--   * mfb_connection — one row per user holding THEIR OWN MyFlightBook OAuth app
--     credentials (client id + secret) and the OAuth tokens we mint on their
--     behalf. User-scoped (not aircraft-scoped): a user reads/writes only their
--     own row, so policies key off auth.uid() directly.
--   * hours_reading — the latest RECORDED hobbs/tach we pulled from a flight,
--     matched to a MyTailLog aircraft by tail number. Aircraft-scoped, so it
--     follows the has_aircraft_access / can_edit_aircraft pattern established in
--     0015_multi_user.sql. A shared aircraft may collect readings synced by any
--     connected co-owner; the newest reading wins in the forecast.
--
-- client_secret + tokens are SENSITIVE: RLS confines every row to its owner and
-- these values are only ever read server-side (route handlers / server actions).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- mfb_connection — per-user MyFlightBook credentials + tokens.
-- ---------------------------------------------------------------------------
create table if not exists mfb_connection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  client_id text,
  client_secret text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  mfb_username text,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mfb_connection enable row level security;

-- User-scoped: read/write only your own row.
create policy mfb_connection_select on mfb_connection for select
  using (user_id = auth.uid());
create policy mfb_connection_insert on mfb_connection for insert
  with check (user_id = auth.uid());
create policy mfb_connection_update on mfb_connection for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mfb_connection_delete on mfb_connection for delete
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- hours_reading — latest recorded hobbs/tach per aircraft, from MyFlightBook.
-- ---------------------------------------------------------------------------
create table if not exists hours_reading (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft on delete cascade,
  reading_date date,
  hobbs numeric(10,1),
  tach numeric(10,1),
  source text not null default 'myflightbook',
  synced_by uuid references auth.users on delete set null,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hours_reading_aircraft_idx on hours_reading(aircraft_id);

-- Idempotent sync: one row per (aircraft, source, external MFB flight id).
create unique index if not exists hours_reading_external_uidx
  on hours_reading(aircraft_id, source, external_ref);

alter table hours_reading enable row level security;

-- Aircraft-scoped: read = any access, write = editor/owner (matches 0015).
create policy hours_reading_read on hours_reading for select
  using (has_aircraft_access(aircraft_id));
create policy hours_reading_insert on hours_reading for insert
  with check (can_edit_aircraft(aircraft_id));
create policy hours_reading_update on hours_reading for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy hours_reading_delete on hours_reading for delete
  using (can_edit_aircraft(aircraft_id));
