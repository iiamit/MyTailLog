-- ===========================================================================
-- MyFlightBook credentials: move the ciphertext out of PostgREST's reach, the
-- same fix 0039 applied to the BYOK Anthropic key.
--
-- mfb_connection holds each user's OWN MyFlightBook OAuth client_secret + access
-- / refresh tokens, encrypted at rest (AES-256-GCM, 0022 + retrofit 9f0098c).
-- But RLS only scopes ROWS, not COLUMNS: the browser `authenticated` role could
-- SELECT client_secret / access_token / refresh_token for its own row straight
-- through PostgREST (profile/page.tsx even fetched them by name). A column-level
-- `revoke select` does NOT hold in Supabase — a table-level grant silently
-- re-includes every column (see 0039's note). So, exactly like user_ai_key:
-- relocate the whole table to the `private` schema PostgREST does not expose, and
-- gate ALL access through SECURITY DEFINER functions.
--
--   Browser (authenticated):  my_mfb_status()       — non-secret state only
--   Service role only:        mfb_conn_secrets()     — the decryptable row
--                             upsert_mfb_credentials / set_mfb_tokens /
--                             disconnect_mfb / mfb_conns_to_sync /
--                             stamp_mfb_synced / set_mfb_client_secret
--
-- The ciphertext and ENCRYPTION_KEY are UNCHANGED — every stored secret still
-- decrypts exactly as before. No user re-entry or key rotation.
-- ===========================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Relocate the table (rows, constraints, the user_id unique index, RLS policies
-- and the auth.users FK all come along). The policies are now moot for the
-- browser role — it can't reach the schema at all — but harmless.
alter table public.mfb_connection set schema private;

-- Browser-facing: non-secret state only, the caller's own row. `connected` = we
-- hold a live access token; `has_secret` = the user configured a client secret.
create or replace function public.my_mfb_status()
returns table (client_id text, mfb_username text, connected boolean, has_secret boolean)
language sql security definer set search_path = private, public stable
as $$
  select client_id, mfb_username,
         access_token is not null as connected,
         client_secret is not null as has_secret
  from private.mfb_connection where user_id = auth.uid();
$$;
revoke all on function public.my_mfb_status() from public, anon;
grant execute on function public.my_mfb_status() to authenticated;

-- Service-only: the full (still-encrypted) credential row for one user.
create or replace function public.mfb_conn_secrets(p_user_id uuid)
returns table (client_id text, client_secret text, access_token text, refresh_token text, token_expires_at timestamptz)
language sql security definer set search_path = private, public stable
as $$
  select client_id, client_secret, access_token, refresh_token, token_expires_at
  from private.mfb_connection where user_id = p_user_id;
$$;

-- Service-only: upsert the app credentials. The secret is only overwritten when
-- a new ciphertext is supplied (p_client_secret_cipher NULL = keep existing).
create or replace function public.upsert_mfb_credentials(
  p_user_id uuid, p_client_id text, p_mfb_username text, p_client_secret_cipher text)
returns void language sql security definer set search_path = private, public
as $$
  insert into private.mfb_connection (user_id, client_id, mfb_username, client_secret, updated_at)
  values (p_user_id, p_client_id, p_mfb_username, p_client_secret_cipher, now())
  on conflict (user_id) do update set
    client_id = excluded.client_id,
    mfb_username = excluded.mfb_username,
    -- keep the existing secret when none supplied; bare relation name = the
    -- conflicting row (schema-qualifying it here is a parse error).
    client_secret = coalesce(excluded.client_secret, mfb_connection.client_secret),
    updated_at = now();
$$;

-- Service-only: store freshly issued / refreshed tokens. p_mark_connected stamps
-- connected_at on the initial OAuth connect; a background refresh leaves it.
create or replace function public.set_mfb_tokens(
  p_user_id uuid, p_access text, p_refresh text, p_expires_at timestamptz, p_mark_connected boolean)
returns void language sql security definer set search_path = private, public
as $$
  update private.mfb_connection set
    access_token = p_access,
    refresh_token = p_refresh,
    token_expires_at = p_expires_at,
    connected_at = case when p_mark_connected then now() else connected_at end,
    updated_at = now()
  where user_id = p_user_id;
$$;

-- Service-only: disconnect (clear tokens, keep the app credentials).
create or replace function public.disconnect_mfb(p_user_id uuid)
returns void language sql security definer set search_path = private, public
as $$
  update private.mfb_connection set
    access_token = null, refresh_token = null, token_expires_at = null,
    connected_at = null, updated_at = now()
  where user_id = p_user_id;
$$;

-- Service-only: connections due for the daily hours sync (those holding a token).
create or replace function public.mfb_conns_to_sync()
returns table (user_id uuid, last_synced_at timestamptz)
language sql security definer set search_path = private, public stable
as $$
  select user_id, last_synced_at from private.mfb_connection where access_token is not null;
$$;

-- Service-only: stamp a clean sync run (so an MFB outage is retried next day).
create or replace function public.stamp_mfb_synced(p_user_id uuid)
returns void language sql security definer set search_path = private, public
as $$
  update private.mfb_connection set last_synced_at = now() where user_id = p_user_id;
$$;

-- Service-only: re-encrypt a legacy plaintext client_secret in place (L9 self-heal
-- for connections made in the 2026-07-03..07-07 window before encryption existed).
create or replace function public.set_mfb_client_secret(p_user_id uuid, p_cipher text)
returns void language sql security definer set search_path = private, public
as $$
  update private.mfb_connection set client_secret = p_cipher, updated_at = now() where user_id = p_user_id;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.mfb_conn_secrets(uuid)',
    'public.upsert_mfb_credentials(uuid,text,text,text)',
    'public.set_mfb_tokens(uuid,text,text,timestamptz,boolean)',
    'public.disconnect_mfb(uuid)',
    'public.mfb_conns_to_sync()',
    'public.stamp_mfb_synced(uuid)',
    'public.set_mfb_client_secret(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
