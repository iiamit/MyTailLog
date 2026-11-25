-- Assertions run by run-migrations.sh after every migration has applied, on the
-- rows from seed-before-0069_*.sql. Each block raises on failure (ON_ERROR_STOP).
-- Covers the 09 §7 checklist items that are testable in SQL.

\set A '00000000-0000-0000-0000-00000000000a'
\set V '00000000-0000-0000-0000-00000000000b'
\set E '00000000-0000-0000-0000-00000000000e'
\set AC '10000000-0000-0000-0000-000000000001'

-- 0069: trust is derived from confirmation, signer and authored signing.
do $$ begin
  assert (select string_agg(trust::text, ',' order by id) from log_entry)
       = 'signed,confirmed,ai_read,ai_read', 'trust levels';
end $$;

-- 0070: exactly one completion per item with a last-done date and per AD with
-- a complied date; the AD row keeps its reference entry.
do $$ begin
  assert (select count(*) from item_completion where maintenance_item_id is not null)
       = (select count(*) from maintenance_item where last_done_date is not null), 'mx back-fill count';
  assert (select count(*) from item_completion where ad_compliance_id is not null)
       = (select count(*) from ad_compliance where complied_date is not null), 'ad back-fill count';
  assert (select log_entry_id from item_completion where ad_compliance_id = '60000000-0000-0000-0000-000000000001')
       = '40000000-0000-0000-0000-000000000001', 'ad back-fill entry';
end $$;

-- Two page-less completions of the same item are allowed (partial unique index)…
insert into item_completion (aircraft_id, maintenance_item_id, done_date, source)
values (:'AC', '50000000-0000-0000-0000-000000000001', '2024-12-01', 'mark_done'),
       (:'AC', '50000000-0000-0000-0000-000000000001', '2023-12-01', 'mark_done');
-- …but one entry completes an item only once.
do $$ begin
  insert into item_completion (aircraft_id, maintenance_item_id, log_entry_id, done_date, source) values
    ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '2025-06-01', 'owner_link'),
    ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '2025-06-01', 'owner_link');
  raise exception 'duplicate entry completion accepted';
exception when unique_violation then null; end $$;

-- 0071: back-fill defaults by kind.
do $$ begin
  assert (select string_agg(kind || '=' || line || '/' || shop_kind || '/' || ifr_only, ' ' order by kind) from maintenance_item)
       = 'annual=airframe/mechanic/false oil_change=engine/mechanic/false pitot_static=avionics/avionics_shop/true prop_overhaul=prop/prop_shop/false',
       'maintenance_item back-fill';
end $$;

-- 0073: week_of must be a Monday; an open item rides in one visit only.
insert into planned_visit (id, aircraft_id, week_of) values ('70000000-0000-0000-0000-000000000001', :'AC', '2026-12-07');
insert into planned_visit_item (aircraft_id, visit_id, item_key)
values (:'AC', '70000000-0000-0000-0000-000000000001', 'mx:50000000-0000-0000-0000-000000000003');
do $$ begin
  insert into planned_visit (aircraft_id, week_of) values ('10000000-0000-0000-0000-000000000001', '2026-12-08');
  raise exception 'non-Monday week_of accepted';
exception when check_violation then null; end $$;
do $$ begin
  insert into planned_visit (id, aircraft_id, week_of) values ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2027-02-22');
  insert into planned_visit_item (aircraft_id, visit_id, item_key)
  values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 'mx:50000000-0000-0000-0000-000000000003');
  raise exception 'open item accepted in two visits';
exception when unique_violation then null; end $$;

-- 0075 / 0077: the new enum values are usable.
insert into document (aircraft_id, type, title, storage_path, track_expiry, expires_on)
values (:'AC', 'insurance', 'Policy', '10000000-0000-0000-0000-000000000001/docs/d.pdf', true, '2027-03-01');
update page set extraction_status = 'queued' where id = '30000000-0000-0000-0000-000000000001';

-- 0084: synced tables write change_log; back-fill rows exist.
do $$ begin
  assert (select count(*) from change_log where table_name = 'item_completion' and op = 'I')
       = (select count(*) from item_completion), 'item_completion change rows';
  assert exists (select 1 from change_log where table_name = 'planned_visit_item'), 'planned_visit_item change row';
  assert (select min_seq_retained from sync_retention) = 0, 'sync_retention row';
end $$;

-- Links for the RLS and transfer checks.
insert into record_room (aircraft_id, created_by, label, token_hash, token_enc, expires_at)
values (:'AC', :'A', 'Buyer', 'h1', 'e1', now() + interval '30 days');
insert into mechanic_link (aircraft_id, kind, visit_id, recipient_label, token_hash, token_enc, expires_at, created_by)
values (:'AC', 'visit', '70000000-0000-0000-0000-000000000001', 'M. Torres', 'h2', 'e2', now() + interval '30 days', :'A');
insert into notification (user_id, aircraft_id, kind, title, body, deep_link)
values (:'A', :'AC', 'lead', 'N734DM: annual due', 'Annual due Dec 31.', 'mytaillog://aircraft/x');
insert into aircraft_status_snapshot (aircraft_id, computed_at, inputs_seq, algo_version, snapshot)
values (:'AC', now(), 0, 1, '{}');

