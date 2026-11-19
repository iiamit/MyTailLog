-- ===========================================================================
-- 0084 — Register the direction D tables with the change feed (09 §2.16, §5.2)
-- and add sync_retention for cursor pruning (09 §5.4).
--
-- Not synced (online only, fetched by endpoint): record_room*, mechanic_link*,
-- notification, reminder_snooze, reminder_log.
-- ===========================================================================

create trigger log_change_item_completion            after insert or update or delete on item_completion            for each row execute function log_change();
create trigger log_change_service_provider           after insert or update or delete on service_provider           for each row execute function log_change();
create trigger log_change_planned_visit              after insert or update or delete on planned_visit              for each row execute function log_change();
create trigger log_change_planned_visit_item         after insert or update or delete on planned_visit_item         for each row execute function log_change();
create trigger log_change_visit_suggestion_dismissal after insert or update or delete on visit_suggestion_dismissal for each row execute function log_change();
create trigger log_change_logbook_gap                after insert or update or delete on logbook_gap                for each row execute function log_change();
create trigger log_change_squawk_photo               after insert or update or delete on squawk_photo               for each row execute function log_change();
create trigger log_change_scan_batch                 after insert or update or delete on scan_batch                 for each row execute function log_change();
create trigger log_change_time_check_dismissal       after insert or update or delete on time_check_dismissal       for each row execute function log_change();
-- Row id = the snapshot's own `id` column (its primary key is aircraft_id).
create trigger log_change_aircraft_status_snapshot   after insert or update or delete on aircraft_status_snapshot   for each row execute function log_change();

-- Backfill (0045 pattern), parent → child, so a device already past the tip
-- still receives existing rows on its next pull.
insert into change_log (table_name, row_id, op, aircraft_id) select 'service_provider',           id, 'I', aircraft_id from service_provider;
insert into change_log (table_name, row_id, op, aircraft_id) select 'planned_visit',              id, 'I', aircraft_id from planned_visit;
insert into change_log (table_name, row_id, op, aircraft_id) select 'item_completion',            id, 'I', aircraft_id from item_completion;
insert into change_log (table_name, row_id, op, aircraft_id) select 'planned_visit_item',         id, 'I', aircraft_id from planned_visit_item;
insert into change_log (table_name, row_id, op, aircraft_id) select 'visit_suggestion_dismissal', id, 'I', aircraft_id from visit_suggestion_dismissal;
insert into change_log (table_name, row_id, op, aircraft_id) select 'logbook_gap',                id, 'I', aircraft_id from logbook_gap;
insert into change_log (table_name, row_id, op, aircraft_id) select 'squawk_photo',               id, 'I', aircraft_id from squawk_photo;
insert into change_log (table_name, row_id, op, aircraft_id) select 'scan_batch',                 id, 'I', aircraft_id from scan_batch;
insert into change_log (table_name, row_id, op, aircraft_id) select 'time_check_dismissal',       id, 'I', aircraft_id from time_check_dismissal;
insert into change_log (table_name, row_id, op, aircraft_id) select 'aircraft_status_snapshot',   id, 'I', aircraft_id from aircraft_status_snapshot;

-- Highest pruned change_log seq. A pull with cursor < min_seq_retained gets
-- 410 resync_required. Pruning ships disabled: the nightly job prunes only when
-- app_setting 'change_log_prune_enabled' exists and is on (absent = off).
create table sync_retention (
  id boolean primary key default true check (id),     -- single row
  min_seq_retained bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into sync_retention default values;
alter table sync_retention enable row level security;
revoke all on sync_retention from anon, authenticated;
grant all on sync_retention to service_role;
