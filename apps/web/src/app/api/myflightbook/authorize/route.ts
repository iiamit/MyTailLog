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

  // Credentials live in a private schema (0047); my_mfb_status returns the
  // caller's non-secret state (incl. client_id) — no ciphertext reaches here.
  const { data: statusRows } = await supabase.rpc("my_mfb_status");
  const clientId = statusRows?.[0]?.client_id;

  if (!clientId) {
    return NextResponse.redirect(`${origin}/profile?mfb=noclient`);
  }

  const state = crypto.randomUUID();
  const redirectUri = `${origin}/api/myflightbook/callback`;
  const res = NextResponse.redirect(
    buildAuthorizeUrl({ clientId, redirectUri, state }),
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
