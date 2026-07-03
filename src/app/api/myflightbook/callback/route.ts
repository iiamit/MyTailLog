import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, expiresAtFrom } from "@/lib/myflightbook";
import { publicOrigin } from "@/lib/publicOrigin";

/**
 * OAuth callback: verify state, exchange the code for tokens using the user's
 * own client id/secret, store the tokens on their mfb_connection row, and
 * bounce back to /profile with a status. All failures degrade to a status
 * query param — never a crash.
 */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const cookieState = request.cookies.get("mfb_oauth_state")?.value;

  const back = (status: string) => {
    const res = NextResponse.redirect(`${origin}/profile?mfb=${status}`);
    res.cookies.delete("mfb_oauth_state");
    return res;
  };

  if (err) return back("denied");
  if (!code || !state || !cookieState || state !== cookieState) {
    return back("state");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/profile`);

  const { data: conn } = await supabase
    .from("mfb_connection")
    .select("client_id, client_secret")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conn?.client_id || !conn?.client_secret) return back("noclient");

  try {
    const tokens = await exchangeCode({
      clientId: conn.client_id,
      clientSecret: conn.client_secret,
      code,
      redirectUri: `${origin}/api/myflightbook/callback`,
    });
    const { error } = await supabase
      .from("mfb_connection")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAtFrom(tokens.expires_in),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    if (error) return back("error");
    return back("connected");
  } catch {
    return back("error");
  }
}
