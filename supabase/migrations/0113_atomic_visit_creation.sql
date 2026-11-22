-- Creation with child rows and standard-item seeding also carry a single sync receipt.
create function create_planned_visit(p_aircraft uuid,p_visit jsonb,p_keys text[])
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v planned_visit%rowtype; saved planned_visit%rowtype;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  select * into v from jsonb_populate_record(null::planned_visit,p_visit);
  select * into saved from planned_visit where id=v.id and aircraft_id=p_aircraft;
  if found then return jsonb_build_object('status','ok','row',to_jsonb(saved)); end if;
  if v.provider_id is not null and not exists(select 1 from service_provider where id=v.provider_id and aircraft_id=p_aircraft) then raise exception 'Shop is not on aircraft'; end if;
  insert into planned_visit(id,aircraft_id,status,week_of,visit_date,provider_id,airport,notes,from_suggestion_key,created_by)
    values(v.id,p_aircraft,'planned',v.week_of,v.visit_date,v.provider_id,v.airport,v.notes,v.from_suggestion_key,auth.uid()) returning * into saved;
  insert into planned_visit_item(aircraft_id,visit_id,item_key) select p_aircraft,saved.id,k from unnest(p_keys) k;
  return jsonb_build_object('status','ok','row',to_jsonb(saved));
end $$;

create function seed_maintenance_items(p_aircraft uuid,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('maintenance-seed:' || p_aircraft,0));
  insert into maintenance_item(aircraft_id,kind,label,regulatory,interval_months,interval_hours)
    select p_aircraft,r.kind,r.label,r.regulatory,r.interval_months,r.interval_hours
    from jsonb_to_recordset(p_items) r(kind text,label text,regulatory boolean,interval_months int,interval_hours numeric)
    where not exists(select 1 from maintenance_item m where m.aircraft_id=p_aircraft and m.kind=r.kind);
  get diagnostics n = row_count;
  return jsonb_build_object('status','ok','row',jsonb_build_object('added',n));
end $$;
revoke all on function create_planned_visit(uuid,jsonb,text[]),seed_maintenance_items(uuid,jsonb) from public,anon;
grant execute on function create_planned_visit(uuid,jsonb,text[]),seed_maintenance_items(uuid,jsonb) to authenticated;
