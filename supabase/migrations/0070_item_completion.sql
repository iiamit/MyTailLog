-- ===========================================================================
-- 0070 — item_completion: every completion of a tracked item or AD, so an
-- item's history can be drawn as stops (09 §2.2). The parent's last_done_* /
-- complied_* columns stay and are maintained by the write functions, so old
-- clients keep working.
--
-- Deviation from 09: the entry uniqueness index is partial (log_entry_id is not
-- null). With NULLS NOT DISTINCT over every row, an item could only ever have
-- ONE completion without a page, so the second "Mark done" would fail.
-- ===========================================================================

create table item_completion (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  maintenance_item_id uuid references maintenance_item(id) on delete cascade,
  ad_compliance_id uuid references ad_compliance(id) on delete cascade,
  log_entry_id uuid references log_entry(id) on delete set null,
  done_date date not null,
  done_hours numeric(10,1),
  meter text check (meter in ('tach','hobbs','airframe')),
  source text not null check (source in ('mark_done','extraction','owner_link','import','vor_check','visit')),
  visit_id uuid,                              -- fk added in 0073
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((maintenance_item_id is null) <> (ad_compliance_id is null))
);
create index item_completion_item_idx on item_completion (maintenance_item_id, done_date desc);
create index item_completion_ad_idx on item_completion (ad_compliance_id, done_date desc);
create index item_completion_aircraft_idx on item_completion (aircraft_id);
create unique index item_completion_entry_uniq on item_completion (log_entry_id, maintenance_item_id, ad_compliance_id)
  nulls not distinct where log_entry_id is not null;

create trigger item_completion_updated_at before update on item_completion
  for each row execute function set_updated_at();

alter table item_completion enable row level security;
create policy item_completion_read on item_completion for select
  using (has_aircraft_access(aircraft_id));
create policy item_completion_insert on item_completion for insert
  with check (can_edit_aircraft(aircraft_id));
create policy item_completion_update on item_completion for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy item_completion_delete on item_completion for delete
  using (can_edit_aircraft(aircraft_id));

-- Back-fill: exactly one row per item with a last-done date and one per AD
-- with a complied date.
insert into item_completion (aircraft_id, maintenance_item_id, done_date, done_hours, meter, source)
select aircraft_id, id, last_done_date, last_done_hours, meter, 'import'
  from maintenance_item where last_done_date is not null;

insert into item_completion (aircraft_id, ad_compliance_id, log_entry_id, done_date, done_hours, source)
select aircraft_id, id, reference_entry_id, complied_date, complied_hours, 'import'
  from ad_compliance where complied_date is not null;
