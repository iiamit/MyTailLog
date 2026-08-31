-- ===========================================================================
-- Backfill page_sequence for pages that were captured without one.
--
-- The capture route stored a NULL sequence whenever the client didn't supply
-- one. The web uploader runs its own counter across a batch and always sent one;
-- the iOS app never did. So every page scanned on the phone came out unnumbered,
-- and a logbook filled from both clients ended up numbered in patches — reported
-- from the field as an airframe book with no numbers at all, an engine book fully
-- numbered, and a propeller book with some pages numbered and some not.
--
-- The route now assigns the next sequence server-side when none is supplied.
-- This fills in what it already stored as NULL.
--
-- ORDER: created_at, i.e. the order the pages arrived, which is the same rule
-- the web uploader's counter followed.
--
-- PLACEMENT: after the highest number already in that logbook, never renumbering
-- a page that has one. A logbook where someone has hand-arranged pages keeps that
-- arrangement; the previously-unnumbered pages land after it rather than being
-- interleaved on a guess. Where every page was NULL (the all-phone case) this is
-- simply 1..N in upload order.
--
-- Pages can be rearranged afterwards from the pages list — sort by entry date and
-- "Save this order" renumbers a whole logbook at once.
-- ===========================================================================

with numbered as (
  select
    p.id,
    coalesce(m.max_seq, 0) + row_number() over (
      partition by p.logbook_id
      order by p.created_at, p.id
    ) as seq
  from page p
  left join (
    select logbook_id, max(page_sequence) as max_seq
    from page
    where page_sequence is not null
    group by logbook_id
  ) m on m.logbook_id = p.logbook_id
  where p.page_sequence is null
)
update page
   set page_sequence = numbered.seq
  from numbered
 where page.id = numbered.id;
