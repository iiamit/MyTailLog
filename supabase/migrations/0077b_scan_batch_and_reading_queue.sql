-- ===========================================================================
-- 0077b — Scan batches, the server-side reading queue, duplicate detection at
-- upload, and the map's landing date for pages (09 §2.9).
--
-- Deviation from 09: scan_batch.created_by is nullable (09 wrote "not null …
-- on delete set null", which blocks deleting the uploader's account).
-- ===========================================================================

create table scan_batch (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  logbook_id uuid not null references logbook(id) on delete cascade,
  source text not null check (source in ('phone_camera','web_upload','web_camera','pdf','csv')),
  expected_pages int not null check (expected_pages between 1 and 2000),
  is_handwritten boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,             -- every page terminal (extracted or failed)
  notified_at timestamptz,
  updated_at timestamptz not null default now()
);
create index scan_batch_aircraft_idx on scan_batch (aircraft_id, created_at desc);

create trigger scan_batch_updated_at before update on scan_batch
  for each row execute function set_updated_at();

alter table scan_batch enable row level security;
create policy scan_batch_read on scan_batch for select
  using (has_aircraft_access(aircraft_id));
create policy scan_batch_insert on scan_batch for insert
  with check (can_edit_aircraft(aircraft_id));
create policy scan_batch_update on scan_batch for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy scan_batch_delete on scan_batch for delete
  using (can_edit_aircraft(aircraft_id));

alter table page
  add column batch_id uuid references scan_batch(id) on delete set null,
  add column image_phash text,                    -- 16 hex chars, 64-bit dHash of the normalised image
  add column duplicate_of_page_id uuid references page(id) on delete set null,
  add column needs_look boolean,                  -- computed at extraction (3.9.2); null until extracted
  add column landing_date date;                   -- earliest confirmed-or-read entry date on the page, for the map
create index page_batch_idx on page (batch_id);
create index page_phash_idx on page (aircraft_id, image_phash) where image_phash is not null;
create index page_queue_idx on page (extraction_status, created_at) where extraction_status in ('queued','waiting_allowance');
