import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider, isBackupProviderId } from "@/lib/backup/providers";
import { publicOrigin } from "@/lib/publicOrigin";

/**
 * Start the OAuth flow for a cloud-backup destination. Mirrors
 * api/myflightbook/authorize: a random state in an httpOnly cookie, verified in
 * the callback (CSRF), and the redirect URI pinned to publicOrigin rather than a
 * request header (redirect poisoning).
 *
 * One dynamic segment serves every provider, and the URLs are byte-identical to
 * the ones phase 1 shipped (`/api/backup/dropbox/authorize`), so the redirect
 * URI already registered in the Dropbox console keeps working.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const origin = publicOrigin(request);
  const { provider: id } = await ctx.params;
  if (!isBackupProviderId(id)) return NextResponse.redirect(`${origin}/profile?backup=unconfigured`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/profile`);

  // Null when this provider's CLIENT_ID/SECRET aren't provisioned — say so
  // instead of bouncing the user to a broken consent screen.
  const provider = getProvider(id);
  if (!provider) return NextResponse.redirect(`${origin}/profile?backup=unconfigured`);

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(provider.authorizeUrl(state, `${origin}/api/backup/${id}/callback`));
  res.cookies.set("backup_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
