-- ===========================================================================
-- Oil analysis — one row per lab sample (Blackstone, AVLab, etc.).
--
-- Owners periodically send an oil sample to a lab; the report lists wear-metal
-- concentrations (ppm) and oil properties. A single report often contains the
-- full sample HISTORY, so import writes one row per sample. Wear metals and oil
-- properties are stored as JSONB because the element set varies by lab and over
-- time — columns would be a moving target.
--
-- Aircraft-scoped (RLS choke points has_aircraft_access / can_edit_aircraft,
-- matching weight_balance/scanned_document). Optionally tied to a `component`
-- (the engine) so twins can trend each engine separately.
-- ===========================================================================

create table if not exists oil_analysis_sample (
  id uuid primary key default gen_random_uuid(),
  aircraft_id uuid not null references aircraft(id) on delete cascade,
  -- The engine this sample is from (null = the aircraft's only/unspecified engine).
  component_id uuid references component(id) on delete set null,
  sample_date date not null,
  analysis_date date,
  lab text,
  lab_number text,
  sample_number text,            -- lab's own sample id, when present (aids dedup)
  oil_type text,
  oil_hours numeric(8,1),        -- hours on THIS oil since the last change
  engine_hours numeric(8,1),     -- total engine time (SMOH/TT) at sampling
  oil_added_quarts numeric(6,2),
  -- { "iron": 12, "chromium": 2, "aluminum": 3, ... } ppm by element.
  elements_ppm jsonb not null default '{}',
  -- { "viscosity_cst_100c": 19.26, "flashpoint_f": 450, "fuel_pct": 0.5,
  --   "water_pct": 0, "insolubles_pct": 0.4, "tbn": 5.2 } — keys present only when reported.
  oil_properties jsonb,
  -- The lab's engine-type "universal averages" per element (Blackstone) — the
  -- baseline the trend chart draws a reference line from. Same key shape as
  -- elements_ppm. Null if the report doesn't provide it.
  universal_averages jsonb,
  lab_comments text,             -- the lab's written assessment
  status text,                   -- lab's flag if any (free text; labs differ)
  notes text,                    -- owner's own notes
  -- Let an owner drop an anomalous sample from trend baselines without deleting it.
  excluded_from_averages boolean not null default false,
  -- The stored scan/page this was imported from, if any (source of truth image).
  source_page_id uuid references page(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oil_analysis_sample_aircraft_idx
  on oil_analysis_sample(aircraft_id, sample_date desc);

create trigger oil_analysis_sample_updated_at before update on oil_analysis_sample
  for each row execute function set_updated_at();

alter table oil_analysis_sample enable row level security;

create policy oil_analysis_read on oil_analysis_sample for select
  using (has_aircraft_access(aircraft_id));
create policy oil_analysis_insert on oil_analysis_sample for insert
  with check (can_edit_aircraft(aircraft_id));
create policy oil_analysis_update on oil_analysis_sample for update
  using (can_edit_aircraft(aircraft_id)) with check (can_edit_aircraft(aircraft_id));
create policy oil_analysis_delete on oil_analysis_sample for delete
  using (can_edit_aircraft(aircraft_id));
