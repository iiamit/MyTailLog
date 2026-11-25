-- Preserve the HTTP conflict contract when upgrading a test installation of 0119.
-- A stale review is a decision for the user, never a transaction for PostgREST to retry.
do $$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'public.confirm_review_entries(uuid,uuid,uuid,timestamptz,jsonb,boolean)'::regprocedure,
    'public.replace_page_extraction(uuid,timestamptz,jsonb,jsonb,uuid[])'::regprocedure
  ] loop
    definition=pg_get_functiondef(target);
    if position('''40001''' in definition)>0 then
      execute replace(definition,'''40001''','''PT409''');
    elsif position('''PT409''' in definition)=0 then
      raise exception 'Review RPC has no expected conflict guard';
    end if;
  end loop;
end $$;
