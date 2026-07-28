import { createClient as createTokenScoped } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

// Auth for the first-party sync API. The native app holds a Supabase session and
// sends the access token as `Authorization: Bearer <jwt>`; we scope a client to
// that token so RLS applies as the signed-in user — no cookies in a WKWebView.
// Falls back to the normal cookie-based server client so the same routes are
// testable from a browser. NOT the OAuth resource server (that's /api/v1/* with
// OAuth tokens); this is the user's own Supabase session.
export async function createSyncClient(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Supabase env not configured");
    return createTokenScoped<Database>(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return createCookieClient();
}
