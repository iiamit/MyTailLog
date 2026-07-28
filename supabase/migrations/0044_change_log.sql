-- ===========================================================================
-- change_log — the change feed for the self-hosted offline sync engine (iOS app).
--
-- Every insert/update/delete on a synced per-aircraft table appends one row here
-- with a monotonic `seq` — the client's sync cursor. `seq` gives a TOTAL order
-- (no clock skew, no same-timestamp ambiguity), and DELETE rows persist after the
-- underlying row is gone, so the client can propagate deletions — the app is
-- otherwise hard-delete-only, so timestamp-diffing could never see them.
--
-- The device pulls `where seq > cursor order by seq`, applies upserts/deletes into
-- local SQLite, and stores the new max seq. RLS scopes the feed to aircraft the
-- caller can access, exactly like the tables it mirrors. No vendor — this is the
-- whole sync backbone in one table + one trigger.
-- ===========================================================================

create table change_log (
  seq         bigint generated always as identity primary key,
  table_name  text        not null,
  row_id      uuid        not null,
  op          char(1)     not null check (op in ('I', 'U', 'D')),
  aircraft_id uuid        not null,
  changed_at  timestamptz not null default now()
);

-- The pull query is always `aircraft_id in (accessible) and seq > cursor`.
create index change_log_aircraft_seq_idx on change_log (aircraft_id, seq);

-- One generic trigger serves every table: it reads the row as jsonb so the
-- aircraft-id column name can be passed as an argument ('id' for the aircraft
-- table itself, else the default 'aircraft_id'). SECURITY DEFINER so the append
-- runs as the table owner and bypasses change_log's RLS — otherwise the writer's
-- own INSERT (e.g. adding a log entry) would fail against a feed it can't write.
create or replace function log_change() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  col text  := coalesce(tg_argv[0], 'aircraft_id');
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into change_log (table_name, row_id, op, aircraft_id)
  values (tg_table_name, (rec ->> 'id')::uuid, left(tg_op, 1), (rec ->> col)::uuid);
  return coalesce(new, old);
end;
$$;

-- Attach to the aircraft row itself (aircraft-id = its own id) …
create trigger log_change_aircraft after insert or update or delete on aircraft
  for each row execute function log_change('id');

-- … and to every per-aircraft data table the app reads offline.
create trigger log_change_logbook            after insert or update or delete on logbook            for each row execute function log_change();
create trigger log_change_page               after insert or update or delete on page               for each row execute function log_change();
create trigger log_change_log_entry          after insert or update or delete on log_entry          for each row execute function log_change();
create trigger log_change_component          after insert or update or delete on component          for each row execute function log_change();
create trigger log_change_ad_compliance      after insert or update or delete on ad_compliance      for each row execute function log_change();
create trigger log_change_maintenance_item   after insert or update or delete on maintenance_item   for each row execute function log_change();
create trigger log_change_document           after insert or update or delete on document           for each row execute function log_change();
create trigger log_change_squawk             after insert or update or delete on squawk             for each row execute function log_change();
create trigger log_change_oil_addition       after insert or update or delete on oil_addition       for each row execute function log_change();
create trigger log_change_oil_analysis_sample after insert or update or delete on oil_analysis_sample for each row execute function log_change();
create trigger log_change_hours_reading      after insert or update or delete on hours_reading      for each row execute function log_change();
create trigger log_change_scanned_document   after insert or update or delete on scanned_document   for each row execute function log_change();
create trigger log_change_weight_balance     after insert or update or delete on weight_balance     for each row execute function log_change();

-- Readers see only changes for aircraft they can access; the SECURITY DEFINER
-- trigger is the only writer, so there is deliberately no insert/update/delete
-- policy.
alter table change_log enable row level security;

create policy change_log_read on change_log
  for select using (has_aircraft_access(aircraft_id));
