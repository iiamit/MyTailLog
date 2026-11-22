-- Compound record operations commit their authoritative state together.
create or replace function public.replace_page_extraction(p_page uuid, p_started_at timestamptz, p_entries jsonb, p_state jsonb, p_stickers uuid[] default '{}')
returns void language plpgsql security invoker set search_path = public as $$
declare p public.page; item jsonb;
begin
  perform pg_advisory_xact_lock(129737019,1);
  select * into p from page where id = p_page for update;
  if p.id is null or (current_user<>'service_role' and not can_edit_aircraft(p.aircraft_id)) then raise exception 'Page not editable' using errcode='42501'; end if;
  perform id from log_entry where page_id = p_page order by id for update;
  if exists(select 1 from log_entry where page_id = p_page and updated_at > p_started_at) then
    raise exception 'Entries changed while this page was being read; retry reading' using errcode='40001';
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
  update page set ocr_text=p_state->>'ocr_text', extraction_confidence=(p_state->>'extraction_confidence')::numeric,
    detected_page_count=(p_state->>'detected_page_count')::int, unread_rotated_content=coalesce((p_state->>'unread_rotated_content')::boolean,false),
    extraction_status='extracted', extraction_error=null, extracted_at=clock_timestamp() where id=p.id;
end $$;
grant execute on function public.replace_page_extraction(uuid,timestamptz,jsonb,jsonb,uuid[]) to authenticated, service_role;
revoke all on function public.replace_page_extraction(uuid,timestamptz,jsonb,jsonb,uuid[]) from public, anon;

