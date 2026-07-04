-- ===========================================================================
-- Demo aircraft: onboarding for new users (TachTime-style).
--
-- An aircraft flagged is_demo is auto-shared READ-ONLY (viewer) with every new
-- account at signup, reusing the existing aircraft_share + RLS model — viewers
-- already can't edit, so no new access control. New users land on a populated
-- dashboard and can explore Status/Timeline/Ask before scanning anything.
--
-- The demo aircraft itself + its data are created by scripts/seed-demo.sql
-- (run AFTER this migration; it also backfills shares for existing users).
-- ===========================================================================

alter table aircraft add column if not exists is_demo boolean not null default false;

-- Extend the signup trigger (0024 version) to also share demo aircraft with the
-- new user. Exception-safe: a demo-share hiccup must never break signup.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profile (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do update set email = excluded.email;

  begin
    if new.email is not null then
      insert into public.aircraft_share (aircraft_id, invited_email, role, invited_by)
      select a.id, lower(new.email), 'viewer', a.owner_id
      from public.aircraft a
      where a.is_demo
      on conflict (aircraft_id, invited_email) do nothing;
    end if;
  exception when others then
    null; -- demo share is best-effort
  end;

  return new;
end;
$$;
