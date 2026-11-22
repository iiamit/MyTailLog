-- Durable inbox commits and cross-instance leases for scheduled notifications.
-- Provider delivery is retryable, not exactly-once: a process can die after APNs/FCM accepts a message.
create table background_job_lease (
  key text primary key,
  token uuid not null,
  expires_at timestamptz not null
);
alter table background_job_lease enable row level security;
revoke all on background_job_lease from public, anon, authenticated;

create function claim_background_job(p_key text) returns uuid
language plpgsql security definer set search_path = public as $$
declare claimed uuid;
begin
  insert into background_job_lease (key, token, expires_at)
    values (p_key, gen_random_uuid(), clock_timestamp() + interval '15 minutes')
  on conflict (key) do update set token = excluded.token, expires_at = excluded.expires_at
    where background_job_lease.expires_at <= clock_timestamp()
  returning token into claimed;
  return claimed;
end $$;

create function release_background_job(p_key text, p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from background_job_lease where key = p_key and token = p_token;
$$;

-- Notification plus its once-per-cycle receipts either all commit or all roll back.
create function commit_reminder_inbox(p_notifications jsonb, p_receipts jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notification (user_id, aircraft_id, kind, title, body, deep_link, actions, payload)
    select user_id, aircraft_id, kind, title, body, deep_link, actions, payload
    from jsonb_to_recordset(p_notifications) as n(user_id uuid, aircraft_id uuid, kind text, title text, body text, deep_link text, actions jsonb, payload jsonb);
  insert into reminder_log (user_id, aircraft_id, item_key, due_signature, kind, channel, nth, visit_id)
    select user_id, aircraft_id, item_key, due_signature, kind, channel, nth, visit_id
    from jsonb_to_recordset(p_receipts) as r(user_id uuid, aircraft_id uuid, item_key text, due_signature text, kind text, channel text, nth smallint, visit_id uuid);
end $$;

create index scan_batch_pending_notice_idx on scan_batch (id) where notified_at is null;

alter table notification add column event_key text;
create unique index notification_event_key_idx on notification (user_id, event_key) where event_key is not null;

-- Close and create the inbox message in the same transaction. Readers may revisit
-- every unfinished batch, including one whose last page finished before a worker died.
create function complete_reading_batch(p_batch_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare b scan_batch%rowtype; n_pages int; n_read int; n_pending int; n_entries int; n_look int; was_complete boolean;
begin
  perform pg_advisory_xact_lock(129737019,1);
  select * into b from scan_batch where id = p_batch_id for update;
  if not found then return false; end if;
  if b.notified_at is not null then return false; end if;
  select count(*), count(*) filter (where extraction_status = 'extracted'),
    count(*) filter (where extraction_status not in ('extracted','failed')), count(*) filter (where needs_look)
    into n_pages, n_read, n_pending, n_look from page where batch_id = b.id;
  if n_pages < b.expected_pages or n_pending > 0 then return false; end if;
  was_complete := b.completed_at is not null;
  update scan_batch set completed_at = coalesce(completed_at, now()) where id = b.id;
  if b.created_by is not null and not exists (
    select 1 from notification where user_id = b.created_by and kind = 'reading_done' and payload->>'batchId' = b.id::text
  ) then
    select count(*) into n_entries from log_entry e join page p on p.id = e.page_id
      where p.batch_id = b.id and p.extraction_status = 'extracted' and not e.owner_confirmed;
    insert into notification (user_id, aircraft_id, kind, title, body, deep_link, actions, payload, event_key)
      values (b.created_by, b.aircraft_id, 'reading_done', n_read || case when n_read = 1 then ' page read' else ' pages read' end,
        n_entries || case when n_entries = 1 then ' entry is' else ' entries are' end || ' ready to review. They don''t count until you confirm them.',
        'mytaillog://aircraft/' || b.aircraft_id || '/logbooks/review?batch=' || b.id,
        '[{"id":"review","label":"Review"}]'::jsonb, jsonb_build_object('batchId', b.id, 'needsLook', n_look), 'reading_done:' || b.id);
  end if;
  return not was_complete;
end $$;

revoke all on function claim_background_job(text), release_background_job(text, uuid),
  commit_reminder_inbox(jsonb,jsonb), complete_reading_batch(uuid) from public, anon, authenticated;
grant execute on function claim_background_job(text), release_background_job(text, uuid),
  commit_reminder_inbox(jsonb,jsonb), complete_reading_batch(uuid) to service_role;
