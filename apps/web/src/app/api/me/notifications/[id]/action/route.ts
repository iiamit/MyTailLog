import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { comingFriday0900 } from "@/lib/reminders";
import { snooze } from "@/lib/writes/reminders";

// POST /api/me/notifications/{id}/action { actionId: 'plan_visit'|'remind_friday'|'review'|'later' }
//   → { deepLink?: string } (09 §4.9). `remind_friday` snoozes every item the notification lists
// until the coming Friday 09:00 in the caller's time zone (14-decisions.md D7, K4), through the
// same write as push `reminder.snooze`. Any action marks the notification read.
export const runtime = "nodejs";

const ACTIONS = new Set(["plan_visit", "remind_friday", "review", "later"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { actionId?: unknown } | null;
  const actionId = typeof body?.actionId === "string" ? body.actionId : "";
  if (!ACTIONS.has(actionId)) return NextResponse.json({ error: "Unknown action.", code: "bad_request" }, { status: 400 });

  const { data: n } = await supabase.from("notification").select("id, aircraft_id, deep_link, payload").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!n) return NextResponse.json({ error: "Notification not found.", code: "not_found" }, { status: 404 });

  let deepLink: string | undefined;
  if (actionId === "remind_friday") {
    if (!n.aircraft_id) return NextResponse.json({ error: "This notification has nothing to snooze.", code: "bad_request" }, { status: 400 });
    const { data: profile } = await supabase.from("profile").select("time_zone").eq("id", user.id).maybeSingle();
    const until = comingFriday0900(profile?.time_zone, new Date()).toISOString();
    const items = Array.isArray(n.payload?.items) ? (n.payload.items as { itemKey: string; dueSignature: string }[]) : [];
    for (const it of items) {
      const r = await snooze(supabase, { aircraftId: n.aircraft_id, userId: user.id }, { itemKey: it.itemKey, dueSignature: it.dueSignature, until });
      if (r.status !== "ok") return NextResponse.json({ error: r.status === "error" ? r.message : "Conflict." }, { status: r.status === "error" ? r.httpStatus ?? 500 : 409 });
    }
  } else if (actionId === "plan_visit" && n.aircraft_id) {
    const visitId = typeof n.payload?.visitId === "string" ? n.payload.visitId : null;
    deepLink = `mytaillog://aircraft/${n.aircraft_id}/status/${visitId ? `visit/${visitId}` : "plan"}`;
  } else if (actionId === "review") {
    deepLink = n.deep_link;
  }

  await supabase.from("notification").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("read_at", null);
  return NextResponse.json(deepLink ? { deepLink } : {});
}
