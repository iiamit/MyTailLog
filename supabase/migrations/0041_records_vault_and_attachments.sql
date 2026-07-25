-- ===========================================================================
-- Records Vault + per-entry attachments/links.
--
-- The `document` table (0001) already stores aircraft records (type + title +
-- storage_path + reference + notes) but has no UI. This turns it into a proper
-- "Records Vault" and lets a document also attach to a maintenance entry.
--
--   * Extend document_type with the permanent-record categories the Vault needs.
--   * document.log_entry_id → a document can attach to a log entry AND/OR sit in
--     the Vault (null = Vault-only). Plus file_name/mime_type/size_bytes so the
--     download route can serve it correctly.
--   * log_entry.reference_links → [{label,url}] external references (STC/AC/AD
--     pages, etc). ad_refs/sb_refs already exist and are editable.
--   * Tighten the document write policy: 0001 left it at `for all` using
--     has_aircraft_access, so a read-only VIEWER could write documents. Split it
--     into read=has_aircraft_access / write=can_edit_aircraft like every other
--     table (0015 lesson) — required now that the Vault UI writes this table.
-- ===========================================================================

alter type document_type add value if not exists 'airworthiness_cert';
alter type document_type add value if not exists 'registration';
alter type document_type add value if not exists 'radio_license';
alter type document_type add value if not exists 'poh_afm';
alter type document_type add value if not exists 'maintenance_manual';

alter table document add column if not exists log_entry_id uuid references log_entry(id) on delete set null;
alter table document add column if not exists file_name text;
alter table document add column if not exists mime_type text;
alter table document add column if not exists size_bytes integer;
create index if not exists document_entry_idx on document(log_entry_id);

alter table log_entry add column if not exists reference_links jsonb not null default '[]'::jsonb;

-- Read = anyone with access; write = editors only. 0001 shipped a single
-- permissive `for all` policy (document_access) that let viewers write. Some
-- databases were already hand-split into document_read/document_write (drift not
-- captured in a migration); this converges either state to the canonical split
-- and records it in migration history so a fresh DB is correct too. Idempotent.
drop policy if exists document_access on document;
drop policy if exists document_read on document;
drop policy if exists document_write on document;
create policy document_read on document for select
  using (has_aircraft_access(aircraft_id));
create policy document_write on document for all
  using (can_edit_aircraft(aircraft_id))
  with check (can_edit_aircraft(aircraft_id));