-- RLS as the viewer: reads the synced tables, never links or another user's
-- notifications, and cannot write.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","email":"viewer@example.test"}';
do $$ begin
  assert (select count(*) from mechanic_link) = 0, 'viewer reads mechanic_link';
  assert (select count(*) from mechanic_link_view) = 0, 'viewer reads mechanic_link_view';
  assert (select count(*) from record_room) = 0, 'viewer reads record_room';
  assert (select count(*) from notification) = 0, 'viewer reads another user''s notification';
  assert (select count(*) from item_completion) > 0, 'viewer cannot read item_completion';
  assert (select count(*) from aircraft_status_snapshot) = 1, 'viewer cannot read snapshot';
end $$;
do $$ begin
  insert into service_provider (aircraft_id, name, kind) values ('10000000-0000-0000-0000-000000000001', 'X', 'mechanic');
  raise exception 'viewer inserted service_provider';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into aircraft_status_snapshot (aircraft_id, computed_at, inputs_seq, algo_version, snapshot)
  values ('10000000-0000-0000-0000-000000000001', now(), 0, 1, '{}');
  raise exception 'viewer wrote a snapshot';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from sync_retention;
  raise exception 'viewer read sync_retention';
exception when insufficient_privilege then null; end $$;
-- The viewer's own time zone is writable (0079 column grant).
update profile set time_zone = 'America/New_York' where id = '00000000-0000-0000-0000-00000000000b';
reset role;
commit;
do $$ begin
  assert (select time_zone from profile where id = '00000000-0000-0000-0000-00000000000b') = 'America/New_York', 'time_zone update';
end $$;

-- RLS as the editor: manages providers and mechanic links, not record rooms.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","email":"editor@example.test"}';
insert into service_provider (aircraft_id, name, kind, airport) values ('10000000-0000-0000-0000-000000000001', 'AeroCheck Instruments', 'avionics_shop', 'KBED');
do $$ begin
  assert (select count(*) from mechanic_link) = 1, 'editor cannot read mechanic_link';
  assert (select count(*) from record_room) = 0, 'editor reads record_room';
end $$;
reset role;
commit;

-- 0076: a transfer revokes live record rooms and mechanic links.
update aircraft set owner_id = :'E' where id = :'AC';
do $$ begin
  assert (select count(*) from record_room where revoked_at is null) = 0, 'room survives transfer';
  assert (select count(*) from mechanic_link where revoked_at is null) = 0, 'mechanic link survives transfer';
end $$;

-- 0085: deleting a user who reported a squawk on someone else's aircraft works.
insert into squawk (aircraft_id, description, reported_by) values (:'AC', 'Nav light out', :'V');
delete from auth.users where id = :'V';
do $$ begin
  assert (select count(*) from squawk where reported_by is null) = 1, 'squawk kept without reporter';
end $$;

-- 0086: the push ledger is per user; the reading claim is service-only and
-- skips pages waiting on a duplicate decision.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","email":"editor@example.test"}';
insert into sync_mutation (user_id, id, aircraft_id, type, status) values (:'E', 'm-1', :'AC', 'entry.update', 'conflict');
do $$ begin
  insert into sync_mutation (user_id, id, type, status) values ('00000000-0000-0000-0000-00000000000a', 'm-2', 'oil.create', 'ok');
  raise exception 'wrote another user''s ledger row';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform claim_reading_pages(1);
  raise exception 'authenticated ran claim_reading_pages';
exception when insufficient_privilege then null; end $$;
reset role;
commit;
insert into page (id, logbook_id, aircraft_id, storage_path, extraction_status, duplicate_of_page_id) values
  ('30000000-0000-0000-0000-000000000086', '20000000-0000-0000-0000-000000000001', :'AC', '10000000-0000-0000-0000-000000000001/pages/dup.jpg', 'queued', '30000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000087', '20000000-0000-0000-0000-000000000001', :'AC', '10000000-0000-0000-0000-000000000001/pages/q.jpg', 'queued', null);
do $$ begin
  -- p1 was queued by an earlier check; the duplicate (…086) must stay behind.
  assert (select string_agg(id::text, ',' order by id) from claim_reading_pages(10))
       = '30000000-0000-0000-0000-000000000001,30000000-0000-0000-0000-000000000087', 'claim skips the page with a duplicate question';
  assert (select read_attempts from page where id = '30000000-0000-0000-0000-000000000087') = 1, 'claim counts the attempt';
  assert (select count(*) from claim_reading_pages(10)) = 0, 'a fresh claim is not reclaimed';
end $$;
