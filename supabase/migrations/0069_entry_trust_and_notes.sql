-- ===========================================================================
-- 0069 — Direction D: trust level on log entries, replaced owner notes,
-- stated times and a normalised entry kind (09-data-and-api.md §2.1).
--
-- `trust` is the single source for TrustMark. It is a STORED generated column,
-- so this rewrites log_entry once (the only table rewrite in 0069–0084); run in
-- a low-traffic window. Old clients ignore the new columns.
--
-- 09 also asks for an (aircraft_id, entry_date) index; 0001's log_entry_date_idx
-- already is exactly that, so a duplicate is not created.
-- ===========================================================================

create type trust_level as enum ('ai_read', 'confirmed', 'signed');

alter table log_entry
  add column trust trust_level generated always as (
    case
      when authored_signed_at is not null then 'signed'::trust_level
      when owner_confirmed and nullif(btrim(signature_name), '') is not null
           and nullif(btrim(mechanic_cert_number), '') is not null then 'signed'::trust_level
      when owner_confirmed then 'confirmed'::trust_level
      else 'ai_read'::trust_level
    end) stored,
  -- Set on an owner note (page_id is null) when the owner accepts a scanned
  -- entry as its source. Replaced notes leave status, meter math and the map.
  add column replaced_by_entry_id uuid references log_entry(id) on delete set null,
  add column stated_times jsonb,          -- [{component:'engine'|'prop', basis:'SMOH'|'SPOH'|'TSO'|'TT', value:number}]
  add column entry_kind text;             -- normalised kind from extraction: 'annual','oil_change','transponder',... (nullable)

create index log_entry_replaced_idx on log_entry (replaced_by_entry_id) where replaced_by_entry_id is not null;
