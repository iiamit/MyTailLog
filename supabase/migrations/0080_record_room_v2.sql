-- ===========================================================================
-- 0080 — Record room v2: audience, cover, contents, and opens as sessions
-- (09 §2.12). Contents rules are unchanged: confirmed and signed entries only.
-- Rows written before 0080 have a null session_key and count one open each.
-- ===========================================================================

alter table record_room
  add column audience text not null default 'other' check (audience in ('ia','buyer','insurer','other')),
  add column cover text not null default 'map' check (cover in ('map','summary')),
  add column map_window text not null default 'whole_life' check (map_window in ('whole_life','line_ahead','last_5_years')),
  add column include_dossier boolean not null default false,
  add column include_squawks boolean not null default false,
  add column include_reporters boolean not null default false,
  add column include_gaps_note boolean not null default true;

alter table record_room_view
  add column session_key text,          -- sha256(ip_hash || user_agent || floor(epoch/1800)) computed by the server
  add column section text;              -- 'map','summary','dossier','logbook:<id>','document:<id>','page:<id>'
create index record_room_view_session_idx on record_room_view (room_id, session_key);

-- security_invoker: the owner-only RLS of record_room_view applies to readers.
create view record_room_opens with (security_invoker = true) as
  select room_id, session_key, min(created_at) as opened_at, max(created_at) as last_at,
         array_agg(distinct section) filter (where section is not null) as sections
  from record_room_view group by room_id, session_key;
revoke all on record_room_opens from anon;
