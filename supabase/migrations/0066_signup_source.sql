-- Where new accounts come from, and whether they reach a useful status.
--
-- signup_source: first-touch attribution copied from the first-party mtl_src
--   cookie (set by the proxy only for anonymous visitors arriving via a tagged
--   link or another site). Written by the service role only.
-- heard_about: the owner's one-tap answer to "How did you hear about us?".
--   Owners may set it themselves, so it gets a column grant (see 0028).

alter table public.profile
  add column if not exists signup_source jsonb,
  add column if not exists heard_about text check (heard_about in (
    'reddit', 'facebook_group', 'forum', 'type_club', 'search', 'app_store',
    'friend_or_mechanic', 'myflightbook', 'other', 'dismissed'));

grant update (heard_about) on public.profile to authenticated;

-- "Status ready": an owned aircraft whose annual has a last-done date and that
-- has a current meter (a reading or an enrollment value). The activation point
-- the guided start (/aircraft/[id]/start) is built to reach.
create or replace function public.owner_status_ready(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from aircraft a
    join maintenance_item m on m.aircraft_id = a.id and m.kind = 'annual' and m.last_done_date is not null
    where a.owner_id = p_owner
      and (a.enrollment_tach is not null or a.enrollment_hobbs is not null
           or exists (select 1 from hours_reading h where h.aircraft_id = a.id))
  );
$$;
revoke all on function public.owner_status_ready(uuid) from public, anon, authenticated;
grant execute on function public.owner_status_ready(uuid) to service_role;

-- Column order of the existing view is kept; the new stage is appended.
create or replace view admin_growth_funnel as
select
  (select count(*) from profile) as signed_up,
  (select count(distinct owner_id) from aircraft) as added_aircraft,
  (select count(distinct a.owner_id) from page p join aircraft a on a.id = p.aircraft_id) as uploaded_pages,
  (select count(distinct a.owner_id) from page p join aircraft a on a.id = p.aircraft_id where p.review_status = 'confirmed') as reviewed_pages,
  (select count(distinct user_id) from growth_event) as shared_summary,
  (select count(*) from profile p where owner_status_ready(p.id)) as status_ready;

revoke all on admin_growth_funnel from anon, authenticated;
grant select on admin_growth_funnel to service_role;

create view admin_signups_by_source as
select
  coalesce(
    nullif(p.signup_source->>'ref', ''),
    nullif(p.signup_source->>'utm_source', ''),
    nullif(p.signup_source->>'referrer_host', ''),
    'heard:' || p.heard_about,
    'unknown') as source,
  count(*)::int as signed_up,
  count(*) filter (where exists (select 1 from aircraft a where a.owner_id = p.id))::int as added_aircraft,
  count(*) filter (where exists (select 1 from page pg join aircraft a on a.id = pg.aircraft_id where a.owner_id = p.id))::int as uploaded_pages,
  count(*) filter (where owner_status_ready(p.id))::int as status_ready,
  count(*) filter (where p.created_at > now() - interval '7 days')::int as last_7d
from profile p
where not p.is_admin
group by 1;

revoke all on admin_signups_by_source from anon, authenticated;
grant select on admin_signups_by_source to service_role;
