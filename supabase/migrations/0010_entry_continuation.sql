-- ===========================================================================
-- MyTailLog — Multi-page entry continuation (Phase 1 refinement)
--
-- Extraction runs one page at a time, so a single logbook entry that spans a
-- page break gets split into a "head" (bottom of page N, has the date/tach and
-- the start of the work) and an orphaned "tail" (top of page N+1, no header —
-- reads as broken). These flags let us identify the two halves and consolidate
-- them into one correct entry:
--   continues_next  — this entry runs off the bottom of its page (no closing
--                     signature) and continues onto the next page.
--   is_continuation — this entry begins mid-entry (no date/header of its own)
--                     because it continues from the previous page.
-- entry_index records each entry's top-to-bottom position on its page, so the
-- head (last on page N) and tail (first on page N+1) can be located.
-- ===========================================================================

alter table log_entry
  add column entry_index     int,
  add column continues_next  boolean not null default false,
  add column is_continuation boolean not null default false;
