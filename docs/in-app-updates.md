# In-app updates

Apply `supabase/migrations/0063_announcements.sql` and `0064_announcement_grants.sql` in order to test, then production, before deploying the website or shipping updated mobile builds.

Admins can open `/admin`, enter a title (up to 120 characters), a short message (up to 500 characters), and optionally a MyTailLog link such as `/whats-new`. **Publish to all users** makes it visible to signed-in users on the website and on mobile builds containing this feature. **End** removes it from view immediately. Older active notices can also appear after a user dismisses the newest one, so end notices that are no longer relevant.

Dismissal is stored per account in Supabase. A dismissed notice stays dismissed across the web, iOS, and Android. Opening another device may show a notice until that device refreshes its view. This is an in-app notice, not a push notification or email; mobile users see it when they open the updated app while online.
