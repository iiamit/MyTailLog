-- Accepted effects and the v2 retry receipt share the same commit.
alter table sync_mutation add column response jsonb, add column request jsonb;

create function apply_sync_write(p_mutation jsonb, p_operation text, p_arguments jsonb)
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

-- A late transport error/conflict must never overwrite an already committed success.
create function record_sync_result(p_mutation jsonb,p_result jsonb,p_resolution text default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare recorded sync_mutation; owner_id uuid:=auth.uid();
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('sync:' || owner_id::text || ':' || (p_mutation->>'id'),0));
  select * into recorded from sync_mutation where user_id=owner_id and id=p_mutation->>'id' for update;
  if recorded.status='ok' and recorded.request is not null and
    (recorded.request->>'type' is distinct from p_mutation->>'type' or recorded.request->'payload' is distinct from p_mutation->'payload'
      or recorded.aircraft_id is distinct from (p_mutation->>'aircraftId')::uuid) then
    raise exception 'Mutation ID already used for another change' using errcode='22023';
  end if;
  insert into sync_mutation(user_id,id,aircraft_id,type,status,base,error,code,response,request)
    values(owner_id,p_mutation->>'id',(p_mutation->>'aircraftId')::uuid,p_mutation->>'type',p_result->>'status',
      (p_mutation->>'base')::timestamptz,left(p_result->>'error',1000),p_result->>'code',p_result,p_mutation)
  on conflict(user_id,id) do update set status=excluded.status,base=excluded.base,error=excluded.error,
    code=excluded.code,response=excluded.response,request=excluded.request,
    resolved_at=case when sync_mutation.status='conflict' and excluded.status='ok' then now() else sync_mutation.resolved_at end,
    resolution=case when sync_mutation.status='conflict' and excluded.status='ok' then coalesce(p_resolution,'keep_mine') else sync_mutation.resolution end
    where sync_mutation.status<>'ok';
  select * into recorded from sync_mutation where user_id=owner_id and id=p_mutation->>'id';
  return recorded.response;
end $$;
revoke all on function record_sync_result(jsonb,jsonb,text) from public,anon;
grant execute on function record_sync_result(jsonb,jsonb,text) to authenticated;
