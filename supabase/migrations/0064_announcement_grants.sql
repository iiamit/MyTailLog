-- Supabase's default table grants include TRUNCATE, which bypasses row-level
-- security. Give clients only the operations needed for notices and dismissals.
revoke all on public.announcement, public.announcement_dismissal from anon, authenticated;
grant select on public.announcement to authenticated;
grant select, insert on public.announcement_dismissal to authenticated;
