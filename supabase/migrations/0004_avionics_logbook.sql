-- ===========================================================================
-- MyTailLog — Add the avionics logbook type.
--
-- Aircraft keep a separate avionics logbook alongside airframe/engine/prop for
-- radio/nav/transponder/ADS-B and other avionics work. Postgres won't let a
-- newly added enum value be used in the SAME transaction that adds it, so this
-- migration only adds the value — the backfill for existing aircraft lives in
-- 0005 and must be run afterward (as a separate execution).
-- ===========================================================================

alter type logbook_type add value if not exists 'avionics';
