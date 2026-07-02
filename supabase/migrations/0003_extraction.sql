-- ===========================================================================
-- MyTailLog — Extraction pipeline state (Phase 1, step 4)
--
-- The OCR/extraction pipeline reads a page image and writes structured
-- log_entry rows with per-field confidence. This migration adds the pipeline's
-- own state to the page, kept distinct from review_status (which tracks the
-- HUMAN review of extracted entries — unreviewed/confirmed/disputed). A page is
-- extracted by the machine first, then reviewed by a person; the two states are
-- orthogonal, so they get separate columns.
--
-- Nothing here is auto-trusted: extracted entries land with owner_confirmed =
-- false and per-field confidence, so the review UI (step 5) can flag exactly
-- which fields fell below threshold. See the design principle in 0001.
-- ===========================================================================

create type extraction_status as enum ('pending', 'processing', 'extracted', 'failed');

alter table page
  add column extraction_status  extraction_status not null default 'pending',
  add column extraction_error   text,
  -- A single scanned image is often a two-page spread (two facing logbook
  -- pages captured at once). The extractor reports how many logbook pages it
  -- sees; the review UI uses this to prompt for a split. See plan notes.
  add column detected_page_count int,
  add column extracted_at        timestamptz;

create index page_extraction_status_idx on page(aircraft_id, extraction_status);
