import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exchangeCode, expiresAtFrom } from "@/lib/myflightbook";
import { publicOrigin } from "@/lib/publicOrigin";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

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

  // Credentials/tokens live in a private schema (0047), reached only via the
  // service-role RPCs. The user was verified above via their own session.
  const svc = createServiceClient();
  const { data: secretRows } = await svc.rpc("mfb_conn_secrets", { p_user_id: user.id });
  const conn = secretRows?.[0];
  if (!conn?.client_id || !conn?.client_secret) return back("noclient");

  try {
    const tokens = await exchangeCode({
      clientId: conn.client_id,
      clientSecret: decryptSecret(conn.client_secret) ?? "",
      code,
      redirectUri: `${origin}/api/myflightbook/callback`,
    });
    const { error } = await svc.rpc("set_mfb_tokens", {
      p_user_id: user.id,
      p_access: encryptSecret(tokens.access_token),
      p_refresh: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
      p_expires_at: expiresAtFrom(tokens.expires_in),
      p_mark_connected: true,
    });
    if (error) return back("error");
    return back("connected");
  } catch {
    return back("error");
  }
}
