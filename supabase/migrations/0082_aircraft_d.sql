-- ===========================================================================
-- 0082 — Aircraft: the owner's flying estimate (third projection fallback,
-- 09 §3.3), a manual situation override (09 §3.6), and the first time status
-- became ready (success metric). No aircraft time zone: see profile.time_zone
-- (0079, 14-decisions.md K4).
-- ===========================================================================

alter table aircraft
  add column expected_hours_per_week numeric(4,1) check (expected_hours_per_week between 0 and 60),
  add column situation_override text check (situation_override in ('preparing_sale','in_shop')),
  add column status_ready_at timestamptz;     -- first time owner_status_ready() became true
