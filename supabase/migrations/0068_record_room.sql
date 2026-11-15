-- Record room: revocable, expiring read-only links an owner hands to a buyer,
-- IA, mechanic or insurer. The recipient has no account, so /r/* reads through
-- the service role and lib/recordRoom.ts is the only authorization boundary.
-- These tables only need RLS for the owner's own management UI.

create table record_room (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 80),
  token_hash text not null unique,      -- sha256(token) hex: the lookup key
  token_enc text not null,              -- AES-GCM (lib/crypto.ts) so the owner can copy it again
  include_summary boolean not null default true,
  logbook_ids uuid[] not null default '{}',
  include_scans boolean not null default true,
  document_ids uuid[] not null default '{}',
  expires_at timestamptz not null check (expires_at <= created_at + interval '181 days'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index record_room_aircraft_idx on record_room (aircraft_id);

create table record_room_view (
  id bigserial primary key,
  room_id uuid not null references record_room(id) on delete cascade,
  path text not null,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index record_room_view_room_idx on record_room_view (room_id, created_at desc);

alter table record_room enable row level security;
alter table record_room_view enable row level security;

-- Owner only (not editors): a room publishes records outside the share list.
create policy room_owner_all on record_room for all
  using (exists (select 1 from aircraft a where a.id = aircraft_id and a.owner_id = auth.uid()))
  with check (
    created_by = auth.uid()
    and exists (select 1 from aircraft a where a.id = aircraft_id and a.owner_id = auth.uid())
  );

create policy room_view_owner_read on record_room_view for select
  using (exists (
    select 1 from record_room r join aircraft a on a.id = r.aircraft_id
    where r.id = room_id and a.owner_id = auth.uid()
  ));
-- No insert policy on record_room_view: the service role writes it.

revoke all on record_room, record_room_view from anon, authenticated;
grant select, insert, update, delete on record_room to authenticated;
grant select on record_room_view to authenticated;
grant all on record_room, record_room_view to service_role;
grant usage on sequence record_room_view_id_seq to service_role;

-- A new owner shouldn't inherit links the previous owner handed out.
create or replace function revoke_rooms_on_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update record_room set revoked_at = now()
   where aircraft_id = new.id and revoked_at is null;
  return new;
end $$;

create trigger aircraft_owner_change_revokes_rooms
  after update of owner_id on aircraft
  for each row when (old.owner_id is distinct from new.owner_id)
  execute function revoke_rooms_on_transfer();
