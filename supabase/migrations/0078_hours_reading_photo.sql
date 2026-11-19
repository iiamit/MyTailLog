-- ===========================================================================
-- 0078 — Tach photo reading results on hours_reading (09 §2.10). New source
-- value 'tach_photo' needs no schema change (source is text); it is a measured
-- reading and counts for utilization, unlike 'adsb_estimate'.
-- ===========================================================================

alter table hours_reading
  add column photo_path text,                -- <aircraft_id>/meters/<reading_id>.jpg, nullable
  add column ocr_value numeric(10,1),        -- what the phone read
  add column ocr_confidence numeric(4,3),
  add column ocr_candidates jsonb,           -- [{value:number, confidence:number, bbox:[x,y,w,h]}]
  add column owner_edited boolean not null default false;   -- the saved value differs from ocr_value
