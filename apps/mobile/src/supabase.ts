import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/mobile/.env");
}

// The anon key is public (same as the web bundle); RLS protects the data. The
// session (incl. refresh token) persists in WKWebView storage for now — it moves
// to the iOS Keychain in a later pass.
export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Where the self-hosted sync API lives. Defaults to prod.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "https://mytaillog.com";
