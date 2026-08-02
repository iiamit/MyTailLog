-- ===========================================================================
-- ADS-B passive hours — the fallback observer for aircraft whose owner doesn't
-- log every flight.
--
-- One job only: notice that the aircraft flew, and that the recorded hours
-- don't reflect it. Not flight logging, not flight analytics — no track points,
-- no runway usage, no replay. We store one row per observed flight (start, end,
-- airborne minutes, the two estimated airports) and nothing else.
--
-- Opt-in per aircraft (`adsb_enabled`, default FALSE): this is position data
-- about someone's aircraft and nobody gets enrolled silently. `icao24` caches
-- the resolved Mode S hex so the sweep never re-resolves it.
-- ===========================================================================

alter table aircraft add column if not exists icao24 text;
alter table aircraft add column if not exists adsb_enabled boolean not null default false;

comment on column aircraft.icao24 is
  'ICAO 24-bit Mode S address, lowercase hex. Resolved from the FAA registry or adsbdb, or entered by hand — never computed from the N-number.';
comment on column aircraft.adsb_enabled is
  'Opt-in: fetch this aircraft''s flight history from OpenSky in the daily sweep.';

create table if not exists adsb_flight (
  id                    uuid primary key default gen_random_uuid(),
  aircraft_id           uuid not null references aircraft(id) on delete cascade,
  icao24                text not null,
  first_seen            timestamptz not null,
  last_seen             timestamptz not null,
  est_departure_airport text,
  est_arrival_airport   text,
  callsign              text,
  airborne_minutes      integer not null,
  dismissed_at          timestamptz,
  created_at            timestamptz not null default now()
);

-- Re-running the sweep over an overlapping window must not duplicate flights.
create unique index if not exists adsb_flight_uidx on adsb_flight(aircraft_id, first_seen);
create index if not exists adsb_flight_aircraft_idx on adsb_flight(aircraft_id, first_seen desc);

alter table adsb_flight enable row level security;

-- Read: anyone with access. Write: editors/owners only (matches 0015). The cron
-- writes with the service role, which bypasses RLS.
create policy adsb_flight_read on adsb_flight for select
  using (has_aircraft_access(aircraft_id));
create policy adsb_flight_insert on adsb_flight for insert
  with check (can_edit_aircraft(aircraft_id));
create policy adsb_flight_update on adsb_flight for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy adsb_flight_delete on adsb_flight for delete
  using (can_edit_aircraft(aircraft_id));

-- Offline clients need these or the suggestion banner can't render on device.
create trigger log_change_adsb_flight after insert or update or delete on adsb_flight
  for each row execute function log_change();
