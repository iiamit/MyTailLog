-- ===========================================================================
-- MyTailLog — Scanned "Other" documents: classification + extracted payload,
-- plus the links that let a scanned A&P document update W&B / corroborate ADs.
--
-- A page captured into the 'other' logbook (see 0017) is classified as a
-- Weight & Balance sheet, an AD compliance report, or neither, and its
-- extracted payload is stored here. The page image stays the source of truth;
-- this is the machine reading of it, plus a record of what it updated.
--
-- Independent DDL (no new enum value used) — safe to run any time after 0018.
-- ===========================================================================

create table scanned_document (
  id            uuid primary key default gen_random_uuid(),
  aircraft_id   uuid not null references aircraft(id) on delete cascade,
  page_id       uuid not null references page(id) on delete cascade,
  doc_type      text not null check (doc_type in ('weight_balance', 'ad_report', 'other')),
  document_date date,                                   -- date on the document, if read
  extracted     jsonb not null default '{}'::jsonb,     -- raw classified payload
  summary       text,                                   -- e.g. "Applied to W&B · 3 ADs correlated"
  applied       boolean not null default false,
  confidence    numeric(4,3),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One classification per page; re-extraction upserts on this.
create unique index scanned_document_page_idx on scanned_document(page_id);
create index scanned_document_aircraft_idx on scanned_document(aircraft_id);

create trigger scanned_document_updated_at before update on scanned_document
  for each row execute function set_updated_at();

alter table scanned_document enable row level security;
create policy scanned_document_read on scanned_document for select
  using (has_aircraft_access(aircraft_id));
create policy scanned_document_insert on scanned_document for insert
  with check (can_edit_aircraft(aircraft_id));
create policy scanned_document_update on scanned_document for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy scanned_document_delete on scanned_document for delete
  using (can_edit_aircraft(aircraft_id));

-- W&B revision derived from a scanned doc links back to its source page image.
alter table weight_balance
  add column if not exists source_page_id uuid references page(id) on delete set null;

-- AD corroboration marker: set when a tracked AD is confirmed by a scanned A&P
-- compliance report, so the UI can badge it ("✓ A&P report") and note the date.
alter table ad_compliance
  add column if not exists verified_report_page_id uuid references page(id) on delete set null;
alter table ad_compliance
  add column if not exists verified_at timestamptz;
