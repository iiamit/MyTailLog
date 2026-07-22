-- ===========================================================================
-- Atomic AI-call reservation (fixes H1: check-then-act budget race).
--
-- prepareAi() previously read the per-user 24h call count and the shared-key $
-- total, THEN ran the model, THEN wrote the ledger row. N concurrent requests
-- all pass the gate before any of them records usage, so a single signed-in user
-- could fan out unbounded paid calls and blow past both the per-user cap and the
-- global AI_SHARED_DAILY_USD ceiling.
--
-- reserve_ai_call() closes the race: it takes a per-user transactional advisory
-- lock (so concurrent reservations for the same user serialize — a plain
-- INSERT ... WHERE count < cap under READ COMMITTED would let two racing calls
-- both pass at the boundary), re-checks both caps, and inserts a reservation row
-- atomically. The reservation carries an estimated cost so in-flight shared-key
-- calls count toward the $ ceiling (shared_key_cost_today already sums cost_usd);
-- the caller replaces it with the real usage row and deletes the reservation
-- when the request finishes (releaseAiReservation).
--
-- SECURITY DEFINER because it writes ai_usage, whose client insert is revoked
-- (0032). Callable ONLY by the service role — the app calls it via the
-- service-role client with a server-trusted user_id and server-set caps, so a
-- signed-in user has no path to reserve for someone else or forge caps.
-- ===========================================================================

create or replace function reserve_ai_call(
  p_user_id uuid,
  p_cap integer,
  p_usd_cap numeric,
  p_own_key boolean,
  p_estimate numeric
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
  -- Serialize reservations for THIS user so the checks + insert are atomic.
  -- Lock is released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext('ai_reserve:' || p_user_id::text));

  -- Self-heal: drop any reservation rows a crashed request never released. The
  -- 15-minute floor is safely above the longest AI request (maxDuration 300s),
  -- so a live reservation is never swept.
  delete from ai_usage
    where route = '__reserve__' and created_at < now() - interval '15 minutes';

  select count(*) into v_count from ai_usage
    where user_id = p_user_id and created_at > now() - interval '24 hours';
  if v_count >= p_cap then
    return null; -- per-user daily call cap reached
  end if;

  if not p_own_key and p_usd_cap > 0 then
    select coalesce(sum(cost_usd), 0) into v_spent from ai_usage
      where used_own_key = false and created_at > now() - interval '24 hours';
    if v_spent >= p_usd_cap then
      return null; -- global shared-key $ ceiling reached
    end if;
  end if;

  insert into ai_usage (user_id, route, model, cost_usd, used_own_key)
    values (p_user_id, '__reserve__', '__reserve__',
            case when p_own_key then 0 else p_estimate end, p_own_key)
    returning id into v_id;
  return v_id;
end;
$$;

revoke all on function reserve_ai_call(uuid, integer, numeric, boolean, numeric) from public, anon, authenticated;
grant execute on function reserve_ai_call(uuid, integer, numeric, boolean, numeric) to service_role;
