import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";

// PATCH /api/aircraft/{id}/mechanic-links/{linkId} { revoke: true } (09 §4.12). Immediate and online.
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || body.revoke !== true) return NextResponse.json({ error: "Nothing to change.", code: "invalid" }, { status: 400 });
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (canEdit !== true) return NextResponse.json({ error: "You don't have edit access to this aircraft.", code: "viewer_read_only" }, { status: 403 });
  const { data: link } = await supabase.from("mechanic_link").select("id, revoked_at").eq("id", linkId).eq("aircraft_id", id).maybeSingle();
  if (!link) return NextResponse.json({ error: "Link not found.", code: "not_found" }, { status: 404 });
  const revokedAt = link.revoked_at ?? new Date().toISOString();
  if (!link.revoked_at) {
    const { error } = await supabase.from("mechanic_link").update({ revoked_at: revokedAt }).eq("id", linkId).eq("aircraft_id", id);
    if (error) return NextResponse.json({ error: error.message, code: "failed" }, { status: 500 });
  }
  return NextResponse.json({ id: linkId, revokedAt });
}
