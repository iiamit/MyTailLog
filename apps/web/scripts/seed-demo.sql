-- ===========================================================================
-- Seed the DEMO aircraft (run once, in the Supabase SQL editor, AFTER 0026).
--
-- Creates N734DM — a fictional 1978 Cessna 172N with a realistic multi-decade
-- history: log entries across all logbooks, maintenance items in mixed states
-- (overdue / due soon / current), AD compliance, equipment, and W&B revisions.
-- Entries are synthetic (no page scans). owner_confirmed=true throughout so the
-- demo reads clean. Finally, shares it read-only with every EXISTING user
-- (new users get it via the signup trigger from 0026).
--
-- Adjust v_owner_email if the demo should belong to a different account.
-- Idempotent-ish: aborts if a demo aircraft already exists.
-- ===========================================================================

do $$
declare
  v_owner_email text := 'iamit@iamit.org';
  v_owner uuid;
  v_ac uuid;
  v_af uuid; v_eng uuid; v_prop uuid; v_av uuid;
begin
  if exists (select 1 from aircraft where is_demo) then
    raise notice 'Demo aircraft already exists — nothing done.';
    return;
  end if;

  select id into v_owner from profile where email = v_owner_email;
  if v_owner is null then
    raise exception 'No profile with email % — edit v_owner_email', v_owner_email;
  end if;

  insert into aircraft (owner_id, tail_number, make, model, serial_number, year,
                        engine_serials, prop_serials, home_base,
                        enrollment_hobbs, enrollment_tach, notes, is_demo)
  values (v_owner, 'N734DM', 'Cessna', '172N', '17269841', 1978,
          array['L-14238-27A'], array['EM-77341'], 'KDEMO',
          4212.4, 4212.4, 'Demo aircraft — fictional data for exploring MyTailLog.', true)
  returning id into v_ac;

  insert into logbook (aircraft_id, type) values (v_ac, 'airframe') returning id into v_af;
  insert into logbook (aircraft_id, type) values (v_ac, 'engine')   returning id into v_eng;
  insert into logbook (aircraft_id, type) values (v_ac, 'prop')     returning id into v_prop;
  insert into logbook (aircraft_id, type) values (v_ac, 'avionics') returning id into v_av;
  insert into logbook (aircraft_id, type) values (v_ac, 'other');

  -- Log entries (a representative slice of 48 years) ------------------------
  insert into log_entry (aircraft_id, logbook_id, entry_date, tach, description, work_performed, signature_name, mechanic_cert_number, ad_refs, owner_confirmed, confidence) values
  (v_ac, v_af, '1978-06-02',    9.1, 'New aircraft. Airworthiness certificate issued.', 'Pre-delivery inspection completed. All systems normal.', 'Cessna Aircraft Co.', null, '{}', true, 0.99),
  (v_ac, v_af, '1998-04-18', 2101.5, 'Annual inspection.', '1. Performed annual inspection IAW FAR 43 App. D. 2. Replaced left main tire. 3. Lubricated all controls. Aircraft returned to service.', 'R. Mitchell', 'A&P 2214467 IA', '{}', true, 0.97),
  (v_ac, v_af, '2011-08-22', 3384.0, 'Annual inspection. AD compliance.', '1. Annual inspection IAW FAR 43 App. D. 2. Complied with AD 2011-10-09 seat rail inspection — no wear beyond limits, next due in 100 hrs. 3. Replaced ELT battery.', 'D. Alvarez', 'A&P 3105582 IA', '{2011-10-09}', true, 0.96),
  (v_ac, v_af, '2019-03-12', 3891.2, 'Avionics upgrade — see avionics log.', 'Removed King KX-155 NAV/COM. Installed Garmin GTN 650 GPS/NAV/COM per STC SA01714WI. Weight & balance amended, new equipment list issued. Form 337 filed.', 'SkyTech Avionics', 'CRS #ST4R881K', '{}', true, 0.98),
  (v_ac, v_af, '2024-05-01', 4102.7, 'Transponder & altimeter certification.', 'Transponder tested and inspected IAW FAR 91.413 / Part 43 App. F. Altimeter/static system IAW 91.411 / App. E. Systems approved.', 'AeroCheck Instruments', 'CRS #AC2Y441L', '{}', true, 0.97),
  (v_ac, v_af, '2025-07-20', 4168.3, 'Annual inspection.', '1. Annual inspection IAW FAR 43 App. D. 2. Complied with AD 2011-10-09 seat rails — satisfactory. 3. Replaced vacuum pump filter. 4. Patched left wing fairing crack. Aircraft returned to service.', 'D. Alvarez', 'A&P 3105582 IA', '{2011-10-09}', true, 0.95),
  (v_ac, v_eng, '2005-09-14', 2803.0, 'Engine overhaul.', 'Lycoming O-320-H2AD overhauled to service limits by Signal Engines. Zero time SMOH. New Slick magnetos, harness, and plugs installed. Test run normal.', 'Signal Engines Inc.', 'CRS #SE9K204M', '{}', true, 0.98),
  (v_ac, v_eng, '2024-11-02', 4131.5, 'Oil change.', 'Drained oil, replaced filter (CH48110-1), serviced with 7 qts Phillips XC 20W-50 + CamGuard. Cut filter — no metal. Compressions 76/74/75/77 over 80.', 'M. Torres', 'A&P 3667012', '{}', true, 0.96),
  (v_ac, v_eng, '2025-06-08', 4172.1, 'Oil change.', 'Drained oil, new filter, 7 qts Phillips XC 20W-50. Oil sample sent to Blackstone — results normal. No leaks noted.', 'M. Torres', 'A&P 3667012', '{}', true, 0.96),
  (v_ac, v_prop, '2010-04-30', 3204.8, 'Propeller overhaul.', 'McCauley 1C160/DTM7557 overhauled by ProProp Services. New seals, blades dressed and balanced. Zero time SPOH.', 'ProProp Services', 'CRS #PP7Q118N', '{}', true, 0.97),
  (v_ac, v_prop, '2025-07-20', 4168.3, 'Annual inspection — propeller.', 'Inspected propeller and spinner IAW FAR 43 App. D. Minor nicks dressed. No cracks or oil leaks.', 'D. Alvarez', 'A&P 3105582 IA', '{}', true, 0.95),
  (v_ac, v_av, '2019-03-12', 3891.2, 'GTN 650 installation.', 'Installed Garmin GTN 650 per STC SA01714WI: new tray, antenna (GA 35), wiring. Interfaced to existing GI 106A CDI. Ground and flight checked — normal.', 'SkyTech Avionics', 'CRS #ST4R881K', '{}', true, 0.98),
  (v_ac, v_av, '2023-02-11', 4038.9, 'ELT battery replacement.', 'Replaced ELT battery (ACK E-04). New expiration: Feb 2027. Self-test normal, remote switch checked.', 'M. Torres', 'A&P 3667012', '{}', true, 0.97);

  -- Maintenance items — mixed urgencies for a colorful Status grid ----------
  insert into maintenance_item (aircraft_id, kind, label, regulatory, interval_months, interval_hours,
                                last_done_date, last_done_hours, next_due_date, next_due_hours, notes) values
  (v_ac, 'annual', 'Annual inspection (91.409)', true, 12, null, '2025-07-20', 4168.3, '2026-07-20', null, null),
  (v_ac, 'transponder', 'Transponder cert (91.413)', true, 24, null, '2024-05-01', null, '2026-05-01', null, null),
  (v_ac, 'pitot_static', 'Pitot-static / altimeter (91.411)', true, 24, null, '2024-11-15', null, '2026-11-15', null, null),
  (v_ac, 'elt', 'ELT inspection (91.207)', true, 12, null, '2025-07-20', null, '2026-07-20', null, 'Battery expires Feb 2027'),
  (v_ac, 'oil_change', 'Oil & filter change', false, null, 50, '2025-06-08', 4172.1, null, 4222.1, '50-hr interval, Phillips XC 20W-50'),
  (v_ac, 'engine_tbo', 'Engine TBO (O-320-H2AD)', false, null, 2000, '2005-09-14', 2803.0, null, 4803.0, 'Advisory — on-condition per Savvy philosophy');

  -- AD compliance -------------------------------------------------------------
  insert into ad_compliance (aircraft_id, kind, reference, title, recurring, interval_hours, status,
                             method, complied_date, complied_hours, next_due_hours, notes) values
  (v_ac, 'ad', '2011-10-09', 'Seat rail / seat rail lock inspection', true, 100, 'complied',
   'Inspected IAW AD para (g); no wear beyond limits', '2025-07-20', 4168.3, 4268.3, 'Recurring 100 hr'),
  (v_ac, 'ad', '76-07-12', 'Fuel tank filler caps', false, null, 'complied',
   'Vented caps installed', '1998-04-18', 2101.5, null, null),
  (v_ac, 'ad', '2020-18-01', 'Fuel pump diaphragm', false, null, 'not_applicable',
   null, null, null, null, 'Engine model not affected');

  -- Equipment ------------------------------------------------------------------
  insert into component (aircraft_id, name, make, category, part_number, install_date, is_installed, notes) values
  (v_ac, 'GTN 650 GPS/NAV/COM', 'Garmin', 'avionics', '011-01057-00', '2019-03-12', true, 'STC SA01714WI'),
  (v_ac, 'Vacuum pump', 'Rapco', 'engine', 'RA215CC', '2021-04-10', true, null),
  (v_ac, 'ELT', 'ACK', 'avionics', 'E-04', '2015-06-20', true, 'Battery exp Feb 2027');
  insert into component (aircraft_id, name, make, category, part_number, install_date, removal_date, is_installed, notes) values
  (v_ac, 'KX-155 NAV/COM', 'King', 'avionics', '069-1024-25', '1978-06-02', '2019-03-12', false, 'Removed for GTN 650');

  -- Weight & balance ------------------------------------------------------------
  insert into weight_balance (aircraft_id, revision_date, empty_weight, empty_weight_arm,
                              empty_weight_moment, max_gross_weight, method, reference, reason) values
  (v_ac, '1998-04-18', 1441.20, 39.420, 56812.10, 2300, 'weighed', 'Annual 1998', 'Periodic reweigh'),
  (v_ac, '2019-03-12', 1447.80, 39.610, 57347.36, 2300, 'computed', 'Form 337, GTN 650 install', 'KX-155 removed, GTN 650 installed');

  -- Share read-only with every existing user (new users: signup trigger) --------
  insert into aircraft_share (aircraft_id, invited_email, role, invited_by)
  select v_ac, lower(p.email), 'viewer', v_owner
  from profile p
  where p.email is not null and p.id <> v_owner
  on conflict (aircraft_id, invited_email) do nothing;

  raise notice 'Demo aircraft N734DM created (%) and shared with existing users.', v_ac;
end $$;
