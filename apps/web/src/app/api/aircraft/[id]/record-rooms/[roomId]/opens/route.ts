import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { roomOpens } from "@/lib/recordRoom";

// GET /api/aircraft/{id}/record-rooms/{roomId}/opens → [{ openedAt, lastAt, sections }] newest first (09 §4.11).
// RLS (room_view_owner_read) shows the views to the aircraft's owner only; anyone else gets a 404.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const { data: room } = await supabase.from("record_room").select("id").eq("id", roomId).eq("aircraft_id", id).maybeSingle();
  if (!room) return NextResponse.json({ error: "Link not found.", code: "not_found" }, { status: 404 });
  const { data: views, error } = await supabase.from("record_room_view")
    .select("session_key, section, created_at").eq("room_id", roomId).order("created_at").limit(5000);
  if (error) return NextResponse.json({ error: "Couldn't load the opens.", code: "failed" }, { status: 500 });
  return NextResponse.json(roomOpens(views ?? []), { headers: { "Cache-Control": "private, no-store" } });
}
