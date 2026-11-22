-- History and its current compliance summary must commit together, against the rendered version.
create function record_ad_compliance(p_aircraft uuid,p_ad uuid,p_base timestamptz,p_date date,p_hours numeric,p_entry uuid,p_method text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare ad ad_compliance; result jsonb; patch jsonb; completion_id uuid=gen_random_uuid();
begin
  perform pg_advisory_xact_lock(129737019,1);
  if not can_edit_aircraft(p_aircraft) then raise exception 'Aircraft not editable' using errcode='42501'; end if;
  select * into ad from ad_compliance where id=p_ad and aircraft_id=p_aircraft for update;
  if ad.id is null then raise exception 'This AD is no longer tracked'; end if;
  if ad.updated_at is distinct from p_base then return jsonb_build_object('status','conflict','row',to_jsonb(ad)); end if;
  if p_date is null or p_hours<0 or p_hours::text in('NaN','Infinity','-Infinity') or p_hours>999999999.9 then raise exception 'Invalid compliance date or hours'; end if;
  if p_entry is not null and not exists(select 1 from log_entry where id=p_entry and aircraft_id=p_aircraft) then raise exception 'Entry is not on this aircraft' using errcode='42501'; end if;
  -- Touch the parent even for older history: one rendered version may record only one completion.
  patch=jsonb_build_object('notes',ad.notes);
  if ad.complied_date is null or p_date>=ad.complied_date then
    patch=jsonb_build_object('status','complied','complied_date',p_date,'complied_hours',p_hours,
      'method',coalesce(nullif(btrim(p_method),''),ad.method),'reference_entry_id',coalesce(p_entry,ad.reference_entry_id),
      'next_due_date',case when ad.recurring and coalesce(ad.interval_months,0)>0 then
        ((date_trunc('month',p_date)::date+make_interval(months=>ad.interval_months))::date+(extract(day from p_date)::int-1)) else null end,
      'next_due_hours',case when ad.recurring and p_hours is not null and ad.interval_hours is not null then round(p_hours+ad.interval_hours,1) else null end);
  end if;
  result=write_record('ad_compliance',p_aircraft,p_ad,p_base,patch,false);
  if result->>'status'<>'ok' then return result; end if;
  if ad.complied_date is not null and not exists(select 1 from item_completion where ad_compliance_id=p_ad) then
    if ad.reference_entry_id is not null and not exists(select 1 from log_entry where id=ad.reference_entry_id and aircraft_id=p_aircraft) then raise exception 'Earlier compliance entry is not on this aircraft'; end if;
    insert into item_completion(aircraft_id,ad_compliance_id,done_date,done_hours,meter,log_entry_id,source,created_by)
      values(p_aircraft,p_ad,ad.complied_date,ad.complied_hours,case when ad.complied_hours is not null then 'tach' else null end,ad.reference_entry_id,'import',auth.uid());
  end if;
  insert into item_completion(id,aircraft_id,ad_compliance_id,done_date,done_hours,meter,log_entry_id,source,created_by)
    values(completion_id,p_aircraft,p_ad,p_date,p_hours,case when p_hours is not null then 'tach' else null end,p_entry,case when p_entry is null then 'mark_done' else 'owner_link' end,auth.uid());
  return result;
end $$;
revoke all on function record_ad_compliance(uuid,uuid,timestamptz,date,numeric,uuid,text) from public,anon;
grant execute on function record_ad_compliance(uuid,uuid,timestamptz,date,numeric,uuid,text) to authenticated;
