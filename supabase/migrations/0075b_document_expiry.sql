-- ===========================================================================
-- 0075b — Document expiry and renewal on the due list (09 §2.7). A document
-- with track_expiry is a due item (`doc:<id>`); with no expires_on it shows as
-- "no record". The expiry date is always typed or confirmed by the owner.
-- ===========================================================================

alter table document
  add column expires_on date,
  add column renews_every_months int check (renews_every_months between 1 and 120),
  add column track_expiry boolean not null default false,
  add column remind_lead_days int check (remind_lead_days between 0 and 365);
create index document_expiry_idx on document (aircraft_id, expires_on) where track_expiry;
