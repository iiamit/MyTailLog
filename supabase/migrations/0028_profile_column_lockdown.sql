-- ===========================================================================
-- Lock down profile self-updates (fixes privilege escalation).
--
-- profile_self_update (0001) gates the ROW (id = auth.uid()) but has no
-- column restriction, and Supabase grants UPDATE on every column of
-- public.profile to the `authenticated` role by default. A signed-in user
-- could therefore PATCH their own row directly via PostgREST and set
-- is_admin = true (self-promotion → /admin, which reads every user's email via
-- the service client) or rewrite their own email. Restrict the grant to the
-- columns a user may actually edit, and add a defensive WITH CHECK.
--
-- email is kept in sync from auth.users by the sync_profile_email trigger
-- (0024, SECURITY DEFINER) — the trigger's owner privileges are unaffected by
-- revoking the authenticated grant, so sync still works.
-- ===========================================================================

revoke update on public.profile from authenticated;
grant update (full_name, cert_number, preferences) on public.profile to authenticated;

alter policy profile_self_update on profile
  using (id = auth.uid())
  with check (id = auth.uid());