create or replace function public.merge_log_entry(p_aircraft uuid,p_head uuid,p_tail uuid,p_head_base timestamptz,p_tail_base timestamptz,p_fields jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare h log_entry; t log_entry;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  perform id from log_entry where id in(p_head,p_tail) and aircraft_id=p_aircraft order by id for update;
  select * into h from log_entry where id=p_head and aircraft_id=p_aircraft;
  select * into t from log_entry where id=p_tail and aircraft_id=p_aircraft;
  if h.id is null or t.id is null or h.id=t.id then raise exception 'Merge entries not found'; end if;
  if h.updated_at<>p_head_base or t.updated_at<>p_tail_base then
    return jsonb_build_object('status','conflict','row',to_jsonb(t));
  end if;
  update log_entry set entry_date=r.entry_date,hobbs=r.hobbs,airframe=r.airframe,tach=r.tach,
    description=r.description,work_performed=r.work_performed,parts=r.parts,signature_name=r.signature_name,
    mechanic_cert_number=r.mechanic_cert_number,ad_refs=r.ad_refs,sb_refs=r.sb_refs,continues_next=r.continues_next,
    is_continuation=r.is_continuation,field_confidence=null,owner_confirmed=false
    from jsonb_populate_record(null::log_entry,p_fields) r where log_entry.id=h.id returning log_entry.* into h;
  update component set install_entry_id=h.id where install_entry_id=t.id and aircraft_id=p_aircraft;
  update component set removal_entry_id=h.id where removal_entry_id=t.id and aircraft_id=p_aircraft;
  update ad_compliance set reference_entry_id=h.id where reference_entry_id=t.id and aircraft_id=p_aircraft;
  update document set log_entry_id=h.id where log_entry_id=t.id and aircraft_id=p_aircraft;
  update squawk set resolved_log_entry_id=h.id where resolved_log_entry_id=t.id and aircraft_id=p_aircraft;
  delete from log_entry where id=t.id;
  return jsonb_build_object('status','ok','row',to_jsonb(h));
end $$;
revoke all on function public.merge_log_entry(uuid,uuid,uuid,timestamptz,timestamptz,jsonb) from public, anon;
grant execute on function public.merge_log_entry(uuid,uuid,uuid,timestamptz,timestamptz,jsonb) to authenticated;

create or replace function public.confirm_scanned_document(p_page uuid,p_base timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
declare d scanned_document; wb weight_balance; j jsonb; a ad_compliance; ref text; baseline boolean; weight numeric; arm numeric; moment numeric;
begin
  perform pg_advisory_xact_lock(129737019,1);
  select * into d from scanned_document where page_id=p_page for update;
  if d.id is null or not can_edit_aircraft(d.aircraft_id) then raise exception 'Document not editable' using errcode='42501'; end if;
  if d.applied then return; end if;
  if d.updated_at<>p_base then raise exception 'The document reading changed; reload before confirming' using errcode='40001'; end if;
  if d.doc_type='weight_balance' then
    j=d.extracted->'weight_balance';
    weight=(j->>'empty_weight')::numeric; arm=(j->>'empty_weight_arm')::numeric; moment=(j->>'empty_weight_moment')::numeric;
    if d.document_date is null or (weight is null and arm is null and moment is null) then raise exception 'Review the document date and weight/balance figures before applying'; end if;
    if weight is null and arm<>0 then weight=moment/arm; end if;
    if arm is null and weight<>0 then arm=moment/weight; end if;
    if moment is null then moment=weight*arm; end if;
    -- Serialize same-aircraft document applications before finding a same-date revision.
    perform id from aircraft where id=d.aircraft_id for update;
    select * into wb from weight_balance where aircraft_id=d.aircraft_id and revision_date=d.document_date limit 1 for update;
    if wb.id is not null then
      update weight_balance set empty_weight=weight,empty_weight_arm=arm,empty_weight_moment=moment,
        max_gross_weight=(j->>'max_gross_weight')::numeric,method=j->>'method',reference=j->>'reference',source_page_id=p_page,
        reason='From owner-reviewed scanned document' where id=wb.id;
    else
      insert into weight_balance(aircraft_id,revision_date,empty_weight,empty_weight_arm,empty_weight_moment,max_gross_weight,method,reference,source_page_id,reason)
      values(d.aircraft_id,d.document_date,weight,arm,moment,(j->>'max_gross_weight')::numeric,j->>'method',j->>'reference',p_page,'From owner-reviewed scanned document');
    end if;
  elsif d.doc_type='ad_report' then
    perform id from aircraft where id=d.aircraft_id for update;
    for j in select value from jsonb_array_elements(d.extracted->'ads') loop
      ref=trim(regexp_replace(trim(j->>'reference'),'^a\.?\s*d\.?[-\s]*','','i'));
      if ref='' then continue; end if;
      select * into a from ad_compliance where aircraft_id=d.aircraft_id and kind='ad'
        and regexp_replace(lower(regexp_replace(reference,'\s+','','g')),'r\d+$','')=regexp_replace(lower(regexp_replace(ref,'\s+','','g')),'r\d+$','') limit 1 for update;
      if a.id is not null then
        baseline=d.document_date is not null and (a.complied_date is null or a.complied_date<=d.document_date);
        update ad_compliance set
          status=case when (baseline or a.status='open') and j->>'status' is not null then (j->>'status')::ad_status else a.status end,
          method=case when baseline or a.method is null then coalesce(j->>'method',a.method) else a.method end,
          complied_date=case when baseline or a.complied_date is null then coalesce((j->>'complied_date')::date,a.complied_date) else a.complied_date end,
          complied_hours=case when baseline or a.complied_hours is null then coalesce((j->>'complied_hours')::numeric,a.complied_hours) else a.complied_hours end,
          next_due_date=case when baseline or a.next_due_date is null then coalesce((j->>'next_due_date')::date,a.next_due_date) else a.next_due_date end,
          next_due_hours=case when baseline or a.next_due_hours is null then coalesce((j->>'next_due_hours')::numeric,a.next_due_hours) else a.next_due_hours end,
          recurring=a.recurring or (baseline and coalesce((j->>'recurring')::boolean,false)),verified_report_page_id=p_page,verified_at=clock_timestamp()
        where id=a.id;
      else
        insert into ad_compliance(aircraft_id,kind,reference,title,status,method,complied_date,complied_hours,next_due_date,next_due_hours,recurring,notes,verified_report_page_id,verified_at)
        values(d.aircraft_id,'ad',ref,j->>'title',coalesce(j->>'status','open')::ad_status,j->>'method',(j->>'complied_date')::date,(j->>'complied_hours')::numeric,(j->>'next_due_date')::date,(j->>'next_due_hours')::numeric,coalesce((j->>'recurring')::boolean,false),'From owner-reviewed scanned document',p_page,clock_timestamp());
      end if;
    end loop;
  else raise exception 'This document has no maintenance values to apply'; end if;
  update scanned_document set applied=true,summary='Confirmed and applied by the owner' where id=d.id;
  update page set review_status='confirmed',needs_look=false where id=p_page;
end $$;
revoke all on function public.confirm_scanned_document(uuid,timestamptz) from public,anon;
grant execute on function public.confirm_scanned_document(uuid,timestamptz) to authenticated;

-- RLS-scoped compare-and-write, shared by web and phone write helpers.
create or replace function public.write_record(p_table text,p_aircraft uuid,p_id uuid,p_base timestamptz,p_patch jsonb default null,p_delete boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare old_row jsonb; changed jsonb; cols text;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if p_table not in ('log_entry','page','hours_reading','meter_reset','maintenance_item','ad_compliance','component','squawk','squawk_photo','oil_addition','document','weight_balance','planned_visit','service_provider','logbook_gap','time_check','aircraft') then raise exception 'Unsupported record table'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and %I=$2 for update',p_table,case when p_table='aircraft' then 'id' else 'aircraft_id' end) into old_row using p_id,p_aircraft;
  if old_row is null then return jsonb_build_object('status','error','message','Record no longer exists or is not editable','httpStatus',404); end if;
  if p_base is null or (old_row->>'updated_at')::timestamptz<>p_base then return jsonb_build_object('status','conflict','row',old_row); end if;
  if p_delete then
    execute format('delete from public.%I where id=$1 returning to_jsonb(%I.*)',p_table,p_table) into changed using p_id;
  else
    if p_patch is null or p_patch ?| array['id','aircraft_id','owner_id','created_at','updated_at'] then raise exception 'Invalid record patch'; end if;
    select string_agg(format('%I',key),',') into cols from jsonb_object_keys(p_patch) key;
    if cols is null then return jsonb_build_object('status','ok','row',old_row); end if;
    execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)) where id=$2 returning to_jsonb(%I.*)',p_table,cols,cols,p_table,p_table)
      into changed using old_row||p_patch,p_id;
  end if;
  if changed is null then return jsonb_build_object('status','error','message','Record is not editable','httpStatus',403); end if;
  return jsonb_build_object('status','ok','row',case when p_delete then null else changed end);
end $$;
revoke all on function public.write_record(text,uuid,uuid,timestamptz,jsonb,boolean) from public,anon;
grant execute on function public.write_record(text,uuid,uuid,timestamptz,jsonb,boolean) to authenticated;
