-- Bind storage references to their own aircraft even for direct PostgREST writes.
-- NOT VALID preserves historic metadata for administrator review; new writes are checked.
create or replace function public.aircraft_storage_path(p_path text, p_aircraft uuid)
returns boolean language sql immutable strict set search_path = public as $$
  select split_part(p_path, '/', 1) = p_aircraft::text
     and position('/' in p_path) > 0
     and p_path !~ '(^|/)(\.{1,2})?(/|$)'
     and p_path !~ '[%\\[:cntrl:]]';
$$;
do $$
declare t text; c text;
begin
  for t, c in values ('page','storage_path'), ('page','thumbnail_path'),
    ('document','storage_path'), ('squawk_photo','storage_path'),
    ('squawk_photo','thumbnail_path'), ('hours_reading','photo_path')
  loop
    execute format('alter table public.%I add constraint %I check (%I is null or public.aircraft_storage_path(%I, aircraft_id)) not valid',
      t, t || '_' || c || '_aircraft_scope', c, c);
  end loop;
end $$;

-- Every change-feed INSERT first takes the same transaction lock. The identity
-- default runs after this BEFORE STATEMENT trigger, so an unpublished lower
-- sequence cannot be overtaken by a committed higher sequence.
-- This lock is acquired by all log_change triggers and held through commit.
create or replace function public.lock_change_publication() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(129737019, 1);
  return null;
end $$;
create trigger change_log_publication before insert on public.change_log
for each statement execute function public.lock_change_publication();

-- Take the publication lock before source tuples, not only in the AFTER-row
-- feed trigger. Otherwise a multi-table write can wait on a tuple held by a
-- writer that is itself waiting to publish its change.
do $$
declare source regclass;
begin
  for source in select distinct tgrelid::regclass from pg_trigger where tgfoid='public.log_change()'::regprocedure and not tgisinternal loop
    execute format('create trigger lock_change_before_write before insert or update or delete on %s for each statement execute function public.lock_change_publication()',source);
  end loop;
end $$;
