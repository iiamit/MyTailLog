-- Isolated rollback-only fixture: private invoices, atomic approval/import and scoped engine observations.
begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000000b','viewer@example.test') on conflict(id) do nothing;
insert into aircraft(id,owner_id,tail_number) values ('11180000-0000-4000-a000-000000000001','00000000-0000-0000-0000-00000000000a','N118QA');
insert into aircraft_share(aircraft_id,invited_email,role,invited_by) values
 ('11180000-0000-4000-a000-000000000001','editor@example.test','editor','00000000-0000-0000-0000-00000000000a'),
 ('11180000-0000-4000-a000-000000000001','viewer@example.test','viewer','00000000-0000-0000-0000-00000000000a');
insert into logbook(id,aircraft_id,type) values ('11180000-0000-4000-a000-000000000002','11180000-0000-4000-a000-000000000001','engine');
insert into component(id,aircraft_id,name,category) values ('11180000-0000-4000-a000-000000000003','11180000-0000-4000-a000-000000000001','Engine','engine');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner@example.test"}';
insert into aircraft_inbox(id,aircraft_id,created_by,file_name,mime_type,size_bytes,storage_path,sha256) values
 ('11180000-0000-4000-a000-000000000004','11180000-0000-4000-a000-000000000001','00000000-0000-0000-0000-00000000000a','Invoice.pdf','application/pdf',100,'11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000004/original',repeat('a',64));
do $$ declare stamp timestamptz; begin
 select updated_at into stamp from aircraft_inbox where id='11180000-0000-4000-a000-000000000004';
 begin
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000004',stamp-interval '1 second','invoice',null,null,'{"date":"2026-01-01","currency":"USD","amount_minor":12500}');
 raise exception 'stale approval accepted'; exception when serialization_failure then null; end;
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000004',stamp,'invoice',null,null,'{"date":"2026-01-01","currency":"USD","amount_minor":12500}');
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000004',stamp,'invoice',null,null,'{"date":"2026-01-01","currency":"USD","amount_minor":12500}');
 assert (select count(*) from aircraft_expense where inbox_id='11180000-0000-4000-a000-000000000004')=1,'approval duplicated expense';
 assert not exists(select 1 from document where id='11180000-0000-4000-a000-000000000004'),'invoice leaked to shared documents';
end $$;
do $$ begin
 begin
 update aircraft_inbox set state='uploaded' where id='11180000-0000-4000-a000-000000000004';
 raise exception 'direct approval state edit accepted'; exception when insufficient_privilege then null; end;
 begin
 insert into aircraft_inbox(id,aircraft_id,created_by,file_name,mime_type,size_bytes,storage_path,sha256,state) values
 ('11180000-0000-4000-a000-000000000014','11180000-0000-4000-a000-000000000001','00000000-0000-0000-0000-00000000000a','forged.pdf','application/pdf',10,'11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000014/original',repeat('b',64),'approved');
 raise exception 'forged initial approved state accepted'; exception when insufficient_privilege then null; end;
end $$;
-- Rendered pages must be contiguous, and duplicate scans wait for an explicit decision.
insert into aircraft_inbox(id,aircraft_id,created_by,file_name,mime_type,size_bytes,storage_path,sha256) values
 ('11180000-0000-4000-a000-000000000015','11180000-0000-4000-a000-000000000001','00000000-0000-0000-0000-00000000000a','logbook.pdf','application/pdf',100,'11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000015/original',repeat('b',64));
