-- Aggregate activation milestones for /admin. Product records provide the
-- funnel; this table only records summary actions that leave no durable row.
create table growth_event (
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('summary_shared', 'summary_exported')),
  created_at timestamptz not null default now(),
  primary key (user_id, event)
);

alter table growth_event enable row level security;
revoke all on growth_event from anon, authenticated;
grant select, insert on growth_event to service_role;

create view admin_growth_funnel as
select
  (select count(*) from profile) as signed_up,
  (select count(distinct owner_id) from aircraft) as added_aircraft,
  (select count(distinct a.owner_id) from page p join aircraft a on a.id = p.aircraft_id) as uploaded_pages,
  (select count(distinct a.owner_id) from page p join aircraft a on a.id = p.aircraft_id where p.review_status = 'confirmed') as reviewed_pages,
  (select count(distinct user_id) from growth_event) as shared_summary;

revoke all on admin_growth_funnel from anon, authenticated;
grant select on admin_growth_funnel to service_role;
