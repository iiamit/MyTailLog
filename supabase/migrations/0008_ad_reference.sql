-- ===========================================================================
-- MyTailLog — FAA AD reference master + compliance/equipment linkage (Phase 2)
--
-- ad_reference is a SHARED cache of Airworthiness Directive data pulled from the
-- Federal Register API (the official source: AD text, effective date, and links
-- to the FR page and the signed govinfo PDF). It is public reference data — not
-- private per-aircraft data — so any authenticated user may read it and cache a
-- lookup. Per-aircraft compliance stays in ad_compliance and points here.
--
-- ad_compliance is extended so a record can:
--   - link to its official FR reference (ad_reference_id),
--   - be tied to the installed component/equipment it concerns (component_id) —
--     removing that equipment is what makes an AD inapplicable,
--   - record WHY and WHEN its status changed (reason + status_changed_on), so a
--     "does not apply" AD can show that it became inapplicable when, e.g., the
--     vacuum pump it targeted was removed on a given date.
-- ===========================================================================

create table ad_reference (
  id                 uuid primary key default gen_random_uuid(),
  ad_number          text unique,       -- e.g. '2026-13-06' (from FR docket_ids)
  fr_document_number text,              -- e.g. '2026-13481'
  title              text,
  abstract           text,
  effective_date     date,
  fr_html_url        text,              -- official Federal Register page
  pdf_url            text,              -- signed rule PDF on govinfo.gov
  full_text_url      text,              -- plain-text full rule (applicability, etc.)
  citation           text,              -- e.g. '91 FR 40353'
  rin                text,
  supersedes         text,              -- AD number(s) this supersedes, if known
  fetched_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index ad_reference_ad_number_idx on ad_reference(ad_number);

create trigger ad_reference_updated_at before update on ad_reference
  for each row execute function set_updated_at();

alter table ad_reference enable row level security;
-- Public reference data: readable and cacheable by any signed-in user.
create policy ad_reference_select on ad_reference for select to authenticated using (true);
create policy ad_reference_insert on ad_reference for insert to authenticated with check (true);
create policy ad_reference_update on ad_reference for update to authenticated using (true);

alter table ad_compliance
  add column ad_reference_id   uuid references ad_reference(id) on delete set null,
  add column component_id      uuid references component(id) on delete set null,
  add column reason            text,   -- why the current status (N/A, superseded, …)
  add column status_changed_on date;   -- when the current status took effect
