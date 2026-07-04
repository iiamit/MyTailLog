-- ===========================================================================
-- Owner/admin reporting: an is_admin flag + a system-wide stats view for the
-- in-app /admin dashboard. The view aggregates ALL users' data, so it is locked
-- down: revoked from anon/authenticated and read ONLY server-side via the
-- Supabase secret key (like the cron). A Postgres view runs with its owner's
-- privileges (bypasses RLS), which is exactly why the revoke matters.
-- After applying, grant yourself admin:
--   update profile set is_admin = true where email = '<your-email>';
-- ===========================================================================

alter table profile add column if not exists is_admin boolean not null default false;

-- Per-user rollup (counts of OWNED aircraft and everything under them).
create or replace view admin_user_stats as
select
  p.id,
  p.email,
  p.is_admin,
  p.created_at as joined,
  (select count(*) from aircraft a where a.owner_id = p.id) as aircraft,
  (select count(*) from logbook   l  where l.aircraft_id  in (select id from aircraft where owner_id = p.id)) as logbooks,
  (select count(*) from page      pg where pg.aircraft_id in (select id from aircraft where owner_id = p.id)) as pages,
  (select count(*) from log_entry e  where e.aircraft_id  in (select id from aircraft where owner_id = p.id)) as entries,
  (select max(e.created_at) from log_entry e where e.aircraft_id in (select id from aircraft where owner_id = p.id)) as last_entry_at
from profile p;

-- Lock it: only the privileged secret key (service_role) may read it.
revoke all on admin_user_stats from anon, authenticated;
grant select on admin_user_stats to service_role;
