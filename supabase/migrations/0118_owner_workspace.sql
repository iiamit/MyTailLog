-- Source-first intake, private owner finances, and engine lifecycle observations.
alter table component add column position text check (length(position) <= 80);
create table aircraft_inbox (
 id uuid primary key, aircraft_id uuid not null references aircraft(id) on delete cascade,
 created_by uuid references auth.users(id) on delete set null, file_name text not null check(length(file_name) between 1 and 255),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 26214400), storage_path text not null,
 restore_source_id uuid,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 kind text not null default 'unclassified' check(kind in ('unclassified','logbook','invoice','oil_report')),
 state text not null default 'uploaded' check(state in ('uploaded','review','approved','failed')),
 proposal jsonb not null default '{}' check(octet_length(proposal::text)<=1048576), rendered_pages jsonb not null default '[]' check(jsonb_typeof(rendered_pages)='array' and jsonb_array_length(rendered_pages)<=500),
 document_id uuid references document(id) on delete set null, page_ids uuid[] not null default '{}', error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(aircraft_id,restore_source_id), check(storage_path like aircraft_id::text||'/inbox/'||id::text||'/%')
);
create unique index aircraft_inbox_content on aircraft_inbox(aircraft_id,created_by,sha256) where restore_source_id is null;
create index aircraft_inbox_aircraft on aircraft_inbox(aircraft_id,created_at desc);
create trigger aircraft_inbox_updated before update on aircraft_inbox for each row execute function set_updated_at();
alter table aircraft_inbox enable row level security;
-- Invoices can contain private financial information: an editor cannot read another uploader's inbox.
create policy inbox_read on aircraft_inbox for select to authenticated using (
 can_edit_aircraft(aircraft_id) and (created_by=auth.uid() or exists(select 1 from aircraft a where a.id=aircraft_id and a.owner_id=auth.uid()))
);
create policy inbox_insert on aircraft_inbox for insert to authenticated with check(can_edit_aircraft(aircraft_id) and created_by=auth.uid() and (restore_source_id is null or exists(select 1 from aircraft a where a.id=aircraft_inbox.aircraft_id and a.owner_id=auth.uid())));
create policy inbox_update on aircraft_inbox for update to authenticated using (
 can_edit_aircraft(aircraft_id) and (created_by=auth.uid() or exists(select 1 from aircraft a where a.id=aircraft_id and a.owner_id=auth.uid()))
) with check(can_edit_aircraft(aircraft_id));
alter table oil_analysis_sample add column source_inbox_id uuid references aircraft_inbox(id) on delete set null;
create table aircraft_expense (
 id uuid primary key, aircraft_id uuid not null references aircraft(id) on delete cascade,
 date date not null, currency text not null check(currency in ('USD','CAD','EUR','GBP','AUD','NZD','CHF','JPY','CNY','HKD','SGD','INR','ZAR','SEK','NOK','DKK','AED','ILS','BRL','MXN','KWD','BHD','OMR')),
 amount_minor bigint not null check(amount_minor between -9000000000000 and 9000000000000 and amount_minor<>0),
 category text not null check(category in ('maintenance','fuel','oil','insurance','hangar','other')),
 cost_type text not null check(cost_type in ('fixed','variable')), basis text not null check(basis in ('actual','reserve')),
 vendor text check(length(vendor)<=200), payer text check(length(payer)<=200), notes text check(length(notes)<=4000),
 document_id uuid references document(id) on delete set null, log_entry_id uuid references log_entry(id) on delete set null,
 inbox_id uuid unique references aircraft_inbox(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index aircraft_expense_period on aircraft_expense(aircraft_id,date);
create trigger aircraft_expense_updated before update on aircraft_expense for each row execute function set_updated_at();
alter table aircraft_expense enable row level security;
create policy expense_owner on aircraft_expense for all to authenticated using (
 exists(select 1 from aircraft a where a.id=aircraft_id and a.owner_id=auth.uid())
) with check(exists(select 1 from aircraft a where a.id=aircraft_id and a.owner_id=auth.uid()));
create table engine_observation (
 id uuid primary key, aircraft_id uuid not null references aircraft(id) on delete cascade,
 component_id uuid not null references component(id) on delete cascade, event_date date not null,
 kind text not null check(kind in ('overhaul','cylinder_replacement','compression')), notes text check(length(notes)<=4000),
 readings jsonb not null default '[]', cylinders integer[] not null default '{}',
 source_entry_id uuid references log_entry(id) on delete set null, source_page_id uuid references page(id) on delete set null,
 meter_basis text check(meter_basis in ('tach','hobbs')), meter_reading numeric(10,1) check(meter_reading>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index engine_observation_history on engine_observation(aircraft_id,component_id,event_date);
create trigger engine_observation_updated before update on engine_observation for each row execute function set_updated_at();
alter table engine_observation enable row level security;
create policy engine_observation_read on engine_observation for select to authenticated using(has_aircraft_access(aircraft_id));
create policy engine_observation_write on engine_observation for all to authenticated using(can_edit_aircraft(aircraft_id)) with check(can_edit_aircraft(aircraft_id));
-- Guard cross-aircraft foreign keys, including direct authenticated DB writes.
create function validate_owner_workspace_links() returns trigger language plpgsql set search_path=public as $$
begin
 if new.document_id is not null and not exists(select 1 from document where id=new.document_id and aircraft_id=new.aircraft_id) then raise exception 'Document belongs to another aircraft'; end if;
 if new.log_entry_id is not null and not exists(select 1 from log_entry where id=new.log_entry_id and aircraft_id=new.aircraft_id) then raise exception 'Entry belongs to another aircraft'; end if;
 if new.inbox_id is not null and not exists(select 1 from aircraft_inbox where id=new.inbox_id and aircraft_id=new.aircraft_id) then raise exception 'Inbox belongs to another aircraft'; end if;
 return new;
end $$;
create trigger expense_links before insert or update on aircraft_expense for each row execute function validate_owner_workspace_links();
create function validate_engine_observation() returns trigger language plpgsql set search_path=public as $$
declare r jsonb;
begin
 if not exists(select 1 from component where id=new.component_id and aircraft_id=new.aircraft_id and category='engine') then raise exception 'Choose an engine on this aircraft'; end if;
 if new.source_entry_id is not null and not exists(select 1 from log_entry where id=new.source_entry_id and aircraft_id=new.aircraft_id) then raise exception 'Entry belongs to another aircraft'; end if;
 if new.source_page_id is not null and not exists(select 1 from page where id=new.source_page_id and aircraft_id=new.aircraft_id) then raise exception 'Page belongs to another aircraft'; end if;
 if coalesce(jsonb_typeof(new.readings),'null')<>'array' or jsonb_array_length(new.readings)>12 then raise exception 'Invalid compression readings'; end if;
 if new.kind='compression' and jsonb_array_length(new.readings)=0 then raise exception 'Compression readings required'; end if;
 for r in select value from jsonb_array_elements(new.readings) loop
   if not(r ?& array['cylinder','psi','reference']) or jsonb_typeof(r->'cylinder')<>'number' or jsonb_typeof(r->'psi')<>'number' or jsonb_typeof(r->'reference')<>'number' or (r->>'cylinder')::numeric not between 1 and 12 or (r->>'cylinder')::numeric<>trunc((r->>'cylinder')::numeric)
     or (r->>'reference')::numeric not between 1 and 120 or (r->>'psi')::numeric not between 0 and (r->>'reference')::numeric then raise exception 'Invalid compression reading'; end if;
 end loop;
 if new.kind='cylinder_replacement' and cardinality(new.cylinders)=0 then raise exception 'Replaced cylinders required'; end if;
 if exists(select 1 from unnest(new.cylinders) c where c is null or c not between 1 and 12) or cardinality(new.cylinders)<>(select count(distinct c) from unnest(new.cylinders) c) then raise exception 'Invalid replaced cylinders'; end if;
 if (select count(distinct value->>'cylinder') from jsonb_array_elements(new.readings))<>jsonb_array_length(new.readings) then raise exception 'Duplicate cylinder'; end if;
 return new;
end $$;
create trigger engine_observation_links before insert or update on engine_observation for each row execute function validate_engine_observation();
-- One transaction creates all approved projections. Failed approvals never leave partial records.
create function approve_aircraft_inbox(p_aircraft uuid,p_id uuid,p_base timestamptz,p_kind text,p_book uuid default null,p_component uuid default null,p_proposal jsonb default '{}',p_count integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item aircraft_inbox; doc uuid; rp jsonb; seq integer; ids uuid[]='{}'; sample jsonb; expense jsonb; duplicate uuid;
begin
 select * into item from aircraft_inbox where id=p_id and aircraft_id=p_aircraft and can_edit_aircraft(p_aircraft) and (created_by=auth.uid() or exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid())) for update;
 if item.id is null then raise exception 'Inbox item not found' using errcode='42501'; end if;
 if item.state='approved' then return to_jsonb(item); end if;
 if item.updated_at<>p_base then raise exception 'Inbox changed; reload before approving' using errcode='40001'; end if;
 if p_kind not in ('logbook','invoice','oil_report','unclassified') then raise exception 'Invalid destination'; end if;
 if p_component is not null and not exists(select 1 from component where id=p_component and aircraft_id=p_aircraft and category='engine') then raise exception 'Choose an engine on this aircraft'; end if;
 if p_kind='logbook' then
  if not exists(select 1 from logbook where id=p_book and aircraft_id=p_aircraft) then raise exception 'Choose a logbook on this aircraft'; end if;
  if p_count<1 or p_count>500 or jsonb_array_length(item.rendered_pages)<>p_count or exists(select 1 from generate_series(1,p_count) n where not exists(select 1 from jsonb_array_elements(item.rendered_pages) r where (r->>'index')::integer=n)) then raise exception 'Render and upload every page first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_book::text,0));
  insert into scan_batch(id,aircraft_id,logbook_id,source,expected_pages,is_handwritten,created_by)
   values(p_id,p_aircraft,p_book,case when item.mime_type='application/pdf' then 'pdf' else 'web_upload' end,p_count,true,auth.uid());
  select coalesce(max(page_sequence),0) into seq from page where logbook_id=p_book;
  for rp in select value from jsonb_array_elements(item.rendered_pages) order by (value->>'index')::integer loop
   seq=seq+1;
   if rp->>'storagePath' not like p_aircraft::text||'/inbox/'||p_id::text||'/page-%' then raise exception 'Invalid page storage'; end if;
   select id into duplicate from page where aircraft_id=p_aircraft and image_phash ~ '^[a-f0-9]{16}$' and bit_count((('x'||image_phash)::bit(64)) # (('x'||(rp->>'imagePhash'))::bit(64)))<=6 order by bit_count((('x'||image_phash)::bit(64)) # (('x'||(rp->>'imagePhash'))::bit(64))),created_at limit 1;
   insert into page(id,aircraft_id,logbook_id,storage_path,page_sequence,extraction_status,queued_by,is_handwritten,image_phash,duplicate_of_page_id,batch_id)
    values((rp->>'pageId')::uuid,p_aircraft,p_book,rp->>'storagePath',seq,'queued',auth.uid(),true,rp->>'imagePhash',duplicate,p_id);
   ids=array_append(ids,(rp->>'pageId')::uuid);
  end loop;
 elsif p_kind='invoice' then
  if not exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid()) then raise exception 'Only the owner can manage finances' using errcode='42501'; end if;
  expense=p_proposal;
  insert into aircraft_expense(id,aircraft_id,date,currency,amount_minor,category,cost_type,basis,vendor,notes,payer,inbox_id,log_entry_id)
  values(p_id,p_aircraft,(expense->>'date')::date,expense->>'currency',(expense->>'amount_minor')::bigint,coalesce(expense->>'category','maintenance'),coalesce(expense->>'cost_type','variable'),'actual',expense->>'vendor',expense->>'notes',expense->>'payer',p_id,(expense->>'log_entry_id')::uuid);
 elsif p_kind='oil_report' then
  perform pg_advisory_xact_lock(hashtextextended(p_aircraft::text,2));
  if coalesce(jsonb_typeof(p_proposal->'samples'),'null')<>'array' or jsonb_array_length(p_proposal->'samples') not between 1 and 100 then raise exception 'Review dated samples first'; end if;
  for sample in select value from jsonb_array_elements(p_proposal->'samples') loop
   -- Replays may reuse identical measurements; corrected values need explicit review.
   if exists(select 1 from oil_analysis_sample o where o.aircraft_id=p_aircraft and o.component_id is not distinct from p_component and o.sample_date=(sample->>'sample_date')::date and (o.engine_hours,o.oil_hours,o.oil_added_quarts,o.elements_ppm,o.oil_properties,o.universal_averages) is distinct from ((sample->>'engine_hours')::numeric,(sample->>'oil_hours')::numeric,(sample->>'oil_added_quarts')::numeric,coalesce(sample->'elements_ppm','{}'::jsonb),sample->'oil_properties',p_proposal->'universal_averages')) then raise exception 'A different oil sample already exists on this date; correct the existing sample before approving' using errcode='40001'; end if;
   if not exists(select 1 from oil_analysis_sample where aircraft_id=p_aircraft and component_id is not distinct from p_component and sample_date=(sample->>'sample_date')::date) then
    insert into oil_analysis_sample(aircraft_id,component_id,sample_date,analysis_date,lab,lab_number,sample_number,oil_type,oil_hours,engine_hours,oil_added_quarts,elements_ppm,oil_properties,universal_averages,lab_comments,notes,source_inbox_id)
    values(p_aircraft,p_component,(sample->>'sample_date')::date,(p_proposal->>'report_date')::date,p_proposal->>'lab',p_proposal->>'lab_number',sample->>'sample_number',p_proposal->>'oil_type',(sample->>'oil_hours')::numeric,(sample->>'engine_hours')::numeric,(sample->>'oil_added_quarts')::numeric,coalesce(sample->'elements_ppm','{}'),sample->'oil_properties',p_proposal->'universal_averages',p_proposal->>'lab_comments','Imported from reviewed inbox report',p_id);
   end if;
  end loop;
 end if;
 -- Non-financial originals are discoverable in Documents; invoices remain private in the inbox.
 if p_kind<>'invoice' then
  doc=p_id;
  insert into document(id,aircraft_id,type,title,storage_path,file_name,mime_type,size_bytes)
   values(doc,p_aircraft,'other',item.file_name,item.storage_path,item.file_name,item.mime_type,item.size_bytes);
 end if;
 update aircraft_inbox set kind=p_kind,state='approved',proposal=p_proposal,document_id=doc,page_ids=ids,error=null where id=p_id returning * into item;
 return to_jsonb(item);
end $$;
revoke all on function approve_aircraft_inbox(uuid,uuid,timestamptz,text,uuid,uuid,jsonb,integer) from public,anon;
grant execute on function approve_aircraft_inbox(uuid,uuid,timestamptz,text,uuid,uuid,jsonb,integer) to authenticated;
-- CSV import is all-or-nothing and retry-safe; an existing differing id aborts.
create function import_aircraft_expenses(p_aircraft uuid,p_rows jsonb) returns void language plpgsql security invoker set search_path=public as $$
declare r jsonb; old aircraft_expense; candidate aircraft_expense;
begin
 if not exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid()) then raise exception 'Only the owner can manage finances' using errcode='42501'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Invalid expense batch'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_aircraft::text,1));
 for r in select value from jsonb_array_elements(p_rows) loop
  r=(r-'created_at'-'updated_at'-'inbox_id')||jsonb_build_object('aircraft_id',p_aircraft);
  select * into candidate from jsonb_populate_record(null::aircraft_expense,r);
  select * into old from aircraft_expense where id=candidate.id;
  if old.id is not null then
   if (to_jsonb(old)-'created_at'-'updated_at'-'inbox_id')<>(to_jsonb(candidate)-'created_at'-'updated_at'-'inbox_id') then raise exception 'An expense identifier already has different details'; end if;
  else
   insert into aircraft_expense(id,aircraft_id,date,currency,amount_minor,category,cost_type,basis,vendor,notes,payer,document_id,log_entry_id)
    values(candidate.id,p_aircraft,candidate.date,candidate.currency,candidate.amount_minor,candidate.category,candidate.cost_type,candidate.basis,candidate.vendor,candidate.notes,candidate.payer,candidate.document_id,candidate.log_entry_id);
  end if;
 end loop;
end $$;
revoke all on function import_aircraft_expenses(uuid,jsonb) from public,anon;
grant execute on function import_aircraft_expenses(uuid,jsonb) to authenticated;
alter table aircraft_inbox add column processing_until timestamptz;
create function stage_inbox_page(p_aircraft uuid,p_id uuid,p_page jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare item aircraft_inbox; old jsonb;
begin
 select * into item from aircraft_inbox where id=p_id and aircraft_id=p_aircraft and can_edit_aircraft(p_aircraft) and (created_by=auth.uid() or exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid())) for update;
 if item.id is null then raise exception 'Inbox item not found' using errcode='42501'; end if;
 if item.state='approved' then raise exception 'Already approved'; end if;
 if coalesce(jsonb_typeof(p_page->'index'),'null')<>'number' or coalesce(p_page->>'imagePhash','') !~ '^[a-f0-9]{16}$' or coalesce(p_page->>'sha256','') !~ '^[a-f0-9]{64}$' or coalesce(p_page->>'pageId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or (p_page->>'index')::numeric<>trunc((p_page->>'index')::numeric) or (p_page->>'index')::integer not between 1 and 500 or p_page->>'storagePath'<>p_aircraft::text||'/inbox/'||p_id::text||'/page-'||(p_page->>'index')||'.jpg' then raise exception 'Invalid rendered page'; end if;
 select value into old from jsonb_array_elements(item.rendered_pages) where value->>'index'=p_page->>'index';
 if old is not null and old<>p_page then raise exception 'Page index already contains different content'; end if;
 if old is null then update aircraft_inbox set rendered_pages=rendered_pages||jsonb_build_array(p_page) where id=p_id returning * into item; end if;
 return to_jsonb(item);
end $$;
revoke all on function stage_inbox_page(uuid,uuid,jsonb) from public,anon;
grant execute on function stage_inbox_page(uuid,uuid,jsonb) to authenticated;

create function immutable_inbox_original() returns trigger language plpgsql set search_path=public as $$
begin
 if (new.id,new.aircraft_id,new.storage_path,new.restore_source_id,new.sha256,new.file_name,new.mime_type,new.size_bytes,new.created_at)
  is distinct from (old.id,old.aircraft_id,old.storage_path,old.restore_source_id,old.sha256,old.file_name,old.mime_type,old.size_bytes,old.created_at) or (new.created_by is distinct from old.created_by and new.created_by is not null) then raise exception 'Original upload metadata cannot be changed'; end if;
 if old.state='approved' and (new.state,new.kind,new.proposal,new.document_id,new.page_ids) is distinct from (old.state,old.kind,old.proposal,old.document_id,old.page_ids) then raise exception 'Approved projections must be corrected in their destination'; end if;
 return new;
end $$;
create trigger inbox_original_immutable before update on aircraft_inbox for each row execute function immutable_inbox_original();

-- Only these RPCs may transition approval state or register rendered pages.
revoke insert,update on aircraft_inbox from authenticated,anon;
grant insert(id,aircraft_id,created_by,file_name,mime_type,size_bytes,storage_path,sha256,restore_source_id) on aircraft_inbox to authenticated;
grant update(kind,proposal,error,processing_until) on aircraft_inbox to authenticated;
create function complete_inbox_analysis(p_aircraft uuid,p_id uuid,p_base timestamptz,p_kind text,p_proposal jsonb,p_error text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare item aircraft_inbox;
begin
 select * into item from aircraft_inbox where id=p_id and aircraft_id=p_aircraft and can_edit_aircraft(p_aircraft) and (created_by=auth.uid() or exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid())) for update;
 if item.id is null then raise exception 'Inbox item not found' using errcode='42501'; end if;
 if item.state='approved' or item.updated_at<>p_base then raise exception 'Upload changed during analysis' using errcode='40001'; end if;
 update aircraft_inbox set kind=p_kind,proposal=p_proposal,state=case when p_error is null then 'review' else 'failed' end,error=p_error,processing_until=null where id=p_id returning * into item;
 return to_jsonb(item);
end $$;
revoke all on function complete_inbox_analysis(uuid,uuid,timestamptz,text,jsonb,text) from public,anon;
grant execute on function complete_inbox_analysis(uuid,uuid,timestamptz,text,jsonb,text) to authenticated;
create function validate_engine_oil_links() returns trigger language plpgsql set search_path=public as $$
begin
 if new.component_id is not null and not exists(select 1 from component where id=new.component_id and aircraft_id=new.aircraft_id and category='engine') then raise exception 'Choose an engine on this aircraft'; end if;
 if tg_table_name='oil_analysis_sample' and to_jsonb(new)->>'source_inbox_id' is not null and not exists(select 1 from aircraft_inbox where id=(to_jsonb(new)->>'source_inbox_id')::uuid and aircraft_id=new.aircraft_id) then raise exception 'Oil source belongs to another aircraft'; end if;
 return new;
end $$;
create trigger oil_addition_engine before insert or update on oil_addition for each row execute function validate_engine_oil_links();
create trigger oil_sample_engine before insert or update on oil_analysis_sample for each row execute function validate_engine_oil_links();
-- Restoring an owner's archive may reconnect already-restored projections, but never creates them again.
create function restore_inbox_destination(p_aircraft uuid,p_id uuid,p_kind text,p_proposal jsonb,p_approved boolean,p_document uuid default null,p_pages uuid[] default '{}') returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid()) or not exists(select 1 from aircraft_inbox where id=p_id and aircraft_id=p_aircraft and created_by=auth.uid() and state<>'approved') then raise exception 'Owner restore only' using errcode='42501'; end if;
 if p_document is not null and not exists(select 1 from document where id=p_document and aircraft_id=p_aircraft) then raise exception 'Foreign document'; end if;
 if exists(select 1 from unnest(p_pages) p where not exists(select 1 from page where id=p and aircraft_id=p_aircraft)) then raise exception 'Foreign page'; end if;
 if p_approved and p_kind='invoice' and not exists(select 1 from aircraft_expense where inbox_id=p_id and aircraft_id=p_aircraft) then raise exception 'Restore the invoice expense first'; end if;
 update aircraft_inbox set kind=p_kind,proposal=p_proposal,state=case when p_approved then 'approved' else 'review' end,document_id=p_document,page_ids=p_pages where id=p_id and aircraft_id=p_aircraft;
end $$;
revoke all on function restore_inbox_destination(uuid,uuid,text,jsonb,boolean,uuid,uuid[]) from public,anon;
grant execute on function restore_inbox_destination(uuid,uuid,text,jsonb,boolean,uuid,uuid[]) to authenticated;
-- The legacy bucket and blob endpoint are aircraft-wide; private inbox originals need a stricter boundary.
create function can_read_inbox_blob(p_path text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(
  select 1 from aircraft_inbox i join aircraft a on a.id=i.aircraft_id
  where has_aircraft_access(i.aircraft_id) and (
    (i.storage_path=p_path and can_edit_aircraft(i.aircraft_id) and (i.created_by=auth.uid() or a.owner_id=auth.uid()))
    or (i.state='approved' and i.kind<>'invoice' and i.storage_path=p_path and exists(select 1 from document d where d.id=i.document_id and d.aircraft_id=i.aircraft_id and d.storage_path=p_path))
    or (i.state='approved' and i.kind='logbook' and exists(select 1 from page p where p.id=any(i.page_ids) and p.aircraft_id=i.aircraft_id and p.storage_path=p_path))
  )
 );
$$;
revoke all on function can_read_inbox_blob(text) from public,anon;
grant execute on function can_read_inbox_blob(text) to authenticated;
create policy inbox_storage_read on storage.objects as restrictive for select to authenticated using(split_part(name,'/',2)<>'inbox' or can_read_inbox_blob(name));
create policy inbox_storage_insert on storage.objects as restrictive for insert to authenticated with check(split_part(name,'/',2)<>'inbox');
create policy inbox_storage_update on storage.objects as restrictive for update to authenticated using(split_part(name,'/',2)<>'inbox') with check(split_part(name,'/',2)<>'inbox');
create policy inbox_storage_delete on storage.objects as restrictive for delete to authenticated using(split_part(name,'/',2)<>'inbox');
-- An editor cannot bypass inbox privacy by attaching another uploader's private path to a shared document/page.
create function protect_inbox_projection() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.storage_path like new.aircraft_id::text||'/inbox/%' and not exists(
   select 1 from aircraft_inbox i join aircraft a on a.id=i.aircraft_id
   where i.aircraft_id=new.aircraft_id and can_edit_aircraft(i.aircraft_id) and (i.created_by=auth.uid() or a.owner_id=auth.uid())
   and (i.storage_path=new.storage_path or exists(select 1 from jsonb_array_elements(i.rendered_pages) r where r->>'storagePath'=new.storage_path))
 ) then raise exception 'This inbox source is private to its uploader and aircraft owner' using errcode='42501'; end if;
 return new;
end $$;
create trigger document_inbox_source before insert or update of storage_path on document for each row execute function protect_inbox_projection();
create trigger page_inbox_source before insert or update of storage_path on page for each row execute function protect_inbox_projection();
