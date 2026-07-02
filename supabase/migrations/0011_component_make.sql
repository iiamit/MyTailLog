-- ===========================================================================
-- MyTailLog — Equipment make + category (Phase 2, current-equipment tracking)
--
-- AD applicability keys off the manufacturer (e.g. an AD against "Dukes"
-- landing-gear actuators, "Garmin" avionics). The component table already
-- tracks part/serial/install/removal/life-limit; add `make` (manufacturer, used
-- to query the FAA AD sources) and `category` (which system it belongs to, for
-- grouping in the UI). Removing a component (is_installed=false + removal_date)
-- is what makes its ADs no longer applicable — the app suggests marking those
-- ad_compliance rows not_applicable with that removal date.
-- ===========================================================================

alter table component
  add column make     text,
  add column category text; -- 'airframe' | 'engine' | 'prop' | 'avionics' | 'other'
