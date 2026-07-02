-- ===========================================================================
-- MyTailLog — Backfill an avionics logbook for existing aircraft.
--
-- New enrollments seed all four logbooks in application code; this gives
-- aircraft enrolled before the avionics type existed their avionics logbook.
-- Idempotent: only inserts where one doesn't already exist.
--
-- RUN THIS AFTER 0004 has been applied (and committed) — it uses the 'avionics'
-- enum value added there.
-- ===========================================================================

insert into logbook (aircraft_id, type)
select a.id, 'avionics'::logbook_type
from aircraft a
where not exists (
  select 1 from logbook l
  where l.aircraft_id = a.id and l.type = 'avionics'
);
