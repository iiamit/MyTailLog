-- ===========================================================================
-- 0073 — Planned shop visits, the items riding on them, and dismissed
-- suggestions (09 §2.5). Suggested visits are computed, never stored.
-- Status transitions are enforced in lib/writes/visits.ts, not here.
-- ===========================================================================

create type visit_status as enum ('planned','in_shop','awaiting_records','done','cancelled');

create table planned_visit (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  status visit_status not null default 'planned',
  week_of date not null,                 -- Monday of the planned week
  visit_date date,                       -- exact day if the owner set one
  provider_id uuid references service_provider(id) on delete set null,
  airport text,
  notes text check (length(notes) <= 2000),
  from_suggestion_key text,              -- suggestion key it was booked from (3.5), null if made by hand
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visit_date is null or (visit_date >= week_of and visit_date < week_of + 7)),
  check (extract(isodow from week_of) = 1)
);
create index planned_visit_aircraft_idx on planned_visit (aircraft_id, week_of);

create table planned_visit_item (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  visit_id uuid not null references planned_visit(id) on delete cascade,
  item_key text not null check (item_key ~ '^(mx|ad|squawk):[0-9a-f-]{36}$'),
  done_completion_id uuid references item_completion(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visit_id, item_key)
);
create index planned_visit_item_aircraft_idx on planned_visit_item (aircraft_id);
-- An open item is in at most one visit (the write function names the other visit).
create unique index planned_visit_item_open_uniq on planned_visit_item (aircraft_id, item_key)
  where done_completion_id is null;

create table visit_suggestion_dismissal (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  suggestion_key text not null,
  dismissed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aircraft_id, suggestion_key)
);

alter table item_completion add constraint item_completion_visit_fk
  foreign key (visit_id) references planned_visit(id) on delete set null;

-- updated_at trigger + the four standard policies (0015 pattern).
do $$
declare t text;
begin
  foreach t in array array['planned_visit','planned_visit_item','visit_suggestion_dismissal'] loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
      t || '_updated_at', t);
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (has_aircraft_access(aircraft_id))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (can_edit_aircraft(aircraft_id))', t || '_insert', t);
    execute format('create policy %I on %I for update using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id))', t || '_update', t);
    execute format('create policy %I on %I for delete using (can_edit_aircraft(aircraft_id))', t || '_delete', t);
  end loop;
end $$;
