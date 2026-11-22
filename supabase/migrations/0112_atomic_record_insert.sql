-- Validated insert/upsert payloads retain ordinary table RLS and constraints.
create function insert_records(p_table text,p_aircraft uuid,p_rows jsonb,p_conflict text default 'id',p_ignore boolean default true)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare item jsonb; cols text; assignments text; conflict_cols text; saved jsonb; output jsonb='[]'; key_filter jsonb; keys text[];
begin
  perform pg_advisory_xact_lock(129737019,1);
  if p_table not in ('log_entry','page','scan_batch','component','ad_compliance','maintenance_item','hours_reading','meter_reset','oil_addition','squawk','document','weight_balance','squawk_photo','logbook_gap','visit_suggestion_dismissal','time_check_dismissal','reminder_snooze') then raise exception 'Unsupported insert table'; end if;
  if p_conflict<>'id' and not (
      (p_table='hours_reading' and p_conflict='aircraft_id,source,external_ref') or
      (p_table='time_check_dismissal' and p_conflict='aircraft_id,component,log_entry_id') or
      (p_table='reminder_snooze' and p_conflict='user_id,aircraft_id,item_key,due_signature') or
      (p_table='visit_suggestion_dismissal' and p_conflict='aircraft_id,suggestion_key')) then raise exception 'Unsupported conflict key'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Invalid insert batch'; end if;
  keys=string_to_array(p_conflict,',');
  select string_agg(format('%I',k),',') into conflict_cols from unnest(keys) k;
  for item in select value from jsonb_array_elements(p_rows) loop
    if item ? 'aircraft_id' and item->>'aircraft_id'<>p_aircraft::text then raise exception 'Wrong aircraft'; end if;
    item=(item-'updated_at'-'created_at')||jsonb_build_object('aircraft_id',p_aircraft,'id',coalesce(item->>'id',gen_random_uuid()::text));
    select string_agg(format('%I',k),','),string_agg(format('%I=excluded.%I',k,k),',') filter(where k not in ('id','aircraft_id') and not(k=any(keys)))
      into cols,assignments from jsonb_object_keys(item) k;
    execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) on conflict(%s) %s returning to_jsonb(%I.*)',
      p_table,cols,cols,p_table,conflict_cols,case when p_ignore or assignments is null then 'do nothing' else 'do update set '||assignments||format(' where %I.aircraft_id=excluded.aircraft_id',p_table) end,p_table)
      into saved using item;
    if saved is null then
      select jsonb_object_agg(k,item->k) into key_filter from unnest(keys) k;
      execute format('select to_jsonb(t) from public.%I t where aircraft_id=$1 and to_jsonb(t) @> $2',p_table) into saved using p_aircraft,key_filter;
    end if;
    if saved is null then raise exception 'Record not editable' using errcode='42501'; end if;
    output=output||jsonb_build_array(saved);
  end loop;
  return jsonb_build_object('status','ok','row',case when jsonb_array_length(output)=1 then output->0 else jsonb_build_object('added',jsonb_array_length(output),'rows',output) end);
end $$;
revoke all on function insert_records(text,uuid,jsonb,text,boolean) from public,anon;
grant execute on function insert_records(text,uuid,jsonb,text,boolean) to authenticated;
