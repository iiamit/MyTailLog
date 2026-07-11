-- ===========================================================================
-- Seed a PARTNER-DEMO aircraft for OAuth integration testing (e.g. MyFlightBook).
-- Run once, in the Supabase SQL editor, on the PROD project.
--
-- Unlike scripts/seed-demo.sql (the app-wide, read-only-shared demo N734DM),
-- this creates an aircraft the partner-demo account OWNS and keeps PRIVATE
-- (is_demo = false, not shared). Ownership matters: consent only offers OWNED
-- aircraft (migration 0035), so the partner must own the plane to authorize an
-- OAuth client against it. Rich data across ALL SIX read scopes so every
-- /api/v1 endpoint returns something: airworthiness (AD + inspections + hours),
-- aircraft, equipment, hours (recent readings), oil (samples), weight & balance.
--
-- SETUP (before running):
--   1. Supabase dashboard → Authentication → Add user → set the email below +
--      a password, tick "Auto Confirm User".
--   2. Set v_owner_email to that address.
--   3. Run this. Then hand the partner the login, point them at
--      https://mytaillog.com/developers + docs/mfb-integration.md.
-- Idempotent: aborts if this owner already has tail N24MFB.
-- ===========================================================================

do $$
declare
  v_owner_email text := 'mfb-demo@mytaillog.com';   -- EDIT to the account you created
  v_owner uuid;
  v_ac uuid;
  v_af uuid; v_eng uuid; v_prop uuid; v_av uuid;
