-- ===========================================================================
-- Global daily budget guard for the SHARED Anthropic key.
--
-- The per-user cap (in app code) bounds one user; it does NOT bound your total
-- spend across all users on the shared key. This function returns the total
-- estimated USD spent on the shared key in the last 24h so prepareAi() can stop
-- shared-key calls once a configurable daily ceiling is hit.
--
-- SECURITY DEFINER because the sum spans EVERY user's ai_usage rows, which the
-- ai_usage RLS policy (own rows only) would otherwise hide. It returns a single
-- scalar — no row data leaks — and is granted to authenticated users only.
-- ===========================================================================

create or replace function shared_key_cost_today()
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(cost_usd), 0)::numeric
  from ai_usage
  where used_own_key = false
    and created_at > now() - interval '24 hours';
$$;

revoke all on function shared_key_cost_today() from public;
grant execute on function shared_key_cost_today() to authenticated;
