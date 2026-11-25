-- Pre-0069 data so the 0069–0084 back-fills and the generated trust column run
-- against real rows. run-migrations.sh applies seed-before-<file> just before
-- <file>. Owner A, viewer V, editor E; one aircraft.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'viewer@example.test'),
  ('00000000-0000-0000-0000-00000000000e', 'editor@example.test');

insert into aircraft (id, owner_id, tail_number, year, home_base) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'N734DM', 1978, 'KBED');

insert into aircraft_share (aircraft_id, invited_email, role, invited_by) values
  ('10000000-0000-0000-0000-000000000001', 'viewer@example.test', 'viewer', '00000000-0000-0000-0000-00000000000a'),
  ('10000000-0000-0000-0000-000000000001', 'editor@example.test', 'editor', '00000000-0000-0000-0000-00000000000a');

insert into logbook (id, aircraft_id, type) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'airframe'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'engine');

insert into page (id, logbook_id, aircraft_id, storage_path) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001/pages/p1.jpg');

-- signed (paper signature + cert, confirmed), confirmed, ai_read, ai_read with signer
insert into log_entry (id, page_id, logbook_id, aircraft_id, entry_date, tach, owner_confirmed, signature_name, mechanic_cert_number) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2025-12-03', 4100.0, true,  'M. Torres', 'A&P 3667012'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2025-06-01', 4050.0, true,  null, null),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2025-12-03', 4100.2, false, null, null),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2024-01-01', 3900.0, false, 'J. Doe', 'A&P 1');

insert into maintenance_item (id, aircraft_id, kind, label, interval_months, interval_hours, last_done_date, last_done_hours) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'annual',       'Annual',        12, null, '2025-12-03', 4100.0),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'pitot_static', 'Pitot-static',  24, null, '2024-12-03', null),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'oil_change',   'Oil change',  null, 50,   null, null),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'prop_overhaul','Prop overhaul', 72, 2000, null, null);

insert into ad_compliance (id, aircraft_id, reference, recurring, status, complied_date, complied_hours, reference_entry_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2011-10-09', true, 'complied', '2025-12-03', 4100.0, '40000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2020-01-01', false, 'open', null, null, null);
