create function create_squawk(p_aircraft uuid,p_fields jsonb,p_photos text[])
returns jsonb language plpgsql security invoker set search_path=public as $$
declare outcome jsonb; squawk_id uuid; photo text;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if cardinality(p_photos)>20 then raise exception 'At most twenty photos per squawk'; end if;
  outcome=insert_records('squawk',p_aircraft,jsonb_build_array(p_fields),'id',true);
  squawk_id=(outcome->'row'->>'id')::uuid;
  for photo in select distinct unnest(p_photos) loop
    perform insert_records('squawk_photo',p_aircraft,jsonb_build_array(jsonb_build_object(
      'id',photo::uuid,'squawk_id',squawk_id,'storage_path',p_aircraft||'/squawks/'||squawk_id||'/'||photo||'.jpg','created_by',auth.uid())), 'id',true);
  end loop;
  return outcome;
end $$;
revoke all on function create_squawk(uuid,jsonb,text[]) from public,anon;
grant execute on function create_squawk(uuid,jsonb,text[]) to authenticated;
