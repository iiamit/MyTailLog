-- ===========================================================================
-- MyTailLog — Weight & Balance revision history (Phase 2, step 10).
--
-- An index of the aircraft's W&B revisions over time (empty weight, CG arm,
-- moment), NOT a load calculator or the legal W&B record. The current W&B is
-- the latest revision. Decision-support value: flag equipment changes (from the
-- log-derived component list) that postdate the last W&B revision — a common
-- records gap (avionics swapped, W&B never recomputed).
-- ===========================================================================

create table weight_balance (
  id                   uuid primary key default gen_random_uuid(),
  aircraft_id          uuid not null references aircraft(id) on delete cascade,
  revision_date        date not null,
  empty_weight         numeric(10,2),   -- lbs
  empty_weight_arm     numeric(10,3),   -- inches aft of datum (CG)
  empty_weight_moment  numeric(14,2),   -- lb-in (= weight * arm)
  max_gross_weight     numeric(10,2),   -- lbs, from the TCDS (optional)
  method               text check (method in ('weighed', 'computed')),
  reference            text,            -- source doc / Form 337 number
  reason               text,            -- what changed at this revision
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index weight_balance_aircraft_idx on weight_balance(aircraft_id, revision_date);
create trigger weight_balance_updated_at before update on weight_balance
  for each row execute function set_updated_at();

-- RLS: read = access, write = editor/owner (matches the multi-user model).
alter table weight_balance enable row level security;
create policy weight_balance_read on weight_balance for select
  using (has_aircraft_access(aircraft_id));
create policy weight_balance_insert on weight_balance for insert
  with check (can_edit_aircraft(aircraft_id));
create policy weight_balance_update on weight_balance for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy weight_balance_delete on weight_balance for delete
  using (can_edit_aircraft(aircraft_id));
