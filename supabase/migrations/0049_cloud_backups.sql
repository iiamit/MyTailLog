-- ===========================================================================
-- Scheduled cloud backups — phase 1 (docs/plan-cloud-backups.md §5).
--
-- Once a month (or quarter) the cron builds each aircraft's .zip and pushes it
-- to a storage account the USER owns. That means we hold a third-party OAuth
-- refresh token that can write to their Dropbox, which is the most dangerous
-- secret in the app after the Supabase keys.
--
-- So the tokens follow the 0047 / 0039 pattern EXACTLY: the table lives in the
-- `private` schema PostgREST does not expose, and every read/write goes through
-- SECURITY DEFINER functions granted to service_role only. A column-level
-- `revoke` does NOT hold in Supabase — a table-level grant silently re-includes
-- every column (0039's note documents why 0038 was cosmetic) — so relocating the
-- table is the only thing that actually works. RLS scopes ROWS, not COLUMNS.
--
--   Browser (authenticated):  my_backup_destinations()  — non-secret state only
--   Service role only:        backup_due_runs / claim_backup_schedule /
--                             start_backup_run / finish_backup_run /
--                             complete_backup_schedule /
--                             upsert_backup_destination / set_backup_tokens /
--                             set_backup_schedule / delete_backup_destination
--
-- backup_schedule / backup_run ARE public + RLS'd: the owner must be able to see
-- "did my backup actually run?". backup_run.error is therefore browser-readable
-- BY DESIGN, so the writer redacts anything token-shaped before storing it (a
-- provider 401 body can contain a token) — see lib/backup/schedule.ts.
--
-- Deliberately NOT added to the log_change() trigger list (0044): these rows are
-- user-scoped, not aircraft-scoped (backup_schedule.aircraft_id is nullable and
-- means "all aircraft"), the trigger requires a non-null aircraft_id, and the
-- offline iOS client has no use for backup history. If that ever changes,
-- remember the 0045 lesson: a new synced table must be added to BOTH the trigger
-- list AND the backfill, or devices syncing from cursor 0 never see it.
-- ===========================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- --- Tokens (private) ------------------------------------------------------

create table private.backup_destination (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  -- Only Dropbox is implemented (phase 1). Google Drive gets its own value here
  -- when phase 2 lands; Box is dropped (see the plan §3).
  provider             text not null check (provider in ('dropbox')),
  -- For the UI ("Connected as …"). Deliberately NOT the email: reading that
  -- needs the account_info.read scope, and files.content.write alone is the
  -- smaller blast radius. The Dropbox account id tail is enough to tell two
  -- accounts apart.
  account_label        text,
  -- Null for Dropbox: App-folder access already roots us at /Apps/MyTailLog, so
  -- prefixing again would write MyTailLog/MyTailLog/<TAIL>/.
  folder_path          text,
  access_token_cipher  text,   -- AES-256-GCM (lib/crypto.ts), never plaintext
  refresh_token_cipher text,   -- Dropbox refresh tokens never expire
  expires_at           timestamptz,
  created_at           timestamptz not null default now(),
  revoked_at           timestamptz,
  unique (user_id, provider)
);

-- Belt and braces: the schema is already unreachable by anon/authenticated, and
-- the definer functions run as owner. No policies = no row is visible to anyone
-- who somehow reaches the table.
alter table private.backup_destination enable row level security;

-- --- Schedule + history (public, RLS'd) ------------------------------------

create table backup_schedule (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  destination_id       uuid references private.backup_destination (id) on delete set null,
  aircraft_id          uuid references aircraft (id) on delete cascade,  -- null ⇒ all the user's aircraft
  frequency            text not null default 'off' check (frequency in ('off', 'monthly', 'quarterly')),
  -- 1–28 so the date exists in February. Derived from a hash of user_id so the
  -- fleet's backups spread across the month instead of all landing on the 1st.
  day_of_month         int not null check (day_of_month between 1 and 28),
  next_run_at          timestamptz,
  last_run_at          timestamptz,
  -- Lease: set while a sweep is working this schedule so a retry (or an
  -- overlapping tick) can't double-upload. Cleared by complete_backup_schedule.
  claimed_at           timestamptz,
  consecutive_failures int not null default 0,
  created_at           timestamptz not null default now()
);

create unique index backup_schedule_user_all_idx on backup_schedule (user_id) where aircraft_id is null;
create index backup_schedule_due_idx on backup_schedule (next_run_at) where frequency <> 'off';

create table backup_run (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references backup_schedule (id) on delete cascade,
  -- Denormalised so the RLS policy is a plain column compare (no subquery into
  -- another RLS'd table).
  user_id     uuid not null references auth.users (id) on delete cascade,
  aircraft_id uuid references aircraft (id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null check (status in ('running', 'ok', 'failed', 'skipped_too_large')),
  bytes       bigint,
  remote_path text,
  -- Browser-readable by design → the writer redacts tokens before storing.
  error       text
);

create index backup_run_user_started_idx on backup_run (user_id, started_at desc);

alter table backup_schedule enable row level security;
alter table backup_run enable row level security;

-- Read-only for the owner. There are deliberately no insert/update/delete
-- policies: every write goes through the definer functions below, so a user
-- can't hand themselves next_run_at = now() and make us ship a full archive
-- every night.
create policy backup_schedule_read on backup_schedule for select using (user_id = auth.uid());
create policy backup_run_read on backup_run for select using (user_id = auth.uid());

-- --- Browser-facing status --------------------------------------------------

-- Everything the Profile page needs and NOTHING that decrypts to a token. This
-- is the exact bug class 0047 existed to fix: the Profile page was selecting a
-- ciphertext column straight into the browser.
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
  left join public.backup_schedule s on s.destination_id = d.id
  left join lateral (
    select br.status, br.bytes, br.error
    from public.backup_run br
    where br.user_id = d.user_id and br.status <> 'running'
    order by br.started_at desc
    limit 1
  ) r on true
  where d.user_id = auth.uid();
$$;
revoke all on function public.my_backup_destinations() from public, anon;
grant execute on function public.my_backup_destinations() to authenticated;

-- --- Service-only: connect / disconnect -------------------------------------

create or replace function public.upsert_backup_destination(
  p_user_id uuid, p_provider text, p_account_label text,
  p_access_cipher text, p_refresh_cipher text, p_expires_at timestamptz)
returns uuid language sql security definer set search_path = private, public
as $$
  insert into private.backup_destination
    (user_id, provider, account_label, access_token_cipher, refresh_token_cipher, expires_at, revoked_at)
  values (p_user_id, p_provider, p_account_label, p_access_cipher, p_refresh_cipher, p_expires_at, null)
  on conflict (user_id, provider) do update set
    account_label        = excluded.account_label,
    access_token_cipher  = excluded.access_token_cipher,
    -- Dropbox only returns a refresh token on the first consent; keep the one we
    -- have when a re-consent doesn't include it.
    refresh_token_cipher = coalesce(excluded.refresh_token_cipher, backup_destination.refresh_token_cipher),
    expires_at           = excluded.expires_at,
    revoked_at           = null
  returning id;
$$;

-- Store a refreshed access token (the refresh token is unchanged on Dropbox).
create or replace function public.set_backup_tokens(
  p_destination_id uuid, p_access_cipher text, p_expires_at timestamptz)
returns void language sql security definer set search_path = private, public
as $$
  update private.backup_destination
     set access_token_cipher = p_access_cipher, expires_at = p_expires_at
   where id = p_destination_id;
$$;

-- Disconnect: DELETE the tokens (§7 — revocation must remove them, not flag a
-- row) and switch the schedule off, keeping the run history so the user can
-- still see what happened.
create or replace function public.delete_backup_destination(p_user_id uuid, p_provider text)
returns void language plpgsql security definer set search_path = private, public
as $$
begin
  update public.backup_schedule
     set frequency = 'off', next_run_at = null, destination_id = null, claimed_at = null
   where user_id = p_user_id;
  delete from private.backup_destination where user_id = p_user_id and provider = p_provider;
end;
$$;

-- Cadence + the spread day. day_of_month / next_run_at are computed server-side
-- (lib/backup/schedule.ts) and passed in.
create or replace function public.set_backup_schedule(
  p_user_id uuid, p_frequency text, p_day_of_month int, p_next_run_at timestamptz)
returns void language sql security definer set search_path = private, public
as $$
  insert into public.backup_schedule (user_id, destination_id, frequency, day_of_month, next_run_at)
  values (
    p_user_id,
    (select id from private.backup_destination
      where user_id = p_user_id and revoked_at is null order by created_at limit 1),
    p_frequency, p_day_of_month, p_next_run_at)
  on conflict (user_id) where aircraft_id is null do update set
    destination_id = excluded.destination_id,
    frequency      = excluded.frequency,
    day_of_month   = excluded.day_of_month,
    next_run_at    = excluded.next_run_at;
$$;

-- --- Service-only: the sweep ------------------------------------------------

-- Due schedules, oldest first. Returns the ciphertext because the cron is the
-- only caller and it holds ENCRYPTION_KEY; this function is never granted to a
-- browser role.
create or replace function public.backup_due_runs(p_now timestamptz)
returns table (
  schedule_id uuid, user_id uuid, aircraft_id uuid, destination_id uuid,
  provider text, folder_path text, access_cipher text, refresh_cipher text,
  expires_at timestamptz, frequency text, day_of_month int
)
language sql security definer set search_path = private, public stable
as $$
  select s.id, s.user_id, s.aircraft_id, d.id, d.provider, d.folder_path,
         d.access_token_cipher, d.refresh_token_cipher, d.expires_at, s.frequency, s.day_of_month
  from public.backup_schedule s
  join private.backup_destination d on d.id = s.destination_id and d.revoked_at is null
  where s.frequency <> 'off' and s.next_run_at is not null and s.next_run_at <= p_now
  order by s.next_run_at asc;
$$;

-- Take the lease. False ⇒ another tick already has it (or a crashed one still
-- holds it, until the lease ages out) — skip, don't double-upload.
create or replace function public.claim_backup_schedule(p_schedule_id uuid, p_lease_minutes int)
returns boolean language plpgsql security definer set search_path = private, public
as $$
begin
  update public.backup_schedule
     set claimed_at = now()
   where id = p_schedule_id
     and (claimed_at is null or claimed_at < now() - make_interval(mins => p_lease_minutes));
  return found;
end;
$$;

create or replace function public.start_backup_run(
  p_schedule_id uuid, p_user_id uuid, p_aircraft_id uuid)
returns uuid language sql security definer set search_path = private, public
as $$
  insert into public.backup_run (schedule_id, user_id, aircraft_id, status)
  values (p_schedule_id, p_user_id, p_aircraft_id, 'running')
  returning id;
$$;

create or replace function public.finish_backup_run(
  p_run_id uuid, p_status text, p_bytes bigint, p_remote_path text, p_error text)
returns void language sql security definer set search_path = private, public
as $$
  update public.backup_run
     set status = p_status, bytes = p_bytes, remote_path = p_remote_path,
         error = p_error, finished_at = now()
   where id = p_run_id;
$$;

-- Release the lease, stamp the run, arm the next one. Returns the new
-- consecutive-failure count so the caller can email after two in a row (§8).
create or replace function public.complete_backup_schedule(
  p_schedule_id uuid, p_next_run_at timestamptz, p_failed boolean)
returns int language plpgsql security definer set search_path = private, public
as $$
declare n int;
begin
  update public.backup_schedule
     set claimed_at = null,
         last_run_at = now(),
         next_run_at = p_next_run_at,
         consecutive_failures = case when p_failed then consecutive_failures + 1 else 0 end
   where id = p_schedule_id
  returning consecutive_failures into n;
  return coalesce(n, 0);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.upsert_backup_destination(uuid,text,text,text,text,timestamptz)',
    'public.set_backup_tokens(uuid,text,timestamptz)',
    'public.delete_backup_destination(uuid,text)',
    'public.set_backup_schedule(uuid,text,int,timestamptz)',
    'public.backup_due_runs(timestamptz)',
    'public.claim_backup_schedule(uuid,int)',
    'public.start_backup_run(uuid,uuid,uuid)',
    'public.finish_backup_run(uuid,text,bigint,text,text)',
    'public.complete_backup_schedule(uuid,timestamptz,boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
