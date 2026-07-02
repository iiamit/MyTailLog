-- ===========================================================================
-- MyTailLog — Full-text search over log entries (Phase 1, step 6).
--
-- The narrative full-text index already exists (log_entry_fts_idx in 0001).
-- This function's tsvector expression is written to match that index EXACTLY so
-- the planner can use it. SECURITY INVOKER (the default) means row-level
-- security still applies — a caller only ever searches their own aircraft's
-- entries — so the aircraft filter below just narrows to one aircraft.
-- ===========================================================================

create or replace function search_log_entries(target_aircraft uuid, q text)
returns setof log_entry
language sql
stable
as $$
  select *
  from log_entry
  where aircraft_id = target_aircraft
    and length(btrim(q)) > 0
    and to_tsvector('english',
          coalesce(description,'') || ' ' || coalesce(work_performed,'') || ' ' || coalesce(parts,''))
        @@ websearch_to_tsquery('english', q)
  order by entry_date desc nulls last, created_at desc;
$$;

grant execute on function search_log_entries(uuid, text) to authenticated, anon;
