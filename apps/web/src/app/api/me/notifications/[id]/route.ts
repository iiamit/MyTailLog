import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";

// POST /api/me/notifications/{id} { read?: true, dismissed?: true } → { ok: true } (09 §4.9).
// Read state is the server's, so it agrees across devices. RLS limits the update to the caller's rows.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { read?: unknown; dismissed?: unknown } | null;
  const now = new Date().toISOString();
  const patch: { read_at?: string; dismissed_at?: string } = {};
  if (body?.read === true) patch.read_at = now;
  if (body?.dismissed === true) patch.dismissed_at = now;
  if (!patch.read_at && !patch.dismissed_at)
    return NextResponse.json({ error: "Send { read: true } or { dismissed: true }.", code: "bad_request" }, { status: 400 });

  const { data, error } = await supabase.from("notification").update(patch).eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Notification not found.", code: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