do $$ declare stamp timestamptz; begin
 perform stage_inbox_page('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000015','{"index":1,"pageId":"11180000-0000-4000-a000-000000000021","storagePath":"11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000015/page-1.jpg","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","imagePhash":"0000000000000000"}');
 perform stage_inbox_page('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000015','{"index":3,"pageId":"11180000-0000-4000-a000-000000000023","storagePath":"11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000015/page-3.jpg","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","imagePhash":"0000000000000000"}');
 select updated_at into stamp from aircraft_inbox where id='11180000-0000-4000-a000-000000000015';
 begin
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000015',stamp,'logbook','11180000-0000-4000-a000-000000000002',null,'{}',2);
 raise exception 'non-contiguous page approval accepted'; exception when raise_exception then assert sqlerrm='Render and upload every page first','unexpected page-contiguity error'; end;
 assert not exists(select 1 from scan_batch where id='11180000-0000-4000-a000-000000000015'),'failed approval left a batch';
 perform stage_inbox_page('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000015','{"index":2,"pageId":"11180000-0000-4000-a000-000000000022","storagePath":"11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000015/page-2.jpg","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","imagePhash":"0000000000000000"}');
 select updated_at into stamp from aircraft_inbox where id='11180000-0000-4000-a000-000000000015';
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000015',stamp,'logbook','11180000-0000-4000-a000-000000000002',null,'{}',3);
 assert (select count(*) from page where batch_id='11180000-0000-4000-a000-000000000015')=3,'pages not registered atomically';
 assert (select count(*) from page where batch_id='11180000-0000-4000-a000-000000000015' and duplicate_of_page_id is not null)=2,'duplicates not paused for review';
end $$;
-- Restores preserve separate source items even when the original bytes match.
insert into aircraft_inbox(id,aircraft_id,created_by,file_name,mime_type,size_bytes,storage_path,sha256,restore_source_id)
select x.id,'11180000-0000-4000-a000-000000000001',auth.uid(),'restore.pdf','application/pdf',8,'11180000-0000-4000-a000-000000000001/inbox/'||x.id||'/original',repeat('b',64),x.id
from (values ('11180000-0000-4000-a000-000000000030'::uuid),('11180000-0000-4000-a000-000000000031'::uuid)) x(id);
do $$ begin
 assert (select count(*) from aircraft_inbox where restore_source_id is not null)=2,'same-byte restored items collapsed';
end $$;
insert into oil_analysis_sample(aircraft_id,component_id,sample_date,elements_ppm) values ('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000003','2026-01-01','{"iron":10}');
do $$ declare stamp timestamptz; begin
 select updated_at into stamp from aircraft_inbox where id='11180000-0000-4000-a000-000000000030';
 begin
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000030',stamp,'oil_report',null,'11180000-0000-4000-a000-000000000003','{"samples":[{"sample_date":"2026-01-01","elements_ppm":{"iron":15}}]}');
 raise exception 'corrected oil report silently skipped'; exception when serialization_failure then null; end;
 assert (select state from aircraft_inbox where id='11180000-0000-4000-a000-000000000030')='uploaded','conflicted report was approved';
 assert (select elements_ppm->>'iron' from oil_analysis_sample where aircraft_id='11180000-0000-4000-a000-000000000001' and sample_date='2026-01-01')='10','existing oil sample overwritten';
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000030',stamp,'invoice',null,null,'{"date":"2026-01-01","currency":"USD","amount_minor":100}');
 select updated_at into stamp from aircraft_inbox where id='11180000-0000-4000-a000-000000000031';
 perform approve_aircraft_inbox('11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000031',stamp,'invoice',null,null,'{"date":"2026-01-01","currency":"USD","amount_minor":100}');
 assert (select count(*) from aircraft_expense where inbox_id in ('11180000-0000-4000-a000-000000000030','11180000-0000-4000-a000-000000000031'))=2,'same-byte restored invoices lost separate projections';
