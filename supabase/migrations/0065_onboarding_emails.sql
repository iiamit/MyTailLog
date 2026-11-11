-- Contextual onboarding email, independent of maintenance reminders.
alter table public.profile
  add column onboarding_opt_out boolean not null default false,
  add column onboarding_unsubscribe_token uuid not null default gen_random_uuid();
create unique index profile_onboarding_unsubscribe_token_idx
  on public.profile (onboarding_unsubscribe_token);

-- 0028 restricts self-updates to safe columns; include this preference only.
grant update (onboarding_opt_out) on public.profile to authenticated;

create table public.onboarding_email_campaign (
  id boolean primary key default true check (id),
  launched_at timestamptz not null default now(),
  enabled boolean not null default false
);
insert into public.onboarding_email_campaign (id) values (true);
alter table public.onboarding_email_campaign enable row level security;
revoke all on public.onboarding_email_campaign from anon, authenticated;
grant all on public.onboarding_email_campaign to service_role;

create table public.onboarding_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('aircraft', 'logbooks', 'extract', 'review', 'success')),
  is_catchup boolean not null default false,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, stage)
);
create unique index onboarding_email_one_catchup_idx
  on public.onboarding_email_log (user_id) where is_catchup;
create index onboarding_email_log_user_sent_idx
  on public.onboarding_email_log (user_id, sent_at);
alter table public.onboarding_email_log enable row level security;
revoke all on public.onboarding_email_log from anon, authenticated;
grant all on public.onboarding_email_log to service_role;

-- The public unsubscribe link is a random token, not a login session. Only
-- onboarding is disabled; maintenance reminders retain their own preference.
create function public.unsubscribe_onboarding_email(p_token uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  update public.profile set onboarding_opt_out = true
  where onboarding_unsubscribe_token = p_token;
  return found;
end;
$$;
revoke all on function public.unsubscribe_onboarding_email(uuid) from public, anon, authenticated;
grant execute on function public.unsubscribe_onboarding_email(uuid) to service_role;

-- One row per candidate. Demo/shared aircraft do not count as setup.
create function public.onboarding_email_candidates(p_preview boolean default false)
returns table (
  user_id uuid, email text, full_name text, unsubscribe_token uuid,
  stage text, is_catchup boolean, aircraft_id uuid, tail_number text
)
language sql stable security invoker set search_path = public
as $$
  with progress as (
    select p.id, p.email, p.full_name, p.onboarding_unsubscribe_token,
      p.created_at, p.created_at < campaign.launched_at as catchup,
      first_aircraft.id as first_id, first_aircraft.tail_number as first_tail,
      first_aircraft.created_at as first_created,
      pending_aircraft.id as pending_id, pending_aircraft.tail_number as pending_tail,
      unextracted_aircraft.id as unextracted_id, unextracted_aircraft.tail_number as unextracted_tail,
      exists (
        select 1 from public.aircraft a join public.page pg on pg.aircraft_id = a.id
        where a.owner_id = p.id and not a.is_demo
      ) as has_page,
      exists (
        select 1 from public.aircraft a join public.log_entry e on e.aircraft_id = a.id
        where a.owner_id = p.id and not a.is_demo
      ) as has_entry,
      exists (
        select 1 from public.aircraft a join public.log_entry e on e.aircraft_id = a.id
        where a.owner_id = p.id and not a.is_demo and e.owner_confirmed
      ) as has_confirmed
    from public.profile p
    cross join public.onboarding_email_campaign campaign
    left join lateral (
      select a.id, a.tail_number, a.created_at from public.aircraft a
      where a.owner_id = p.id and not a.is_demo
      order by a.created_at, a.id limit 1
    ) first_aircraft on true
    left join lateral (
      select a.id, a.tail_number from public.aircraft a
      join public.page pg on pg.aircraft_id = a.id
      join public.log_entry e on e.page_id = pg.id and not e.owner_confirmed
      where a.owner_id = p.id and not a.is_demo
        and pg.extraction_status = 'extracted'
        and pg.updated_at <= now() - interval '24 hours'
      order by pg.updated_at, pg.id limit 1
    ) pending_aircraft on true
    left join lateral (
      select a.id, a.tail_number from public.aircraft a
      join public.page pg on pg.aircraft_id = a.id
      where a.owner_id = p.id and not a.is_demo
        and pg.extraction_status in ('pending', 'failed')
        and pg.created_at <= now() - interval '24 hours'
      order by pg.created_at, pg.id limit 1
    ) unextracted_aircraft on true
    where (campaign.enabled or p_preview) and not p.is_admin and not p.onboarding_opt_out
      and p.email is not null
  )
  select progress.id, progress.email, progress.full_name,
    progress.onboarding_unsubscribe_token, chosen.stage, progress.catchup,
    case when chosen.stage = 'review' then progress.pending_id
      when chosen.stage = 'extract' then progress.unextracted_id else progress.first_id end,
    case when chosen.stage = 'review' then progress.pending_tail
      when chosen.stage = 'extract' then progress.unextracted_tail else progress.first_tail end
  from progress
  cross join lateral (
    select case
      when progress.catchup then case
        when progress.first_id is null and progress.created_at <= now() - interval '24 hours' then 'aircraft'
        when not progress.has_page and not progress.has_entry
          and progress.first_created <= now() - interval '7 days' then 'logbooks'
        when progress.pending_id is not null and not progress.has_confirmed then 'review'
        when progress.unextracted_id is not null and not progress.has_confirmed then 'extract'
      end
      when progress.has_confirmed then 'success'
      when progress.pending_id is not null then 'review'
      when progress.unextracted_id is not null then 'extract'
      when progress.first_id is not null and not progress.has_page and not progress.has_entry
        and progress.first_created <= now() - interval '7 days' then 'logbooks'
      when progress.first_id is null and progress.created_at <= now() - interval '24 hours'
        then 'aircraft'
    end as stage
  ) chosen
  where chosen.stage is not null
    and not exists (
      select 1 from public.onboarding_email_log l
      where l.user_id = progress.id and l.stage = chosen.stage
    )
    and (not progress.catchup or not exists (
      select 1 from public.onboarding_email_log l
      where l.user_id = progress.id and l.is_catchup
    ))
    and (chosen.stage = 'success' or (
      (select count(*) from public.onboarding_email_log l
       where l.user_id = progress.id and l.stage <> 'success') < 3
      and not exists (
        select 1 from public.onboarding_email_log l
        where l.user_id = progress.id and l.sent_at > now() - interval '3 days'
      )
    ));
$$;
revoke all on function public.onboarding_email_candidates(boolean) from public, anon, authenticated;
grant execute on function public.onboarding_email_candidates(boolean) to service_role;
