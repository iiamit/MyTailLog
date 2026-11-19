import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { updateRoom } from "@/lib/recordRoom";

// PATCH /api/aircraft/{id}/record-rooms/{roomId} { extendDays?: 30, revoke?: true, label? } (09 §4.11, D18).
// → { id, label, expiresAt, revokedAt }. Owner only; revoking is immediate (every /r request re-reads the row).
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { id, roomId } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const r = await updateRoom(supabase, { aircraftId: id, roomId, userId: user.id, body });
  if ("error" in r) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json(r, { headers: { "Cache-Control": "private, no-store" } });
}
