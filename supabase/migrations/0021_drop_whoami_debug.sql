-- ===========================================================================
-- Remove the temporary whoami() diagnostic added in 0020. The enroll RLS issue
-- was diagnosed (an INSERT ... RETURNING tripping the aircraft SELECT policy,
-- fixed in app code by not returning the inserted row), so this is no longer
-- needed. Non-urgent cleanup — safe to run any time.
-- ===========================================================================

drop function if exists public.whoami();
