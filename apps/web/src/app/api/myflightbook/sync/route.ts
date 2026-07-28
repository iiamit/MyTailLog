import { createClient } from "@/lib/supabase/server";
import { syncUserHours } from "@/lib/mfbSync";

export const runtime = "nodejs";

/**
 * Manual "Sync now" from the profile: pull the signed-in user's MyFlightBook
 * aircraft + recent flights, match by tail to MyTailLog aircraft they can see
 * (RLS scopes the query to owner/shared), and upsert one hours_reading per
 * matched aircraft. The heavy lifting lives in @/lib/mfbSync (shared with the
 * daily cron). Unthrottled — the button always runs; the once-per-day throttle
 * only applies to the cron.
 *
 * Best-effort: not connected, an MFB error, or an unmatched tail each return a
 * clear JSON result rather than throwing.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  // RLS scopes this to aircraft the user owns or is shared on.
  const { data: myAircraft } = await supabase.from("aircraft").select("id, tail_number");

  let result;
  try {
    result = await syncUserHours(supabase, user.id, myAircraft ?? []);
  } catch (e) {
    return json({ error: `MyFlightBook error: ${(e as Error).message}` }, 502);
  }
  if (!result) {
    return json({ error: "MyFlightBook isn’t connected. Connect it in your profile." }, 400);
  }

  return json({
    synced: result.synced,
    matched: result.matched,
    unmatchedTails: result.unmatchedTails,
    errors: result.errors.length ? result.errors : undefined,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
