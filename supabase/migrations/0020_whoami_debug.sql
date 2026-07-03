-- ===========================================================================
-- TEMPORARY diagnostic: expose auth.uid() to the app so we can see exactly what
-- identity the server actions carry into the database (debugging the enroll
-- "new row violates row-level security policy" failure). Safe — it only returns
-- the caller's own uid. REMOVE with 0021 once the enroll issue is resolved:
--   drop function if exists public.whoami();
-- ===========================================================================

create or replace function public.whoami()
returns uuid
language sql
stable
as $$ select auth.uid() $$;

grant execute on function public.whoami() to authenticated, anon;
