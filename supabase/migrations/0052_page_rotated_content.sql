-- Flag a page whose rotated content we could not fully read.
--
-- Reported from the field: shops affix stickers wherever there is room, so a
-- page can carry an upright sticker AND one rotated 90°. Extraction returned
-- only the upright one. The rotated entry was not wrong — it was ABSENT, and an
-- absent entry has nothing to review against, so the owner had no way to know.
--
-- The extractor now reports when it can see rotated content it did not fully
-- read, which triggers a second targeted pass. This column persists the state
-- AFTER that pass, so review can still say "look here" when even the retry came
-- up short. Silent omission → visible flag.

alter table page
  add column if not exists unread_rotated_content boolean not null default false;

comment on column page.unread_rotated_content is
  'Rotated/sideways content was visible but not fully read, even after the follow-up pass. Review shows a "check this page" warning. Default false: pages extracted before 0052 were never assessed, and false means "nothing to flag", not "verified clean".';

-- Pages needing a look are rare, so index only those.
create index if not exists page_unread_rotated_idx
  on page (aircraft_id)
  where unread_rotated_content;
