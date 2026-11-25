-- Rollback-only regression: reference-page review, conflicts, historical equipment and retry receipts.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','owner@example.test'),
 ('00000000-0000-0000-0000-00000000000b','viewer@example.test') on conflict(id) do nothing;
insert into aircraft(id,owner_id,tail_number) values ('11190000-0000-4000-a000-000000000001','00000000-0000-0000-0000-00000000000a','N119QA');
insert into aircraft_share(aircraft_id,invited_email,role,invited_by) values ('11190000-0000-4000-a000-000000000001','viewer@example.test','viewer','00000000-0000-0000-0000-00000000000a');
insert into logbook(id,aircraft_id,type) values ('11190000-0000-4000-a000-000000000002','11190000-0000-4000-a000-000000000001','engine');
insert into page(id,aircraft_id,logbook_id,storage_path,extraction_status,content_kinds,identity_suggestions) values
 ('11190000-0000-4000-a000-000000000003','11190000-0000-4000-a000-000000000001','11190000-0000-4000-a000-000000000002','11190000-0000-4000-a000-000000000001/qa/cover','extracted','{identity}',
 '[{"id":"aaaaaaaaaaaaaaaaaaaaaaaa","subject":"aircraft","name":"Aircraft","fields":{"serial_number":"000123"},"quote":"Serial 000123","confidence":0.9,"status":"pending"},{"id":"bbbbbbbbbbbbbbbbbbbbbbbb","subject":"engine","name":"Engine","fields":{"serial_number":"000456"},"quote":"Engine serial 000456","confidence":0.8,"status":"pending"}]');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-00000000000a","email":"owner@example.test"}';
do $$ declare p page; a aircraft; result jsonb; request jsonb; fields jsonb; begin
 select * into p from page where id='11190000-0000-4000-a000-000000000003';
 select * into a from aircraft where id=p.aircraft_id;
 fields='{"action":"accept","suggestionId":"aaaaaaaaaaaaaaaaaaaaaaaa","fields":{"serial_number":"000123"}}'::jsonb||jsonb_build_object('targetBase',a.updated_at);
 result=review_page_details(a.id,p.id,p.updated_at-interval '1 second',fields);
 assert result->>'status'='conflict','stale page accepted';
 result=review_page_details(a.id,p.id,p.updated_at,fields||jsonb_build_object('targetBase',a.updated_at-interval '1 second'));
 assert result->>'status'='conflict','stale aircraft overwritten';
 assert result->'row'->>'id'=p.id::text,'conflict must retain the page target';
 result=review_page_details(a.id,p.id,p.updated_at,fields);
 assert result->>'status'='ok';
 assert (select serial_number from aircraft where id=a.id)='000123','leading zeros lost';
 assert (select identity_sources->'serial_number'->>'pageId' from aircraft where id=a.id)=p.id::text,'source lost';
 select * into p from page where id=p.id;
 assert p.identity_suggestions->1->>'status'='pending',p.identity_suggestions::text;
 request=jsonb_build_object('id','identity-retry-fixture','type','page.details','aircraftId',a.id,'base',p.updated_at,
   'payload',jsonb_build_object('pageId',p.id,'decision','{"action":"accept","suggestionId":"bbbbbbbbbbbbbbbbbbbbbbbb","targetId":"11190000-0000-4000-a000-000000000004","fields":{"serial_number":"000456"}}'::jsonb));
 result=apply_sync_write(request,'review_page_details',jsonb_build_object('p_aircraft',a.id,'p_page',p.id,'p_base',p.updated_at,'p_decision',request->'payload'->'decision'));
 assert result->>'status'='ok';
 perform apply_sync_write(request,'review_page_details',jsonb_build_object('p_aircraft',a.id,'p_page',p.id,'p_base',p.updated_at,'p_decision',request->'payload'->'decision'));
 assert (select count(*) from component where aircraft_id=a.id)=1,'retry duplicated equipment';
 assert (select identity_historical and not is_installed and install_date is null from component where id='11190000-0000-4000-a000-000000000004'),'old cover installed equipment today';
 assert (select is_complete_engine(c) from component c where id='11190000-0000-4000-a000-000000000004');
 select * into p from page where id=p.id;
 perform confirm_review_entries(a.id,p.id,p.logbook_id,p.updated_at,'[]',true);
 assert (select review_status from page where id=p.id)='confirmed','empty reference page cannot be reviewed';
 assert not exists(select 1 from log_entry where page_id=p.id),'reference page created maintenance';
 perform replace_page_extraction(p.id,clock_timestamp(),'[]',jsonb_build_object('ocr_text','Serial 000123','content_kinds','["identity"]'::jsonb,'identity_suggestions','[{"id":"aaaaaaaaaaaaaaaaaaaaaaaa","status":"pending"},{"id":"bbbbbbbbbbbbbbbbbbbbbbbb","status":"pending"}]'::jsonb));
 assert (select count(*) from page p2,jsonb_array_elements(p2.identity_suggestions) x where p2.id=p.id and x->>'status'='accepted')=2,'reread discarded decisions';
end $$;
insert into component(aircraft_id,name,category) values ('11190000-0000-4000-a000-000000000001','Vacuum pump','engine');
do $$ begin
 assert not (select is_complete_engine(c) from component c where name='Vacuum pump' and aircraft_id='11190000-0000-4000-a000-000000000001'),'accessory became an engine';
 begin
 insert into engine_observation(aircraft_id,component_id,event_date,kind,readings) select aircraft_id,id,'2026-01-01','compression','[{"cylinder":1,"psi":76,"reference":80}]' from component where aircraft_id='11190000-0000-4000-a000-000000000001' and name='Vacuum pump';
 raise exception 'accessory accepted a compression observation';
 exception when raise_exception then if sqlerrm='accessory accepted a compression observation' then raise; end if; end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-00000000000b","email":"viewer@example.test"}';
do $$ declare p page; begin
 select * into p from page where id='11190000-0000-4000-a000-000000000003';
 begin
 perform review_page_details(p.aircraft_id,p.id,p.updated_at,'{"action":"classify","kinds":["reference"]}');
 raise exception 'viewer edited page details';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
