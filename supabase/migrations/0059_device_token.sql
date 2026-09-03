-- ===========================================================================
-- Push notifications — the device side of the daily reminder (CONTRACT §7).
--
-- One row per installed app that has been granted notification permission. The
-- APNs device token is not a credential — it only routes to a device, and only
-- for a sender holding our APNs key — so unlike the backup tokens (0049) it can
-- live in a public, RLS'd table rather than the `private` schema. It is still
-- personal data, so the policies are owner-scoped both ways: you can list and
-- delete your own devices and nobody else's.
--
-- `token` is the primary key, not (user_id, token): a phone handed to a second
-- account must MOVE, not accumulate a second row that would send one person's
-- maintenance to another's lock screen. Registration therefore upserts on the
-- token and overwrites user_id.
--
-- Deliberately NOT added to the log_change() trigger list (0044): these rows are
-- user-scoped rather than aircraft-scoped (the trigger needs an aircraft_id) and
-- a device has no use for the list of its owner's other devices. If that ever
-- changes, remember the 0045 lesson — a new synced table needs BOTH the trigger
-- entry AND a backfill, or a fresh device never sees its rows. For the same
-- reason there is no updated_at/BEFORE UPDATE trigger here (0058): nothing syncs
-- this table, so nothing needs a `base` to compare against.
-- ===========================================================================

create table device_token (
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Only iOS ships today. Android would add 'android' here and a second sender.
  platform   text not null check (platform in ('ios')),
  created_at timestamptz not null default now()
);

create index device_token_user_idx on device_token (user_id);

alter table device_token enable row level security;

revoke all on device_token from anon, authenticated;
grant select, delete on device_token to authenticated;
grant select, delete on device_token to service_role;

-- Owner-scoped: you can list and forget your own devices, and no others.
create policy device_token_select on device_token
  for select to authenticated
  using (user_id = auth.uid());

create policy device_token_delete on device_token
  for delete to authenticated
  using (user_id = auth.uid());

-- Registering goes through a function rather than an insert policy, for the
-- hand-off case: when a phone that already holds a row is signed into a SECOND
-- account, RLS hides the old row from the new owner, so neither an insert (it
-- collides on the primary key) nor an upsert (its `using` clause matches
-- nothing) can move it — and the previous owner would keep getting that phone's
-- notifications. This claims it. It is still the caller's own row that gets
-- written: auth.uid() is read here, never taken from the request.
create function register_device_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from device_token where token = p_token;
  insert into device_token (token, user_id, platform) values (p_token, auth.uid(), p_platform);
end;
$$;

revoke all on function register_device_token(text, text) from public, anon;
grant execute on function register_device_token(text, text) to authenticated;
