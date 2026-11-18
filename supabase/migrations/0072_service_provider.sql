-- ===========================================================================
-- 0072 — service_provider: the shops and mechanics an aircraft uses (09 §2.4).
-- Created by the owner or proposed from confirmed entries, never auto-created.
-- `email` only prefills the owner's own mail client; MyTailLog never mails it.
-- ===========================================================================

create table service_provider (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),        -- 'AeroCheck Instruments', 'M. Torres'
  kind text not null check (kind in ('mechanic','avionics_shop','prop_shop','engine_shop')),
  cert_number text,                                                  -- 'A&P 3667012', 'CRS AC2Y441L'
  airport text,                                                      -- ICAO/FAA ident, 'KBED'
  email text,
  phone text,
  is_default boolean not null default false,                          -- default for its kind on this aircraft
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_provider_aircraft_idx on service_provider (aircraft_id);
create unique index service_provider_default_uniq on service_provider (aircraft_id, kind) where is_default;

create trigger service_provider_updated_at before update on service_provider
  for each row execute function set_updated_at();

alter table service_provider enable row level security;
create policy service_provider_read on service_provider for select
  using (has_aircraft_access(aircraft_id));
create policy service_provider_insert on service_provider for insert
  with check (can_edit_aircraft(aircraft_id));
create policy service_provider_update on service_provider for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy service_provider_delete on service_provider for delete
  using (can_edit_aircraft(aircraft_id));

alter table maintenance_item add constraint maintenance_item_provider_fk
  foreign key (provider_id) references service_provider(id) on delete set null;
alter table ad_compliance add column provider_id uuid references service_provider(id) on delete set null;
