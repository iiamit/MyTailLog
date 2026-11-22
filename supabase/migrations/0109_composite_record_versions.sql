-- Guard composite edits before touching their child/default rows, in one transaction.
create function save_service_provider(p_aircraft uuid, p_id uuid, p_base timestamptz, p_fields jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare current service_provider%rowtype; merged service_provider%rowtype; saved service_provider%rowtype;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider:' || p_aircraft, 0));
  select * into current from service_provider where id=p_id and aircraft_id=p_aircraft for update;
  if found and (p_base is null or current.updated_at<>p_base) then return jsonb_build_object('status','conflict','row',to_jsonb(current)); end if;
  if p_fields ?| array['id','aircraft_id','created_at','updated_at'] then raise exception 'Invalid provider patch'; end if;
  select * into merged from jsonb_populate_record(null::service_provider,coalesce(to_jsonb(current),'{}'::jsonb)||p_fields);
  if merged.is_default then
    update service_provider set is_default=false where aircraft_id=p_aircraft and kind=merged.kind and id<>p_id and is_default;
  end if;
  if current.id is null then
    insert into service_provider(id,aircraft_id,name,kind,cert_number,airport,email,phone,is_default)
      values(p_id,p_aircraft,merged.name,merged.kind,merged.cert_number,merged.airport,merged.email,merged.phone,coalesce(merged.is_default,false)) returning * into saved;
  else
    update service_provider set name=merged.name,kind=merged.kind,cert_number=merged.cert_number,airport=merged.airport,
      email=merged.email,phone=merged.phone,is_default=merged.is_default where id=current.id returning * into saved;
  end if;
  return jsonb_build_object('status','ok','row',to_jsonb(saved));
end $$;

create function save_planned_visit(p_aircraft uuid,p_visit uuid,p_base timestamptz,p_patch jsonb,p_add text[],p_remove text[])
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; r planned_visit%rowtype;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('week_of','visit_date','provider_id','airport','notes','status')) then raise exception 'Invalid visit patch'; end if;
  result := write_record('planned_visit',p_aircraft,p_visit,p_base,p_patch,false);
  if result->>'status'<>'ok' then return result; end if;
  select * into r from planned_visit where id=p_visit;
  if r.provider_id is not null and not exists(select 1 from service_provider where id=r.provider_id and aircraft_id=p_aircraft) then raise exception 'Shop is not on aircraft'; end if;
  if r.status in ('done','cancelled') then
    delete from planned_visit_item where visit_id=p_visit and aircraft_id=p_aircraft and done_completion_id is null;
  else
    delete from planned_visit_item where visit_id=p_visit and aircraft_id=p_aircraft and item_key=any(p_remove) and done_completion_id is null;
    insert into planned_visit_item(aircraft_id,visit_id,item_key)
      select p_aircraft,p_visit,k from unnest(p_add) k on conflict(visit_id,item_key) do nothing;
  end if;
  return result;
end $$;

-- Keep the existing legacy RPC for installed clients. New writes compare under its row lock.
create function set_expected_hours_checked(target_aircraft uuid,hours_per_week numeric,p_base timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current aircraft%rowtype;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(target_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  select * into current from aircraft where id=target_aircraft for update;
  if not found then return jsonb_build_object('status','error','message','Aircraft not found','httpStatus',404); end if;
  if p_base is null or current.updated_at<>p_base then return jsonb_build_object('status','conflict','row',to_jsonb(current)); end if;
  perform set_expected_hours(target_aircraft,hours_per_week);
  select * into current from aircraft where id=target_aircraft;
  return jsonb_build_object('status','ok','row',to_jsonb(current));
end $$;

revoke all on function save_service_provider(uuid,uuid,timestamptz,jsonb),save_planned_visit(uuid,uuid,timestamptz,jsonb,text[],text[]),set_expected_hours_checked(uuid,numeric,timestamptz) from public,anon;
grant execute on function save_service_provider(uuid,uuid,timestamptz,jsonb),save_planned_visit(uuid,uuid,timestamptz,jsonb,text[],text[]),set_expected_hours_checked(uuid,numeric,timestamptz) to authenticated;

-- The completion, its meter reading and optional VOR record must not survive separately.
create function mark_maintenance_done(p_aircraft uuid,p_item uuid,p_base timestamptz,p_patch jsonb,p_reading jsonb,p_entry jsonb,p_completion jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb; reading hours_reading%rowtype; entry log_entry%rowtype; completion item_completion%rowtype; visit_item planned_visit_item%rowtype;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  if p_patch ?| array['kind','label','interval_months','interval_hours','regulatory'] then raise exception 'Invalid completion patch'; end if;
  if p_entry is not null then
    select * into entry from jsonb_populate_record(null::log_entry,p_entry);
    if not exists(select 1 from logbook where id=entry.logbook_id and aircraft_id=p_aircraft) then raise exception 'Logbook is not on aircraft'; end if;
    if entry.tach<0 or entry.hobbs<0 then raise exception 'Readings cannot be negative'; end if;
  end if;
  result := write_record('maintenance_item',p_aircraft,p_item,p_base,p_patch,false);
  if result->>'status'<>'ok' then return result; end if;
  if p_reading is not null then
    select * into reading from jsonb_populate_record(null::hours_reading,p_reading);
    if reading.reading_date is null or reading.tach<0 or reading.hobbs<0 or reading.airframe<0 then raise exception 'Invalid meter reading'; end if;
    insert into hours_reading(id,aircraft_id,reading_date,hobbs,tach,airframe,source,synced_by,external_ref)
      values(reading.id,p_aircraft,reading.reading_date,reading.hobbs,reading.tach,reading.airframe,'manual',auth.uid(),reading.id::text)
      on conflict(id) do nothing;
  end if;
  if p_entry is not null then
    insert into log_entry(id,aircraft_id,logbook_id,entry_date,tach,hobbs,description,work_performed,signature_name,owner_confirmed)
      values(entry.id,p_aircraft,entry.logbook_id,entry.entry_date,entry.tach,entry.hobbs,entry.description,entry.work_performed,entry.signature_name,true)
      on conflict(id) do nothing;
  end if;
  if p_completion is not null then
    select * into completion from jsonb_populate_record(null::item_completion,p_completion);
    insert into item_completion(id,aircraft_id,maintenance_item_id,done_date,done_hours,meter,source,log_entry_id,created_by)
      values(completion.id,p_aircraft,p_item,completion.done_date,completion.done_hours,completion.meter,completion.source,entry.id,auth.uid());
    select * into visit_item from planned_visit_item where aircraft_id=p_aircraft and item_key='mx:' || p_item and done_completion_id is null for update;
    if found then
      update planned_visit_item set done_completion_id=completion.id where id=visit_item.id;
      update item_completion set visit_id=visit_item.visit_id where id=completion.id;
      update planned_visit set status='done' where id=visit_item.visit_id and status='awaiting_records'
        and not exists(select 1 from planned_visit_item where visit_id=visit_item.visit_id and done_completion_id is null and item_key not like 'squawk:%');
      if exists(select 1 from planned_visit where id=visit_item.visit_id and status='done') then
        delete from planned_visit_item where visit_id=visit_item.visit_id and done_completion_id is null;
      end if;
    end if;
  end if;
  return result;
end $$;
revoke all on function mark_maintenance_done(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function mark_maintenance_done(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to authenticated;
