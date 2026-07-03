-- ===========================================================================
-- Store each user's email on their profile row.
--
-- The daily reminder cron runs with the Supabase SECRET API key (RLS-bypassing
-- DB access) but that key does NOT reliably grant the GoTrue admin API — so
-- `auth.admin.listUsers()` returned nothing and every reminder was skipped
-- before it could send. Reading the email from a normal table (public.profile)
-- fixes it with plain DB access. Populated at signup, on email change, and
-- backfilled here.
-- ===========================================================================

alter table profile add column if not exists email text;

-- Backfill existing profiles from auth.users (this migration runs privileged).
update profile p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- Extend the signup trigger to also capture the email (upsert keeps it fresh).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profile (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Keep profile.email in sync when a user changes their email.
create or replace function sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profile set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_change on auth.users;
create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row execute function sync_profile_email();
