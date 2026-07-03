-- ===========================================================================
-- MyTailLog — Phase 2: daily auto-sync throttle + reminder-email dedup.
--
--   * mfb_connection.last_synced_at — drives the once-per-day auto-sync in the
--     daily cron. The manual "Sync now" button stays unthrottled (it never reads
--     this column).
--   * reminder_log — one row per reminder email actually sent for an item's
--     current due-cycle, so the cron never re-emails the same due item. The
--     due_signature captures the item's next_due date+hours; a NEW cycle (item
--     marked done → later next-due) yields a new signature and re-alerts.
--
-- The cron writes reminder_log via the SERVICE/SECRET key (bypasses RLS), so no
-- public insert policy is needed. A self SELECT policy lets a user read their own
-- reminder history under their JWT.
-- ===========================================================================

-- Once-per-day auto-sync throttle ------------------------------------------
alter table mfb_connection add column if not exists last_synced_at timestamptz;

-- Reminder-email dedup ------------------------------------------------------
create table if not exists reminder_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  aircraft_id   uuid not null references aircraft on delete cascade,
  item_key      text not null,          -- 'maint:<maintenance_item_id>' | 'ad:<ad_compliance_id>'
  due_signature text not null,          -- stable string of the item's current next_due date+hours
  sent_at       timestamptz not null default now()
);

-- One email per (user, item, due-cycle). A later cycle has a new signature.
create unique index if not exists reminder_log_dedup_idx
  on reminder_log (user_id, item_key, due_signature);

alter table reminder_log enable row level security;

-- Users may read their own reminder history; the cron writes via the secret key
-- (RLS-exempt), so no insert/update/delete policy is defined for regular users.
create policy reminder_log_self_select on reminder_log for select
  using (user_id = auth.uid());
