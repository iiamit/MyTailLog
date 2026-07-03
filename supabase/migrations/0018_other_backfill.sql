-- ===========================================================================
-- MyTailLog — Backfill an "other" logbook for existing aircraft.
--
-- New enrollments seed all logbooks (incl. 'other') in application code; this
-- gives aircraft enrolled before the 'other' type existed their Other logbook.
-- Idempotent: only inserts where one doesn't already exist.
--
-- RUN THIS AFTER 0017 has been applied (and committed) — it uses the 'other'
-- enum value added there.
-- ===========================================================================

insert into logbook (aircraft_id, type)
select a.id, 'other'::logbook_type
from aircraft a
where not exists (
  select 1 from logbook l
  where l.aircraft_id = a.id and l.type = 'other'
);
