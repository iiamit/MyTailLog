-- ===========================================================================
-- Per-field source boxes on log_entry (extraction schema v3).
--
-- Extraction now reports, per field, WHERE its value sits on the scanned image
-- (a bounding box in image fractions) alongside a real per-field confidence.
-- field_confidence already existed (jsonb, now holds true 0..1 scores); this
-- adds the companion boxes the review UI crops beside each field.
--
-- Shape: { "<field>": {"x":0..1,"y":0..1,"w":0..1,"h":0..1} | null, ... }
-- Nullable overall — entries extracted before v3 simply have no boxes until
-- their page is re-extracted; the review UI treats absent boxes as "no hint".
-- ===========================================================================

alter table log_entry add column if not exists field_boxes jsonb;
