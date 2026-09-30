-- A later scan of a printed sticker is evidence for the existing signed entry.
-- Keep the signature row immutable; a page may contain several stickers.
create table signed_entry_scan (
  page_id uuid not null references page(id) on delete cascade,
  entry_id uuid not null references log_entry(id) on delete cascade,
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (page_id, entry_id)
);
create index signed_entry_scan_entry_idx on signed_entry_scan(entry_id);

create function check_signed_entry_scan() returns trigger language plpgsql
set search_path = public as $$
begin
  if not exists (
    select 1 from page p join log_entry e on e.id = new.entry_id
    where p.id = new.page_id and p.aircraft_id = new.aircraft_id
      and e.aircraft_id = p.aircraft_id and e.logbook_id = p.logbook_id
      and e.authored_signed_at is not null
  ) then raise exception 'The scan and signed entry must belong to the same aircraft and logbook'; end if;
  return new;
end;
$$;
create trigger check_signed_entry_scan before insert on signed_entry_scan
for each row execute function check_signed_entry_scan();

alter table signed_entry_scan enable row level security;
create policy signed_entry_scan_read on signed_entry_scan for select
using (has_aircraft_access(aircraft_id));
create policy signed_entry_scan_insert on signed_entry_scan for insert
with check (can_edit_aircraft(aircraft_id));
grant select, insert on signed_entry_scan to authenticated;
