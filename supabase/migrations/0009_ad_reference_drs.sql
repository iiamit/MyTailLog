-- ===========================================================================
-- MyTailLog — AD reference: add DRS as a second source.
--
-- The Federal Register API only covers ADs from 1994 on. Pre-1994 legacy ADs
-- live in the FAA Dynamic Regulatory System (DRS). ad_reference can now hold a
-- record sourced from either: FR (fr_html_url/pdf_url/effective_date/citation)
-- or DRS (drs_url to the official document view, plus its DRS doc id + status).
-- ===========================================================================

alter table ad_reference
  add column source          text not null default 'federal_register', -- 'federal_register' | 'drs'
  add column drs_url         text,   -- DRS document view URL
  add column drs_doc_id      text,   -- DRS docUniqueId
  add column document_status text;   -- DRS status, e.g. 'Current' / 'Historical'
