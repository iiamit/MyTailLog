-- Reference pages and reviewed identity facts do not create maintenance entries.
alter table page add column content_kinds text[] not null default '{}',
  add column identity_suggestions jsonb not null default '[]', add column content_reviewed_at timestamptz;
alter table page add constraint page_content_kinds_check check(content_kinds <@ array['identity','equipment','maintenance','reference','blank']::text[]),
  add constraint page_identity_array_check check(jsonb_typeof(identity_suggestions)='array' and jsonb_array_length(identity_suggestions)<=60);
alter table aircraft add column identity_sources jsonb not null default '{}';
alter table component add column component_kind text check(component_kind in('engine','propeller','accessory','equipment')), add column model text, add column identity_historical boolean not null default false,
  add column identity_sources jsonb not null default '{}';

create function review_page_details(p_aircraft uuid,p_page uuid,p_base timestamptz,p_decision jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare p page; a aircraft; c component; suggestion jsonb; fields jsonb; sources jsonb; k text; v jsonb;
  target uuid; kinds text[]; installed boolean; action text:=p_decision->>'action';
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  select * into p from page where id=p_page and aircraft_id=p_aircraft for update;
  if p.id is null then raise exception 'Page not found'; end if;
  if p_base is null or p.updated_at<>p_base then return jsonb_build_object('status','conflict','row',to_jsonb(p)); end if;
  if action='classify' then
    if jsonb_typeof(p_decision->'kinds') is distinct from 'array' then raise exception 'Choose a page type'; end if;
    kinds=array(select distinct jsonb_array_elements_text(p_decision->'kinds'));
    if cardinality(kinds)<1 or not(kinds <@ array['identity','equipment','maintenance','reference','blank']::text[]) then raise exception 'Unknown page type'; end if;
    update page set content_kinds=kinds,content_reviewed_at=clock_timestamp() where id=p.id returning * into p;
    return jsonb_build_object('status','ok','row',to_jsonb(p));
  end if;
  if action not in('accept','dismiss') or action is null then raise exception 'Unknown detail decision'; end if;
  select value into suggestion from jsonb_array_elements(p.identity_suggestions) where value->>'id'=p_decision->>'suggestionId';
  if suggestion is null or suggestion->>'status'<>'pending' then raise exception 'This suggestion was already reviewed; reload'; end if;
  if action='accept' then
    fields=p_decision->'fields';
    if jsonb_typeof(fields) is distinct from 'object' or fields='{}'::jsonb then raise exception 'Enter at least one detail'; end if;
    for k,v in select * from jsonb_each(fields) loop
      if k not in('make','model','serial_number','part_number','tail_number') or jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 200 then raise exception 'Invalid identity detail'; end if;
      if (suggestion->>'subject'='aircraft' and k='part_number') or (suggestion->>'subject'<>'aircraft' and k='tail_number') then raise exception 'Detail does not belong to this record'; end if;
    end loop;
    sources=(select jsonb_object_agg(key,jsonb_build_object('pageId',p.id,'quote',suggestion->>'quote','reviewedAt',clock_timestamp(),'reviewedBy',auth.uid())) from jsonb_each(fields));
    if suggestion->>'subject'='aircraft' then
      select * into a from aircraft where id=p_aircraft for update;
      if p_decision->>'targetBase' is null or a.updated_at<>(p_decision->>'targetBase')::timestamptz then
        return jsonb_build_object('status','conflict','row',to_jsonb(p)||jsonb_build_object('identity_conflict',to_jsonb(a)));
      end if;
      update aircraft set make=coalesce(fields->>'make',a.make),model=coalesce(fields->>'model',a.model),
        serial_number=coalesce(fields->>'serial_number',a.serial_number),tail_number=coalesce(fields->>'tail_number',a.tail_number),
        identity_sources=a.identity_sources||sources where id=a.id;
    else
      target=(p_decision->>'targetId')::uuid;
      if target is null then raise exception 'Choose the equipment record'; end if;
      select * into c from component where id=target and aircraft_id=p_aircraft for update;
      if c.id is not null then
        if p_decision->>'targetBase' is null or c.updated_at<>(p_decision->>'targetBase')::timestamptz then return jsonb_build_object('status','conflict','row',to_jsonb(p)||jsonb_build_object('identity_conflict',to_jsonb(c))); end if;
        update component set make=coalesce(fields->>'make',c.make),model=coalesce(fields->>'model',c.model),
          serial_number=coalesce(fields->>'serial_number',c.serial_number),part_number=coalesce(fields->>'part_number',c.part_number),
          identity_sources=c.identity_sources||sources where id=c.id;
      else
        if p_decision->>'targetBase' is not null then raise exception 'Equipment record no longer exists'; end if;
        -- A new photo of the same cover must not create a second component.
        if fields->>'serial_number' is not null and exists(select 1 from component where aircraft_id=p_aircraft
          and lower(btrim(serial_number))=lower(btrim(fields->>'serial_number')) and category=suggestion->>'subject') then
          raise exception 'Equipment with this serial number already exists. Select that record and review its current values.';
        end if;
        installed=coalesce((p_decision->>'installed')::boolean,false);
        insert into component(id,aircraft_id,name,category,component_kind,make,model,serial_number,part_number,is_installed,identity_historical,identity_sources)
          values(target,p_aircraft,suggestion->>'name',suggestion->>'subject',case suggestion->>'subject' when 'engine' then 'engine' when 'prop' then 'propeller' else 'equipment' end,fields->>'make',fields->>'model',fields->>'serial_number',fields->>'part_number',installed,not installed,sources);
      end if;
    end if;
  end if;
  update page set identity_suggestions=(select jsonb_agg(case when value->>'id'=suggestion->>'id' then value||jsonb_build_object('status',case when action='accept' then 'accepted' else 'dismissed' end,
      'reviewedAt',clock_timestamp(),'reviewedBy',auth.uid(),'acceptedFields',case when action='accept' then fields else null end,'targetId',target) else value end order by ord)
      from jsonb_array_elements(p.identity_suggestions) with ordinality as x(value,ord)) where id=p.id returning * into p;
  return jsonb_build_object('status','ok','row',to_jsonb(p));
end $$;
revoke all on function review_page_details(uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function review_page_details(uuid,uuid,timestamptz,jsonb) to authenticated;

create or replace function public.replace_page_extraction(p_page uuid, p_started_at timestamptz, p_entries jsonb, p_state jsonb, p_stickers uuid[] default '{}')
returns void language plpgsql security invoker set search_path = public as $$
declare p public.page; item jsonb;
begin
  perform pg_advisory_xact_lock(129737019,1);
  select * into p from page where id = p_page for update;
  if p.id is null or (current_user<>'service_role' and not can_edit_aircraft(p.aircraft_id)) then raise exception 'Page not editable' using errcode='42501'; end if;
  perform id from log_entry where page_id = p_page order by id for update;
  if exists(select 1 from log_entry where page_id = p_page and updated_at > p_started_at) then
    raise exception 'Entries changed while this page was being read; retry reading' using errcode='PT409';
  end if;
  if exists(select 1 from jsonb_array_elements(p.identity_suggestions) x where (x->>'reviewedAt')::timestamptz>p_started_at) then
    raise exception 'Page details changed while reading; retry' using errcode='PT409';
  end if;
  delete from log_entry where page_id=p_page and not owner_confirmed;
  for item in select value from jsonb_array_elements(p_entries) loop
    insert into log_entry(id,page_id,logbook_id,aircraft_id,entry_index,continues_next,is_continuation,
      entry_date,hobbs,tach,description,work_performed,parts,signature_name,mechanic_cert_number,
      ad_refs,sb_refs,confidence,field_confidence,field_boxes,extraction_schema_version,extraction_model,owner_confirmed)
    select gen_random_uuid(),p.id,p.logbook_id,p.aircraft_id,r.entry_index,r.continues_next,r.is_continuation,
      r.entry_date,r.hobbs,r.tach,r.description,r.work_performed,r.parts,r.signature_name,r.mechanic_cert_number,
      r.ad_refs,r.sb_refs,r.confidence,r.field_confidence,r.field_boxes,r.extraction_schema_version,r.extraction_model,false
    from jsonb_populate_record(null::log_entry,item) r;
  end loop;
  insert into signed_entry_scan(page_id,entry_id,aircraft_id)
    select p.id,e.id,p.aircraft_id from log_entry e where e.id=any(p_stickers) and e.aircraft_id=p.aircraft_id and e.authored_signed_at is not null
    on conflict(page_id,entry_id) do nothing;
  update page set content_kinds=case when p.content_reviewed_at is not null then p.content_kinds when p_state ? 'content_kinds' then array(select jsonb_array_elements_text(p_state->'content_kinds')) else p.content_kinds end,
    identity_suggestions=case when p_state ? 'identity_suggestions' then (
      select coalesce(jsonb_agg(value),'[]') from (
        select value from jsonb_array_elements(p.identity_suggestions) where value->>'status'<>'pending'
        union all
        select value from jsonb_array_elements(p_state->'identity_suggestions') n(value) where not exists(
          select 1 from jsonb_array_elements(p.identity_suggestions) o where o->>'id'=n.value->>'id' and o->>'status'<>'pending')
      ) kept) else p.identity_suggestions end,
    review_status=case when exists(select 1 from jsonb_array_elements(coalesce(p_state->'identity_suggestions','[]')) n where not exists(
      select 1 from jsonb_array_elements(p.identity_suggestions) o where o->>'id'=n->>'id' and o->>'status'<>'pending')) then 'unreviewed' else p.review_status end,
    ocr_text=p_state->>'ocr_text', extraction_confidence=(p_state->>'extraction_confidence')::numeric,
    detected_page_count=(p_state->>'detected_page_count')::int, unread_rotated_content=coalesce((p_state->>'unread_rotated_content')::boolean,false),
    extraction_status='extracted', extraction_error=null, extracted_at=clock_timestamp() where id=p.id;
end $$;
grant execute on function public.replace_page_extraction(uuid,timestamptz,jsonb,jsonb,uuid[]) to authenticated, service_role;
revoke all on function public.replace_page_extraction(uuid,timestamptz,jsonb,jsonb,uuid[]) from public, anon;


create or replace function apply_sync_write(p_mutation jsonb, p_operation text, p_arguments jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare prior sync_mutation; outcome jsonb; owner_id uuid := auth.uid(); mutation_id text := p_mutation->>'id';
  aircraft uuid := (p_mutation->>'aircraftId')::uuid;
begin
  if owner_id is null or mutation_id is null or length(mutation_id) not between 1 and 64 then
    raise exception 'Authenticated mutation required' using errcode='42501';
  end if;
  if coalesce(p_arguments->>'p_aircraft',p_arguments->>'target_aircraft') is distinct from aircraft::text then
    raise exception 'Mutation aircraft mismatch' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(129737019,1);
  perform pg_advisory_xact_lock(hashtextextended('sync:' || owner_id::text || ':' || mutation_id,0));
  select * into prior from sync_mutation where user_id=owner_id and id=mutation_id for update;
  if prior.status='ok' then
    if prior.request is not null and (prior.request->>'type' is distinct from p_mutation->>'type'
      or prior.request->'payload' is distinct from p_mutation->'payload' or prior.aircraft_id is distinct from aircraft) then
      raise exception 'Mutation ID already used for another change' using errcode='22023';
    end if;
    return coalesce(prior.response,jsonb_build_object('status','ok','row',null));
  end if;
  case p_operation
    when 'review_page_details' then
      outcome := review_page_details(aircraft,(p_arguments->>'p_page')::uuid,(p_arguments->>'p_base')::timestamptz,p_arguments->'p_decision');
    when 'write_record' then
      outcome := write_record(p_arguments->>'p_table',aircraft,(p_arguments->>'p_id')::uuid,
        (p_arguments->>'p_base')::timestamptz,nullif(p_arguments->'p_patch','null'::jsonb),(p_arguments->>'p_delete')::boolean);
    when 'merge_log_entry' then
      outcome := merge_log_entry(aircraft,(p_arguments->>'p_head')::uuid,(p_arguments->>'p_tail')::uuid,
        (p_arguments->>'p_head_base')::timestamptz,(p_arguments->>'p_tail_base')::timestamptz,p_arguments->'p_fields');
    when 'mark_maintenance_done' then
      outcome := mark_maintenance_done(aircraft,(p_arguments->>'p_item')::uuid,(p_arguments->>'p_base')::timestamptz,
        p_arguments->'p_patch',nullif(p_arguments->'p_reading','null'::jsonb),nullif(p_arguments->'p_entry','null'::jsonb),
        nullif(p_arguments->'p_completion','null'::jsonb));
    when 'save_service_provider' then
      outcome := save_service_provider(aircraft,(p_arguments->>'p_id')::uuid,(p_arguments->>'p_base')::timestamptz,p_arguments->'p_fields');
    when 'save_planned_visit' then
      outcome := save_planned_visit(aircraft,(p_arguments->>'p_visit')::uuid,(p_arguments->>'p_base')::timestamptz,p_arguments->'p_patch',
        array(select jsonb_array_elements_text(p_arguments->'p_add')),array(select jsonb_array_elements_text(p_arguments->'p_remove')));
    when 'set_expected_hours_checked' then
      outcome := set_expected_hours_checked(aircraft,(p_arguments->>'hours_per_week')::numeric,(p_arguments->>'p_base')::timestamptz);
    when 'confirm_clean_entries' then
      outcome := confirm_clean_entries(aircraft,p_arguments->'p_versions');
    when 'create_squawk' then
      outcome := create_squawk(aircraft,p_arguments->'p_fields',array(select jsonb_array_elements_text(p_arguments->'p_photos')));
    when 'create_planned_visit' then
      outcome := create_planned_visit(aircraft,p_arguments->'p_visit',array(select jsonb_array_elements_text(p_arguments->'p_keys')));
    when 'seed_maintenance_items' then
      outcome := seed_maintenance_items(aircraft,p_arguments->'p_items');
    when 'insert_records' then
      outcome := insert_records(p_arguments->>'p_table',aircraft,p_arguments->'p_rows',
        p_arguments->>'p_conflict',coalesce((p_arguments->>'p_ignore')::boolean,false));
    when 'retire_component' then
      outcome := retire_component(aircraft,(p_arguments->>'p_id')::uuid,(p_arguments->>'p_base')::timestamptz,
        (p_arguments->>'p_date')::date,(p_arguments->>'p_entry')::uuid);
    when 'confirm_equipment_proposals' then
      outcome := confirm_equipment_proposals(aircraft,array(select jsonb_array_elements_text(p_arguments->'p_ids'))::uuid[],
        coalesce((p_arguments->>'p_dismiss')::boolean,false));
    when 'change_pages' then
      outcome := change_pages(aircraft,array(select jsonb_array_elements_text(p_arguments->'p_ids'))::uuid[],
        p_arguments->>'p_action',(p_arguments->>'p_book')::uuid);
    else raise exception 'Unsupported transactional write';
  end case;
  if outcome->>'status'='ok' then
    insert into sync_mutation(user_id,id,aircraft_id,type,status,base,response,request,resolved_at,resolution)
      values(owner_id,mutation_id,aircraft,p_mutation->>'type','ok',(p_mutation->>'base')::timestamptz,
        jsonb_build_object('id',mutation_id,'status','ok','row',outcome->'row'),p_mutation,
        case when prior.status='conflict' then now() else null end,
        case when prior.status='conflict' then coalesce(p_mutation->>'resolution','keep_mine') else null end)
    on conflict(user_id,id) do update set status='ok',response=excluded.response,request=excluded.request,
      base=excluded.base,error=null,code=null,resolved_at=excluded.resolved_at,resolution=excluded.resolution;
  end if;
  return outcome;
end $$;
revoke all on function apply_sync_write(jsonb,text,jsonb) from public,anon;
grant execute on function apply_sync_write(jsonb,text,jsonb) to authenticated;


create or replace function confirm_review_entries(p_aircraft uuid,p_page uuid,p_book uuid,p_page_base timestamptz,p_writes jsonb,p_whole boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare item jsonb; current log_entry; p page; result jsonb; entries jsonb='{}'; updated_versions jsonb='{}'; pages jsonb='{}'; created jsonb='[]'; ids jsonb='[]'; record_id uuid; fields jsonb; was_confirmed boolean;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if jsonb_array_length(p_writes)>500 then raise exception 'Too many review entries'; end if;
  if p_whole and p_page is not null then
    select * into p from page where id=p_page and aircraft_id=p_aircraft for update;
    if p.id is null or p_page_base is null or p.updated_at<>p_page_base then raise exception 'The page changed; reload before confirming' using errcode='PT409'; end if;
    if exists(select 1 from jsonb_array_elements(p.identity_suggestions) x where x->>'status'='pending') then raise exception 'Accept or dismiss the aircraft details before marking this page reviewed'; end if;
    if exists(select 1 from scanned_document where page_id=p.id and not applied and doc_type in('ad_report','weight_balance')) then raise exception 'Review and apply this document on the website first'; end if;
  end if;
  -- Validate/lock every existing version before changing any row.
  perform id from log_entry where aircraft_id=p_aircraft and id in(select (w->>'id')::uuid from jsonb_array_elements(p_writes)w) order by id for update;
  for item in select value from jsonb_array_elements(p_writes) loop
    select * into current from log_entry where id=(item->>'id')::uuid and aircraft_id=p_aircraft;
    if not coalesce((item->>'isNew')::boolean,false) then
      if current.id is null or item->>'base' is null or current.updated_at<>(item->>'base')::timestamptz then raise exception 'An entry changed; reload before confirming' using errcode='PT409'; end if;
    elsif current.id is not null and not (to_jsonb(current) @> coalesce(item->'fields','{}')) then
      raise exception 'This entry was already saved with different details; reload before confirming' using errcode='PT409';
    end if;
    if item->'fields' ? 'logbook_id' and not exists(select 1 from logbook where id=(item->'fields'->>'logbook_id')::uuid and aircraft_id=p_aircraft) then raise exception 'Logbook is not on this aircraft'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_writes) loop
    record_id=(item->>'id')::uuid;
    select * into current from log_entry where id=record_id and aircraft_id=p_aircraft;
    was_confirmed=coalesce(current.owner_confirmed,false);
    fields=coalesce(nullif(item->'fields','null'::jsonb),'{}')||jsonb_build_object('owner_confirmed',true);
    if coalesce((item->>'isNew')::boolean,false) then
      if not exists(select 1 from logbook where id=coalesce((fields->>'logbook_id')::uuid,p_book) and aircraft_id=p_aircraft) then raise exception 'Logbook is not on this aircraft'; end if;
      if p_page is not null and not exists(select 1 from page where id=p_page and aircraft_id=p_aircraft) then raise exception 'Page is not on this aircraft'; end if;
      result=insert_records('log_entry',p_aircraft,jsonb_build_array(fields||jsonb_build_object('id',record_id,'page_id',p_page,'logbook_id',coalesce((fields->>'logbook_id')::uuid,p_book))),'id',true);
      created=created||jsonb_build_array(jsonb_build_object('tempId',item->>'tempId','id',record_id));
    elsif was_confirmed and to_jsonb(current) @> fields then
      -- An unchanged row confirmed before this action must not be touched or undone.
      result=jsonb_build_object('status','ok','row',to_jsonb(current));
    else
      result=write_record('log_entry',p_aircraft,record_id,(item->>'base')::timestamptz,fields,false);
    end if;
    if result->>'status'<>'ok' then raise exception 'Review could not be saved; reload before confirming'; end if;
    ids=ids||to_jsonb(record_id);
    updated_versions=updated_versions||jsonb_build_object(record_id::text,result->'row'->>'updated_at');
    if not was_confirmed then entries=entries||jsonb_build_object(record_id::text,result->'row'->>'updated_at'); end if;
  end loop;
  if p_whole and p_page is not null and exists(select 1 from log_entry where page_id=p_page and aircraft_id=p_aircraft and not owner_confirmed) then
    raise exception 'The page has entries that were not reviewed; reload before confirming' using errcode='PT409';
  end if;
  if p_whole and p_page is not null and p.review_status<>'confirmed' then
    update page set review_status='confirmed' where id=p_page returning * into p;
    pages=jsonb_build_object(p_page::text,p.updated_at);
  end if;
  return jsonb_build_object('status','ok','row',jsonb_build_object('confirmed',ids,'created',created,'entryVersions',entries,'updatedVersions',updated_versions,'pageVersions',pages));
end $$;


revoke all on function confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean) from public,anon;
grant execute on function confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean) to authenticated;

-- A system category includes accessories. Only a complete powerplant can own engine observations.
create function is_complete_engine(c component) returns boolean language sql immutable set search_path=public as $$
  select case when c.component_kind is not null then c.component_kind='engine' else c.category='engine'
    and c.name !~* '\y(pump|magneto|alternator|starter|exhaust|muffler|filter|monitor|mount|cylinder|baffle|hose|belt|injector|governor|sensor|tachometer)\y'
    and concat_ws(' ',c.name,c.model) ~* '\yengine\y|\y(AEIO|AIO|IO|O|TSIO|TIO|GTSIO|GO|HIO|LIO)-?[0-9]{3}\y|\y(Rotax|Rotec|PT6)[ -]*[a-z0-9]+' end
$$;
revoke all on function is_complete_engine(component) from public,anon;
grant execute on function is_complete_engine(component) to authenticated,service_role;

create or replace function validate_engine_observation() returns trigger language plpgsql set search_path=public as $$
declare r jsonb;
begin
 if not exists(select 1 from component where id=new.component_id and aircraft_id=new.aircraft_id and is_complete_engine(component)) then raise exception 'Choose an engine on this aircraft'; end if;
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

create or replace function approve_aircraft_inbox(p_aircraft uuid,p_id uuid,p_base timestamptz,p_kind text,p_book uuid default null,p_component uuid default null,p_proposal jsonb default '{}',p_count integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item aircraft_inbox; doc uuid; rp jsonb; seq integer; ids uuid[]='{}'; sample jsonb; expense jsonb; duplicate uuid;
begin
 select * into item from aircraft_inbox where id=p_id and aircraft_id=p_aircraft and can_edit_aircraft(p_aircraft) and (created_by=auth.uid() or exists(select 1 from aircraft where id=p_aircraft and owner_id=auth.uid())) for update;
 if item.id is null then raise exception 'Inbox item not found' using errcode='42501'; end if;
 if item.state='approved' then return to_jsonb(item); end if;
 if item.updated_at<>p_base then raise exception 'Inbox changed; reload before approving' using errcode='PT409'; end if;
 if p_kind not in ('logbook','invoice','oil_report','unclassified') then raise exception 'Invalid destination'; end if;
 if p_component is not null and not exists(select 1 from component where id=p_component and aircraft_id=p_aircraft and is_complete_engine(component)) then raise exception 'Choose an engine on this aircraft'; end if;
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
   if exists(select 1 from oil_analysis_sample o where o.aircraft_id=p_aircraft and o.component_id is not distinct from p_component and o.sample_date=(sample->>'sample_date')::date and (o.engine_hours,o.oil_hours,o.oil_added_quarts,o.elements_ppm,o.oil_properties,o.universal_averages) is distinct from ((sample->>'engine_hours')::numeric,(sample->>'oil_hours')::numeric,(sample->>'oil_added_quarts')::numeric,coalesce(sample->'elements_ppm','{}'::jsonb),sample->'oil_properties',p_proposal->'universal_averages')) then raise exception 'A different oil sample already exists on this date; correct the existing sample before approving' using errcode='PT409'; end if;
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

create or replace function validate_engine_oil_links() returns trigger language plpgsql set search_path=public as $$
begin
 if new.component_id is not null and not exists(select 1 from component where id=new.component_id and aircraft_id=new.aircraft_id and is_complete_engine(component)) then raise exception 'Choose an engine on this aircraft'; end if;
 if tg_table_name='oil_analysis_sample' and to_jsonb(new)->>'source_inbox_id' is not null and not exists(select 1 from aircraft_inbox where id=(to_jsonb(new)->>'source_inbox_id')::uuid and aircraft_id=new.aircraft_id) then raise exception 'Oil source belongs to another aircraft'; end if;
 return new;
end $$;
