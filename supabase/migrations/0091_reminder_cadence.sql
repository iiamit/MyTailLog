-- ===========================================================================
-- 0091 — Reminder cadence (14-decisions.md D7, 09 §3.11).
--
-- 0023's unique (user_id, item_key, due_signature) allowed ONE reminder per due
-- cycle, so a lapse could never follow a lead and weekly reminders while lapsed
-- could never repeat. D7 allows, per due cycle and per channel: one lead, one
-- lapse, and up to 8 weekly reminders. `nth` numbers the weekly sends (1..8);
-- lead, lapse, visit and visit_risk always use 1. The check caps weekly at 8 in
-- the database as well as in lib/notifications.ts.
--
-- Additive and v1-safe: v1's cron inserts (user, item, signature) only, which
-- lands as kind 'lead', channel 'email', nth 1, and the new unique index still
-- refuses its duplicates (23505), as before. The new index is a superset of the
-- old key, so every existing row satisfies it.
-- ===========================================================================

alter table reminder_log add column if not exists nth smallint not null default 1 check (nth between 1 and 8);

create unique index if not exists reminder_log_cycle_idx
  on reminder_log (user_id, item_key, due_signature, kind, channel, nth);
drop index if exists reminder_log_dedup_idx;

-- "At most one push and one email digest per user per day": the cron looks up
-- the user's latest send per channel.
create index if not exists reminder_log_user_channel_idx on reminder_log (user_id, channel, sent_at desc);
