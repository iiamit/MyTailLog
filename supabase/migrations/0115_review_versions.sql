-- Review confirmation and undo carry the exact versions they changed.
create function confirm_review_entries(p_aircraft uuid,p_page uuid,p_book uuid,p_page_base timestamptz,p_writes jsonb,p_whole boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare item jsonb; current log_entry; p page; result jsonb; entries jsonb='{}'; updated_versions jsonb='{}'; pages jsonb='{}'; created jsonb='[]'; ids jsonb='[]'; record_id uuid; fields jsonb; was_confirmed boolean;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if jsonb_array_length(p_writes)>500 then raise exception 'Too many review entries'; end if;
  if p_whole and p_page is not null then
    select * into p from page where id=p_page and aircraft_id=p_aircraft for update;
    if p.id is null or p_page_base is null or p.updated_at<>p_page_base then raise exception 'The page changed; reload before confirming' using errcode='40001'; end if;
    if exists(select 1 from scanned_document where page_id=p.id and not applied and doc_type in('ad_report','weight_balance')) then raise exception 'Review and apply this document on the website first'; end if;
  end if;
  -- Validate/lock every existing version before changing any row.
  perform id from log_entry where aircraft_id=p_aircraft and id in(select (w->>'id')::uuid from jsonb_array_elements(p_writes)w) order by id for update;
  for item in select value from jsonb_array_elements(p_writes) loop
    select * into current from log_entry where id=(item->>'id')::uuid and aircraft_id=p_aircraft;
    if not coalesce((item->>'isNew')::boolean,false) then
      if current.id is null or item->>'base' is null or current.updated_at<>(item->>'base')::timestamptz then raise exception 'An entry changed; reload before confirming' using errcode='40001'; end if;
    elsif current.id is not null and not (to_jsonb(current) @> coalesce(item->'fields','{}')) then
      raise exception 'This entry was already saved with different details; reload before confirming' using errcode='40001';
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
    raise exception 'The page has entries that were not reviewed; reload before confirming' using errcode='40001';
  end if;
  if p_whole and p_page is not null and p.review_status<>'confirmed' then
    update page set review_status='confirmed' where id=p_page returning * into p;
    pages=jsonb_build_object(p_page::text,p.updated_at);
  end if;
  return jsonb_build_object('status','ok','row',jsonb_build_object('confirmed',ids,'created',created,'entryVersions',entries,'updatedVersions',updated_versions,'pageVersions',pages));
end $$;

create function undo_review_confirmation(p_aircraft uuid,p_entries jsonb,p_pages jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare e log_entry; p page; item record;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if (select count(*) from jsonb_object_keys(p_entries))>500 or (select count(*) from jsonb_object_keys(p_pages))>500 then raise exception 'Too many review entries'; end if;
  for item in select key,value from jsonb_each_text(p_entries) order by key loop
    select * into e from log_entry where id=item.key::uuid and aircraft_id=p_aircraft for update;
    if e.id is null or e.updated_at is distinct from item.value::timestamptz then raise exception 'An entry changed after confirmation; reload instead of undoing it' using errcode='40001'; end if;
  end loop;
  for item in select key,value from jsonb_each_text(p_pages) order by key loop
    select * into p from page where id=item.key::uuid and aircraft_id=p_aircraft for update;
    if p.id is null or p.updated_at is distinct from item.value::timestamptz then raise exception 'A page changed after confirmation; reload instead of undoing it' using errcode='40001'; end if;
  end loop;
  update log_entry set owner_confirmed=false where aircraft_id=p_aircraft and id::text in(select jsonb_object_keys(p_entries));
  update page set review_status='unreviewed' where aircraft_id=p_aircraft and id::text in(select jsonb_object_keys(p_pages));
  return jsonb_build_object('status','ok','row',null);
end $$;
revoke all on function confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean),undo_review_confirmation(uuid,jsonb,jsonb) from public,anon;
grant execute on function confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean),undo_review_confirmation(uuid,jsonb,jsonb) to authenticated;
