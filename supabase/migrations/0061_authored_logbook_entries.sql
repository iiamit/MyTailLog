-- A signed entry is an immutable log_entry, not an editable transcription.
-- Signer credentials are self-declared; MyTailLog does not verify FAA status.
create table signing_credential (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('private_pilot', 'commercial_pilot', 'airline_transport_pilot', 'sport_pilot', 'mechanic')),
  certificate_number text not null check (length(trim(certificate_number)) between 1 and 40),
  rating text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, certificate_number)
);
create index signing_credential_user_idx on signing_credential(user_id);
alter table signing_credential enable row level security;
create policy signing_credential_self_select on signing_credential for select using (user_id = auth.uid());
create policy signing_credential_self_insert on signing_credential for insert with check (user_id = auth.uid());
create policy signing_credential_self_update on signing_credential for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy signing_credential_self_delete on signing_credential for delete using (user_id = auth.uid());
grant select, insert, update, delete on signing_credential to authenticated;

-- The legacy profile number is explicitly labeled A&P / IA in the UI. Preserve
-- it as a self-declared mechanic credential so existing users need not retype it.
insert into signing_credential (user_id, kind, certificate_number, rating)
select id, 'mechanic', left(trim(cert_number), 40), 'A&P (legacy profile)'
from profile where nullif(trim(cert_number), '') is not null
on conflict do nothing;

alter table log_entry add column authored_by uuid references auth.users(id);
alter table log_entry add column authored_signed_at timestamptz;
alter table log_entry add column authored_cert_kind text;
alter table log_entry add column authored_cert_rating text;
alter table log_entry add column authored_template_id text;
alter table log_entry add column authored_template_version int;
alter table log_entry add column authored_answers jsonb;
alter table log_entry add column authored_payload jsonb;
alter table log_entry add column authored_digest text;
alter table log_entry add column supersedes_entry_id uuid references log_entry(id);
alter table log_entry add column authored_superseded_by uuid references log_entry(id);
alter table log_entry add constraint authored_complete check (
  authored_signed_at is null or (
    authored_by is not null and authored_cert_kind is not null and
    authored_template_id is not null and authored_template_version is not null and
    authored_payload is not null and authored_digest is not null and
    signature_name is not null and mechanic_cert_number is not null
  )
);

create or replace function protect_signed_log_entry() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.authored_signed_at is not null and current_setting('mytaillog.signing', true) is distinct from 'yes' then
      raise exception 'Signed entries may only be created through sign_authored_entry';
    end if;
    return new;
  end if;
  if old.authored_signed_at is not null then
    if tg_op = 'UPDATE' and current_setting('mytaillog.signing', true) = 'yes' and
       old.authored_superseded_by is null and new.authored_superseded_by is not null and
       (to_jsonb(new) - 'authored_superseded_by' - 'updated_at') =
       (to_jsonb(old) - 'authored_superseded_by' - 'updated_at') then
      return new;
    end if;
    raise exception 'Signed logbook entries are immutable; create a correcting entry';
  end if;
  if tg_op = 'UPDATE' and new.authored_signed_at is not null then
    raise exception 'Signed entries may only be created through sign_authored_entry';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;
create trigger protect_signed_log_entry before insert or update or delete on log_entry
  for each row execute function protect_signed_log_entry();

