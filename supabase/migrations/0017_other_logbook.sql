-- ===========================================================================
-- MyTailLog — Add the "other" logbook type (Scan type: Other).
--
-- The "Other" logbook is the capture target for documents that aren't running
-- maintenance-log pages: A&P Weight & Balance sheets and AD compliance reports
-- (produced at annual). Pages captured here are classified and applied instead
-- of being extracted as log entries. See 0019 for the storage tables.
--
-- Postgres won't let a newly added enum value be used in the SAME transaction
-- that adds it, so this migration ONLY adds the value — the backfill for
-- existing aircraft lives in 0018 and must be run afterward (separate execution).
-- ===========================================================================

alter type logbook_type add value if not exists 'other';
