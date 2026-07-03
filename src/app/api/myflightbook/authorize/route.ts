import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl } from "@/lib/myflightbook";
import { publicOrigin } from "@/lib/publicOrigin";

/**
 * Start the MyFlightBook OAuth flow: build the authorize URL from the user's
 * OWN client id and redirect there. A random state is stashed in an httpOnly
 * cookie and verified in the callback (CSRF protection).
 */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/profile`);

  const { data: conn } = await supabase
    .from("mfb_connection")
    .select("client_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conn?.client_id) {
    return NextResponse.redirect(`${origin}/profile?mfb=noclient`);
  }

  const state = crypto.randomUUID();
  const redirectUri = `${origin}/api/myflightbook/callback`;
  const res = NextResponse.redirect(
    buildAuthorizeUrl({ clientId: conn.client_id, redirectUri, state }),
  );
  res.cookies.set("mfb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
