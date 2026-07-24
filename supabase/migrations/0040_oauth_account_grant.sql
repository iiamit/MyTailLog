-- ===========================================================================
-- Account-wide OAuth grants ("all my aircraft, now and future").
--
-- oauth_aircraft_grant restricts a client to a fixed set of aircraft chosen at
-- consent time, so an aircraft added later is invisible until the owner
-- re-consents (reported by MFB). This adds an OPT-IN account-level grant: one
-- row per (account, client) meaning "this client may access every aircraft I
-- own." The Resource Server checks it first and, when present, returns all
-- currently-owned aircraft — and it STILL re-verifies live ownership on every
-- read, so a transferred-away aircraft drops off exactly as before.
--
-- No per-aircraft ownership check is needed in RLS here (the grant is account-
-- scoped, not aircraft-scoped); ownership is enforced at read time by the RS.
-- ===========================================================================

create table if not exists oauth_account_grant (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users on delete cascade,
  client_id text not null references oauth_client(client_id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (account_id, client_id)
);

create index if not exists oauth_account_grant_lookup_idx
  on oauth_account_grant(client_id, account_id);

alter table oauth_account_grant enable row level security;

create policy oauth_account_grant_select on oauth_account_grant for select
  using (account_id = auth.uid());
create policy oauth_account_grant_insert on oauth_account_grant for insert
  with check (account_id = auth.uid());
create policy oauth_account_grant_update on oauth_account_grant for update
  using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy oauth_account_grant_delete on oauth_account_grant for delete
  using (account_id = auth.uid());
