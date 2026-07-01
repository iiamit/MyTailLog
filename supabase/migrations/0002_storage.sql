-- ===========================================================================
-- MyTailLog — Storage bucket for logbook page images and scanned documents.
--
-- Object keys are laid out as:  <aircraft_id>/<logbook_id>/<page_id>.<ext>
-- for pages, and <aircraft_id>/documents/<document_id>.<ext> for documents.
-- The first path segment is always the aircraft id, so RLS can authorize a
-- storage object by checking access to that aircraft — the same choke point
-- (has_aircraft_access) used by the table policies.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('logbook-pages', 'logbook-pages', false)
on conflict (id) do nothing;

-- Helper: pull the leading aircraft-id segment out of a storage object name.
create or replace function storage_object_aircraft(object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

-- Private bucket: every operation requires access to the owning aircraft.
create policy logbook_pages_select on storage.objects for select
  using (bucket_id = 'logbook-pages' and has_aircraft_access(storage_object_aircraft(name)));

create policy logbook_pages_insert on storage.objects for insert
  with check (bucket_id = 'logbook-pages' and has_aircraft_access(storage_object_aircraft(name)));

create policy logbook_pages_update on storage.objects for update
  using (bucket_id = 'logbook-pages' and has_aircraft_access(storage_object_aircraft(name)));

create policy logbook_pages_delete on storage.objects for delete
  using (bucket_id = 'logbook-pages' and has_aircraft_access(storage_object_aircraft(name)));
