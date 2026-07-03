-- ===========================================================================
-- MyTailLog — Page thumbnail key.
--
-- Thumbnails are generated in the browser from the original scan and stored in
-- the same bucket (key = <original>_thumb.jpg). thumbnail_path records the key
-- so list/timeline views can serve the small image; null means no thumbnail yet
-- (older pages), and callers fall back to the original.
-- ===========================================================================

alter table page add column thumbnail_path text;
