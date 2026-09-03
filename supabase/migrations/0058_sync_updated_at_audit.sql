-- ===========================================================================
-- 0058 — iOS parity, core sync.
--
-- 1. updated_at audit. The push endpoint's conflict rule (CONTRACT §2) compares
--    the phone's `base` against row.updated_at, so every synced table must have
--    the column AND a BEFORE UPDATE trigger that bumps it. Audit of 0001–0057:
--
--      has both:  aircraft, logbook, page, log_entry, component, ad_compliance,
--                 maintenance_item, document, oil_analysis_sample, meter_reset,
--                 scanned_document, weight_balance, ad_reference
--      column, no trigger:  squawk (0043), hours_reading (0022)
--      neither:             oil_addition (0042), adsb_flight (0048),
--                           equipment_proposal (0012)
--
--    hours_reading's writers set updated_at by hand today; the trigger makes
--    that redundant, not wrong.
--
-- 2. ad_reference + equipment_proposal join the change feed (log_change trigger
--    + 0045-style backfill) so the phone can show the AD text behind a
--    compliance record and the extractor's equipment proposals offline.
--
--    ad_reference is GLOBAL reference data (no aircraft_id; readable by every
--    signed-in user — 0008). change_log required an aircraft on every row, so
--    the feed gains "global" rows: aircraft_id null, visible to any
--    authenticated user. log_change() writes null when the row has no aircraft
--    column; the read policy admits null rows.
-- ===========================================================================

-- --- 1. updated_at -----------------------------------------------------------

create trigger squawk_updated_at before update on squawk
  for each row execute function set_updated_at();

create trigger hours_reading_updated_at before update on hours_reading
  for each row execute function set_updated_at();

alter table oil_addition add column updated_at timestamptz not null default now();
create trigger oil_addition_updated_at before update on oil_addition
  for each row execute function set_updated_at();

alter table adsb_flight add column updated_at timestamptz not null default now();
create trigger adsb_flight_updated_at before update on adsb_flight
  for each row execute function set_updated_at();

alter table equipment_proposal add column updated_at timestamptz not null default now();
create trigger equipment_proposal_updated_at before update on equipment_proposal
  for each row execute function set_updated_at();

-- --- 2. change feed ----------------------------------------------------------

alter table change_log alter column aircraft_id drop not null;

create or replace function log_change() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  col text  := coalesce(tg_argv[0], 'aircraft_id');
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into change_log (table_name, row_id, op, aircraft_id, owner_id)
  values (
    tg_table_name,
    (rec ->> 'id')::uuid,
    left(tg_op, 1),
    -- Global reference tables have no aircraft column: a null aircraft_id marks
    -- the change as visible to every signed-in user (see the read policy).
    case when rec ? col then (rec ->> col)::uuid end,
    -- OLD still has owner_id on a DELETE, which is the whole point (0054).
    case when tg_table_name = 'aircraft' then (rec ->> 'owner_id')::uuid end
  );
  return coalesce(new, old);
end;
$$;

create trigger log_change_ad_reference after insert or update or delete on ad_reference
  for each row execute function log_change();
create trigger log_change_equipment_proposal after insert or update or delete on equipment_proposal
  for each row execute function log_change();

drop policy change_log_read on change_log;
create policy change_log_read on change_log
  for select using (
    -- Global reference rows: any signed-in user (mirrors ad_reference_select).
    (aircraft_id is null and auth.uid() is not null)
    or has_aircraft_access(aircraft_id)
    -- The aircraft is gone; only the stamp can still prove this feed was yours.
    or owner_id = auth.uid()
  );

-- Backfill (0045 pattern): one synthetic 'I' per current row so a device that
-- is already past the tip still receives them on its next pull.
insert into change_log (table_name, row_id, op, aircraft_id) select 'ad_reference',       id, 'I', null        from ad_reference;
insert into change_log (table_name, row_id, op, aircraft_id) select 'equipment_proposal', id, 'I', aircraft_id from equipment_proposal;
