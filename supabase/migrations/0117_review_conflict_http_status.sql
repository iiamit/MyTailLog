-- An expected stale-form conflict is not a transient serialization failure.
-- PostgREST 14 retries custom 40001 exceptions indefinitely; PT409 returns an
-- HTTP conflict immediately while retaining transaction rollback on failure.
do $$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'public.confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean)'::regprocedure,
    'public.undo_review_confirmation(uuid,jsonb,jsonb)'::regprocedure,
    'public.replace_page_extraction(uuid,timestamptz,jsonb,jsonb,uuid[])'::regprocedure,
    'public.confirm_scanned_document(uuid,timestamptz)'::regprocedure
  ] loop
    definition=pg_get_functiondef(target);
    if position('''40001''' in definition)=0 then raise exception 'RPC conflict definition did not match the expected migration'; end if;
    definition=replace(definition,'''40001''','''PT409''');
    if target='public.confirm_scanned_document(uuid,timestamptz)'::regprocedure then
      definition=replace(definition,'d.updated_at<>p_base','d.updated_at is distinct from p_base');
    end if;
    execute definition;
  end loop;
end $$;