end $$;
-- A failed batch must roll back its first valid row.
do $$ begin
 begin
 perform import_aircraft_expenses('11180000-0000-4000-a000-000000000001','[{"id":"11180000-0000-4000-a000-000000000005","date":"2026-01-01","currency":"USD","amount_minor":100,"category":"fuel","cost_type":"variable","basis":"actual"},{"id":"11180000-0000-4000-a000-000000000006","date":"2026-01-01","currency":"USD","amount_minor":0,"category":"fuel","cost_type":"variable","basis":"actual"}]');
 raise exception 'invalid batch accepted'; exception when check_violation then null; end;
 assert not exists(select 1 from aircraft_expense where id='11180000-0000-4000-a000-000000000005'),'partial expense import';
 begin
 insert into aircraft_expense(id,aircraft_id,date,currency,amount_minor,category,cost_type,basis,log_entry_id) values ('11180000-0000-4000-a000-000000000007','11180000-0000-4000-a000-000000000001','2026-01-01','USD',100,'fuel','variable','actual','40000000-0000-0000-0000-000000000001');
 raise exception 'foreign entry accepted'; exception when raise_exception then assert sqlerrm='Entry belongs to another aircraft','unexpected cross-aircraft error'; end;
end $$;
reset role;
insert into storage.objects(bucket_id,name) values ('logbook-pages','11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000004/original');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-00000000000e","email":"editor@example.test"}';
do $$ begin
 assert (select count(*) from aircraft_expense where aircraft_id='11180000-0000-4000-a000-000000000001')=0,'editor reads finances';
 assert not can_read_inbox_blob('11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000004/original'),'editor reads private original';
 assert not exists(select 1 from storage.objects where name='11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000004/original'),'editor bypasses inbox via storage SDK';
 begin
 insert into document(aircraft_id,type,title,storage_path) values ('11180000-0000-4000-a000-000000000001','other','Forged invoice source','11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000004/original');
 raise exception 'editor forged shared document reference to invoice'; exception when insufficient_privilege then null; end;

 assert (select count(*) from aircraft_inbox where aircraft_id='11180000-0000-4000-a000-000000000001')=0,'editor reads owner private inbox';
 begin
 insert into aircraft_expense(id,aircraft_id,date,currency,amount_minor,category,cost_type,basis) values ('11180000-0000-4000-a000-000000000008','11180000-0000-4000-a000-000000000001','2026-01-01','USD',100,'fuel','variable','actual');
 raise exception 'editor writes finances'; exception when insufficient_privilege then null; end;
end $$;
insert into engine_observation(id,aircraft_id,component_id,event_date,kind,readings) values ('11180000-0000-4000-a000-000000000009','11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000003','2026-01-01','compression','[{"cylinder":1,"psi":75,"reference":80},{"cylinder":2,"psi":69,"reference":70}]');
reset role;
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-00000000000b","email":"viewer@example.test"}';
do $$ begin
 assert (select count(*) from aircraft_expense where aircraft_id='11180000-0000-4000-a000-000000000001')=0,'viewer reads finances';
 assert (select count(*) from aircraft_inbox where aircraft_id='11180000-0000-4000-a000-000000000001')=0,'viewer reads inbox';
 assert (select count(*) from engine_observation where aircraft_id='11180000-0000-4000-a000-000000000001')=1,'viewer cannot read engine history';
 begin
 insert into engine_observation(id,aircraft_id,component_id,event_date,kind) values ('11180000-0000-4000-a000-000000000010','11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000003','2026-01-02','overhaul');
 raise exception 'viewer writes engine history'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Deleting an editor account retains uploads that belong to another owner's aircraft.
insert into auth.users(id,email) values ('11180000-0000-4000-a000-000000000099','uploader@example.test');
insert into aircraft_inbox(id,aircraft_id,created_by,file_name,mime_type,size_bytes,storage_path,sha256) values
 ('11180000-0000-4000-a000-000000000098','11180000-0000-4000-a000-000000000001','11180000-0000-4000-a000-000000000099','retained.pdf','application/pdf',100,'11180000-0000-4000-a000-000000000001/inbox/11180000-0000-4000-a000-000000000098/original',repeat('c',64));
delete from auth.users where id='11180000-0000-4000-a000-000000000099';
do $$ begin assert exists(select 1 from aircraft_inbox where id='11180000-0000-4000-a000-000000000098' and created_by is null),'deleting uploader removed another owners original'; end $$;
rollback;
