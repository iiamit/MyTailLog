-- ===========================================================================
-- 0079 — Reminders v2: reminder kinds and channels, snooze, an in-app inbox
-- (09 §2.11), and the user's time zone (14-decisions.md K4).
--
-- profile.time_zone replaces the aircraft time zone 09 mentions: an IANA name
-- captured automatically by the browser and phones (no settings control). It
-- decides "today" for the due engine and status snapshot, quiet hours,
-- "Remind me Friday" and the daily digest. Null means UTC.
--
-- Reminder preferences stay in profile.preferences.alerts (jsonb); the new keys
-- are documented in 09 §2.11 and need no schema change.
-- ===========================================================================

alter table reminder_log
  add column kind text not null default 'lead' check (kind in ('lead','lapse','weekly','visit','visit_risk','document','reading_done','gap')),
  add column channel text not null default 'email' check (channel in ('email','push','in_app')),
  add column visit_id uuid references planned_visit(id) on delete set null;
create index reminder_log_lookup_idx on reminder_log (user_id, aircraft_id, item_key, kind, due_signature);

create table reminder_snooze (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  item_key text not null,
  due_signature text not null,               -- snooze ends automatically when the cycle changes
  until_at timestamptz,                      -- null = stop for this cycle
  created_at timestamptz not null default now(),
  unique (user_id, aircraft_id, item_key, due_signature)
);
create index reminder_snooze_aircraft_idx on reminder_snooze (aircraft_id);
alter table reminder_snooze enable row level security;
create policy snooze_self on reminder_snooze for all using (user_id = auth.uid()) with check (user_id = auth.uid() and has_aircraft_access(aircraft_id));

create table notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  aircraft_id uuid references aircraft(id) on delete cascade,
  kind text not null,                        -- same set as reminder_log.kind plus 'share_invite','backup_failed','conflict'
  title text not null check (length(title) <= 140),
  body text not null check (length(body) <= 600),
  deep_link text not null,                   -- 'mytaillog://aircraft/<id>/status/item/mx:<uuid>' (09 §4.9)
  actions jsonb not null default '[]',       -- [{id:'plan_visit', label:'Plan the visit'}, …]
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz
);
create index notification_user_idx on notification (user_id, created_at desc);
alter table notification enable row level security;
create policy notification_self_read on notification for select using (user_id = auth.uid());
create policy notification_self_update on notification for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No insert policy: the server writes notifications with the service role.

revoke all on reminder_snooze, notification from anon;

-- User time zone (K4). Column-level grant, as 0028 locks profile updates down.
alter table profile add column time_zone text check (length(time_zone) between 1 and 64);
grant update (time_zone) on public.profile to authenticated;
