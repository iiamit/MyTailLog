-- ===========================================================================
-- 0090 — Editors set "Usual flying" (aircraft.expected_hours_per_week, 0082).
--
-- 09 §5.3 gives `aircraft.setExpectedHours` to editors (W-AIRCRAFT-01 "Usual
-- flying: Change", owner and editors), but aircraft rows are owner-update only
-- (aircraft_owner_update, 0001). This narrow definer function lets an editor
-- change that one column and nothing else. The write function
-- (lib/writes/aircraft.ts setExpectedHours) checks the base first.
-- ===========================================================================

create or replace function set_expected_hours(target_aircraft uuid, hours_per_week numeric)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare stamp timestamptz;
begin
  if not can_edit_aircraft(target_aircraft) then
    raise exception 'You don''t have edit access to this aircraft.' using errcode = '42501';
  end if;
  if hours_per_week is not null and (hours_per_week < 0 or hours_per_week > 60) then
    raise exception 'Hours a week must be between 0 and 60.' using errcode = '22023';
  end if;
  update aircraft set expected_hours_per_week = hours_per_week
   where id = target_aircraft
  returning updated_at into stamp;
  return stamp;
end $$;

revoke all on function set_expected_hours(uuid, numeric) from public, anon;
grant execute on function set_expected_hours(uuid, numeric) to authenticated;
