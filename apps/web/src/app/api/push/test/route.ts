import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPush } from "../apns";

// POST /api/push/test — send a push to the caller's OWN registered devices.
//
// Why this exists: the real reminder rides on the daily email, so it only fires
// for an item that is genuinely due AND not already in reminder_log for this
// due cycle. That is right for reminders and useless for answering "does push
// work on this phone at all" — trigger the cron with nothing newly due and you
// get silence, which is indistinguishable from the failure you are testing for.
//
// Four builds were spent on that ambiguity. This route removes it: it always
// sends, it says what happened, and it reaches only the caller's own devices.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The caller's own tokens only. Read with the service client because
  // device_token is owner-scoped and this is the owner asking about themselves —
  // filtered by user.id, never by anything the caller supplied.
  const db = createServiceClient();
  const { data, error } = await db.from("device_token").select("token").eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tokens = (data ?? []).map((d) => d.token);
  if (tokens.length === 0) {
    return NextResponse.json({
      devices: 0,
      sent: 0,
      hint: "No device is registered for this account. Open the app, accept notifications, then check the account menu.",
    });
  }

  const result = await sendPush(tokens, {
    title: "MyTailLog",
    body: "Test notification — push is working on this device.",
  });

  // Apple refuses a token from a deleted or reinstalled app; the cron drops
  // those, and so does this, or the next test retries a token that can never
  // succeed.
  if (result.dead.length) await db.from("device_token").delete().in("token", result.dead);

  return NextResponse.json({
    devices: tokens.length,
    sent: result.sent,
    dead: result.dead.length,
    // The reason is the whole point — a silent 200 is what made this hard.
    error: result.error ?? null,
  });
}
