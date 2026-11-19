import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";

// GET /api/me/notifications?after=<iso> → { items: Notification[] } newest first, 50 max (09 §4.9).
// The in-app inbox (C-NOTIFY-02): read through RLS as the caller; dismissed rows and rows older
// than 90 days (08 §3.17) are left out. Bearer (phones) or cookie (web).
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam ? Date.parse(afterParam) : NaN;
  if (afterParam && Number.isNaN(after)) return NextResponse.json({ error: "`after` is not a date.", code: "bad_request" }, { status: 400 });
  const floor = Math.max(Number.isNaN(after) ? 0 : after, Date.now() - 90 * 86_400_000);

  const { data, error } = await supabase.from("notification")
    .select("id, aircraft_id, kind, title, body, deep_link, actions, payload, created_at, read_at")
    .eq("user_id", user.id).is("dismissed_at", null).gt("created_at", new Date(floor).toISOString())
    .order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data ?? []).map((n) => ({
    id: n.id, aircraftId: n.aircraft_id, kind: n.kind, title: n.title, body: n.body, deepLink: n.deep_link,
    actions: n.actions, payload: n.payload, createdAt: n.created_at, readAt: n.read_at,
  }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
