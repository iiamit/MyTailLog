-- ===========================================================================
-- 0076 — Squawk photos and account-free mechanic links (09 §2.8).
--
-- squawk_photo is synced metadata; images live in the private logbook-pages
-- bucket under <aircraft_id>/squawks/<squawk_id>/<photo_id>.jpg, so the
-- existing storage_object_aircraft() policies cover them.
--
-- mechanic_link mirrors record_room (0068): the recipient has no account, the
-- /m/* route reads through the service role, and these policies serve only the
-- owner's and editors' management UI. Online only, never synced.
--
-- Deviation from 09: squawk_photo.created_by is nullable. 09 wrote "not null …
-- on delete set null", which makes deleting the photographer's account fail.
-- The insert policy still pins it to auth.uid().
-- ===========================================================================

create table squawk_photo (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  squawk_id uuid not null references squawk(id) on delete cascade,
  storage_path text not null,
  thumbnail_path text,
  width int, height int,
  taken_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index squawk_photo_squawk_idx on squawk_photo (squawk_id, created_at);
create index squawk_photo_aircraft_idx on squawk_photo (aircraft_id);

create trigger squawk_photo_updated_at before update on squawk_photo
  for each row execute function set_updated_at();

alter table squawk_photo enable row level security;
create policy squawk_photo_read on squawk_photo for select using (has_aircraft_access(aircraft_id));
-- Anyone with access may add a photo to a squawk they reported; editors may add to any.
create policy squawk_photo_add on squawk_photo for insert with check (
  has_aircraft_access(aircraft_id) and created_by = auth.uid() and (
    can_edit_aircraft(aircraft_id) or exists (select 1 from squawk s where s.id = squawk_id and s.reported_by = auth.uid())));
create policy squawk_photo_delete on squawk_photo for delete using (
  can_edit_aircraft(aircraft_id) or created_by = auth.uid());

create table mechanic_link (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  kind text not null check (kind in ('squawk','visit')),
  squawk_ids uuid[] not null default '{}',
  visit_id uuid references planned_visit(id) on delete cascade,
  recipient_label text not null check (length(recipient_label) between 1 and 80),   -- 'M. Torres'
  provider_id uuid references service_provider(id) on delete set null,
  token_hash text not null unique,      -- sha256(token) hex: the lookup key
  token_enc text not null,              -- AES-GCM (lib/crypto.ts) so the owner can copy it again
  include_photos boolean not null default true,
  include_reporter boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '91 days'),
  check ((kind = 'squawk' and cardinality(squawk_ids) between 1 and 20) or (kind = 'visit' and visit_id is not null))
);
create index mechanic_link_aircraft_idx on mechanic_link (aircraft_id);

create table mechanic_link_view (
  id bigserial primary key,
  link_id uuid not null references mechanic_link(id) on delete cascade,
  ip_hash text, user_agent text,
  created_at timestamptz not null default now()
);
create index mechanic_link_view_idx on mechanic_link_view (link_id, created_at desc);

alter table mechanic_link enable row level security;
alter table mechanic_link_view enable row level security;
create policy mlink_manage on mechanic_link for all
  using (can_edit_aircraft(aircraft_id))
  with check (can_edit_aircraft(aircraft_id) and created_by = auth.uid());
create policy mlink_view_read on mechanic_link_view for select using (
  exists (select 1 from mechanic_link l where l.id = link_id and can_edit_aircraft(l.aircraft_id)));
-- No insert policy on mechanic_link_view: the service role writes it.

revoke all on mechanic_link, mechanic_link_view from anon;
grant all on mechanic_link, mechanic_link_view to service_role;
grant usage on sequence mechanic_link_view_id_seq to service_role;

-- A new owner shouldn't inherit links the previous owner handed out (0068),
-- now including mechanic links.
create or replace function revoke_rooms_on_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update record_room set revoked_at = now()
   where aircraft_id = new.id and revoked_at is null;
  update mechanic_link set revoked_at = now()
   where aircraft_id = new.id and revoked_at is null;
  return new;
end $$;
