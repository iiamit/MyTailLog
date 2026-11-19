-- ===========================================================================
-- 0086 — Sync protocol v2 and the server reading queue (09 §3.9.1, §5.3–5.5;
-- 13-build-plan.md phase 3). Additive only: v1 sync and the Capacitor app are
-- untouched.
--
-- sync_mutation: the push ledger, one row per (user, mutation id) the v2 push
--   has answered. It makes a retry of an accepted mutation an exact no-op
--   (instead of v1's compare-by-value) and is the server's conflict record: a
--   `conflict` row stays open until the same mutation is re-pushed and lands
--   ("Keep mine" / "Keep both") or the device reports "Take theirs" / discard.
--   It holds no copy of the conflicting row — the device has that.
-- page.queued_by / read_attempts / read_after: who pays the AI allowance for a
--   queued page, how many times the worker has tried it, and when a page that
--   is `waiting_allowance` may be tried again (09 §3.9.1 `retry_after`).
-- claim_reading_pages(): the worker's atomic claim (skip locked), service role only.
-- ===========================================================================

create table sync_mutation (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  aircraft_id uuid references aircraft(id) on delete cascade,
  type text not null check (length(type) <= 64),
  status text not null check (status in ('ok', 'conflict', 'error')),
  base timestamptz,
  error text check (length(error) <= 1000),
  code text check (length(code) <= 64),
  resolution text check (resolution in ('keep_mine', 'keep_both', 'take_theirs', 'discard')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index sync_mutation_open_idx on sync_mutation (user_id, created_at)
  where status = 'conflict' and resolved_at is null;
create index sync_mutation_aircraft_idx on sync_mutation (aircraft_id);

create trigger sync_mutation_updated_at before update on sync_mutation
  for each row execute function set_updated_at();

alter table sync_mutation enable row level security;
create policy sync_mutation_self on sync_mutation for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on sync_mutation from anon;
grant select, insert, update on sync_mutation to authenticated;

alter table page
  add column queued_by uuid references auth.users(id) on delete set null,
  add column read_attempts int not null default 0,
  add column read_after timestamptz;

-- Claim up to p_limit pages for reading, oldest first: queued pages with no
-- open duplicate question, allowance waits whose time has come, and pages a
-- worker claimed but never finished (killed mid-read) after 15 minutes.
-- Legacy synchronous reads (read_attempts = 0) are never reclaimed.
create or replace function claim_reading_pages(p_limit integer)
returns setof page
language sql
security definer
set search_path = public
as $$
  update page p
     set extraction_status = 'processing',
         read_attempts = p.read_attempts + 1,
         read_after = null,
         extraction_error = null
   where p.id in (
     select q.id from page q
      where (q.extraction_status = 'queued' and q.duplicate_of_page_id is null)
         or (q.extraction_status = 'waiting_allowance' and coalesce(q.read_after, now()) <= now())
         or (q.extraction_status = 'processing' and q.read_attempts > 0 and q.updated_at < now() - interval '15 minutes')
      order by q.created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked)
  returning p.*;
$$;
revoke all on function claim_reading_pages(integer) from public, anon, authenticated;
grant execute on function claim_reading_pages(integer) to service_role;