begin
  select id into v_owner from profile where email = lower(v_owner_email);
  if v_owner is null then
    raise exception 'No profile with email % — create the account first (Auth → Add user) and confirm it', v_owner_email;
  end if;
  if exists (select 1 from aircraft where owner_id = v_owner and tail_number = 'N24MFB') then
    raise notice 'Partner-demo aircraft N24MFB already exists for % — nothing done.', v_owner_email;
    return;
  end if;

  insert into aircraft (owner_id, tail_number, make, model, serial_number, year,
                        engine_serials, prop_serials, home_base,
                        enrollment_hobbs, enrollment_tach, notes, is_demo)
  values (v_owner, 'N24MFB', 'Piper', 'PA-28-181 Archer II', '28-7990318', 1979,
          array['L-30291-36A'], array['SN-88214'], 'KOSH',
          3400.0, 3400.0, 'Partner integration test aircraft — fictional data.', false)
  returning id into v_ac;

  insert into logbook (aircraft_id, type) values (v_ac, 'airframe') returning id into v_af;
  insert into logbook (aircraft_id, type) values (v_ac, 'engine')   returning id into v_eng;
  insert into logbook (aircraft_id, type) values (v_ac, 'prop')     returning id into v_prop;
  insert into logbook (aircraft_id, type) values (v_ac, 'avionics') returning id into v_av;
  insert into logbook (aircraft_id, type) values (v_ac, 'other');

  -- Log entries — enough history that current hours (max tach) ≈ 3452 ----------
  insert into log_entry (aircraft_id, logbook_id, entry_date, tach, description, work_performed, signature_name, mechanic_cert_number, ad_refs, owner_confirmed, confidence) values
  (v_ac, v_af,  '1979-05-14',    6.0, 'New aircraft. Airworthiness certificate issued.', 'Pre-delivery inspection completed.', 'Piper Aircraft Corp.', null, '{}', true, 0.99),
  (v_ac, v_af,  '2015-06-01', 2980.4, 'Annual inspection.', 'Annual IAW FAR 43 App. D. Replaced brake linings. Returned to service.', 'K. Rowe', 'A&P 3312890 IA', '{}', true, 0.97),
  (v_ac, v_af,  '2025-06-15', 3441.9, 'Annual inspection.', 'Annual IAW FAR 43 App. D. Complied with AD 2011-10-09 seat rails. Replaced ELT battery. Returned to service.', 'K. Rowe', 'A&P 3312890 IA', '{2011-10-09}', true, 0.96),
  (v_ac, v_eng, '2012-03-20', 2610.0, 'Engine overhaul.', 'Lycoming O-360-A4M overhauled to service limits. Zero SMOH. New magnetos, plugs, harness.', 'Poplar Grove Engines', 'CRS #PG5T119K', '{}', true, 0.98),
  (v_ac, v_eng, '2025-05-30', 3438.2, 'Oil change + sample.', 'Drained oil, new filter, 8 qts Aeroshell 15W-50. Sample to Blackstone. Compressions 78/76/77/75.', 'J. Fields', 'A&P 3778145', '{}', true, 0.96),
  (v_ac, v_eng, '2025-07-05', 3452.0, 'Oil change + sample.', 'Drained oil, new filter, 8 qts Aeroshell 15W-50 + CamGuard. Sample to Blackstone.', 'J. Fields', 'A&P 3778145', '{}', true, 0.96),
  (v_ac, v_prop,'2018-09-10', 3102.6, 'Propeller overhaul.', 'Sensenich metal prop overhauled, blades dressed and balanced. Zero SPOH.', 'Precision Prop', 'CRS #PP2Q660N', '{}', true, 0.97),
  (v_ac, v_av,  '2021-11-08', 3300.1, 'ADS-B / transponder install.', 'Installed Garmin GTX 345 ADS-B Out/In transponder per STC. Ground checked, FAA report clean.', 'North Ramp Avionics', 'CRS #NR8R204M', '{}', true, 0.98);

  -- Maintenance items — mixed urgencies (current hrs ≈ 3452) --------------------
  insert into maintenance_item (aircraft_id, kind, label, regulatory, interval_months, interval_hours,
                                last_done_date, last_done_hours, next_due_date, next_due_hours, notes) values
  (v_ac, 'annual', 'Annual inspection (91.409)', true, 12, null, '2025-06-15', 3441.9, '2026-06-15', null, null),
  (v_ac, 'transponder', 'Transponder cert (91.413)', true, 24, null, '2021-11-08', null, '2026-03-01', null, null),
  (v_ac, 'pitot_static', 'Pitot-static / altimeter (91.411)', true, 24, null, '2023-04-15', null, '2026-06-01', null, 'OVERDUE — good test case'),
  (v_ac, 'elt', 'ELT inspection (91.207)', true, 12, null, '2025-06-15', null, '2026-06-15', null, 'Battery exp Mar 2028'),
  (v_ac, 'oil_change', 'Oil & filter change', false, null, 50, '2025-07-05', 3452.0, null, 3458.0, '50-hr interval; due soon'),
  (v_ac, 'engine_tbo', 'Engine TBO (O-360-A4M)', false, null, 2000, '2012-03-20', 2610.0, null, 4610.0, 'Advisory / on-condition');

  -- AD compliance --------------------------------------------------------------
  insert into ad_compliance (aircraft_id, kind, reference, title, recurring, interval_hours, status,
                             method, complied_date, complied_hours, next_due_hours, notes) values
  (v_ac, 'ad', '2011-10-09', 'Seat rail / seat rail lock inspection', true, 100, 'complied',
   'Inspected IAW AD para (g); no wear beyond limits', '2025-06-15', 3441.9, 3460.0, 'Recurring 100 hr — due soon'),
  (v_ac, 'ad', '77-13-21', 'Oil cooler hose inspection', false, null, 'complied',
   'Hoses replaced', '2015-06-01', 2980.4, null, null),
  (v_ac, 'sb', 'SB-1301A', 'Fuel selector placard', false, null, 'open',
   null, null, null, null, 'Not yet complied — open item for testing');

  -- Equipment ------------------------------------------------------------------
  insert into component (aircraft_id, name, make, category, part_number, install_date, is_installed, notes) values
  (v_ac, 'GTX 345 ADS-B transponder', 'Garmin', 'avionics', '010-00734-00', '2021-11-08', true, 'STC — ADS-B Out/In'),
  (v_ac, 'Attitude indicator', 'RC Allen', 'instruments', 'RCA26AK-3', '2020-02-14', true, 'Electric backup'),
  (v_ac, 'ELT', 'ACK', 'avionics', 'E-04', '2025-06-15', true, 'Battery exp Mar 2028');
  insert into component (aircraft_id, name, make, category, part_number, install_date, removal_date, is_installed, notes) values
  (v_ac, 'KT 76A transponder', 'King', 'avionics', '066-1062-00', '1979-05-14', '2021-11-08', false, 'Replaced by GTX 345');

  -- Recent hours readings (so /hours has a readings array) ----------------------
  insert into hours_reading (aircraft_id, reading_date, hobbs, tach, source, external_ref) values
  (v_ac, '2025-05-30', 3438.2, 3438.2, 'seed', 'partner-demo-1'),
  (v_ac, '2025-07-05', 3452.0, 3452.0, 'seed', 'partner-demo-2');

  -- Oil analysis — 3 Blackstone-style samples, iron trending up slightly -------
  insert into oil_analysis_sample (aircraft_id, sample_date, analysis_date, lab, lab_number, oil_type,
                                   oil_hours, engine_hours, oil_added_quarts, elements_ppm, oil_properties,
                                   universal_averages, lab_comments, status) values
  (v_ac, '2025-03-18', '2025-03-25', 'Blackstone', 'BL-778201', 'Aeroshell 15W-50',
   48, 3410.0, 1.0,
   '{"iron":22,"chromium":2,"aluminum":4,"copper":8,"lead":940,"nickel":1,"silicon":6}'::jsonb,
   '{"viscosity":19.8,"flashpoint":420}'::jsonb,
   '{"iron":30,"chromium":3,"aluminum":5,"copper":9,"lead":1100,"silicon":8}'::jsonb,
   'All wear metals within universal averages. Continue current interval.', 'normal'),
  (v_ac, '2025-05-30', '2025-06-06', 'Blackstone', 'BL-781544', 'Aeroshell 15W-50',
   50, 3438.2, 1.5,
   '{"iron":28,"chromium":2,"aluminum":4,"copper":7,"lead":880,"nickel":1,"silicon":5}'::jsonb,
   '{"viscosity":19.6,"flashpoint":415}'::jsonb,
   '{"iron":30,"chromium":3,"aluminum":5,"copper":9,"lead":1100,"silicon":8}'::jsonb,
   'Iron up slightly but normal for this engine. No action needed.', 'normal'),
  (v_ac, '2025-07-05', '2025-07-12', 'Blackstone', 'BL-784990', 'Aeroshell 15W-50',
   47, 3452.0, 1.0,
   '{"iron":35,"chromium":3,"aluminum":5,"copper":7,"lead":910,"nickel":1,"silicon":5}'::jsonb,
   '{"viscosity":19.7,"flashpoint":418}'::jsonb,
   '{"iron":30,"chromium":3,"aluminum":5,"copper":9,"lead":1100,"silicon":8}'::jsonb,
   'Iron a touch above average — resample at next change to confirm trend.', 'monitor');

  -- Weight & balance -----------------------------------------------------------
  insert into weight_balance (aircraft_id, revision_date, empty_weight, empty_weight_arm,
                              empty_weight_moment, max_gross_weight, method, reference, reason) values
  (v_ac, '2015-06-01', 1543.60, 87.240, 134664.86, 2550, 'weighed', 'Annual 2015', 'Periodic reweigh'),
  (v_ac, '2021-11-08', 1548.10, 87.310, 135165.60, 2550, 'computed', 'Form 337, GTX 345 install', 'Transponder swap');

  raise notice 'Partner-demo aircraft N24MFB created (%) — owned by %, private.', v_ac, v_owner_email;
end $$;
