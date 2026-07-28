import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed `middleware` → `proxy` (nodejs runtime; edge not supported).
// This only refreshes the Supabase auth session cookie — no edge-only deps.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on page navigations only — refresh the auth cookie + redirect
  // unauthenticated users. Excludes static assets, the service worker, AND
  // `/api/*`: route handlers do their own auth, and routing them through the
  // proxy caps their request body at Next's proxy limit (~10 MB), which
  // truncated large uploads (a 20 MB manual → the Records Vault / oil-report
  // import). Skipping the proxy lets those routes receive the full body.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
