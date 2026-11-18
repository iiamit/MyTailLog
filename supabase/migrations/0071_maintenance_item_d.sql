-- ===========================================================================
-- 0071 — maintenance_item: the book line its ring sits on, who does it, IFR-only
-- items, expiry-type items (ELT battery), visit windows and per-item reminder
-- leads (09 §2.3). Back-fills line / shop_kind / ifr_only by kind.
-- ===========================================================================

alter table maintenance_item
  add column line logbook_type,                      -- the book whose line its ring sits on
  add column shop_kind text check (shop_kind in ('mechanic','avionics_shop','prop_shop','engine_shop','self')),
  add column provider_id uuid,                       -- fk added in 0072
  add column ifr_only boolean not null default false,
  add column expires_on date,                        -- expiry-type items (ELT battery): due on this date, no interval
  add column visit_window_days int check (visit_window_days between 0 and 180),
  add column visit_window_hours numeric(6,1) check (visit_window_hours between 0 and 200),
  add column remind_lead_days int,                   -- per-item override of the category lead
  add column remind_lead_hours numeric(6,1);

update maintenance_item set
  line = (case kind
    when 'transponder' then 'avionics' when 'pitot_static' then 'avionics'
    when 'elt' then 'avionics' when 'elt_battery' then 'avionics' when 'vor' then 'avionics'
    when 'oil_change' then 'engine' when 'engine_tbo' then 'engine'
    when 'prop_overhaul' then 'prop'
    else 'airframe' end)::logbook_type,
  shop_kind = case kind
    when 'transponder' then 'avionics_shop' when 'pitot_static' then 'avionics_shop'
    when 'vor' then 'self'
    when 'engine_tbo' then 'engine_shop'
    when 'prop_overhaul' then 'prop_shop'
    else 'mechanic' end,
  ifr_only = kind in ('pitot_static', 'vor');
