-- ===========================================================================
-- Seed change_log with the CURRENT state of every synced table.
--
-- The 0044 triggers only record changes from their creation forward, so a device
-- syncing from cursor 0 would never see data that already existed. This inserts
-- one synthetic 'I' per current row so the first pull returns the whole dataset;
-- the pull endpoint fetches live row data by id, so these rows carry today's
-- values. Ordered parent → child so seqs roughly follow FK dependencies.
--
-- One-time backfill. (Re-running would append duplicates, but the client's
-- reduce-to-latest makes that harmless — just avoid it.)
-- ===========================================================================

insert into change_log (table_name, row_id, op, aircraft_id) select 'aircraft',            id, 'I', id          from aircraft;
insert into change_log (table_name, row_id, op, aircraft_id) select 'logbook',             id, 'I', aircraft_id from logbook;
insert into change_log (table_name, row_id, op, aircraft_id) select 'page',                id, 'I', aircraft_id from page;
insert into change_log (table_name, row_id, op, aircraft_id) select 'log_entry',           id, 'I', aircraft_id from log_entry;
insert into change_log (table_name, row_id, op, aircraft_id) select 'component',            id, 'I', aircraft_id from component;
insert into change_log (table_name, row_id, op, aircraft_id) select 'ad_compliance',        id, 'I', aircraft_id from ad_compliance;
insert into change_log (table_name, row_id, op, aircraft_id) select 'maintenance_item',     id, 'I', aircraft_id from maintenance_item;
insert into change_log (table_name, row_id, op, aircraft_id) select 'document',             id, 'I', aircraft_id from document;
insert into change_log (table_name, row_id, op, aircraft_id) select 'squawk',               id, 'I', aircraft_id from squawk;
insert into change_log (table_name, row_id, op, aircraft_id) select 'oil_addition',         id, 'I', aircraft_id from oil_addition;
insert into change_log (table_name, row_id, op, aircraft_id) select 'oil_analysis_sample',  id, 'I', aircraft_id from oil_analysis_sample;
insert into change_log (table_name, row_id, op, aircraft_id) select 'hours_reading',        id, 'I', aircraft_id from hours_reading;
insert into change_log (table_name, row_id, op, aircraft_id) select 'scanned_document',     id, 'I', aircraft_id from scanned_document;
insert into change_log (table_name, row_id, op, aircraft_id) select 'weight_balance',       id, 'I', aircraft_id from weight_balance;
