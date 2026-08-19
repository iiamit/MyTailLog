-- OpenAI support: provider-tagged usage, provider-aware BYOK, and an admin-
-- controlled shared provider. Platform API keys stay in deployment secrets.

alter table public.ai_usage
  add column provider text not null default 'anthropic'
  check (provider in ('anthropic', 'openai'));

alter table private.user_ai_key
  add column provider text not null default 'anthropic'
  check (provider in ('anthropic', 'openai'));

create table public.app_setting (
  key text primary key,
  value text not null check (value in ('anthropic', 'openai', 'disabled')),
  updated_at timestamptz not null default now()
);
alter table public.app_setting enable row level security;
revoke all on public.app_setting from anon, authenticated;
grant all on public.app_setting to service_role;

insert into public.app_setting (key, value)
values ('shared_ai_provider', 'anthropic');

create or replace function public.my_ai_key_metadata()
returns jsonb
language sql
security definer
set search_path = private, public
stable
as $$
  select jsonb_build_object('provider', provider, 'last4', key_last4)
  from private.user_ai_key where user_id = auth.uid();
$$;
revoke all on function public.my_ai_key_metadata() from public, anon;
grant execute on function public.my_ai_key_metadata() to authenticated;

create or replace function public.ai_key_provider(p_user_id uuid)
returns text
language sql
security definer
set search_path = private, public
stable
as $$
  select provider from private.user_ai_key where user_id = p_user_id;
$$;

create or replace function public.upsert_ai_key_v2(
  p_user_id uuid, p_provider text, p_cipher text, p_last4 text
)
returns void
language sql
security definer
set search_path = private, public
as $$
  insert into private.user_ai_key (user_id, provider, key_cipher, key_last4, updated_at)
  values (p_user_id, p_provider, p_cipher, p_last4, now())
  on conflict (user_id) do update set
    provider = excluded.provider,
    key_cipher = excluded.key_cipher,
    key_last4 = excluded.key_last4,
    updated_at = now();
$$;

revoke all on function public.ai_key_provider(uuid) from public, anon, authenticated;
revoke all on function public.upsert_ai_key_v2(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_key_provider(uuid) to service_role;
grant execute on function public.upsert_ai_key_v2(uuid, text, text, text) to service_role;

create function public.reserve_ai_call_v2(
  p_user_id uuid,
  p_cap integer,
  p_usd_cap numeric,
  p_own_key boolean,
  p_estimate numeric,
  p_provider text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_count integer;
  v_spent numeric;
begin
  perform pg_advisory_xact_lock(hashtext('ai_reserve:' || p_user_id::text));
  delete from ai_usage
    where route = '__reserve__' and created_at < now() - interval '15 minutes';

  select count(*) into v_count from ai_usage
    where user_id = p_user_id and created_at > now() - interval '24 hours';
  if v_count >= p_cap then return null; end if;

  if not p_own_key and p_usd_cap > 0 then
    select coalesce(sum(cost_usd), 0) into v_spent from ai_usage
      where used_own_key = false and created_at > now() - interval '24 hours';
    if v_spent >= p_usd_cap then return null; end if;
  end if;

  insert into ai_usage (user_id, route, model, cost_usd, used_own_key, provider)
    values (p_user_id, '__reserve__', '__reserve__',
            case when p_own_key then 0 else p_estimate end, p_own_key, p_provider)
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_ai_call_v2(uuid, integer, numeric, boolean, numeric, text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_call_v2(uuid, integer, numeric, boolean, numeric, text)
  to service_role;
