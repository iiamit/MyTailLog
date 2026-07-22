-- ===========================================================================
-- BYOK key ciphertext: move it out of PostgREST's reach entirely (fixes L2 for
-- real).
--
-- 0038 used a column-level `revoke select (key_cipher)`. That does NOT hold in
-- Supabase: a table-level `grant select on user_ai_key to authenticated` (issued
-- by the dashboard / tooling / a broad migration) silently re-includes every
-- column, so the browser role could still read the ciphertext (confirmed via
-- has_column_privilege('authenticated','user_ai_key','key_cipher','select') =
-- true). Any revoke from `authenticated` has the same fragility.
--
-- Robust fix: relocate the table to a `private` schema that PostgREST does NOT
-- expose, so no browser (or even service-role REST) query can reach it, and gate
-- ALL access through SECURITY DEFINER functions:
--   * my_ai_key_last4()  — browser: returns only key_last4 for the caller
--   * ai_key_cipher()    — service role only: the decryptable ciphertext
--   * upsert_ai_key() / delete_ai_key() — service role only: writes
-- The app's getUserAiKey + saveAiKey/removeAiKey now call these via the
-- service-role client; the profile page reads key_last4 via my_ai_key_last4().
-- ===========================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Relocate the table (rows come along). RLS policies + FKs move with it; they're
-- now moot for the browser role (which can't reach the schema at all) but harmless.
alter table public.user_ai_key set schema private;

-- Browser-facing: only the last 4, only the caller's own.
create or replace function public.my_ai_key_last4()
returns text
language sql
security definer
set search_path = private, public
stable
as $$
  select key_last4 from private.user_ai_key where user_id = auth.uid();
$$;
revoke all on function public.my_ai_key_last4() from public, anon;
grant execute on function public.my_ai_key_last4() to authenticated;

-- Server-only (service role): read the ciphertext, upsert, delete.
create or replace function public.ai_key_cipher(p_user_id uuid)
returns text
language sql
security definer
set search_path = private, public
stable
as $$
  select key_cipher from private.user_ai_key where user_id = p_user_id;
$$;

create or replace function public.upsert_ai_key(p_user_id uuid, p_cipher text, p_last4 text)
returns void
language sql
security definer
set search_path = private, public
as $$
  insert into private.user_ai_key (user_id, key_cipher, key_last4, updated_at)
  values (p_user_id, p_cipher, p_last4, now())
  on conflict (user_id) do update
    set key_cipher = excluded.key_cipher, key_last4 = excluded.key_last4, updated_at = now();
$$;

create or replace function public.delete_ai_key(p_user_id uuid)
returns void
language sql
security definer
set search_path = private, public
as $$
  delete from private.user_ai_key where user_id = p_user_id;
$$;

revoke all on function public.ai_key_cipher(uuid) from public, anon, authenticated;
revoke all on function public.upsert_ai_key(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_ai_key(uuid) from public, anon, authenticated;
grant execute on function public.ai_key_cipher(uuid) to service_role;
grant execute on function public.upsert_ai_key(uuid, text, text) to service_role;
grant execute on function public.delete_ai_key(uuid) to service_role;
