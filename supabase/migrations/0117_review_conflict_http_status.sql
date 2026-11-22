-- An expected stale-form conflict is not a transient serialization failure.
-- PostgREST 14 retries custom 40001 exceptions indefinitely; PT409 returns an
-- HTTP conflict immediately while retaining transaction rollback on failure.
do $$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'public.confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean)'::regprocedure,
    'public.undo_review_confirmation(uuid,jsonb,jsonb)'::regprocedure
  ] loop
    definition=pg_get_functiondef(target);
    if position('''40001''' in definition)=0 then raise exception 'Review conflict definition did not match the expected migration'; end if;
    execute replace(definition,'''40001''','''PT409''');
  end loop;
end $$;
