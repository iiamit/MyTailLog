-- ===========================================================================
-- Let a user remove a shared aircraft from their own dashboard.
--
-- Reported by a beta user who couldn't get rid of the demo aircraft. He wasn't
-- missing anything: the demo is auto-shared READ-ONLY with every new account
-- (0026), he is a viewer rather than the owner, and `share_self_select` (0015)
-- let him SEE his grant but never drop it. There was no way out.
--
-- Deleting your own grant is not a privileged act — it removes your access,
-- nobody else's, and it cannot touch the aircraft or its records. The owner's
-- `share_owner_all` policy is untouched, so an owner can still revoke and
-- re-invite.
--
-- Scoped by the SAME lower(email) comparison share_self_select uses, so a user
-- can only ever delete a row addressed to them.
-- ===========================================================================

drop policy if exists share_self_delete on aircraft_share;
create policy share_self_delete on aircraft_share for delete
  using (lower(invited_email) = lower(auth.jwt() ->> 'email'));
