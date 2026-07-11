-- ===========================================================================
-- SECURITY FIX (O1/O3) — bind per-aircraft OAuth consent to OWNED aircraft.
--
-- oauth_aircraft_grant is the Resource Server's entire authorization boundary,
-- and the RS reads aircraft data with a service client that BYPASSES RLS. The
-- original insert/update policies only checked `account_id = auth.uid()` — i.e.
-- the row belongs to the acting user — but NOT that the user owns the aircraft.
-- So a user could register their own OAuth client, tamper the consent form to
-- submit any aircraft UUID, insert a grant (RLS passed on account_id), and then
-- read that aircraft's data through the API: cross-tenant data exposure, and a
-- share-revocation bypass (a previously-shared viewer knows the UUID).
--
-- Tighten both policies to require the acting user to OWN the aircraft. This is
-- the authoritative fix; the app also filters submitted ids to owned before
-- insert, and the RS re-verifies live ownership at read time (defense in depth).
-- ===========================================================================

alter policy oauth_grant_insert on oauth_aircraft_grant
  with check (
    account_id = auth.uid()
    and exists (
      select 1 from aircraft a
      where a.id = oauth_aircraft_grant.aircraft_id and a.owner_id = auth.uid()
    )
  );

alter policy oauth_grant_update on oauth_aircraft_grant
  using (account_id = auth.uid())
  with check (
    account_id = auth.uid()
    and exists (
      select 1 from aircraft a
      where a.id = oauth_aircraft_grant.aircraft_id and a.owner_id = auth.uid()
    )
  );
