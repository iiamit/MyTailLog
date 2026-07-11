-- ===========================================================================
-- OAuth API provider foundation (see docs/oauth-api-plan.md).
--
-- MyTailLog becomes an OAuth 2.1 Authorization Server (Panva oidc-provider) +
-- Resource Server so third-party apps can pull a user's per-aircraft
-- airworthiness data with consent. This migration is the data model only; the
-- provider wiring, consent UI, and API endpoints come in later phases.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- oidc_payloads — Panva oidc-provider's adapter storage (Clients, Grants,
-- Sessions, AccessTokens, AuthorizationCodes, RefreshTokens, Interactions, …).
-- Written ONLY by the server-side provider (service role); no client access.
-- (Column set follows the reference Postgres adapter; adjust in P1b if the
-- pinned oidc-provider version differs — additive.)
-- ---------------------------------------------------------------------------
create table if not exists oidc_payloads (
  id text not null,
  type text not null,          -- the oidc-provider model name
  payload jsonb,
  grant_id text,
  user_code text,
  uid text,
  expires_at timestamptz,
  consumed_at timestamptz,
  primary key (id, type)
);
create index if not exists oidc_payloads_grant_idx on oidc_payloads(grant_id);
create index if not exists oidc_payloads_user_code_idx on oidc_payloads(user_code);
create index if not exists oidc_payloads_uid_idx on oidc_payloads(uid);
create index if not exists oidc_payloads_expires_idx on oidc_payloads(expires_at);

alter table oidc_payloads enable row level security;
revoke all on oidc_payloads from authenticated, anon;
-- No policies → default-deny for authenticated/anon; the service role (provider)
-- bypasses RLS. Nothing client-side ever touches this table.

-- ---------------------------------------------------------------------------
-- oauth_client — self-serve registered third-party apps (developer portal is the
-- source of truth; the provider's client store reads from here). The secret is
-- hashed (shown once at creation); redirect URIs are an exact-match allowlist.
-- ---------------------------------------------------------------------------
create table if not exists oauth_client (
  client_id text primary key default replace(gen_random_uuid()::text, '-', ''),
  client_secret_hash text,                 -- confidential clients only; hashed
  name text not null,
  redirect_uris text[] not null default '{}',
  scopes text[] not null default '{}',     -- scopes this client may request
  is_confidential boolean not null default true,
  owner_id uuid not null references auth.users on delete cascade, -- the developer
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists oauth_client_owner_idx on oauth_client(owner_id);

alter table oauth_client enable row level security;
-- Developers manage their own registered apps. The secret hash is useless to a
-- client (never the plaintext); the portal simply doesn't display it.
create policy oauth_client_select on oauth_client for select using (owner_id = auth.uid());
create policy oauth_client_insert on oauth_client for insert with check (owner_id = auth.uid());
create policy oauth_client_update on oauth_client for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy oauth_client_delete on oauth_client for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- oauth_aircraft_grant — the PER-AIRCRAFT consent. One row per (account, client,
-- aircraft) with the granted scopes. The Resource Server authorizes every API
-- call against this (token's user+client must have the aircraft with the scope).
-- ---------------------------------------------------------------------------
create table if not exists oauth_aircraft_grant (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users on delete cascade, -- aircraft owner who consented
  client_id text not null references oauth_client(client_id) on delete cascade,
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (account_id, client_id, aircraft_id)
);
create index if not exists oauth_grant_account_idx on oauth_aircraft_grant(account_id);
create index if not exists oauth_grant_lookup_idx on oauth_aircraft_grant(client_id, aircraft_id);

alter table oauth_aircraft_grant enable row level security;
-- The aircraft owner manages their own consents (view + revoke in "Connected
-- apps"). Grants are created during the consent flow with check on the owner.
create policy oauth_grant_select on oauth_aircraft_grant for select using (account_id = auth.uid());
create policy oauth_grant_insert on oauth_aircraft_grant for insert with check (account_id = auth.uid());
create policy oauth_grant_update on oauth_aircraft_grant for update
  using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy oauth_grant_delete on oauth_aircraft_grant for delete using (account_id = auth.uid());

-- ---------------------------------------------------------------------------
-- oauth_access_log — audit: which client read which aircraft/scope, when.
-- Service-role writes; the owner can read their own access history.
-- ---------------------------------------------------------------------------
create table if not exists oauth_access_log (
  id uuid primary key default gen_random_uuid(),
  client_id text,
  account_id uuid,
  aircraft_id uuid,
  scope text,
  path text,
  created_at timestamptz not null default now()
);
create index if not exists oauth_access_log_account_idx on oauth_access_log(account_id, created_at desc);

alter table oauth_access_log enable row level security;
create policy oauth_access_log_select on oauth_access_log for select using (account_id = auth.uid());
-- No insert policy for authenticated: written only by the service role.
