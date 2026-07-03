-- ===========================================================================
-- MyTailLog — Multi-user: sharing, roles, ownership transfer, profile prefs.
--
-- Extends the single-owner model without rewriting app queries: the
-- has_aircraft_access() choke point now also honors aircraft_share rows, and a
-- new can_edit_aircraft() distinguishes read (viewer) from contribute (editor).
-- Child-table policies split into read (any access) + write (edit access).
--
-- Sharing is by EMAIL so you can invite someone before they have an account;
-- access is matched on the signed-in user's JWT email (accepting an invite is
-- just signing in with that address). Ownership transfer targets an existing
-- user by email via a security-definer function (only the owner can call it).
-- ===========================================================================

-- Profile preferences (extensible bag; today: notification opt-in) -----------
alter table profile add column if not exists preferences jsonb not null default '{}';

-- ---------------------------------------------------------------------------
-- aircraft_share — a read/contribute grant on one aircraft to one email.
-- ---------------------------------------------------------------------------
create table if not exists aircraft_share (
  id            uuid primary key default gen_random_uuid(),
  aircraft_id   uuid not null references aircraft(id) on delete cascade,
  invited_email text not null,
  role          text not null check (role in ('viewer', 'editor')),
  invited_by    uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (aircraft_id, invited_email)
);

create index if not exists aircraft_share_aircraft_idx on aircraft_share(aircraft_id);
create index if not exists aircraft_share_email_idx on aircraft_share(lower(invited_email));

-- ---------------------------------------------------------------------------
-- Access helpers — the single choke points. Both are SECURITY DEFINER so their
-- internal reads bypass RLS (no policy recursion when aircraft's own policy
-- calls has_aircraft_access).
-- ---------------------------------------------------------------------------
create or replace function has_aircraft_access(target_aircraft uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from aircraft a
    where a.id = target_aircraft and a.owner_id = auth.uid()
  ) or exists (
    select 1 from aircraft_share s
    where s.aircraft_id = target_aircraft
      and lower(s.invited_email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- Owner or editor-share → may mutate child records. Viewers get false.
create or replace function can_edit_aircraft(target_aircraft uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from aircraft a
    where a.id = target_aircraft and a.owner_id = auth.uid()
  ) or exists (
    select 1 from aircraft_share s
    where s.aircraft_id = target_aircraft
      and s.role = 'editor'
      and lower(s.invited_email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- ---------------------------------------------------------------------------
-- aircraft_share RLS: the aircraft owner manages grants; a grantee may read
-- their own grant (to know they have access and its role).
-- ---------------------------------------------------------------------------
alter table aircraft_share enable row level security;

create policy share_owner_all on aircraft_share for all
  using (exists (select 1 from aircraft a where a.id = aircraft_id and a.owner_id = auth.uid()))
  with check (exists (select 1 from aircraft a where a.id = aircraft_id and a.owner_id = auth.uid()));

create policy share_self_select on aircraft_share for select
  using (lower(invited_email) = lower(auth.jwt() ->> 'email'));

-- ---------------------------------------------------------------------------
-- aircraft: shared users can SELECT; only the owner mutates the aircraft row
-- (identity edits, delete, and — via functions below — share/transfer).
-- ---------------------------------------------------------------------------
drop policy if exists aircraft_owner_select on aircraft;
create policy aircraft_access_select on aircraft for select using (has_aircraft_access(id));

-- ---------------------------------------------------------------------------
-- Child tables: read = has_aircraft_access, write = can_edit_aircraft.
-- Replaces the single `for all` policy on each aircraft-scoped table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'logbook','page','log_entry','document','component',
    'ad_compliance','equipment_proposal','maintenance_item'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_access', t);
    execute format(
      'create policy %I on %I for select using (has_aircraft_access(aircraft_id))',
      t || '_read', t);
    execute format(
      'create policy %I on %I for insert with check (can_edit_aircraft(aircraft_id))',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id))',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete using (can_edit_aircraft(aircraft_id))',
      t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: viewers read page images; only editors/owner write them.
-- ---------------------------------------------------------------------------
drop policy if exists logbook_pages_insert on storage.objects;
drop policy if exists logbook_pages_update on storage.objects;
drop policy if exists logbook_pages_delete on storage.objects;

create policy logbook_pages_insert on storage.objects for insert
  with check (bucket_id = 'logbook-pages' and can_edit_aircraft(storage_object_aircraft(name)));
create policy logbook_pages_update on storage.objects for update
  using (bucket_id = 'logbook-pages' and can_edit_aircraft(storage_object_aircraft(name)));
create policy logbook_pages_delete on storage.objects for delete
  using (bucket_id = 'logbook-pages' and can_edit_aircraft(storage_object_aircraft(name)));

-- ---------------------------------------------------------------------------
-- Ownership transfer — owner hands the aircraft to another existing user by
-- email. SECURITY DEFINER so it can resolve the email against auth.users.
-- Any prior share for the new owner's email is cleared (they're the owner now).
-- ---------------------------------------------------------------------------
create or replace function transfer_aircraft(target_aircraft uuid, new_owner_email text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  new_owner uuid;
begin
  if not exists (
    select 1 from aircraft a where a.id = target_aircraft and a.owner_id = auth.uid()
  ) then
    raise exception 'Only the owner can transfer this aircraft';
  end if;

  select id into new_owner from auth.users
   where lower(email) = lower(new_owner_email) limit 1;
  if new_owner is null then
    raise exception 'No MyTailLog account for %', new_owner_email;
  end if;
  if new_owner = auth.uid() then
    raise exception 'You already own this aircraft';
  end if;

  update aircraft set owner_id = new_owner where id = target_aircraft;
  delete from aircraft_share
   where aircraft_id = target_aircraft
     and lower(invited_email) = lower(new_owner_email);
end;
$$;
