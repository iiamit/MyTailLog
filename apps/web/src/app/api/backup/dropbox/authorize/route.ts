import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/backup/providers";
import { publicOrigin } from "@/lib/publicOrigin";

/**
 * Start the Dropbox OAuth flow for scheduled cloud backups. Mirrors
 * api/myflightbook/authorize: a random state in an httpOnly cookie, verified in
 * the callback (CSRF), and the redirect URI pinned to publicOrigin rather than a
 * request header (redirect poisoning).
 */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/profile`);

  // Null when DROPBOX_CLIENT_ID/SECRET aren't provisioned — say so instead of
  // bouncing the user to a broken Dropbox consent screen.
  const provider = getProvider("dropbox");
  if (!provider) return NextResponse.redirect(`${origin}/profile?backup=unconfigured`);

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(
    provider.authorizeUrl(state, `${origin}/api/backup/dropbox/callback`),
  );
  res.cookies.set("backup_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
