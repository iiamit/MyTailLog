-- ===========================================================================
-- MyTailLog — public AD catalog for the /ads SEO pages.
--
-- ad_reference (0008) only caches ADs that some user tracked and is readable by
-- signed-in users only. ad_catalog is a broader, PUBLIC snapshot of FAA
-- airworthiness directive final rules from the Federal Register, keyed by AD
-- number, with the makes and model designations parsed from each AD's title and
-- abstract (see apps/web/src/lib/faa/adCatalog.ts).
--
-- Populated ONLY by apps/web/scripts/ad-catalog-backfill.ts (weekly GitHub
-- Action, service role). The production server never fetches the Federal
-- Register (it IP-blocks Cloud Run egress); pages just read this table.
--
-- makes  = fixed make slugs ('cessna', 'piper', 'lycoming', …)
-- models = normalized designations: uppercase, alphanumerics only ('172N',
--          'O320'). The URL slug is the lowercase form.
-- A parsed model list is a reading aid, not an applicability determination.
-- ===========================================================================

create table ad_catalog (
  ad_number      text primary key,          -- e.g. '2026-13-06'
  title          text not null,
  abstract       text,
  effective_date date,
  makes          text[] not null default '{}',
  models         text[] not null default '{}',
  fr_html_url    text,
  pdf_url        text,
  citation       text,
  source         text not null default 'federal_register',
  updated_at     timestamptz not null default now()
);

create index ad_catalog_models_idx on ad_catalog using gin (models);
create index ad_catalog_makes_idx on ad_catalog using gin (makes);
create index ad_catalog_effective_idx on ad_catalog (effective_date desc);

create trigger ad_catalog_updated_at before update on ad_catalog
  for each row execute function set_updated_at();

-- Public reference data: anyone may read. No write policies — only the service
-- role (which bypasses RLS) writes.
alter table ad_catalog enable row level security;
create policy ad_catalog_select on ad_catalog for select to anon, authenticated using (true);
grant select on ad_catalog to anon, authenticated;

-- One row per (make, model) with its AD count, for the /ads index and sitemap.
-- security_invoker so the view is subject to ad_catalog's RLS, not the owner's.
create view ad_catalog_model with (security_invoker = true) as
select make, model, count(*)::int as ad_count, max(c.effective_date) as latest_effective_date
from ad_catalog c, unnest(c.makes) as make, unnest(c.models) as model
group by make, model;

grant select on ad_catalog_model to anon, authenticated;