-- A short-lived email challenge binds fresh identity proof to the exact entry.
-- Only the service role may issue a challenge; the signing RPC consumes it.
create table entry_signing_challenge (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request jsonb not null,
  signer_name text not null,
  cert_kind text not null,
  cert_number text not null,
  cert_rating text,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index entry_signing_challenge_user_idx on entry_signing_challenge(user_id, created_at desc);
alter table entry_signing_challenge enable row level security;
revoke all on entry_signing_challenge from anon, authenticated;

-- One database transaction creates the signed entry and its digest. All
-- authorization and credential snapshots are checked here, including calls
-- made directly through PostgREST rather than our application UI.
create or replace function sign_authored_entry(
  p_challenge_id uuid,
  p_code text,
  p_id uuid,
  p_aircraft_id uuid,
  p_logbook_id uuid,
  p_template_id text,
  p_template_version int,
  p_entry_date date,
  p_hobbs numeric,
  p_tach numeric,
  p_airframe numeric,
  p_work text,
  p_answers jsonb,
  p_credential_id uuid,
  p_performed_by text,
  p_supersedes_entry_id uuid,
  p_attested boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_kind text;
  v_number text;
  v_rating text;
  v_signed_at timestamptz := clock_timestamp();
  v_payload jsonb;
  v_existing uuid;
  v_challenge entry_signing_challenge%rowtype;
  v_request jsonb;
begin
  if v_user is null then raise exception 'Sign in to sign an entry'; end if;
  select id into v_existing from log_entry where id = p_id and authored_by = v_user and authored_signed_at is not null;
  if v_existing is not null then return v_existing; end if;
  select * into v_challenge from entry_signing_challenge
    where id = p_challenge_id and user_id = v_user for update;
  v_request := jsonb_build_object(
    'p_id', p_id, 'p_aircraft_id', p_aircraft_id, 'p_logbook_id', p_logbook_id,
    'p_template_id', p_template_id, 'p_template_version', p_template_version,
    'p_entry_date', p_entry_date, 'p_hobbs', p_hobbs, 'p_tach', p_tach,
    'p_airframe', p_airframe, 'p_work', p_work, 'p_answers', p_answers,
    'p_credential_id', p_credential_id, 'p_performed_by', p_performed_by,
    'p_supersedes_entry_id', p_supersedes_entry_id, 'p_attested', p_attested
  );
  if v_challenge.id is null or v_challenge.consumed_at is not null or
     v_challenge.expires_at < now() or v_challenge.attempts >= 5 or
     v_challenge.request <> v_request or p_code is null or length(p_code) <> 8 or
     v_challenge.code_hash <> encode(digest(p_challenge_id::text || p_code, 'sha256'), 'hex') then
    if v_challenge.id is not null then
      update entry_signing_challenge set attempts = attempts + 1 where id = p_challenge_id;
    end if;
    return null;
  end if;
  if not can_edit_aircraft(p_aircraft_id) then raise exception 'No edit access to this aircraft'; end if;
  if not exists (select 1 from logbook where id = p_logbook_id and aircraft_id = p_aircraft_id) then
    raise exception 'Logbook is not on this aircraft';
  end if;
  select nullif(trim(full_name), '') into v_name from profile where id = v_user;
  if v_name is null then raise exception 'Set your full name in your profile before signing'; end if;
  select kind, certificate_number, rating into v_kind, v_number, v_rating from signing_credential
    where id = p_credential_id and user_id = v_user;
  if v_kind is null then raise exception 'Select one of your signing credentials'; end if;
  if v_challenge.signer_name is distinct from v_name or
     v_challenge.cert_kind is distinct from v_kind or
     v_challenge.cert_number is distinct from v_number or
     v_challenge.cert_rating is distinct from v_rating then
    raise exception 'Signer details changed; request a new code';
  end if;
  if p_template_id not in ('oil_filter', 'tire', 'spark_plug', 'battery', 'general') or p_template_version <> 1 then
    raise exception 'Unsupported entry template';
  end if;
  if v_kind <> 'mechanic' and p_template_id = 'general' then
    raise exception 'The general maintenance template requires a mechanic credential';
  end if;
  if v_kind = 'sport_pilot' then
    raise exception 'Sport-pilot privileges depend on aircraft category; this workflow does not yet support them';
  end if;
  if p_entry_date is null or p_entry_date > current_date + 1 or p_entry_date < date '1900-01-01' then
    raise exception 'Enter a valid completion date';
  end if;
  if p_work is null or length(trim(p_work)) < 20 or length(p_work) > 10000 then
    raise exception 'Describe the work performed';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Template details are missing';
  end if;
  if p_hobbs < 0 or p_tach < 0 or p_airframe < 0 then raise exception 'Meter readings cannot be negative'; end if;
  if p_performed_by is null or length(trim(p_performed_by)) < 2 then raise exception 'Enter who performed the work'; end if;
  if v_kind <> 'mechanic' and trim(p_performed_by) <> v_name then
    raise exception 'A pilot may sign only preventive maintenance they performed';
  end if;
  if p_attested is distinct from true then raise exception 'Confirm the signing statement'; end if;
  if p_supersedes_entry_id is not null and not exists (
    select 1 from log_entry where id = p_supersedes_entry_id and aircraft_id = p_aircraft_id and authored_signed_at is not null
  ) then raise exception 'The corrected entry must be a signed entry on this aircraft'; end if;

  v_payload := jsonb_build_object(
    'version', 1, 'aircraft_id', p_aircraft_id, 'logbook_id', p_logbook_id,
    'entry_date', p_entry_date, 'hobbs', p_hobbs, 'tach', p_tach, 'airframe', p_airframe,
    'work', trim(p_work), 'performed_by', trim(p_performed_by), 'template_id', p_template_id,
    'template_version', p_template_version, 'answers', p_answers,
    'signer_id', v_user, 'signer_name', v_name, 'certificate_kind', v_kind,
    'certificate_number', v_number, 'certificate_rating', v_rating, 'signed_at', v_signed_at,
    'supersedes_entry_id', p_supersedes_entry_id,
    'attestation', 'I performed or approved only the work described, am authorized to sign this entry, and intend this electronic signature to approve return to service for that work.'
  );
  perform set_config('mytaillog.signing', 'yes', true);
  insert into log_entry (
    id, aircraft_id, logbook_id, page_id, entry_date, hobbs, tach, airframe,
    description, work_performed, signature_name, mechanic_cert_number,
    owner_confirmed, authored_by, authored_signed_at, authored_cert_kind, authored_cert_rating,
    authored_template_id, authored_template_version, authored_answers,
    authored_payload, authored_digest, supersedes_entry_id
  ) values (
    p_id, p_aircraft_id, p_logbook_id, null, p_entry_date, p_hobbs, p_tach, p_airframe,
    trim(p_work), trim(p_work), v_name, v_number,
    true, v_user, v_signed_at, v_kind, v_rating,
    p_template_id, p_template_version, p_answers,
    v_payload, encode(digest(v_payload::text, 'sha256'), 'hex'), p_supersedes_entry_id
  );
  if p_supersedes_entry_id is not null then
    update log_entry set authored_superseded_by = p_id where id = p_supersedes_entry_id;
  end if;
  update entry_signing_challenge set consumed_at = now() where id = p_challenge_id;
  return p_id;
end;
$$;
revoke all on function sign_authored_entry(uuid, text, uuid, uuid, uuid, text, int, date, numeric, numeric, numeric, text, jsonb, uuid, text, uuid, boolean) from public;
grant execute on function sign_authored_entry(uuid, text, uuid, uuid, uuid, text, int, date, numeric, numeric, numeric, text, jsonb, uuid, text, uuid, boolean) to authenticated;
