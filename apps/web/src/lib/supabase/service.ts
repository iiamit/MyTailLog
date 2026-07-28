import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * ELEVATED Supabase client — bypasses row-level security and carries NO user
 * session. Cross-user by design, so import it ONLY from places that have
 * independently verified privileged access: the daily cron (gated by
 * CRON_SECRET) and the /admin dashboard (gated by profile.is_admin, checked with
 * the normal authed client first). Never from a client component or anything
 * reachable by the browser.
 *
 * Authenticates with a Supabase SECRET API KEY (`sb_secret_...`, created under
 * Project Settings → API Keys → "Create secret key") — the recommended,
 * individually rotatable replacement for the legacy service_role JWT. It is a
 * drop-in here: a privileged role that bypasses RLS. Server-only (no
 * NEXT_PUBLIC_ prefix); must never reach the client bundle.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
