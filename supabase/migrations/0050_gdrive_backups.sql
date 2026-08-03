-- ===========================================================================
-- Scheduled cloud backups — phase 2: Google Drive (docs/plan-cloud-backups.md §3).
--
-- 0049 already built `backup_destination` multi-provider (unique (user_id,
-- provider), upsert keyed on the same pair). Three things still assumed exactly
-- one provider, and all three are fixed here:
--
--   1. `check (provider in ('dropbox'))` — widened to include 'gdrive'.
--
--   2. `backup_schedule_user_all_idx` was unique on (user_id) WHERE
--      aircraft_id is null, i.e. ONE all-aircraft schedule per USER. A user
--      could therefore never have Dropbox AND Google Drive both backing up
--      everything, which is precisely the redundancy a second provider is for.
--      It is now unique per (user_id, destination_id): each destination is
--      scheduled, claimed and swept independently.
--
--   3. `my_backup_destinations()` reported the newest run for the USER against
--      every destination, so two connected providers would each show the
--      other's result. The lateral is now scoped to the destination's own
--      schedule.
--
-- Disconnect also changes shape. 0049 DELETEd the destination row; with a
-- per-destination schedule key that orphans the schedule (destination_id null)
-- and loses the run history on reconnect. §7 requires that revocation REMOVE the
-- stored tokens rather than flag a row — so we do both: the ciphertext columns,
-- the expiry, the label and the folder id are nulled (there is nothing left to
-- steal) and revoked_at is stamped, keeping the destination id stable so the
-- schedule and its history survive a reconnect.
--
-- Google Drive specifics that land in this file:
--   * `folder_path` is now opaque PER-PROVIDER state, not a path. Dropbox leaves
--     it null (App-folder access already roots us). Google Drive stores the id
--     of the MyTailLog folder it created, because `drive.file` can only see
--     files our app created and re-querying for the folder on every run is a
--     wasted round trip. set_backup_folder() persists it; the adapter
--     re-resolves and rewrites it when the user has deleted the folder.
--   * Google issues a refresh token only on the FIRST consent, so
--     upsert_backup_destination's existing coalesce() is load-bearing for
--     gdrive, not just belt-and-braces. (The adapter also forces
--     prompt=consent, which is the actual fix; the coalesce is the net.)
--
-- APPLY BY HAND TO BOTH PROD AND TEST BEFORE MERGING. The e2e check fails
-- against a database without it.
-- ===========================================================================

-- --- 1. A second provider ---------------------------------------------------

alter table private.backup_destination
  drop constraint if exists backup_destination_provider_check;
alter table private.backup_destination
  add constraint backup_destination_provider_check
  check (provider in ('dropbox', 'gdrive'));

comment on column private.backup_destination.folder_path is
  'Opaque per-provider state, NOT a user-visible path. Dropbox: null (App folder '
  'already roots us at /Apps/MyTailLog). Google Drive: the file id of the '
  'MyTailLog folder we created, re-resolved by the adapter if the user deletes it.';

-- --- 2. One all-aircraft schedule per DESTINATION, not per user --------------

drop index if exists backup_schedule_user_all_idx;
create unique index backup_schedule_user_dest_all_idx
  on backup_schedule (user_id, destination_id)
  where aircraft_id is null;

-- --- 3. Browser-facing status, per destination -------------------------------

-- Same contract as 0049 (never ciphertext), with the last run scoped to THIS
-- destination's schedule instead of "the user's newest run anywhere".
create or replace function public.my_backup_destinations()
returns table (
  provider text, account_label text, connected boolean, folder_path text,
  frequency text, day_of_month int, next_run_at timestamptz, last_run_at timestamptz,
  last_status text, last_bytes bigint, last_error text, consecutive_failures int
)
language sql security definer set search_path = private, public stable
as $$
  select d.provider,
         d.account_label,
         (d.access_token_cipher is not null and d.revoked_at is null) as connected,
         -- Opaque provider state; harmless to expose (a Drive folder id the user
         -- owns) and useful for support. Never a token.
         d.folder_path,
         coalesce(s.frequency, 'off'),
         s.day_of_month,
         s.next_run_at,
         s.last_run_at,
         r.status,
         r.bytes,
         r.error,
         coalesce(s.consecutive_failures, 0)
  from private.backup_destination d
  left join public.backup_schedule s
    on s.destination_id = d.id and s.aircraft_id is null
  left join lateral (
    select br.status, br.bytes, br.error
    from public.backup_run br
    where br.schedule_id = s.id and br.status <> 'running'
    order by br.started_at desc
    limit 1
  ) r on true
  where d.user_id = auth.uid()
  order by d.provider;
$$;
revoke all on function public.my_backup_destinations() from public, anon;
grant execute on function public.my_backup_destinations() to authenticated;

-- --- 4. Per-destination schedule writes --------------------------------------

-- The 0049 signature keyed the upsert on (user_id) alone. Dropped rather than
-- overloaded: leaving the old one callable would silently write the wrong row.
drop function if exists public.set_backup_schedule(uuid, text, int, timestamptz);

create or replace function public.set_backup_schedule(
  p_user_id uuid, p_provider text, p_frequency text, p_day_of_month int, p_next_run_at timestamptz)
returns void language sql security definer set search_path = private, public
as $$
  -- insert..select from the destination, so a provider the user hasn't connected
  -- writes no row at all (rather than a schedule with a null destination_id that
  -- the sweep would silently never pick up).
  insert into public.backup_schedule (user_id, destination_id, frequency, day_of_month, next_run_at)
  select p_user_id, d.id, p_frequency, p_day_of_month, p_next_run_at
    from private.backup_destination d
   where d.user_id = p_user_id and d.provider = p_provider and d.revoked_at is null
  on conflict (user_id, destination_id) where aircraft_id is null do update set
    frequency    = excluded.frequency,
    day_of_month = excluded.day_of_month,
    next_run_at  = excluded.next_run_at;
$$;

-- Persist the provider's opaque folder state after an upload resolved it.
create or replace function public.set_backup_folder(p_destination_id uuid, p_folder_path text)
returns void language sql security definer set search_path = private, public
as $$
  update private.backup_destination
     set folder_path = p_folder_path
   where id = p_destination_id;
$$;

-- --- 5. Disconnect: destroy the tokens, keep the row -------------------------

create or replace function public.delete_backup_destination(p_user_id uuid, p_provider text)
returns void language plpgsql security definer set search_path = private, public
as $$
begin
  -- Only THIS provider's schedule — the other destination keeps running.
  update public.backup_schedule s
     set frequency = 'off', next_run_at = null, claimed_at = null
   where s.user_id = p_user_id
     and s.destination_id in (
       select d.id from private.backup_destination d
        where d.user_id = p_user_id and d.provider = p_provider);

  -- §7: revocation must REMOVE the stored tokens. Nothing decryptable is left on
  -- the row; revoked_at additionally excludes it from backup_due_runs. The row
  -- itself stays so the schedule and its run history survive a reconnect.
  update private.backup_destination
     set access_token_cipher  = null,
         refresh_token_cipher = null,
         expires_at           = null,
         account_label        = null,
         folder_path          = null,
         revoked_at           = now()
   where user_id = p_user_id and provider = p_provider;
end;
$$;

-- --- 6. Grants (same rule as 0049: service_role only) ------------------------

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.set_backup_schedule(uuid,text,text,int,timestamptz)',
    'public.set_backup_folder(uuid,text)',
    'public.delete_backup_destination(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
