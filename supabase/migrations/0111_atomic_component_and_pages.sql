create function retire_component(p_aircraft uuid,p_id uuid,p_base timestamptz,p_date date,p_entry uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; n int; label text;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if p_entry is not null and not exists(select 1 from log_entry where id=p_entry and aircraft_id=p_aircraft) then raise exception 'Entry is not on this aircraft'; end if;
  result=write_record('component',p_aircraft,p_id,p_base,jsonb_build_object('is_installed',false,'removal_date',p_date)||case when p_entry is null then '{}'::jsonb else jsonb_build_object('removal_entry_id',p_entry) end,false);
  if result->>'status'<>'ok' then return result; end if;
  label=result->'row'->>'name';
  update ad_compliance set status='not_applicable',reason='Equipment removed: '||label,status_changed_on=p_date,next_due_date=null,next_due_hours=null
    where component_id=p_id and aircraft_id=p_aircraft and status in('open','complied','previously_complied');
  get diagnostics n=row_count;
  return jsonb_build_object('status','ok','row',(result->'row')||jsonb_build_object('ads_updated',n));
end $$;

create function confirm_equipment_proposals(p_aircraft uuid,p_ids uuid[],p_dismiss boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare p equipment_proposal; existing uuid; n_added int=0; n_updated int=0; n_deleted int;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  perform id from aircraft where id=p_aircraft for update;
  if not p_dismiss then
    for p in select * from equipment_proposal where aircraft_id=p_aircraft and id=any(p_ids) order by id for update loop
      select id into existing from component c where c.aircraft_id=p_aircraft and
        case when coalesce(p.part_number,'')<>'' or coalesce(p.serial_number,'')<>'' then
          lower(trim(coalesce(c.part_number,'')))=lower(trim(coalesce(p.part_number,''))) and lower(trim(coalesce(c.serial_number,'')))=lower(trim(coalesce(p.serial_number,'')))
        else lower(trim(c.name))=lower(trim(p.name)) end limit 1 for update;
      if existing is null then
        insert into component(aircraft_id,name,make,category,part_number,serial_number,install_date,removal_date,is_installed)
          values(p_aircraft,trim(p.name),p.make,p.category,p.part_number,p.serial_number,p.install_date,p.removal_date,p.is_installed);
        n_added=n_added+1;
      else
        update component set name=trim(p.name),make=p.make,category=p.category,part_number=p.part_number,serial_number=p.serial_number,
          install_date=p.install_date,removal_date=p.removal_date,is_installed=p.is_installed where id=existing;
        n_updated=n_updated+1;
      end if;
    end loop;
  end if;
  delete from equipment_proposal where aircraft_id=p_aircraft and id=any(p_ids);
  get diagnostics n_deleted=row_count;
  return jsonb_build_object('status','ok','row',case when p_dismiss then jsonb_build_object('dismissed',n_deleted) else jsonb_build_object('added',n_added,'updated',n_updated) end);
end $$;

create function change_pages(p_aircraft uuid,p_ids uuid[],p_action text,p_book uuid default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare n int; p page; r uuid; ord bigint;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if cardinality(p_ids)>500 or cardinality(p_ids)<>(select count(distinct i) from unnest(p_ids)i) then raise exception 'Invalid page selection'; end if;
  perform id from page where aircraft_id=p_aircraft and id=any(p_ids) order by id for update;
  if p_action='reorder' then
    if (select count(*) from page where aircraft_id=p_aircraft and id=any(p_ids) and (p_book is null or logbook_id=p_book))<>cardinality(p_ids) then raise exception 'Some pages are no longer here'; end if;
    for r,ord in select * from unnest(p_ids) with ordinality loop update page set page_sequence=ord where id=r and aircraft_id=p_aircraft; end loop;
    return jsonb_build_object('status','ok','row',null);
  elsif p_action in ('skip','keep_both') then
    if cardinality(p_ids)<>1 then raise exception 'Choose one duplicate page'; end if;
    select * into p from page where id=p_ids[1] and aircraft_id=p_aircraft;
    if p.id is null then return jsonb_build_object('status','ok','row',null); end if;
    if p_action='keep_both' then
      update page set duplicate_of_page_id=null where id=p.id returning * into p;
      return jsonb_build_object('status','ok','row',to_jsonb(p));
    end if;
    if p.batch_id is not null then update scan_batch set expected_pages=greatest(1,expected_pages-1) where id=p.batch_id and aircraft_id=p_aircraft; end if;
  elsif p_action<>'delete' then raise exception 'Invalid page action'; end if;
  delete from log_entry where aircraft_id=p_aircraft and page_id=any(p_ids);
  delete from page where aircraft_id=p_aircraft and id=any(p_ids);
  get diagnostics n=row_count;
  return jsonb_build_object('status','ok','row',jsonb_build_object('deleted',n));
end $$;
revoke all on function retire_component(uuid,uuid,timestamptz,date,uuid),confirm_equipment_proposals(uuid,uuid[],boolean),change_pages(uuid,uuid[],text,uuid) from public,anon;
grant execute on function retire_component(uuid,uuid,timestamptz,date,uuid),confirm_equipment_proposals(uuid,uuid[],boolean),change_pages(uuid,uuid[],text,uuid) to authenticated;

create function confirm_clean_entries(p_aircraft uuid,p_versions jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare n int; remaining int; changed log_entry; entry_versions jsonb; page_versions jsonb;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  perform id from log_entry where aircraft_id=p_aircraft and id::text in(select jsonb_object_keys(p_versions)) order by id for update;
  select * into changed from log_entry where aircraft_id=p_aircraft and id::text in(select jsonb_object_keys(p_versions))
    and updated_at is distinct from (p_versions->>id::text)::timestamptz limit 1;
  if changed.id is not null then return jsonb_build_object('status','conflict','row',to_jsonb(changed)); end if;
  with changed as (  update log_entry e set owner_confirmed=true where e.aircraft_id=p_aircraft and e.id::text in(select jsonb_object_keys(p_versions))
    and not e.owner_confirmed and not e.is_continuation and e.confidence>=0.75
    and not exists(select 1 from jsonb_each(coalesce(e.field_confidence,'{}')) f where jsonb_typeof(f.value)='number' and (f.value::text)::numeric<0.75)
    and not exists(select 1 from page p where p.id=e.page_id and p.needs_look) returning e.id,e.updated_at)
    select count(*),coalesce(jsonb_object_agg(id,updated_at),'{}') into n,entry_versions from changed;
  with changed_pages as (update page p set review_status='confirmed' where p.aircraft_id=p_aircraft and p.review_status='unreviewed'
    and exists(select 1 from log_entry e where e.page_id=p.id and e.id::text in(select jsonb_object_keys(entry_versions)))
    and not exists(select 1 from log_entry e where e.page_id=p.id and not e.owner_confirmed)
    and not exists(select 1 from scanned_document d where d.page_id=p.id and not d.applied and d.doc_type in('ad_report','weight_balance')) returning p.id,p.updated_at)
    select coalesce(jsonb_object_agg(id,updated_at),'{}') into page_versions from changed_pages;
  select count(*) into remaining from log_entry where aircraft_id=p_aircraft and not owner_confirmed;
  return jsonb_build_object('status','ok','row',jsonb_build_object('confirmed',n,'remaining',remaining,'entryVersions',entry_versions,'pageVersions',page_versions));
end $$;
revoke all on function confirm_clean_entries(uuid,jsonb) from public,anon;
grant execute on function confirm_clean_entries(uuid,jsonb) to authenticated;
