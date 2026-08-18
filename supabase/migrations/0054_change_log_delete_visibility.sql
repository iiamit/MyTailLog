-- ===========================================================================
-- change_log: make a DELETED aircraft's tombstone readable by its former owner.
--
-- change_log exists so hard deletes can propagate to the offline client — its
-- own header says "DELETE rows persist after the underlying row is gone, so the
-- client can propagate deletions". They do persist. They were just never
-- READABLE, because the read policy resolves access through the row the delete
-- had removed:
--
--   using (has_aircraft_access(aircraft_id))
--     -> exists (select 1 from aircraft where id = target and owner_id = auth.uid())
--        or exists (select 1 from aircraft_share where aircraft_id = target and ...)
--
-- Delete the aircraft and both clauses are false forever, so the one row that
-- announces the deletion is hidden from the one device that needs it. The
-- aircraft then lives on the phone permanently — reported from the field as the
-- demo plane surviving a full sync.
--
-- Deleting a CHILD row was always fine (the aircraft still exists, so access
-- still resolves), which is why this went unnoticed.
--
-- Fix: stamp the owner onto the aircraft's own change_log rows at trigger time,
-- where OLD still carries owner_id, and let the policy fall back to it. The
-- stamp is a snapshot, so it is deliberately NOT the primary clause: a snapshot
-- alone would break newly-shared users, who must be able to read change rows
-- written before the share existed. Live access first, snapshot as the fallback
-- that survives the row's death.
-- ===========================================================================

alter table change_log add column owner_id uuid;

-- Only the `aircraft` table's own rows carry it. Child tables gain nothing from
-- a stamp: while the aircraft exists they are already covered by live access,
-- and once it is gone the parent's tombstone is what the client acts on (it
-- cascades the deletion locally). Keeping the lookup off the child path also
-- keeps the write hot path — bulk page imports — free of an extra query.
create or replace function log_change() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  col text  := coalesce(tg_argv[0], 'aircraft_id');
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into change_log (table_name, row_id, op, aircraft_id, owner_id)
  values (
    tg_table_name,
    (rec ->> 'id')::uuid,
    left(tg_op, 1),
    (rec ->> col)::uuid,
    -- OLD still has owner_id on a DELETE, which is the whole point.
    case when tg_table_name = 'aircraft' then (rec ->> 'owner_id')::uuid end
  );
  return coalesce(new, old);
end;
$$;

-- Backfill live aircraft so an owner who deletes one TODAY still gets the
-- tombstone: the D row is new, but rows written before this migration have a
-- null stamp and the delete would fall back to nothing for the history. (The
-- tombstone itself is what matters, and it will be stamped — this is belt and
-- braces for feeds that replay from an old cursor.)
update change_log c
   set owner_id = a.owner_id
  from aircraft a
 where c.table_name = 'aircraft'
   and c.row_id = a.id
   and c.owner_id is null;

create index change_log_owner_idx on change_log (owner_id) where owner_id is not null;

drop policy change_log_read on change_log;

create policy change_log_read on change_log
  for select using (
    has_aircraft_access(aircraft_id)
    -- The aircraft is gone; only the stamp can still prove this feed was yours.
    or owner_id = auth.uid()
  );

-- KNOWN GAP, deliberately not closed here: when an owner deletes an aircraft
-- that was SHARED, the share rows cascade away at the same moment, so a viewer's
-- device never learns of the deletion and keeps its stale copy. Closing it needs
-- the viewer set snapshotted at delete time (or retained share tombstones), which
-- is a bigger change than the reported bug warrants. It is also the existing
-- behaviour for share REVOCATION, so it is one gap and not two.
