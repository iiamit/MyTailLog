-- ===========================================================================
-- 0060 — scope the global (null-aircraft) change feed to references you use.
--
-- 0058 put ad_reference into the change feed and admitted its change rows with
--     (aircraft_id is null and auth.uid() is not null)
-- i.e. every signed-in user. ad_reference has been world-writable since 0008
-- (`ad_reference_insert ... with check (true)`, `ad_reference_update ... using
-- (true)`) because it is a shared cache any user may fill from the Federal
-- Register. Before 0058 a forged or altered row only reached users whose own
-- ad_compliance pointed at it. After 0058 it reached EVERY device: one
-- PostgREST insert appended a change row that every other user's next
-- /api/sync/pull fetched and wrote into its local mirror, where the compliance
-- screen renders the title and abstract as official AD text — and N inserts
-- made every device in the fleet download and store N rows.
--
-- The fix is the feed, not the cache: a global change row is visible only to
-- users whose own compliance records actually reference that row. An AD nobody
-- linked is nobody's business, and the lookup that links one is an idempotent
-- upsert on ad_number, so the reference arrives the moment it is used.
--
-- NOT fixed here, and pre-existing: any signed-in user can still rewrite the
-- text of an ad_reference row that IS referenced. Closing that means moving
-- lib/writes/compliance.ts's upsert off the caller's client onto an admin one,
-- which is a change to a write path, not to a policy — its own PR.
-- ===========================================================================

-- security definer: change_log's policy must see ad_compliance rows across the
-- join without recursing into that table's own RLS. stable + one indexed
-- lookup per candidate row, and only for the null-aircraft rows.
create or replace function ad_reference_is_mine(ref uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from ad_compliance c
    where c.ad_reference_id = ref
      and has_aircraft_access(c.aircraft_id)
  );
$$;

create index if not exists ad_compliance_ad_reference_idx on ad_compliance(ad_reference_id);

drop policy change_log_read on change_log;
create policy change_log_read on change_log
  for select using (
    -- Global reference rows: only those an aircraft you can see refers to.
    (aircraft_id is null and ad_reference_is_mine(row_id))
    or has_aircraft_access(aircraft_id)
    -- The aircraft is gone; only the stamp can still prove this feed was yours.
    or owner_id = auth.uid()
  );
