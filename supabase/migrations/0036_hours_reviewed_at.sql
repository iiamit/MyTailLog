-- ===========================================================================
-- Hobbs↔tach reconciliation (Phase 3) — anomaly review state.
--
-- hobbsTach.detectAnomalies flags hobbs/tach readings that read like typos
-- (dropped/extra digit, fat-finger) and suggests a corrected value. Once the
-- owner accepts a fix or validates a flagged-but-correct value, the reading
-- must stop re-flagging. hours_reviewed_at records that resolution.
--
-- Nullable, no default: NULL = never reviewed (eligible for flagging), a
-- timestamp = resolved. Applies to both reading sources — log entries and
-- synced hours_reading rows (MFB has no owner_confirmed, so it needs this too).
-- Existing RLS on both tables already scopes updates to aircraft editors; a new
-- nullable column needs no policy change.
-- ===========================================================================

alter table log_entry     add column if not exists hours_reviewed_at timestamptz;
alter table hours_reading add column if not exists hours_reviewed_at timestamptz;
