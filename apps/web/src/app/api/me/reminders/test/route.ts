import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/email";
import { hit } from "@/lib/rateLimit";
import { sendToDevices } from "../../../push/devices";

// POST /api/me/reminders/test → { devices, email } (09 §4.9): a test push to the caller's own
// devices and a test email to their own address, whatever is due, so "does it reach me" has an
// answer. `devices` counts the devices that took the push; `email` says whether the email went.
// Not counted in the daily cap (it writes no reminder_log row).
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const wait = hit(`reminders-test:${user.id}`, 5, 3_600_000);
  if (wait) return NextResponse.json({ error: "Try again later.", code: "rate_limited" }, { status: 429, headers: { "Retry-After": String(wait) } });

  // device_token is owner-scoped; the service client reads the caller's own tokens, filtered by user.id only.
  const db = createServiceClient();
  const { data: tokens, error } = await db.from("device_token").select("token, platform").eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let devices = 0;
  if (tokens?.length) {
    const r = await sendToDevices(tokens, { title: "MyTailLog", body: "Test reminder. Notifications reach this device." });
    if (r.dead.length) await db.from("device_token").delete().in("token", r.dead);
    devices = r.sent;
  }

  const email = user.email
    ? await sendEmail({
        to: user.email,
        subject: "MyTailLog: test reminder",
        html: "<p>Test reminder. Reminder emails reach this address.</p>",
        text: "Test reminder. Reminder emails reach this address.",
      })
    : false;
  return NextResponse.json({ devices, email });
}
