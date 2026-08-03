import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getProvider, isBackupProviderId } from "@/lib/backup/providers";
import { dayOfMonthFor, nextRunAt, redactSecrets } from "@/lib/backup/schedule";
import { publicOrigin } from "@/lib/publicOrigin";
import { encryptSecret } from "@/lib/crypto";

/**
 * Cloud-backup OAuth callback: verify state, exchange the code, store the tokens
 * as ciphertext in the private schema (0049), and arm a monthly schedule for
 * THIS destination on the user's hashed day of the month (0050 — the schedule is
 * per destination, so connecting Google Drive doesn't disturb Dropbox). Every
 * failure degrades to a status query param — never a crash, never a token in a
 * log line.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const origin = publicOrigin(request);
  const { provider: id } = await ctx.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const cookieState = request.cookies.get("backup_oauth_state")?.value;

  const back = (status: string) => {
    const res = NextResponse.redirect(`${origin}/profile?backup=${status}&provider=${id}`);
    res.cookies.delete("backup_oauth_state");
    return res;
  };

  if (!isBackupProviderId(id)) return back("unconfigured");
  if (err) return back("denied");
  // One state cookie for all providers: two consent flows in flight at once
  // means the second wins and the first fails closed here, which is the right
  // direction for a CSRF check.
  if (!code || !state || !cookieState || state !== cookieState) return back("state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?next=/profile`);

  const provider = getProvider(id);
  if (!provider) return back("unconfigured");

  try {
    // The redirect URI is rebuilt from publicOrigin, not echoed from the
    // request — it must match the one sent to /authorize byte for byte anyway.
    const tokens = await provider.exchangeCode(code, `${origin}/api/backup/${id}/callback`);

    const svc = createServiceClient();
    const { error } = await svc.rpc("upsert_backup_destination", {
      p_user_id: user.id,
      p_provider: id,
      p_account_label: tokens.accountLabel,
      p_access_cipher: encryptSecret(tokens.accessToken),
      p_refresh_cipher: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      p_expires_at: tokens.expiresIn
        ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
        : null,
    });
    if (error) {
      // Never the token — just why the write failed (a missing 0050 looks
      // identical to a broken provider from the redirect alone).
      console.error(`[backup] storing the ${id} destination failed: ${error.message}`);
      return back("error");
    }

    // Connecting IS the consent, so arm the cadence now — a destination that
    // never backs anything up is the failure mode this feature exists to fix.
    // Monthly is the ceiling (plan §1); the user can change or switch it off.
    const day = dayOfMonthFor(user.id);
    await svc.rpc("set_backup_schedule", {
      p_user_id: user.id,
      p_provider: id,
      p_frequency: "monthly",
      p_day_of_month: day,
      p_next_run_at: nextRunAt("monthly", day),
    });
    return back("connected");
  } catch (e) {
    console.error(`[backup] ${id} connect failed: ${redactSecrets((e as Error).message)}`);
    return back("error");
  }
}
